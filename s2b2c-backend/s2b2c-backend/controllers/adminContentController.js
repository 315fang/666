const { Banner, Content } = require('../../../models');
const { Op } = require('sequelize');

// 获取轮播图列表
const getBanners = async (req, res) => {
    try {
        const { position, status } = req.query;
        const where = {};
        if (position) where.position = position;
        if (status !== undefined) where.status = parseInt(status);

        const banners = await Banner.findAll({
            where,
            order: [['sort_order', 'DESC'], ['id', 'ASC']]
        });

        res.json({ code: 0, data: banners });
    } catch (error) {
        console.error('获取轮播图失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

// 创建轮播图
const createBanner = async (req, res) => {
    try {
        const { title, image_url, link_type, link_value, position, sort_order, start_time, end_time } = req.body;

        if (!image_url) {
            return res.status(400).json({ code: -1, message: '图片URL必填' });
        }

        const banner = await Banner.create({
            title, image_url, link_type, link_value, position, sort_order, start_time, end_time, status: 1
        });

        res.json({ code: 0, data: banner, message: '创建成功' });
    } catch (error) {
        console.error('创建轮播图失败:', error);
        res.status(500).json({ code: -1, message: '创建失败' });
    }
};

// 更新轮播图
const updateBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const banner = await Banner.findByPk(id);
        if (!banner) {
            return res.status(404).json({ code: -1, message: '轮播图不存在' });
        }

        await banner.update(updates);
        res.json({ code: 0, data: banner, message: '更新成功' });
    } catch (error) {
        console.error('更新轮播图失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

// 删除轮播图
const deleteBanner = async (req, res) => {
    try {
        const { id } = req.params;
        await Banner.destroy({ where: { id } });
        res.json({ code: 0, message: '删除成功' });
    } catch (error) {
        console.error('删除轮播图失败:', error);
        res.status(500).json({ code: -1, message: '删除失败' });
    }
};

// 获取内容列表
const getContents = async (req, res) => {
    try {
        const { type, status } = req.query;
        const where = {};
        if (type) where.type = type;
        if (status !== undefined) where.status = parseInt(status);

        const contents = await Content.findAll({
            where,
            order: [['sort_order', 'DESC'], ['createdAt', 'DESC']]
        });

        res.json({ code: 0, data: contents });
    } catch (error) {
        console.error('获取内容失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

// 创建内容
const createContent = async (req, res) => {
    try {
        const { type, slug, title, subtitle, cover_image, content, extra_data, sort_order } = req.body;

        if (!type || !title) {
            return res.status(400).json({ code: -1, message: '类型和标题必填' });
        }

        const newContent = await Content.create({
            type, slug, title, subtitle, cover_image, content, extra_data, sort_order, status: 1
        });

        res.json({ code: 0, data: newContent, message: '创建成功' });
    } catch (error) {
        console.error('创建内容失败:', error);
        res.status(500).json({ code: -1, message: '创建失败' });
    }
};

// 更新内容
const updateContent = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const contentItem = await Content.findByPk(id);
        if (!contentItem) {
            return res.status(404).json({ code: -1, message: '内容不存在' });
        }

        await contentItem.update(updates);
        res.json({ code: 0, data: contentItem, message: '更新成功' });
    } catch (error) {
        console.error('更新内容失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

module.exports = {
    getBanners,
    createBanner,
    updateBanner,
    deleteBanner,
    getContents,
    createContent,
    updateContent
};
