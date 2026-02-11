const { AppConfig, QuickEntry, HomeSection, Banner } = require('../models');
const { Op } = require('sequelize');

/**
 * 获取公开配置（供前端调用）
 * 返回所有公开的配置项
 */
const getPublicConfigs = async (req, res) => {
    try {
        const { category } = req.query;

        const where = {
            is_public: true,
            status: 1
        };

        if (category) {
            where.category = category;
        }

        const configs = await AppConfig.findAll({
            where,
            attributes: ['config_key', 'config_value', 'config_type', 'category'],
            order: [['category', 'ASC'], ['config_key', 'ASC']]
        });

        // 格式化返回数据，将JSON字符串解析为对象
        const formattedConfigs = {};
        configs.forEach(config => {
            let value = config.config_value;

            // 根据类型转换值
            switch (config.config_type) {
                case 'number':
                    value = parseFloat(value);
                    break;
                case 'boolean':
                    value = value === 'true' || value === '1';
                    break;
                case 'json':
                case 'array':
                    try {
                        value = JSON.parse(value);
                    } catch (e) {
                        console.warn(`配置 ${config.config_key} 解析JSON失败:`, e);
                    }
                    break;
            }

            formattedConfigs[config.config_key] = value;
        });

        res.json({
            code: 0,
            data: formattedConfigs
        });
    } catch (error) {
        console.error('获取配置失败:', error);
        res.status(500).json({ code: -1, message: '获取配置失败' });
    }
};

/**
 * 获取快捷入口列表
 */
const getQuickEntries = async (req, res) => {
    try {
        const { position = 'home', limit = 10 } = req.query;
        const now = new Date();

        const entries = await QuickEntry.findAll({
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
            limit: parseInt(limit)
        });

        res.json({
            code: 0,
            data: entries
        });
    } catch (error) {
        console.error('获取快捷入口失败:', error);
        res.status(500).json({ code: -1, message: '获取快捷入口失败' });
    }
};

/**
 * 获取首页区块配置
 */
const getHomeSections = async (req, res) => {
    try {
        const sections = await HomeSection.findAll({
            where: {
                status: 1,
                is_visible: true
            },
            order: [['sort_order', 'DESC'], ['id', 'ASC']]
        });

        res.json({
            code: 0,
            data: sections
        });
    } catch (error) {
        console.error('获取首页区块配置失败:', error);
        res.status(500).json({ code: -1, message: '获取首页区块配置失败' });
    }
};

/**
 * 获取完整的首页配置（一次性返回所有配置）
 * 优化前端请求次数
 */
const getHomePageConfig = async (req, res) => {
    try {
        const now = new Date();

        // 并行获取所有配置
        const [appConfigs, quickEntries, homeSections, banners] = await Promise.all([
            // 获取首页相关配置
            AppConfig.findAll({
                where: {
                    is_public: true,
                    status: 1,
                    category: 'homepage'
                },
                attributes: ['config_key', 'config_value', 'config_type']
            }),

            // 获取快捷入口
            QuickEntry.findAll({
                where: {
                    status: 1,
                    position: 'home',
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
                order: [['sort_order', 'DESC']],
                limit: 10
            }),

            // 获取区块配置
            HomeSection.findAll({
                where: {
                    status: 1,
                    is_visible: true
                },
                order: [['sort_order', 'DESC']]
            }),

            // 获取轮播图
            Banner.findAll({
                where: {
                    status: 1,
                    position: 'home',
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
                attributes: ['id', 'title', 'subtitle', 'image_url', 'link_type', 'link_value']
            })
        ]);

        // 格式化配置
        const configs = {};
        appConfigs.forEach(config => {
            let value = config.config_value;
            switch (config.config_type) {
                case 'number':
                    value = parseFloat(value);
                    break;
                case 'boolean':
                    value = value === 'true' || value === '1';
                    break;
                case 'json':
                case 'array':
                    try {
                        value = JSON.parse(value);
                    } catch (e) {
                        console.warn(`配置解析失败:`, e);
                    }
                    break;
            }
            configs[config.config_key] = value;
        });

        res.json({
            code: 0,
            data: {
                configs,
                quickEntries,
                sections: homeSections,
                banners
            }
        });
    } catch (error) {
        console.error('获取首页配置失败:', error);
        res.status(500).json({ code: -1, message: '获取首页配置失败' });
    }
};

module.exports = {
    getPublicConfigs,
    getQuickEntries,
    getHomeSections,
    getHomePageConfig
};
