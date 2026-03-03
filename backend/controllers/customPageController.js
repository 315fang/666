const { AppConfig } = require('../models');

const PAGE_KEY_PREFIX = 'custom_page_';

/**
 * 获取自定义页面（前端调用，公开）
 */
const getCustomPage = async (req, res) => {
    try {
        const { key } = req.params;
        if (!key) {
            return res.status(400).json({ code: -1, message: '页面标识不能为空' });
        }

        const config = await AppConfig.findOne({
            where: { config_key: PAGE_KEY_PREFIX + key, status: 1 }
        });

        if (!config) {
            return res.json({ code: 0, data: { key, title: '', blocks: [] } });
        }

        let pageData = {};
        try {
            pageData = JSON.parse(config.config_value);
        } catch (e) {
            pageData = { blocks: [] };
        }

        res.json({ code: 0, data: { key, ...pageData } });
    } catch (error) {
        console.error('[CustomPage] 获取页面失败:', error);
        res.status(500).json({ code: -1, message: '获取页面失败' });
    }
};

/**
 * 获取所有自定义页面列表（管理员）
 */
const listCustomPages = async (req, res) => {
    try {
        const configs = await AppConfig.findAll({
            where: { category: 'custom_page', status: 1 },
            order: [['updated_at', 'DESC']]
        });

        const pages = configs.map(c => {
            let data = {};
            try { data = JSON.parse(c.config_value); } catch (e) {}
            return {
                id: c.id,
                key: c.config_key.replace(PAGE_KEY_PREFIX, ''),
                title: data.title || c.description || '',
                blockCount: Array.isArray(data.blocks) ? data.blocks.length : 0,
                updatedAt: c.updated_at
            };
        });

        res.json({ code: 0, data: pages });
    } catch (error) {
        console.error('[CustomPage] 获取页面列表失败:', error);
        res.status(500).json({ code: -1, message: '获取页面列表失败' });
    }
};

/**
 * 保存/更新自定义页面（管理员）
 */
const saveCustomPage = async (req, res) => {
    try {
        const { key } = req.params;
        const { title, blocks } = req.body;

        if (!key) {
            return res.status(400).json({ code: -1, message: '页面标识不能为空' });
        }
        if (!Array.isArray(blocks)) {
            return res.status(400).json({ code: -1, message: 'blocks 必须是数组' });
        }

        const pageData = { title: title || '', blocks };

        await AppConfig.upsert({
            config_key: PAGE_KEY_PREFIX + key,
            config_value: JSON.stringify(pageData),
            config_type: 'json',
            category: 'custom_page',
            description: title || key,
            is_public: true,
            status: 1
        });

        res.json({ code: 0, message: '页面保存成功', data: { key } });
    } catch (error) {
        console.error('[CustomPage] 保存页面失败:', error);
        res.status(500).json({ code: -1, message: '保存页面失败' });
    }
};

/**
 * 删除自定义页面（管理员）
 */
const deleteCustomPage = async (req, res) => {
    try {
        const { key } = req.params;

        await AppConfig.update(
            { status: 0 },
            { where: { config_key: PAGE_KEY_PREFIX + key } }
        );

        res.json({ code: 0, message: '页面已删除' });
    } catch (error) {
        console.error('[CustomPage] 删除页面失败:', error);
        res.status(500).json({ code: -1, message: '删除页面失败' });
    }
};

module.exports = { getCustomPage, listCustomPages, saveCustomPage, deleteCustomPage };
