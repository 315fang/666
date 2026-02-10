const { Dealer, User } = require('../../../models');
const { Op } = require('sequelize');

// 获取经销商列表
const getDealers = async (req, res) => {
    try {
        const { status, keyword, page = 1, limit = 20 } = req.query;
        const where = {};

        if (status) where.status = status;
        if (keyword) {
            where[Op.or] = [
                { company_name: { [Op.like]: `%${keyword}%` } },
                { contact_name: { [Op.like]: `%${keyword}%` } }
            ];
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Dealer.findAndCountAll({
            where,
            include: [{ model: User, as: 'user', attributes: ['id', 'nickname', 'avatar_url'] }],
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
        console.error('获取经销商列表失败:', error);
        res.status(500).json({ code: -1, message: '获取经销商列表失败' });
    }
};

// 获取经销商详情
const getDealerById = async (req, res) => {
    try {
        const { id } = req.params;
        const dealer = await Dealer.findByPk(id, {
            include: [{ model: User, as: 'user', attributes: ['id', 'nickname', 'avatar_url', 'role_level'] }]
        });

        if (!dealer) {
            return res.status(404).json({ code: -1, message: '经销商不存在' });
        }

        res.json({ code: 0, data: dealer });
    } catch (error) {
        console.error('获取经销商详情失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

// 审核通过经销商
const approveDealer = async (req, res) => {
    try {
        const { id } = req.params;
        const dealer = await Dealer.findByPk(id);

        if (!dealer) {
            return res.status(404).json({ code: -1, message: '经销商不存在' });
        }

        dealer.status = 'approved';
        dealer.approved_at = new Date();
        await dealer.save();

        // 更新用户角色为店主/合伙人
        if (dealer.user_id) {
            const user = await User.findByPk(dealer.user_id);
            if (user && user.role_level < 3) {
                user.role_level = 3; // 合伙人
                await user.save();
            }
        }

        res.json({ code: 0, message: '审核通过' });
    } catch (error) {
        console.error('审核经销商失败:', error);
        res.status(500).json({ code: -1, message: '操作失败' });
    }
};

// 拒绝经销商
const rejectDealer = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const dealer = await Dealer.findByPk(id);

        if (!dealer) {
            return res.status(404).json({ code: -1, message: '经销商不存在' });
        }

        dealer.status = 'rejected';
        dealer.reject_reason = reason || '';
        await dealer.save();

        res.json({ code: 0, message: '已拒绝' });
    } catch (error) {
        console.error('拒绝经销商失败:', error);
        res.status(500).json({ code: -1, message: '操作失败' });
    }
};

// 更新经销商等级
const updateDealerLevel = async (req, res) => {
    try {
        const { id } = req.params;
        const { level } = req.body;
        const dealer = await Dealer.findByPk(id);

        if (!dealer) {
            return res.status(404).json({ code: -1, message: '经销商不存在' });
        }

        dealer.level = level;
        await dealer.save();

        res.json({ code: 0, message: '等级更新成功' });
    } catch (error) {
        console.error('更新经销商等级失败:', error);
        res.status(500).json({ code: -1, message: '操作失败' });
    }
};

module.exports = {
    getDealers,
    getDealerById,
    approveDealer,
    rejectDealer,
    updateDealerLevel
};
