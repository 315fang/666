const { Banner, Content } = require('../models');
const { Op } = require('sequelize');

// 获取轮播图列表
const getBanners = async (req, res) => {
    try {
        const { position = 'home' } = req.query;
        const now = new Date();

        const banners = await Banner.findAll({
            where: {
                status: 1,
                position,
                [Op.or]: [
                    { start_time: null, end_time: null },
                    {
                        start_time: { [Op.lte]: now },
                        end_time: { [Op.gte]: now }
                    },
                    {
                        start_time: { [Op.lte]: now },
                        end_time: null
                    },
                    {
                        start_time: null,
                        end_time: { [Op.gte]: now }
                    }
                ]
            },
            order: [['sort_order', 'DESC'], ['id', 'ASC']],
            attributes: ['id', 'title', 'image_url', 'link_type', 'link_value']
        });

        res.json({
            code: 0,
            data: banners
        });
    } catch (error) {
        console.error('获取轮播图失败:', error);
        res.status(500).json({ code: -1, message: '获取轮播图失败' });
    }
};

// 获取图文内容列表
const getContents = async (req, res) => {
    try {
        const { type } = req.query;

        const where = { status: 1 };
        if (type) where.type = type;

        const contents = await Content.findAll({
            where,
            order: [['sort_order', 'DESC'], ['created_at', 'DESC']],
            attributes: ['id', 'type', 'slug', 'title', 'subtitle', 'cover_image', 'created_at']
        });

        res.json({
            code: 0,
            data: contents
        });
    } catch (error) {
        console.error('获取内容列表失败:', error);
        res.status(500).json({ code: -1, message: '获取内容列表失败' });
    }
};

// 获取指定图文页
const getContentBySlug = async (req, res) => {
    try {
        const { slug } = req.params;

        const content = await Content.findOne({
            where: {
                slug,
                status: 1
            }
        });

        if (!content) {
            return res.status(404).json({ code: -1, message: '页面不存在' });
        }

        res.json({
            code: 0,
            data: content
        });
    } catch (error) {
        console.error('获取页面内容失败:', error);
        res.status(500).json({ code: -1, message: '获取页面内容失败' });
    }
};

module.exports = {
    getBanners,
    getContents,
    getContentBySlug
};
