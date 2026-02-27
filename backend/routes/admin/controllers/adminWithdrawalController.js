const { Withdrawal, User, sequelize } = require('../../../models');
const { Op } = require('sequelize');
const { sendNotification } = require('../../../models/notificationUtil');
const { transferToWallet } = require('../../../utils/wechat');

// 获取提现列表
const getWithdrawals = async (req, res) => {
    try {
        const { status, user_id, page = 1, limit = 20 } = req.query;
        const where = {};

        if (status) where.status = status;
        if (user_id) where.user_id = user_id;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Withdrawal.findAndCountAll({
            where,
            include: [{ model: User, as: 'user', attributes: ['id', 'nickname', 'openid'] }],
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        res.json({
            code: 0,
            data: {
                list: rows,
                pagination: { total: count, page: parseInt(page), limit: parseInt(limit) }
            }
        });
    } catch (error) {
        console.error('获取提现列表失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

// 审核通过
const approveWithdrawal = async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.admin.id;

        const withdrawal = await Withdrawal.findByPk(id);
        if (!withdrawal) {
            return res.status(404).json({ code: -1, message: '提现记录不存在' });
        }

        if (withdrawal.status !== 'pending') {
            return res.status(400).json({ code: -1, message: '状态不正确' });
        }

        withdrawal.status = 'approved';
        withdrawal.processed_by = adminId;
        withdrawal.processed_at = new Date();
        await withdrawal.save();

        // 通知用户
        await sendNotification(
            withdrawal.user_id,
            '提现审核通过',
            `您的提现申请 ¥${parseFloat(withdrawal.amount).toFixed(2)} 已审核通过，即将为您处理打款。`,
            'withdrawal',
            String(withdrawal.id)
        );

        res.json({ code: 0, message: '审核通过' });
    } catch (error) {
        console.error('审核失败:', error);
        res.status(500).json({ code: -1, message: '审核失败' });
    }
};

// 拒绝提现（★ 使用事务保证余额退回和状态更新的原子性）
const rejectWithdrawal = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.admin.id;

        const withdrawal = await Withdrawal.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!withdrawal) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '提现记录不存在' });
        }

        if (withdrawal.status !== 'pending') {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '状态不正确' });
        }

        // 退还用户余额
        await User.increment('balance', { by: parseFloat(withdrawal.amount), where: { id: withdrawal.user_id }, transaction: t });

        withdrawal.status = 'rejected';
        withdrawal.reject_reason = reason;
        withdrawal.processed_by = adminId;
        withdrawal.processed_at = new Date();
        await withdrawal.save({ transaction: t });

        await t.commit();

        // 通知用户（事务外发送，失败不影响业务）
        await sendNotification(
            withdrawal.user_id,
            '提现申请被拒绝',
            `您的提现申请 ¥${parseFloat(withdrawal.amount).toFixed(2)} 已被拒绝${reason ? '，原因: ' + reason : ''}。余额已退回。`,
            'withdrawal',
            String(withdrawal.id)
        );

        res.json({ code: 0, message: '已拒绝' });
    } catch (error) {
        await t.rollback();
        console.error('拒绝失败:', error);
        res.status(500).json({ code: -1, message: '操作失败' });
    }
};

// 完成打款
const completeWithdrawal = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { remark } = req.body;

        const withdrawal = await Withdrawal.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!withdrawal) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '提现记录不存在' });
        }

        if (withdrawal.status !== 'approved') {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '请先审核通过' });
        }

        if (withdrawal.method !== 'wechat') {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '该提现方式不支持自动打款' });
        }

        const user = await User.findByPk(withdrawal.user_id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!user || !user.openid) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '用户openid缺失' });
        }

        const amount = Math.round(parseFloat(withdrawal.actual_amount) * 100);
        if (!amount || amount <= 0) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '打款金额不合法' });
        }

        const clientIp = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '127.0.0.1')
            .split(',')[0].trim().replace(/^::ffff:/, '');

        try {
            await transferToWallet({
                partnerTradeNo: withdrawal.withdrawal_no,
                openid: user.openid,
                amount,
                desc: remark || '佣金提现',
                spbillCreateIp: clientIp
            });
        } catch (err) {
            withdrawal.status = 'failed';
            withdrawal.remark = (withdrawal.remark ? withdrawal.remark + ' | ' : '') + `自动打款失败: ${err.message}`;
            await withdrawal.save({ transaction: t });
            await t.commit();
            return res.status(500).json({ code: -1, message: '自动打款失败' });
        }

        withdrawal.status = 'completed';
        withdrawal.completed_at = new Date();
        if (remark) withdrawal.remark = remark;
        await withdrawal.save({ transaction: t });

        await t.commit();

        await sendNotification(
            withdrawal.user_id,
            '提现到账通知',
            `您的提现 ¥${parseFloat(withdrawal.actual_amount).toFixed(2)} 已成功打款到账，请注意查收。`,
            'withdrawal',
            String(withdrawal.id)
        );

        res.json({ code: 0, message: '打款完成' });
    } catch (error) {
        await t.rollback();
        console.error('完成打款失败:', error);
        res.status(500).json({ code: -1, message: '操作失败' });
    }
};

module.exports = {
    getWithdrawals,
    approveWithdrawal,
    rejectWithdrawal,
    completeWithdrawal
};
