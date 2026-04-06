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
    Product, User
} = require('../models');
const GroupCoreService = require('../services/GroupCoreService');

/** 活动时间在有效期内（避免 where 里重复 [Op.or] 键被后者覆盖） */
function buildGroupActivityWindowWhere(now) {
    return {
        [Op.and]: [
            { [Op.or]: [{ start_at: null }, { start_at: { [Op.lte]: now } }] },
            { [Op.or]: [{ end_at: null }, { end_at: { [Op.gt]: now } }] }
        ]
    };
}

// ============================================================
// 获取拼团活动
// GET /api/group/activities
// - 传 product_id：该商品下的有效活动（商品详情）
// - 不传：全部有效活动（拼团专区列表）；仅返回上架且开启「参与拼团」的商品
// ============================================================
async function getActivitiesByProduct(req, res, next) {
    try {
        const product_id = req.query.product_id;
        const now = new Date();

        const productWhere = { status: 1 };
        if (product_id) {
            productWhere.id = product_id;
        } else {
            productWhere.enable_group_buy = 1;
        }

        const activities = await GroupActivity.findAll({
            where: {
                status: 1,
                ...(product_id ? { product_id } : {}),
                ...buildGroupActivityWindowWhere(now)
            },
            include: [
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'images', 'retail_price', 'enable_group_buy', 'status', 'description', 'market_price'],
                    where: productWhere,
                    required: true
                }
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
                { model: Product, as: 'product', attributes: ['id', 'name', 'images', 'retail_price', 'category_id', 'supports_pickup', 'description', 'market_price'] },
                {
                    model: GroupActivity,
                    as: 'activity',
                    attributes: [
                        'id', 'sku_id', 'product_id',
                        'min_members', 'max_members', 'group_price', 'original_price',
                        'expire_hours', 'stock_limit', 'sold_count',
                        'start_at', 'end_at'
                    ]
                },
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
    try {
        const userId = req.user.id;
        const { activity_id, sku_id, inviter_id } = req.body;

        const result = await GroupCoreService.startGroupOrder({
            userId,
            activity_id,
            sku_id,
            inviter_id
        });

        res.json({
            code: 0,
            message: '拼团发起成功，快去邀请好友吧！',
            data: result
        });
    } catch (err) {
        if (err.need_upgrade) {
            return res.status(err.status || 403).json({
                code: -1,
                message: err.message,
                need_upgrade: true
            });
        }
        if (err.code === 1) {
            return res.json({
                code: 1,
                message: err.message,
                data: err.data
            });
        }
        res.status(400).json({ code: -1, message: err.message || '发起失败' });
    }
}

// ============================================================
// 参团（普通成员）
// POST /api/group/orders/:group_no/join
// body: { inviter_id? }  分销归因用
// ============================================================
async function joinGroupOrder(req, res, next) {
    try {
        const userId = req.user.id;
        const { group_no } = req.params;
        const { inviter_id } = req.body;

        const result = await GroupCoreService.joinGroupOrder({
            userId,
            group_no,
            inviter_id
        });

        res.json({
            code: 0,
            message: result.just_succeeded ? '🎉 拼团成功！订单确认处理中...' : '参团成功，等待成团中...',
            data: result
        });
    } catch (err) {
        if (err.status === 404) {
            return res.status(404).json({ code: -1, message: err.message });
        }
        if (err.code === 1) {
            return res.json({ code: 1, message: err.message, data: err.data });
        }
        res.status(400).json({ code: -1, message: err.message || '参团失败' });
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
        const count = await GroupCoreService.processExpiredGroups();
        res.json({ code: 0, message: `处理完成，共处理 ${count} 个超时团次` });
    } catch (err) {
        next(err);
    }
}

// ============================================================
// ★ 纯业务函数：供定时任务调用（无 req/res）
// ============================================================
async function processExpiredGroups() {
    return GroupCoreService.processExpiredGroups();
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
