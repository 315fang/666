const { User, CommissionLog, Withdrawal, Order } = require('../models');
const { Op } = require('sequelize');

// 生成提现单号
const generateWithdrawalNo = () => {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `WD${timestamp}${random}`;
};

// 获取钱包信息
const getWalletInfo = async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await User.findByPk(userId, {
            attributes: ['id', 'balance', 'total_sales']
        });

        // 统计佣金信息
        const commissionStats = await CommissionLog.findAll({
            where: { user_id: userId },
            attributes: [
                'status',
                [require('sequelize').fn('SUM', require('sequelize').col('amount')), 'total']
            ],
            group: ['status'],
            raw: true
        });

        // 构建佣金概览
        const commissionOverview = {
            available: 0,   // 可用（已结算）
            frozen: 0,      // 冻结中
            total: 0        // 累计获得
        };

        commissionStats.forEach(item => {
            const amount = parseFloat(item.total) || 0;
            if (item.status === 'settled') {
                commissionOverview.available += amount;
            } else if (item.status === 'frozen') {
                commissionOverview.frozen += amount;
            }
            commissionOverview.total += amount;
        });

        // 统计提现信息
        const withdrawnAmount = await Withdrawal.sum('actual_amount', {
            where: {
                user_id: userId,
                status: 'completed'
            }
        }) || 0;

        const pendingWithdrawal = await Withdrawal.sum('amount', {
            where: {
                user_id: userId,
                status: { [Op.in]: ['pending', 'approved', 'processing'] }
            }
        }) || 0;

        res.json({
            code: 0,
            data: {
                balance: parseFloat(user.balance) || 0,
                totalSales: parseFloat(user.total_sales) || 0,
                commission: commissionOverview,
                withdrawal: {
                    withdrawn: withdrawnAmount,
                    pending: pendingWithdrawal
                }
            }
        });
    } catch (error) {
        console.error('获取钱包信息失败:', error);
        res.status(500).json({ code: -1, message: '获取钱包信息失败' });
    }
};

// 获取佣金明细
const getCommissionLogs = async (req, res) => {
    try {
        const userId = req.user.id;
        const { status, page = 1, limit = 20 } = req.query;

        const where = { user_id: userId };
        if (status) where.status = status;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await CommissionLog.findAndCountAll({
            where,
            include: [{
                model: Order,
                as: 'order',
                attributes: ['id', 'order_no', 'total_amount', 'createdAt']
            }],
            order: [['createdAt', 'DESC']],
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
                    limit: parseInt(limit),
                    totalPages: Math.ceil(count / parseInt(limit))
                }
            }
        });
    } catch (error) {
        console.error('获取佣金明细失败:', error);
        res.status(500).json({ code: -1, message: '获取佣金明细失败' });
    }
};

// 获取提现记录
const getWithdrawals = async (req, res) => {
    try {
        const userId = req.user.id;
        const { status, page = 1, limit = 20 } = req.query;

        const where = { user_id: userId };
        if (status) where.status = status;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Withdrawal.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
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
                    limit: parseInt(limit),
                    totalPages: Math.ceil(count / parseInt(limit))
                }
            }
        });
    } catch (error) {
        console.error('获取提现记录失败:', error);
        res.status(500).json({ code: -1, message: '获取提现记录失败' });
    }
};

// 申请提现
const applyWithdrawal = async (req, res) => {
    try {
        const userId = req.user.id;
        const { amount, method = 'wechat', account_name, account_no, bank_name } = req.body;

        // 参数校验
        if (!amount || amount <= 0) {
            return res.status(400).json({ code: -1, message: '提现金额必须大于0' });
        }

        // 检查余额
        const user = await User.findByPk(userId);
        if (parseFloat(user.balance) < parseFloat(amount)) {
            return res.status(400).json({ code: -1, message: '余额不足' });
        }

        // 计算手续费（示例：0费率，可配置）
        const feeRate = 0;
        const fee = parseFloat(amount) * feeRate;
        const actualAmount = parseFloat(amount) - fee;

        // 创建提现记录
        const withdrawal = await Withdrawal.create({
            withdrawal_no: generateWithdrawalNo(),
            user_id: userId,
            amount: parseFloat(amount),
            fee,
            actual_amount: actualAmount,
            method,
            account_name,
            account_no,
            bank_name,
            status: 'pending'
        });

        // 冻结余额（扣除）
        await user.decrement('balance', { by: parseFloat(amount) });

        res.json({
            code: 0,
            data: withdrawal,
            message: '提现申请已提交，请等待审核'
        });
    } catch (error) {
        console.error('申请提现失败:', error);
        res.status(500).json({ code: -1, message: '申请提现失败' });
    }
};

module.exports = {
    getWalletInfo,
    getCommissionLogs,
    getWithdrawals,
    applyWithdrawal
};
