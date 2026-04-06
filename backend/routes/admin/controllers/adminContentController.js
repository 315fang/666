const { Banner, Content, Product } = require('../../../models');
const { Op } = require('sequelize');
const { clearHomepageCache } = require('../../../controllers/configController');
const { ensureNoTemporaryAssetUrls } = require('../../../utils/assetUrlAudit');
const { deleteAssetIfUnreferenced } = require('../../../services/AssetReferenceService');

// 获取轮播图列表
const getBanners = async (req, res) => {
    try {
        const { position, status } = req.query;
        const where = {};
        if (position) where.position = position;
        if (status !== undefined) where.status = parseInt(status);

        const banners = await Banner.findAll({
            where,
            include: [{
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'images'],
                required: false
            }],
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
        const {
            title, subtitle, kicker,
            image_url, link_type, link_value, product_id,
            position, sort_order, start_time, end_time, status
        } = req.body;

        const VALID_LINK_TYPES = ['none', 'product', 'activity', 'group_buy', 'slash', 'lottery', 'page', 'url'];
        if (link_type && !VALID_LINK_TYPES.includes(link_type)) {
            return res.status(400).json({ code: -1, message: `link_type 不合法，允许值: ${VALID_LINK_TYPES.join(', ')}` });
        }
        if (link_type === 'product' && !product_id) {
            return res.status(400).json({ code: -1, message: 'product 类型必须提供 product_id' });
        }
        if (link_type !== 'product' && !image_url) {
            return res.status(400).json({ code: -1, message: '图片URL必填' });
        }
        if (image_url) {
            ensureNoTemporaryAssetUrls([image_url], 'Banner 图片');
        }

        const banner = await Banner.create({
            title, subtitle, kicker,
            image_url, link_type: link_type || 'none',
            link_value: link_type === 'product' ? String(product_id || link_value || '') : (link_value || ''),
            product_id: product_id || null,
            position: position || 'home',
            sort_order: sort_order || 0,
            start_time: start_time || null,
            end_time: end_time || null,
            status: status ?? 1
        });

        clearHomepageCache();
        res.json({ code: 0, data: banner, message: '创建成功' });
    } catch (error) {
        console.error('创建轮播图失败:', error);
        res.status(error.statusCode || 500).json({ code: -1, message: error.message || '创建失败' });
    }
};

// 更新轮播图
const updateBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (updates.image_url !== undefined && updates.image_url) {
            ensureNoTemporaryAssetUrls([updates.image_url], 'Banner 图片');
        }

        // 如果切换到 product 类型，同步 link_value
        if (updates.link_type === 'product' && updates.product_id) {
            updates.link_value = String(updates.product_id);
        }

        const banner = await Banner.findByPk(id);
        if (!banner) {
            return res.status(404).json({ code: -1, message: '轮播图不存在' });
        }

        await banner.update(updates);
        clearHomepageCache();
        res.json({ code: 0, data: banner, message: '更新成功' });
    } catch (error) {
        console.error('更新轮播图失败:', error);
        res.status(error.statusCode || 500).json({ code: -1, message: error.message || '更新失败' });
    }
};

// 删除轮播图
const deleteBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const banner = await Banner.findByPk(id);
        if (banner) {
            const imageUrl = banner.image_url;
            await banner.destroy();
            if (imageUrl) await deleteAssetIfUnreferenced(imageUrl);
        }
        clearHomepageCache();
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
            order: [['sort_order', 'DESC'], ['created_at', 'DESC']]
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

        if (cover_image) {
            ensureNoTemporaryAssetUrls([cover_image], '内容封面');
        }

        const newContent = await Content.create({
            type, slug, title, subtitle, cover_image, content, extra_data, sort_order, status: 1
        });

        clearHomepageCache();
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

        if (updates.cover_image !== undefined && updates.cover_image) {
            ensureNoTemporaryAssetUrls([updates.cover_image], '内容封面');
        }

        const contentItem = await Content.findByPk(id);
        if (!contentItem) {
            return res.status(404).json({ code: -1, message: '内容不存在' });
        }

        await contentItem.update(updates);
        clearHomepageCache();
        res.json({ code: 0, data: contentItem, message: '更新成功' });
    } catch (error) {
        console.error('更新内容失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

const deleteContent = async (req, res) => {
    try {
        const { id } = req.params;
        const item = await Content.findByPk(id);
        if (!item) return res.status(404).json({ code: -1, message: '内容不存在' });
        const coverImage = item.cover_image;
        await item.destroy();
        if (coverImage) await deleteAssetIfUnreferenced(coverImage);
        clearHomepageCache();
        res.json({ code: 0, message: '删除成功' });
    } catch (error) {
        console.error('删除内容失败:', error);
        res.status(500).json({ code: -1, message: '删除失败' });
    }
};

module.exports = {
    getBanners,
    createBanner,
    updateBanner,
    deleteBanner,
    getContents,
    createContent,
    updateContent,
    deleteContent
};
