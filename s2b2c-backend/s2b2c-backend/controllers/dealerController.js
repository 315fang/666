const { Dealer, User, Order, Product } = require('../models');
const { Op } = require('sequelize');

// 生成经销商编号
const generateDealerNo = () => {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `D${timestamp}${random}`;
};

// 申请成为经销商
const applyDealer = async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            company_name, license_no, license_image,
            contact_name, contact_phone, contact_email, address
        } = req.body;

        if (!contact_name || !contact_phone) {
            return res.status(400).json({ code: -1, message: '联系人和电话必填' });
        }

        // 检查是否已申请
        const existing = await Dealer.findOne({ where: { user_id: userId } });
        if (existing) {
            return res.status(400).json({ code: -1, message: '已提交申请，请勿重复提交' });
        }

        const dealer = await Dealer.create({
            user_id: userId,
            dealer_no: generateDealerNo(),
            company_name, license_no, license_image,
            contact_name, contact_phone, contact_email, address,
            status: 'pending'
        });

        res.json({ code: 0, data: dealer, message: '申请已提交' });
    } catch (error) {
        console.error('申请经销商失败:', error);
        res.status(500).json({ code: -1, message: '申请失败' });
    }
};

// 获取经销商信息
const getDealerInfo = async (req, res) => {
    try {
        const userId = req.user.id;
        const dealer = await Dealer.findOne({ where: { user_id: userId } });

        if (!dealer) {
            return res.json({ code: 0, data: null, message: '未申请经销商' });
        }

        res.json({ code: 0, data: dealer });
    } catch (error) {
        console.error('获取经销商信息失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

// 经销商统计数据
const getDealerStats = async (req, res) => {
    try {
        const userId = req.user.id;
        const dealer = await Dealer.findOne({ where: { user_id: userId, status: 'approved' } });

        if (!dealer) {
            return res.status(400).json({ code: -1, message: '非有效经销商' });
        }

        const teamMembers = await User.findAll({ where: { parent_id: userId } });
        const teamIds = teamMembers.map(m => m.id);

        // 团队订单统计
        const teamOrders = await Order.findAll({
            where: { buyer_id: { [Op.in]: [userId, ...teamIds] }, status: { [Op.ne]: 'cancelled' } },
            attributes: ['total_amount', 'status']
        });

        const totalSales = teamOrders.reduce((sum, o) => sum + parseFloat(o.total_amount), 0);
        const completedOrders = teamOrders.filter(o => o.status === 'completed').length;

        res.json({
            code: 0,
            data: {
                dealer_level: dealer.level,
                team_count: teamIds.length,
                total_sales: totalSales,
                total_orders: teamOrders.length,
                completed_orders: completedOrders,
                commission: dealer.total_commission
            }
        });
    } catch (error) {
        console.error('获取经销商统计失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

// 获取团队成员
const getDealerTeam = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await User.findAndCountAll({
            where: { parent_id: userId },
            attributes: ['id', 'nickname', 'avatar_url', 'role_level', 'order_count', 'total_sales', 'created_at'],
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
        console.error('获取团队成员失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

// 获取团队订单
const getDealerOrders = async (req, res) => {
    try {
        const userId = req.user.id;
        const { status, page = 1, limit = 20 } = req.query;

        const teamMembers = await User.findAll({
            where: { parent_id: userId },
            attributes: ['id']
        });
        const teamIds = teamMembers.map(m => m.id);

        const where = { buyer_id: { [Op.in]: [userId, ...teamIds] } };
        if (status) where.status = status;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Order.findAndCountAll({
            where,
            include: [
                { model: User, as: 'buyer', attributes: ['id', 'nickname'] },
                { model: Product, as: 'product', attributes: ['id', 'name', 'images'] }
            ],
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
        console.error('获取团队订单失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

module.exports = {
    applyDealer,
    getDealerInfo,
    getDealerStats,
    getDealerTeam,
    getDealerOrders
};
