/**
 * 拼团控制器
 * 
 * 核心流程：
 * 1. 用户查看商品详情 → 看到拼团活动入口
 * 2. 发起拼团（leader）：创建 GroupOrder + 第一条 GroupMember + 生成拼团订单
 * 3. 好友点击分享链接 → 查看拼团进度页
 * 4. 好友参团：加入 GroupMember + 生成拼团订单 + 检查是否成团
 * 5. 成团：更新所有成员订单状态为可履约
 * 6. 超时未成团：退款所有成员
 * 7. 分销归因：新用户参团时，自动绑定邀请者为上级
 */
const { Op } = require('sequelize');
const {
    GroupActivity, GroupOrder, GroupMember,
    Product, SKU, User, Order,
    sequelize
} = require('../models');
const PointService = require('../services/PointService');
const { sendNotification } = require('../models/notificationUtil');
const { checkRoleUpgrade } = require('../utils/commission');
const { handleSameLevelReferral } = require('../utils/commission');

// ============================================================
// 生成团次号
// ============================================================
function genGroupNo() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
    return `GP${date}${rand}`;
}

// ============================================================
// 获取商品的拼团活动（商品详情页调用）
// GET /api/group/activities?product_id=X
// ============================================================
async function getActivitiesByProduct(req, res, next) {
    try {
        const { product_id } = req.query;
        if (!product_id) return res.json({ code: 0, data: [] });

        const now = new Date();
        const activities = await GroupActivity.findAll({
            where: {
                product_id,
                status: 1,
                [Op.or]: [
                    { start_at: null },
                    { start_at: { [Op.lte]: now } }
                ],
                [Op.or]: [
                    { end_at: null },
                    { end_at: { [Op.gt]: now } }
                ]
            },
            include: [
                { model: Product, as: 'product', attributes: ['id', 'name', 'images', 'retail_price'] }
            ],
            order: [['group_price', 'ASC']]
        });

        res.json({ code: 0, data: activities });
    } catch (err) {
        next(err);
    }
}

// ============================================================
// 查看拼团进度详情（参团页、分享页共用）
// GET /api/group/orders/:group_no
// ============================================================
async function getGroupOrderDetail(req, res, next) {
    try {
        const { group_no } = req.params;

        const groupOrder = await GroupOrder.findOne({
            where: { group_no },
            include: [
                {
                    model: GroupMember,
                    as: 'members',
                    include: [
                        { model: User, as: 'user', attributes: ['id', 'nickname', 'avatar_url'] }
                    ]
                },
                { model: Product, as: 'product', attributes: ['id', 'name', 'images', 'retail_price'] },
                { model: User, as: 'leader', attributes: ['id', 'nickname', 'avatar_url'] }
            ]
        });

        if (!groupOrder) {
            return res.status(404).json({ code: -1, message: '拼团不存在' });
        }

        // 计算剩余时间
        const now = new Date();
        const expireAt = new Date(groupOrder.expire_at);
        const remainSeconds = Math.max(0, Math.floor((expireAt - now) / 1000));

        // 检查当前用户是否已参团（需要登录）
        let currentUserStatus = null;
        if (req.user) {
            const myMember = groupOrder.members.find(m => m.user_id === req.user.id);
            currentUserStatus = myMember ? myMember.status : null;
        }

        res.json({
            code: 0,
            data: {
                ...groupOrder.toJSON(),
                remain_seconds: remainSeconds,
                need_more: Math.max(0, groupOrder.min_members - groupOrder.current_members),
                current_user_status: currentUserStatus,
                is_expired: remainSeconds === 0 && groupOrder.status === 'open'
            }
        });
    } catch (err) {
        next(err);
    }
}

// ============================================================
// 发起拼团（团长）
// POST /api/group/orders
// body: { activity_id, sku_id? }
// ============================================================
async function startGroupOrder(req, res, next) {
    const t = await sequelize.transaction();
    try {
        const userId = req.user.id;
        const { activity_id, sku_id, inviter_id } = req.body;

        // 1. 验证活动
        const now = new Date();
        const activity = await GroupActivity.findOne({
            where: {
                id: activity_id,
                status: 1,
                [Op.or]: [{ start_at: null }, { start_at: { [Op.lte]: now } }],
                [Op.or]: [{ end_at: null }, { end_at: { [Op.gt]: now } }]
            },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!activity) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '拼团活动不存在或已结束' });
        }

        // 2. ★ Phase 3：拼团发起者必须是会员及以上等级
        const initiator = await User.findByPk(userId, { transaction: t, attributes: ['role_level'] });
        if (!initiator || initiator.role_level < 1) {
            await t.rollback();
            return res.status(403).json({
                code: -1,
                message: '发起拼团需要会员身份，请先完成首单成为会员',
                need_upgrade: true
            });
        }

        // 3. 库存检查
        if (activity.sold_count >= activity.stock_limit) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '活动库存已售罄' });
        }

        // 2. 检查用户是否已在同商品进行中的拼团（防止重复开团）
        const existingOpen = await GroupOrder.findOne({
            where: { product_id: activity.product_id, leader_id: userId, status: 'open' },
            transaction: t
        });
        if (existingOpen) {
            await t.rollback();
            return res.json({
                code: 1,
                message: '您已有进行中的拼团',
                data: { group_no: existingOpen.group_no }
            });
        }

        // 3. 创建团次
        const expireAt = new Date(now.getTime() + activity.expire_hours * 60 * 60 * 1000);
        const groupOrder = await GroupOrder.create({
            group_no: genGroupNo(),
            activity_id: activity.id,
            product_id: activity.product_id,
            leader_id: userId,
            inviter_id: inviter_id || null,
            status: 'open',
            current_members: 1,  // 团长自己算第一个
            min_members: activity.min_members,
            max_members: activity.max_members,
            group_price: activity.group_price,
            expire_at: expireAt
        }, { transaction: t });

        // 4. 团长加入成员表
        const user = await User.findByPk(userId, { transaction: t });
        await GroupMember.create({
            group_order_id: groupOrder.id,
            user_id: userId,
            is_leader: 1,
            inviter_id: inviter_id || null,
            is_new_user: !user.parent_id ? 1 : 0,
            status: 'joined'    // 还未支付，等待支付后改为paid
        }, { transaction: t });

        await t.commit();

        // 5. 积分奖励（事务外，失败不影响主流程）
        PointService.addPoints(userId, PointService.POINT_RULES.group_start.points, 'group_start',
            groupOrder.group_no, PointService.POINT_RULES.group_start.remark)
            .catch(e => console.error('发起拼团积分奖励失败:', e));

        res.json({
            code: 0,
            message: '拼团发起成功，快去邀请好友吧！',
            data: {
                group_no: groupOrder.group_no,
                group_order_id: groupOrder.id,
                expire_at: groupOrder.expire_at,
                min_members: groupOrder.min_members,
                group_price: groupOrder.group_price
            }
        });
    } catch (err) {
        await t.rollback();
        next(err);
    }
}

// ============================================================
// 参团（普通成员）
// POST /api/group/orders/:group_no/join
// body: { inviter_id? }  分销归因用
// ============================================================
async function joinGroupOrder(req, res, next) {
    const t = await sequelize.transaction();
    try {
        const userId = req.user.id;
        const { group_no } = req.params;
        const { inviter_id } = req.body;

        // 1. 锁定并查询团次
        const groupOrder = await GroupOrder.findOne({
            where: { group_no },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!groupOrder) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '拼团不存在' });
        }

        if (groupOrder.status !== 'open') {
            await t.rollback();
            return res.status(400).json({
                code: -1,
                message: groupOrder.status === 'success' ? '该拼团已成团' : '该拼团已结束'
            });
        }

        if (new Date() > new Date(groupOrder.expire_at)) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '拼团已超时，无法参团' });
        }

        if (groupOrder.current_members >= groupOrder.max_members) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '拼团人数已满' });
        }

        // 2. 检查是否已参团
        const existing = await GroupMember.findOne({
            where: { group_order_id: groupOrder.id, user_id: userId },
            transaction: t
        });
        if (existing) {
            await t.rollback();
            return res.json({ code: 1, message: '您已参加该拼团', data: { group_no } });
        }

        // 3. ★ 分销归因处理：新用户自动绑定邀请者
        const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
        let wasBound = false;
        const effectiveInviterId = inviter_id || groupOrder.inviter_id || groupOrder.leader_id;

        if (!user.parent_id && user.role_level < 1 && effectiveInviterId && effectiveInviterId !== userId) {
            const inviter = await User.findByPk(effectiveInviterId, { transaction: t });

            if (inviter && (inviter.parent_id || inviter.role_level >= 1)) {
                // 防循环检查（简化版）
                if (inviter.parent_id !== userId) {
                    user.parent_id = inviter.id;
                    user.parent_openid = inviter.openid;
                    user.agent_id = inviter.role_level >= 3 ? inviter.id : inviter.agent_id;
                    user.joined_team_at = new Date();
                    await user.save({ transaction: t });

                    // 更新邀请人推荐数
                    await inviter.increment('referee_count', { transaction: t });
                    await inviter.reload({ transaction: t });

                    // 检查升级
                    const { checkRoleUpgrade } = require('../utils/commission');
                    const newRole = checkRoleUpgrade(inviter);
                    if (newRole) {
                        const oldRole = inviter.role_level;
                        await inviter.update({ role_level: newRole }, { transaction: t });
                        // ★ Phase 3：同级直推——升级后如果与上线同级，触发奖金（事务外异步）
                        if (inviter.parent_id) {
                            const inviterUpline = await User.findByPk(inviter.parent_id,
                                { attributes: ['id', 'role_level'], transaction: t });
                            setImmediate(() =>
                                handleSameLevelReferral(
                                    inviterUpline,
                                    { id: inviter.id, role_level: newRole }
                                ).catch(() => { })
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

        // 5. 更新团次成员数
        groupOrder.current_members += 1;
        let justSucceeded = false;

        if (groupOrder.current_members >= groupOrder.min_members) {
            // ★ 成团！
            groupOrder.status = 'success';
            groupOrder.success_at = new Date();
            justSucceeded = true;

            // 更新活动售出数
            await GroupActivity.increment('sold_count', {
                by: groupOrder.current_members,
                where: { id: groupOrder.activity_id },
                transaction: t
            });
        }

        await groupOrder.save({ transaction: t });
        await t.commit();

        // 6. 成团后处理（事务外）
        if (justSucceeded) {
            _handleGroupSuccess(groupOrder).catch(e => console.error('成团后处理失败:', e));
        } else {
            // 通知团长有新成员
            sendNotification(
                groupOrder.leader_id,
                '有好友加入了你的拼团',
                `距离成团还差 ${groupOrder.min_members - groupOrder.current_members} 人，快去邀请更多好友吧！`,
                'group',
                String(groupOrder.id)
            ).catch(() => { });
        }

        res.json({
            code: 0,
            message: justSucceeded ? '🎉 拼团成功！订单确认处理中...' : '参团成功，等待成团中...',
            data: {
                group_no,
                status: groupOrder.status,
                current_members: groupOrder.current_members,
                min_members: groupOrder.min_members,
                was_bound,           // 告知前端是否自动绑定了分销关系
                just_succeeded: justSucceeded
            }
        });
    } catch (err) {
        await t.rollback();
        next(err);
    }
}

// ============================================================
// 内部：拼团成功后置处理
// ============================================================
async function _handleGroupSuccess(groupOrder) {
    try {
        // 获取所有成员
        const members = await GroupMember.findAll({
            where: { group_order_id: groupOrder.id, status: 'joined' }
        });

        // 通知所有成员
        for (const member of members) {
            await sendNotification(
                member.user_id,
                '🎉 拼团成功！',
                `您参与的拼团已成功，系统将以拼团价 ¥${groupOrder.group_price} 为您生成订单，请前往"我的订单"完成支付。`,
                'group',
                String(groupOrder.id)
            ).catch(() => { });

            // 积分奖励
            PointService.addPoints(
                member.user_id,
                PointService.POINT_RULES.group_success.points,
                'group_success',
                groupOrder.group_no,
                PointService.POINT_RULES.group_success.remark
            ).catch(() => { });
        }
    } catch (err) {
        console.error('拼团成功后置处理失败:', err);
    }
}

// ============================================================
// 我参与的拼团列表
// GET /api/group/my
// ============================================================
async function getMyGroups(req, res, next) {
    try {
        const userId = req.user.id;
        const { status } = req.query;

        const where = { user_id: userId };
        if (status) where.status = status;

        const members = await GroupMember.findAll({
            where,
            include: [
                {
                    model: GroupOrder,
                    as: 'groupOrder',
                    where: status ? { status } : {},
                    include: [
                        { model: Product, as: 'product', attributes: ['id', 'name', 'images'] }
                    ]
                }
            ],
            order: [[{ model: GroupOrder, as: 'groupOrder' }, 'created_at', 'DESC']],
            limit: 50
        });

        res.json({ code: 0, data: members });
    } catch (err) {
        next(err);
    }
}

// ============================================================
// 系统定时任务：处理超时未成团（由 cron 或手动触发）
// POST /api/group/check-expire （仅内部调用）
// ============================================================
async function checkExpiredGroups(req, res, next) {
    try {
        const now = new Date();
        const expiredGroups = await GroupOrder.findAll({
            where: { status: 'open', expire_at: { [Op.lt]: now } },
            include: [{ model: GroupMember, as: 'members' }]
        });

        let processedCount = 0;
        for (const group of expiredGroups) {
            const t = await sequelize.transaction();
            try {
                group.status = 'fail';
                group.failed_at = now;
                await group.save({ transaction: t });

                // 标记所有成员状态
                await GroupMember.update(
                    { status: 'refunded' },
                    { where: { group_order_id: group.id, status: 'joined' }, transaction: t }
                );

                await t.commit();

                // 通知成员退款（TODO: 对接微信退款API）
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
            } catch (err) {
                await t.rollback();
                console.error(`处理超时团次 ${group.group_no} 失败:`, err);
            }
        }

        res.json({ code: 0, message: `处理完成，共处理 ${processedCount} 个超时团次` });
    } catch (err) {
        next(err);
    }
}

// ============================================================
// ★ 纯业务函数：供定时任务调用（无 req/res）
// ============================================================
async function processExpiredGroups() {
    const now = new Date();
    const expiredGroups = await GroupOrder.findAll({
        where: { status: 'open', expire_at: { [Op.lt]: now } },
        include: [{ model: GroupMember, as: 'members' }]
    });

    let processedCount = 0;
    for (const group of expiredGroups) {
        const t = await sequelize.transaction();
        try {
            await group.update({ status: 'fail', failed_at: now }, { transaction: t });
            await GroupMember.update(
                { status: 'refunded' },
                { where: { group_order_id: group.id, status: 'joined' }, transaction: t }
            );
            await t.commit();

            // 通知成员
            for (const member of group.members) {
                sendNotification(
                    member.user_id,
                    '拼团未成功，已自动退款',
                    `很遗憾，您参与的拼团未在规定时间内凑齐人数，已自动退款至原支付账户。`,
                    'group',
                    String(group.id)
                ).catch(() => { });
            }

            console.log(`[拼团定时] 团次 ${group.group_no} 超时失败处理完成`);
            processedCount++;
        } catch (e) {
            await t.rollback();
            console.error(`[拼团定时] 处理团次 ${group.group_no} 失败:`, e.message);
        }
    }
    return processedCount;
}

module.exports = {
    getActivitiesByProduct,
    getGroupOrderDetail,
    startGroupOrder,
    joinGroupOrder,
    getMyGroups,
    checkExpiredGroups,
    processExpiredGroups
};
