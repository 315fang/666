const { Withdrawal, User } = require('../../../models');
const { Op } = require('sequelize');

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
            order: [['createdAt', 'DESC']],
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

        res.json({ code: 0, message: '审核通过' });
    } catch (error) {
        console.error('审核失败:', error);
        res.status(500).json({ code: -1, message: '审核失败' });
    }
};

// 拒绝提现
const rejectWithdrawal = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.admin.id;

        const withdrawal = await Withdrawal.findByPk(id);
        if (!withdrawal) {
            return res.status(404).json({ code: -1, message: '提现记录不存在' });
        }

        if (withdrawal.status !== 'pending') {
            return res.status(400).json({ code: -1, message: '状态不正确' });
        }

        // 退还用户余额
        const user = await User.findByPk(withdrawal.user_id);
        await user.increment('balance', { by: parseFloat(withdrawal.amount) });

        withdrawal.status = 'rejected';
        withdrawal.reject_reason = reason;
        withdrawal.processed_by = adminId;
        withdrawal.processed_at = new Date();
        await withdrawal.save();

        res.json({ code: 0, message: '已拒绝' });
    } catch (error) {
        console.error('拒绝失败:', error);
        res.status(500).json({ code: -1, message: '操作失败' });
    }
};

// 完成打款
const completeWithdrawal = async (req, res) => {
    try {
        const { id } = req.params;
        const { remark } = req.body;

        const withdrawal = await Withdrawal.findByPk(id);
        if (!withdrawal) {
            return res.status(404).json({ code: -1, message: '提现记录不存在' });
        }

        if (withdrawal.status !== 'approved') {
            return res.status(400).json({ code: -1, message: '请先审核通过' });
        }

        withdrawal.status = 'completed';
        withdrawal.completed_at = new Date();
        if (remark) withdrawal.remark = remark;
        await withdrawal.save();

        res.json({ code: 0, message: '打款完成' });
    } catch (error) {
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
