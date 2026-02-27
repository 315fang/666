const { User, CommissionLog, Withdrawal, Order, sequelize } = require('../models');
const { Op } = require('sequelize');
const { sendNotification } = require('../models/notificationUtil');
const constants = require('../config/constants');

const ADMIN_USER_ID = constants.ADMIN.USER_ID;

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
        // 状态说明：
        // - frozen: 冻结中（等待售后期结束）
        // - pending_approval: 待审批（售后期结束，等待管理员审批）
        // - approved: 审批通过（等待自动结算）
        // - settled: 已结算（已到账，可提现）
        const commissionOverview = {
            available: 0,       // 可用（已结算，到账可提现）
            frozen: 0,          // 冻结中（售后期内）
            pendingApproval: 0, // 待审批（售后期结束，等待管理员审批）
            approved: 0,        // 审批通过（等待结算）
            total: 0            // 累计获得（不含已取消）
        };

        commissionStats.forEach(item => {
            const amount = parseFloat(item.total) || 0;
            if (item.status === 'settled') {
                commissionOverview.available += amount;
                commissionOverview.total += amount;
            } else if (item.status === 'frozen') {
                commissionOverview.frozen += amount;
                commissionOverview.total += amount;
            } else if (item.status === 'pending_approval') {
                commissionOverview.pendingApproval += amount;
                commissionOverview.total += amount;
            } else if (item.status === 'approved') {
                commissionOverview.approved += amount;
                commissionOverview.total += amount;
            }
            // cancelled 状态不计入 total
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
                attributes: ['id', 'order_no', 'total_amount', 'created_at']
            }],
            order: [['created_at', 'DESC']],
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
            order: [['created_at', 'DESC']],
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

// 申请提现（★ 使用事务+行锁，防止并发多次提现导致余额为负）
const applyWithdrawal = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const userId = req.user.id;
        const { amount, method = 'wechat', account_name, account_no, bank_name } = req.body;

        // 参数校验
        if (!amount || amount <= 0) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '提现金额必须大于0' });
        }

        // ★ 最低提现金额校验
        if (parseFloat(amount) < constants.WITHDRAWAL.MIN_AMOUNT) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: `最低提现金额为 ¥${constants.WITHDRAWAL.MIN_AMOUNT}` });
        }

        // ★ 单次最大提现金额校验
        if (parseFloat(amount) > constants.WITHDRAWAL.MAX_SINGLE_AMOUNT) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: `单次最大提现金额为 ¥${constants.WITHDRAWAL.MAX_SINGLE_AMOUNT}` });
        }

        // ★ 在事务中锁定用户行，防止并发
        const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });

        // ★ 欠款冻结机制：有欠款时禁止提现
        const userDebt = parseFloat(user.debt_amount) || 0;
        if (userDebt > 0) {
            await t.rollback();
            return res.status(400).json({
                code: -1,
                message: `您有待还欠款 ¥${userDebt.toFixed(2)}，请等待系统自动扣除后再提现`
            });
        }

        if (parseFloat(user.balance) < parseFloat(amount)) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '余额不足' });
        }

        // ★ 单日提现次数限制
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayCount = await Withdrawal.count({
            where: {
                user_id: userId,
                created_at: { [Op.gte]: todayStart },
                status: { [Op.notIn]: ['rejected', 'failed'] }
            },
            transaction: t
        });
        if (todayCount >= constants.WITHDRAWAL.MAX_DAILY_COUNT) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: `每日最多提现${constants.WITHDRAWAL.MAX_DAILY_COUNT}次` });
        }

        // 计算手续费（从集中配置读取费率，使用 toFixed+parseFloat 防浮点误差）
        const feeRate = constants.WITHDRAWAL.FEE_RATE;
        const fee = parseFloat((parseFloat(amount) * feeRate).toFixed(2));
        const actualAmount = parseFloat((parseFloat(amount) - fee).toFixed(2));

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
        }, { transaction: t });

        // 冻结余额（扣除）
        await user.decrement('balance', { by: parseFloat(amount), transaction: t });

        await t.commit();

        // 发送通知（事务外，失败不影响业务）
        await sendNotification(
            userId,
            '提现申请已提交',
            `您申请提现 ¥${parseFloat(amount).toFixed(2)}，正在等待审核。`,
            'withdrawal',
            String(withdrawal.id)
        );

        await sendNotification(
            ADMIN_USER_ID,
            '新提现申请',
            `用户 ${user.nickname || '未知'} 申请提现 ¥${parseFloat(amount).toFixed(2)}，请及时审核。`,
            'withdrawal_admin',
            String(withdrawal.id)
        );

        res.json({
            code: 0,
            data: withdrawal,
            message: '提现申请已提交，请等待审核'
        });
    } catch (error) {
        await t.rollback();
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
