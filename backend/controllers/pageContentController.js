const { AppConfig } = require('../models');
const { getPagePayload } = require('../services/PageLayoutService');
const logger = require('../utils/logger');

const getBrandNewsDetail = async (req, res) => {
    try {
        const id = String(req.query.id || '').trim();
        if (!id) {
            return res.status(400).json({ code: -1, message: '缺少 id' });
        }
        const row = await AppConfig.findOne({
            where: { category: 'activity', config_key: 'activity_links_config', status: 1 }
        });
        let raw = { brand_news: [] };
        if (row?.config_value) {
            try {
                raw = { ...raw, ...JSON.parse(row.config_value) };
            } catch (_) {
                raw = { brand_news: [] };
            }
        }
        const article = (raw.brand_news || []).find((a) => String(a.id) === id && a.enabled !== false);
        if (!article) {
            return res.status(404).json({ code: -1, message: '文章不存在' });
        }
        res.json({
            code: 0,
            data: {
                id: article.id,
                title: article.title || '',
                summary: article.summary || '',
                cover_image: article.cover_image || article.image || '',
                content_html: String(article.content_html || '')
            }
        });
    } catch (error) {
        logger.error('获取品牌新闻详情失败', { message: error.message, stack: error.stack });
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

const getPageContent = async (req, res) => {
    try {
        const pageKey = String(req.query.page_key || req.params.pageKey || '').trim();
        if (!['home', 'activity', 'user'].includes(pageKey)) {
            return res.status(400).json({ code: -1, message: 'page_key 仅支持 home/activity/user' });
        }

        const data = await getPagePayload(pageKey);
        if (!data) {
            return res.status(404).json({ code: -1, message: '页面编排不存在' });
        }

        res.json({ code: 0, data });
    } catch (error) {
        logger.error('获取页面编排聚合内容失败', { message: error.message, stack: error.stack });
        res.status(500).json({ code: -1, message: '获取页面内容失败' });
    }
};

module.exports = {
    getPageContent,
    getBrandNewsDetail
};
