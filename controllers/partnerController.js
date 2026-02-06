const { User, Order, CommissionLog } = require('../models');
const { Op } = require('sequelize');

/**
 * 获取合伙人数据
 */
async function getPartnerData(req, res, next) {
    try {
        const user = req.user;

        if (user.role_level < 3) {
            return res.status(403).json({
                success: false,
                message: '仅合伙人可访问'
            });
        }

        // 查询团队人数（包括间接下级）
        const teamCount = await User.count({
            where: { parent_id: user.id }
        });

        // 查询本月收益
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const monthCommissions = await CommissionLog.findAll({
            where: {
                user_id: user.id,
                created_at: { [Op.gte]: startOfMonth }
            }
        });

        const monthEarnings = monthCommissions.reduce((sum, log) => sum + parseFloat(log.amount), 0);

        // 销售数据（最近7天）
        const last7Days = new Date();
        last7Days.setDate(last7Days.getDate() - 6);
        last7Days.setHours(0, 0, 0, 0);

        const salesData = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(last7Days);
            date.setDate(date.getDate() + i);
            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);

            const dayOrders = await Order.count({
                where: {
                    distributor_id: user.id,
                    created_at: {
                        [Op.gte]: date,
                        [Op.lt]: nextDate
                    }
                }
            });

            salesData.push({
                date: `${date.getMonth() + 1}/${date.getDate()}`,
                count: dayOrders
            });
        }

        // 证书数据
        const certificateData = {
            code: `P${user.id.toString().padStart(6, '0')}`,
            name: user.nickname,
            date: user.created_at
        };

        res.json({
            success: true,
            data: {
                teamCount,
                monthEarnings: monthEarnings.toFixed(2),
                salesData,
                certificateData,
                certificateUrl: '' // 可以生成实际证书图片
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 合伙人充值补货
 */
async function partnerRecharge(req, res, next) {
    try {
        const user = req.user;
        const { amount, stockCount } = req.body;

        if (!amount || !stockCount) {
            return res.status(400).json({
                success: false,
                message: '缺少充值金额或库存数量'
            });
        }

        // 这里应该调用微信支付接口
        // 暂时模拟支付成功

        // 更新库存
        await user.increment('stock_count', { by: stockCount });

        // 如果是首次充值且金额>=3000，升级为合伙人
        if (user.role_level < 3 && amount >= 3000) {
            await user.update({ role_level: 3 });
        }

        res.json({
            success: true,
            message: '补货成功',
            newStock: user.stock_count + stockCount
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 获取合伙人证书数据
 */
async function getPartnerCertificate(req, res, next) {
    try {
        const user = req.user;

        if (user.role_level < 3) {
            return res.status(403).json({
                success: false,
                message: '仅合伙人可访问'
            });
        }

        const certificateData = {
            code: `P${user.id.toString().padStart(6, '0')}`,
            name: user.nickname,
            date: user.created_at
        };

        res.json({
            success: true,
            data: certificateData,
            certificateUrl: '' // 可以生成实际证书图片
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getPartnerData,
    partnerRecharge,
    getPartnerCertificate
};
