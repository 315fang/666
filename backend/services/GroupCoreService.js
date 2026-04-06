/**
 * 拼团核心业务逻辑服务
 */
const { Op } = require('sequelize');
const {
    GroupActivity, GroupOrder, GroupMember,
    Product, SKU, User, Order,
    sequelize
} = require('../models');
const PointService = require('./PointService');
const MemberTierService = require('./MemberTierService');
const { sendNotification } = require('../models/notificationUtil');
const { error: logError, warn: logWarn } = require('../utils/logger');
const { checkRoleUpgrade, handleSameLevelReferral } = require('../utils/commission');

// 生成团次号
function genGroupNo() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = secureRandomHex(3); // 6位随机十六进制 ≈ 5位十进制随机性
    return `GP${date}${rand}`;
}

class GroupCoreService {

    /**
     * 发起拼团
     */
    static async startGroupOrder({ userId, activity_id, sku_id, inviter_id }) {
        const t = await sequelize.transaction();
        try {
            // 1. 验证活动
            const now = new Date();
            const activity = await GroupActivity.findOne({
                where: {
                    id: activity_id,
                    status: 1,
                    [Op.and]: [
                        { [Op.or]: [{ start_at: null }, { start_at: { [Op.lte]: now } }] },
                        { [Op.or]: [{ end_at: null }, { end_at: { [Op.gt]: now } }] }
                    ]
                },
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (!activity) {
                await t.rollback();
                throw new Error('拼团活动不存在或已结束');
            }

            const product = await Product.findByPk(activity.product_id, {
                transaction: t,
                attributes: ['id', 'status', 'enable_group_buy']
            });
            if (!product || Number(product.status) !== 1) {
                await t.rollback();
                throw new Error('商品已下架，无法发起拼团');
            }
            if (Number(product.enable_group_buy) !== 1) {
                await t.rollback();
                throw new Error('该商品未在营销设置中开启「参与拼团」');
            }

            if (activity.sku_id != null && activity.sku_id !== '') {
                const needSku = parseInt(activity.sku_id, 10);
                const gotSku = sku_id != null && sku_id !== '' ? parseInt(sku_id, 10) : NaN;
                if (!Number.isFinite(needSku) || gotSku !== needSku) {
                    await t.rollback();
                    throw new Error('该拼团仅限指定规格，请从商品页选择对应规格后再发起');
                }
                const skuRow = await SKU.findOne({
                    where: { id: needSku, product_id: activity.product_id, status: 1 },
                    transaction: t
                });
                if (!skuRow) {
                    await t.rollback();
                    throw new Error('拼团活动配置的规格无效或已下架');
                }
            }

            // 2. 检查发起者是否为会员（role_level>=1 视为会员，与小程序提示一致）
            const initiator = await User.findByPk(userId, { transaction: t, attributes: ['role_level'] });
            if (!initiator || initiator.role_level < 1) {
                await t.rollback();
                const error = new Error('发起拼团需要会员身份，请先完成首单成为会员');
                error.need_upgrade = true;
                error.status = 403;
                throw error;
            }

            // 3. 库存检查
            if (activity.sold_count >= activity.stock_limit) {
                await t.rollback();
                throw new Error('活动库存已售罄');
            }

            // 4. 防止重复开团
            const existingOpen = await GroupOrder.findOne({
                where: { product_id: activity.product_id, leader_id: userId, status: 'open' },
                transaction: t
            });
            if (existingOpen) {
                await t.rollback();
                const error = new Error('您已有进行中的拼团');
                error.code = 1;
                error.data = { group_no: existingOpen.group_no };
                throw error;
            }

            // 5. 创建团次
            const expireAt = new Date(now.getTime() + activity.expire_hours * 60 * 60 * 1000);
            const groupOrder = await GroupOrder.create({
                group_no: genGroupNo(),
                activity_id: activity.id,
                product_id: activity.product_id,
                leader_id: userId,
                inviter_id: inviter_id || null,
                status: 'open',
                current_members: 1,  // 团长
                min_members: activity.min_members,
                max_members: activity.max_members,
                group_price: activity.group_price,
                expire_at: expireAt
            }, { transaction: t });

            // 6. 团长加入成员表
            const user = await User.findByPk(userId, { transaction: t });
            await GroupMember.create({
                group_order_id: groupOrder.id,
                user_id: userId,
                is_leader: 1,
                inviter_id: inviter_id || null,
                is_new_user: !user.parent_id ? 1 : 0,
                status: 'joined'
            }, { transaction: t });

            await t.commit();

            // 7. 积分奖励（异步）
            (async () => {
                try {
                    const pr = await MemberTierService.getPointRules();
                    await PointService.addPoints(
                        userId,
                        pr.group_start?.points ?? 10,
                        'group_start',
                        groupOrder.group_no,
                        pr.group_start?.remark
                    );
                } catch (e) {
                    logError('GROUP', '发起拼团积分奖励失败', { error: e?.message || e });
                }
            })();

            return {
                group_no: groupOrder.group_no,
                group_order_id: groupOrder.id,
                expire_at: groupOrder.expire_at,
                min_members: groupOrder.min_members,
                group_price: groupOrder.group_price
            };
        } catch (err) {
            if (!t.finished) await t.rollback();
            throw err;
        }
    }

    /**
     * 参团逻辑
     */
    static async joinGroupOrder({ userId, group_no, inviter_id }) {
        const t = await sequelize.transaction();
        try {
            // 1. 查找团次带更新锁
            const groupOrder = await GroupOrder.findOne({
                where: { group_no },
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (!groupOrder) {
                await t.rollback();
                const error = new Error('拼团不存在');
                error.status = 404;
                throw error;
            }

            if (groupOrder.status !== 'open') {
                await t.rollback();
                throw new Error(groupOrder.status === 'success' ? '该拼团已成团' : '该拼团已结束');
            }

            if (new Date() > new Date(groupOrder.expire_at)) {
                await t.rollback();
                throw new Error('拼团已超时，无法参团');
            }

            if (groupOrder.current_members >= groupOrder.max_members) {
                await t.rollback();
                throw new Error('拼团人数已满');
            }

            // 2. 检查是否已参团
            const existing = await GroupMember.findOne({
                where: { group_order_id: groupOrder.id, user_id: userId },
                transaction: t
            });
            if (existing) {
                await t.rollback();
                const error = new Error('您已参加该拼团');
                error.code = 1;
                error.data = { group_no };
                throw error;
            }

            // 3. 分销归因：新用户自动绑定邀请者
            const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
            let wasBound = false;
            const effectiveInviterId = inviter_id || groupOrder.inviter_id || groupOrder.leader_id;

            if (!user.parent_id && user.role_level < 1 && effectiveInviterId && effectiveInviterId !== userId) {
                const inviter = await User.findByPk(effectiveInviterId, { transaction: t });

                if (inviter && (inviter.parent_id || inviter.role_level >= 1)) {
                    if (inviter.parent_id !== userId) {
                        user.parent_id = inviter.id;
                        user.parent_openid = inviter.openid;
                        user.agent_id = inviter.role_level >= 3 ? inviter.id : inviter.agent_id;
                        user.joined_team_at = new Date();
                        await user.save({ transaction: t });

                        await inviter.increment('referee_count', { transaction: t });
                        await inviter.reload({ transaction: t });

                        const newRole = checkRoleUpgrade(inviter);
                        if (newRole) {
                            await inviter.update({ role_level: newRole }, { transaction: t });
                            if (inviter.parent_id) {
                                const inviterUpline = await User.findByPk(inviter.parent_id,
                                    { attributes: ['id', 'role_level'], transaction: t });
                                setImmediate(() =>
                                    handleSameLevelReferral(inviterUpline, { id: inviter.id, role_level: newRole }).catch(() => { })
                                );
                            }
                        }
                        wasBound = true;
                    }
                }
            }

            // 4. 加入成员表
            await GroupMember.create({
                group_order_id: groupOrder.id,
                user_id: userId,
                is_leader: 0,
                inviter_id: effectiveInviterId || null,
                is_new_user: wasBound || !user.parent_id ? 1 : 0,
                was_bound: wasBound ? 1 : 0,
                status: 'joined'
            }, { transaction: t });

            // 5. 更新状态与成团判定
            groupOrder.current_members += 1;
            let justSucceeded = false;

            if (groupOrder.current_members >= groupOrder.min_members) {
                groupOrder.status = 'success';
                groupOrder.success_at = new Date();
                justSucceeded = true;

                await GroupActivity.increment('sold_count', {
                    by: groupOrder.current_members,
                    where: { id: groupOrder.activity_id },
                    transaction: t
                });
            }

            await groupOrder.save({ transaction: t });
            await t.commit();

            // 6. 异步通知
            if (justSucceeded) {
                this._handleGroupSuccess(groupOrder).catch(e => logError('GROUP', '成团后处理失败', { error: e?.message || e }));
            } else {
                sendNotification(
                    groupOrder.leader_id,
                    '有好友加入了你的拼团',
                    `距离成团还差 ${groupOrder.min_members - groupOrder.current_members} 人快去邀请更多好友吧！`,
                    'group',
                    String(groupOrder.id)
                ).catch(() => { });
            }

            return {
                group_no,
                status: groupOrder.status,
                current_members: groupOrder.current_members,
                min_members: groupOrder.min_members,
                was_bound: wasBound,
                just_succeeded: justSucceeded
            };
        } catch (err) {
            if (!t.finished) await t.rollback();
            throw err;
        }
    }

    /**
     * 内部：拼团成功后置处理
     */
    static async _handleGroupSuccess(groupOrder) {
        try {
            const members = await GroupMember.findAll({
                where: { group_order_id: groupOrder.id, status: 'joined' }
            });

            for (const member of members) {
                await sendNotification(
                    member.user_id,
                    '🎉 拼团成功！',
                    `您参与的拼团已成功，系统将以拼团价 ¥${groupOrder.group_price} 为您生成订单，请前往"我的订单"完成支付。`,
                    'group',
                    String(groupOrder.id)
                ).catch(() => { });

                (async () => {
                    try {
                        const pr = await MemberTierService.getPointRules();
                        await PointService.addPoints(
                            member.user_id,
                            pr.group_success?.points ?? 30,
                            'group_success',
                            groupOrder.group_no,
                            pr.group_success?.remark
                        );
                    } catch (_) { /* ignore */ }
                })();
            }
        } catch (err) {
            logError('GROUP', '拼团成功异步处理失败', { error: err?.message || err });
        }
    }

    /**
     * 定时任务：处理过期拼团
     */
    static async processExpiredGroups() {
        const now = new Date();
        const expiredGroups = await GroupOrder.findAll({
            where: { status: 'open', expire_at: { [Op.lt]: now } },
            include: [{ model: GroupMember, as: 'members' }]
        });

        let processedCount = 0;
        for (const group of expiredGroups) {
            const t = await sequelize.transaction();
            try {
                // 更新团状态
                await group.update({ status: 'fail', failed_at: now }, { transaction: t });
                // 更新成员状态
                await GroupMember.update(
                    { status: 'refunded' },
                    { where: { group_order_id: group.id, status: 'joined' }, transaction: t }
                );
                await t.commit();

                // 异步发通知
                for (const member of group.members) {
                    sendNotification(
                        member.user_id,
                        '拼团未成功，已自动退款',
                        `很遗憾，您参与的拼团未在规定时间内凑齐人数，已自动退款至原支付账户。`,
                        'group',
                        String(group.id)
                    ).catch(() => { });
                }

                processedCount++;
            } catch (e) {
                if (!t.finished) await t.rollback();
                logError('GROUP', `处理团次 ${group.group_no} 过期失败`, { error: e.message });
            }
        }
        return processedCount;
    }
}

module.exports = GroupCoreService;
