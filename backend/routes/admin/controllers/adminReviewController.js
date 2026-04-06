const { Review, Product, User, Order } = require('../../../models');
const { Op } = require('sequelize');

const getReviews = async (req, res) => {
    try {
        const { page = 1, limit = 20, status, product_id, keyword } = req.query;
        const where = {};
        if (status !== undefined && status !== '') where.status = parseInt(status, 10);
        if (product_id) where.product_id = product_id;
        if (keyword) where.content = { [Op.like]: `%${keyword}%` };

        const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
        const { count, rows } = await Review.findAndCountAll({
            where,
            include: [
                { model: Product, as: 'product', attributes: ['id', 'name', 'images'] },
                { model: User, as: 'user', attributes: ['id', 'nickname', 'avatar_url', 'member_no'] },
                { model: Order, as: 'order', attributes: ['id', 'order_no'] }
            ],
            order: [['is_featured', 'DESC'], ['created_at', 'DESC']],
            offset,
            limit: parseInt(limit, 10)
        });

        res.json({
            code: 0,
            data: {
                list: rows,
                pagination: { total: count, page: parseInt(page, 10), limit: parseInt(limit, 10) }
            }
        });
    } catch (error) {
        console.error('获取评论列表失败:', error);
        res.json({ code: 0, data: { list: [], pagination: { total: 0, page: parseInt(req.query.page || 1, 10), limit: parseInt(req.query.limit || 20, 10) } } });
    }
};

const updateReview = async (req, res) => {
    try {
        const { id } = req.params;
        const review = await Review.findByPk(id);
        if (!review) {
            return res.status(404).json({ code: -1, message: '评论不存在' });
        }
        await review.update(req.body);
        res.json({ code: 0, data: review, message: '更新成功' });
    } catch (error) {
        console.error('更新评论失败:', error);
        res.status(500).json({ code: -1, message: '更新评论失败' });
    }
};

module.exports = { getReviews, updateReview };
