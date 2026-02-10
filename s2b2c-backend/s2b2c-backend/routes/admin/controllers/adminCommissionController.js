const { CommissionLog, User, Order, sequelize } = require('../../../models');
const { Op } = require('sequelize');
const { sendNotification } = require('../../../models/notificationUtil');

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
 * ★ 审批通过单条佣金
 */
const approveCommission = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { remark } = req.body;
        const adminId = req.admin.id;

        const commission = await CommissionLog.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!commission) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '佣金记录不存在' });
        }

        if (commission.status !== 'pending_approval') {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '只有待审批状态的佣金才能审批' });
        }

        commission.status = 'approved';
        commission.approved_by = adminId;
        commission.approved_at = new Date();
        commission.available_at = new Date(); // 审批通过后立即可结算
        if (remark) {
            commission.remark = (commission.remark || '') + ` [审批备注: ${remark}]`;
        }
        await commission.save({ transaction: t });

        await t.commit();

        // 通知用户
        await sendNotification(
            commission.user_id,
            '佣金审批通过',
            `您有一笔佣金 ¥${parseFloat(commission.amount).toFixed(2)} 已审批通过，将在下次结算时到账。`,
            'commission',
            commission.order_id
        );

        res.json({ code: 0, message: '审批通过' });
    } catch (error) {
        await t.rollback();
        console.error('审批失败:', error);
        res.status(500).json({ code: -1, message: '审批失败' });
    }
};

/**
 * ★ 拒绝单条佣金
 */
const rejectCommission = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.admin.id;

        const commission = await CommissionLog.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!commission) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '佣金记录不存在' });
        }

        if (!['pending_approval', 'frozen'].includes(commission.status)) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '当前状态不允许拒绝' });
        }

        commission.status = 'cancelled';
        commission.approved_by = adminId;
        commission.approved_at = new Date();
        commission.remark = (commission.remark || '') + ` [管理员拒绝${reason ? ': ' + reason : ''}]`;
        await commission.save({ transaction: t });

        await t.commit();

        // 通知用户
        await sendNotification(
            commission.user_id,
            '佣金审批未通过',
            `您有一笔佣金 ¥${parseFloat(commission.amount).toFixed(2)} 审批未通过${reason ? '，原因：' + reason : ''}。`,
            'commission',
            commission.order_id
        );

        res.json({ code: 0, message: '已拒绝' });
    } catch (error) {
        await t.rollback();
        console.error('拒绝失败:', error);
        res.status(500).json({ code: -1, message: '操作失败' });
    }
};

/**
 * ★ 批量审批通过
 */
const batchApproveCommissions = async (req, res) => {
    try {
        const { ids } = req.body;
        const adminId = req.admin.id;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ code: -1, message: '请选择要审批的记录' });
        }

        const now = new Date();
        const [updateCount] = await CommissionLog.update(
            {
                status: 'approved',
                approved_by: adminId,
                approved_at: now,
                available_at: now
            },
            {
                where: {
                    id: { [Op.in]: ids },
                    status: 'pending_approval'
                }
            }
        );

        // 批量通知用户
        const approvedLogs = await CommissionLog.findAll({
            where: { id: { [Op.in]: ids }, status: 'approved' }
        });

        for (const log of approvedLogs) {
            await sendNotification(
                log.user_id,
                '佣金审批通过',
                `您有一笔佣金 ¥${parseFloat(log.amount).toFixed(2)} 已审批通过，将在下次结算时到账。`,
                'commission',
                log.order_id
            );
        }

        res.json({ code: 0, message: `已审批通过 ${updateCount} 条记录` });
    } catch (error) {
        console.error('批量审批失败:', error);
        res.status(500).json({ code: -1, message: '批量审批失败' });
    }
};

/**
 * ★ 批量拒绝
 */
const batchRejectCommissions = async (req, res) => {
    try {
        const { ids, reason } = req.body;
        const adminId = req.admin.id;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ code: -1, message: '请选择要拒绝的记录' });
        }

        const now = new Date();
        const [updateCount] = await CommissionLog.update(
            {
                status: 'cancelled',
                approved_by: adminId,
                approved_at: now,
                remark: sequelize.literal(`CONCAT(IFNULL(remark, ''), ' [管理员批量拒绝${reason ? ': ' + reason : ''}]')`)
            },
            {
                where: {
                    id: { [Op.in]: ids },
                    status: { [Op.in]: ['pending_approval', 'frozen'] }
                }
            }
        );

        // 批量通知用户
        const rejectedLogs = await CommissionLog.findAll({
            where: { id: { [Op.in]: ids }, status: 'cancelled' }
        });

        for (const log of rejectedLogs) {
            await sendNotification(
                log.user_id,
                '佣金审批未通过',
                `您有一笔佣金 ¥${parseFloat(log.amount).toFixed(2)} 审批未通过${reason ? '，原因：' + reason : ''}。`,
                'commission',
                log.order_id
            );
        }

        res.json({ code: 0, message: `已拒绝 ${updateCount} 条记录` });
    } catch (error) {
        console.error('批量拒绝失败:', error);
        res.status(500).json({ code: -1, message: '批量拒绝失败' });
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
