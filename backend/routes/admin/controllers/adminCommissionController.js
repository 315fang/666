const { CommissionLog, User, Order, sequelize } = require('../../../models');
const { Op } = require('sequelize');
const { sendNotification } = require('../../../models/notificationUtil');
const AdminCommissionService = require('../../../services/AdminCommissionService');

/**
 * 获取全局佣金/分润记录
 */
const getCommissionLogs = async (req, res) => {
    try {
        const { type, status, user_id, page = 1, limit = 20 } = req.query;
        const where = {};

        if (type) where.type = type;
        if (status) where.status = status;
        if (user_id) where.user_id = user_id;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await CommissionLog.findAndCountAll({
            where,
            include: [
                { model: User, as: 'user', attributes: ['id', 'nickname', 'avatar_url', 'role_level'] },
                { model: Order, as: 'order', attributes: ['id', 'order_no', 'total_amount', 'status'] }
            ],
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        // 统计信息
        const stats = await getCommissionStats();

        res.json({
            code: 0,
            data: {
                list: rows,
                pagination: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit)
                },
                stats
            }
        });
    } catch (error) {
        console.error('获取分润记录失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * 获取佣金统计数据
 */
const getCommissionStats = async () => {
    try {
        const [frozenAmount, pendingApprovalAmount, approvedAmount, settledAmount] = await Promise.all([
            CommissionLog.sum('amount', { where: { status: 'frozen' } }),
            CommissionLog.sum('amount', { where: { status: 'pending_approval' } }),
            CommissionLog.sum('amount', { where: { status: 'approved' } }),
            CommissionLog.sum('amount', { where: { status: 'settled' } })
        ]);

        const [pendingApprovalCount, approvedCount] = await Promise.all([
            CommissionLog.count({ where: { status: 'pending_approval' } }),
            CommissionLog.count({ where: { status: 'approved' } })
        ]);

        return {
            totalFrozen: frozenAmount || 0,
            totalPendingApproval: pendingApprovalAmount || 0,
            totalApproved: approvedAmount || 0,
            totalSettled: settledAmount || 0,
            pendingApprovalCount,
            approvedCount
        };
    } catch (error) {
        console.error('获取佣金统计失败:', error);
        return {
            totalFrozen: 0,
            totalPendingApproval: 0,
            totalApproved: 0,
            totalSettled: 0,
            pendingApprovalCount: 0,
            approvedCount: 0
        };
    }
};

/**
 * 获取佣金详情
 */
const getCommissionById = async (req, res) => {
    try {
        const { id } = req.params;
        const commission = await CommissionLog.findByPk(id, {
            include: [
                { model: User, as: 'user', attributes: ['id', 'nickname', 'avatar_url', 'role_level', 'phone'] },
                {
                    model: Order,
                    as: 'order',
                    attributes: ['id', 'order_no', 'total_amount', 'status', 'buyer_id', 'created_at', 'completed_at']
                }
            ]
        });

        if (!commission) {
            return res.status(404).json({ code: -1, message: '佣金记录不存在' });
        }

        res.json({ code: 0, data: commission });
    } catch (error) {
        console.error('获取佣金详情失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * ★ 审批通过单条佣金 (委托至 AdminCommissionService)
 */
const approveCommission = async (req, res) => {
    try {
        const { id } = req.params;
        const { remark } = req.body;
        const adminId = req.admin.id;
        await AdminCommissionService.approveCommission(id, adminId, remark);
        res.json({ code: 0, message: '审批通过' });
    } catch (error) {
        console.error('审批失败:', error);
        const status = error.message.includes('不存在') ? 404 : 400;
        res.status(status).json({ code: -1, message: error.message || '审批失败' });
    }
};

/**
 * ★ 拒绝单条佣金 (委托至 AdminCommissionService)
 */
const rejectCommission = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.admin.id;
        await AdminCommissionService.rejectCommission(id, adminId, reason);
        res.json({ code: 0, message: '已拒绝' });
    } catch (error) {
        console.error('拒绝失败:', error);
        const status = error.message.includes('不存在') ? 404 : 400;
        res.status(status).json({ code: -1, message: error.message || '操作失败' });
    }
};

/**
 * ★ 批量审批通过 (委托至 AdminCommissionService)
 */
const batchApproveCommissions = async (req, res) => {
    try {
        const { ids } = req.body;
        const adminId = req.admin.id;
        const updateCount = await AdminCommissionService.batchApproveCommissions(ids, adminId);
        res.json({ code: 0, message: `已审批通过 ${updateCount} 条记录` });
    } catch (error) {
        console.error('批量审批失败:', error);
        res.status(400).json({ code: -1, message: error.message || '批量审批失败' });
    }
};

/**
 * ★ 批量拒绝 (委托至 AdminCommissionService)
 */
const batchRejectCommissions = async (req, res) => {
    try {
        const { ids, reason } = req.body;
        const adminId = req.admin.id;
        const updateCount = await AdminCommissionService.batchRejectCommissions(ids, adminId, reason);
        res.json({ code: 0, message: `已拒绝 ${updateCount} 条记录` });
    } catch (error) {
        console.error('批量拒绝失败:', error);
        res.status(400).json({ code: -1, message: error.message || '批量拒绝失败' });
    }
};

/**
 * 获取待审批佣金列表（快捷入口）
 */
const getPendingApprovals = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await CommissionLog.findAndCountAll({
            where: { status: 'pending_approval' },
            include: [
                { model: User, as: 'user', attributes: ['id', 'nickname', 'avatar_url', 'role_level'] },
                { model: Order, as: 'order', attributes: ['id', 'order_no', 'total_amount', 'status', 'completed_at'] }
            ],
            order: [['refund_deadline', 'ASC']], // 按售后期结束时间排序，早的在前
            offset,
            limit: parseInt(limit)
        });

        res.json({
            code: 0,
            data: {
                list: rows,
                pagination: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit)
                }
            }
        });
    } catch (error) {
        console.error('获取待审批列表失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

module.exports = {
    getCommissionLogs,
    getCommissionById,
    approveCommission,
    rejectCommission,
    batchApproveCommissions,
    batchRejectCommissions,
    getPendingApprovals
};
