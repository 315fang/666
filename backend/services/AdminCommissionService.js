const { CommissionLog, sequelize } = require('../models');
const { Op } = require('sequelize');
const { sendNotification } = require('../models/notificationUtil');

class AdminCommissionService {

    /**
     * 单条审批通过
     */
    async approveCommission(id, adminId, remarkStr) {
        const t = await sequelize.transaction();
        try {
            const commission = await CommissionLog.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
            if (!commission) {
                await t.rollback();
                throw new Error('佣金记录不存在');
            }

            if (commission.status !== 'pending_approval') {
                await t.rollback();
                throw new Error('只有待审批状态的佣金才能审批');
            }

            commission.status = 'approved';
            commission.approved_by = adminId;
            commission.approved_at = new Date();
            commission.available_at = new Date(); // 审批通过后立即可结算
            if (remarkStr) {
                commission.remark = (commission.remark || '') + ` [审批备注: ${remarkStr}]`;
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

            return true;
        } catch (error) {
            await t.rollback();
            throw error;
        }
    }

    /**
     * 单条拒绝
     */
    async rejectCommission(id, adminId, reason) {
        const t = await sequelize.transaction();
        try {
            const commission = await CommissionLog.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
            if (!commission) {
                await t.rollback();
                throw new Error('佣金记录不存在');
            }

            if (!['pending_approval', 'frozen'].includes(commission.status)) {
                await t.rollback();
                throw new Error('当前状态不允许拒绝');
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

            return true;
        } catch (error) {
            await t.rollback();
            throw error;
        }
    }

    /**
     * 批量审批通过
     */
    async batchApproveCommissions(ids, adminId) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            throw new Error('请选择要审批的记录');
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

        // 批量通知用户 (仅通知本次更新的)
        const approvedLogs = await CommissionLog.findAll({
            where: {
                id: { [Op.in]: ids },
                status: 'approved',
                approved_at: { [Op.gte]: now }
            }
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

        return updateCount;
    }

    /**
     * 批量拒绝
     */
    async batchRejectCommissions(ids, adminId, reason) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            throw new Error('请选择要拒绝的记录');
        }

        const now = new Date();
        const safeReason = String(reason || '').trim();
        const t = await sequelize.transaction();
        try {
            const rejectedLogs = await CommissionLog.findAll({
                where: {
                    id: { [Op.in]: ids },
                    status: { [Op.in]: ['pending_approval', 'frozen'] }
                },
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            for (const log of rejectedLogs) {
                log.status = 'cancelled';
                log.approved_by = adminId;
                log.approved_at = now;
                log.remark = (log.remark || '') + ` [管理员批量拒绝${safeReason ? ': ' + safeReason : ''}]`;
                await log.save({ transaction: t });
            }

            await t.commit();

            for (const log of rejectedLogs) {
                await sendNotification(
                    log.user_id,
                    '佣金审批未通过',
                    `您有一笔佣金 ¥${parseFloat(log.amount).toFixed(2)} 审批未通过${safeReason ? '，原因：' + safeReason : ''}。`,
                    'commission',
                    log.order_id
                );
            }

            return rejectedLogs.length;
        } catch (error) {
            await t.rollback();
            throw error;
        }
    }
}

module.exports = new AdminCommissionService();
