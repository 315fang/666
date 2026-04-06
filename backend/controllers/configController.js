const { AppConfig, QuickEntry, HomeSection, Banner, Product } = require('../models');
const { Op } = require('sequelize');
const { LRUCache } = require('lru-cache');
const { FEATURE_DEFS, getFeatureToggleKey, buildFeatureToggleMap } = require('../utils/featureToggles');
const { loadMiniProgramConfig } = require('../utils/miniprogramConfig');
const { clearPagePayloadCache } = require('../services/PageLayoutService');
const logger = require('../utils/logger');

// ★ 首页高并发 LRU 内存防压坝 (缓存 1 分钟)
const homepageCache = new LRUCache({
    max: 10, // 最多缓存 10 个维度的首页数据（目前只有 1 个维度）
    ttl: 1000 * 60 * 1, // TTL 为 60 秒
});

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
                        logger.warn('CONFIG_CTRL', `配置 ${config.config_key} 解析JSON失败`, { error: e?.message || e });
                    }
                    break;
            }

            formattedConfigs[config.config_key] = value;
        });

        const featureToggleKeys = FEATURE_DEFS.map((feature) => getFeatureToggleKey(feature.key));
        const featureToggleConfigs = configs.filter((config) => featureToggleKeys.includes(config.config_key));
        if (featureToggleConfigs.length) {
            formattedConfigs.feature_toggles = buildFeatureToggleMap(featureToggleConfigs);
        }

        res.json({
            code: 0,
            data: formattedConfigs
        });
    } catch (error) {
        logger.error('CONFIG_CTRL', '获取配置失败', { error: error?.message || error });
        res.status(500).json({ code: -1, message: '获取配置失败' });
    }
};

const getMiniProgramConfig = async (req, res) => {
    try {
        const [miniProgramConfig, featureToggleConfigs] = await Promise.all([
            loadMiniProgramConfig(AppConfig),
            AppConfig.findAll({
                where: {
                    category: 'feature_toggle',
                    config_key: FEATURE_DEFS.map((feature) => getFeatureToggleKey(feature.key))
                },
                attributes: ['config_key', 'config_value']
            })
        ]);

        res.json({
            code: 0,
            data: {
                ...miniProgramConfig,
                feature_toggles: buildFeatureToggleMap(featureToggleConfigs)
            }
        });
    } catch (error) {
        logger.error('CONFIG_CTRL', '获取小程序配置失败', { error: error?.message || error });
        res.status(500).json({ code: -1, message: '获取小程序配置失败' });
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
        logger.error('CONFIG_CTRL', '获取快捷入口失败', { error: error?.message || error });
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
        logger.error('CONFIG_CTRL', '获取首页区块配置失败', { error: error?.message || error });
        res.status(500).json({ code: -1, message: '获取首页区块配置失败' });
    }
};

/**
 * 获取完整的首页配置（一次性返回所有配置）
 * 优化前端请求次数
 */
const getHomePageConfig = async (req, res) => {
    try {
        // ★ 命中缓存直接返回（极速防雪崩）
        const cacheKey = 'HOMEPAGE_DATA';
        if (homepageCache.has(cacheKey)) {
            return res.json({
                code: 0,
                data: homepageCache.get(cacheKey)
            });
        }

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

            // 获取轮播图（含关联商品信息，用于自动填充首图）
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
                attributes: ['id', 'title', 'subtitle', 'kicker', 'image_url', 'link_type', 'link_value', 'product_id'],
                include: [{
                    model: Product,
                    as: 'product',
                    required: false,
                    attributes: ['id', 'name', 'images', 'retail_price']
                }]
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
                        logger.warn('CONFIG_CTRL', '配置解析失败', { error: e?.message || e });
                    }
                    break;
            }
            configs[config.config_key] = value;
        });

        // 特色卡片：优先从 AppConfig（config_key = feature_cards）读取，否则使用默认值
        let featureCards = configs.feature_cards && Array.isArray(configs.feature_cards) ? configs.feature_cards : [];
        // 按 sort_order 降序排列
        featureCards.sort((a, b) => (b.sort_order || 0) - (a.sort_order || 0));

        // ── Banner 商品关联处理 ──────────────────────────────────────────────
        // 若 banner.product_id 已设置：
        //   1. image_url 为空时自动取 product.images[0]
        //   2. link_type/link_value 自动指向该商品（管理员手动填写的 link_type 优先）
        let resolvedBanners = banners.map(banner => {
            const b = banner.get ? banner.get({ plain: true }) : { ...banner };
            if (b.product_id && b.product) {
                // 解析商品图片数组
                let productImages = b.product.images || [];
                if (typeof productImages === 'string') {
                    try { productImages = JSON.parse(productImages); } catch (e) { productImages = []; }
                }
                // 没有手动填图时，用商品首图
                if (!b.image_url && productImages.length > 0) {
                    b.image_url = productImages[0];
                }
                // 没有手动填跳转类型时，默认跳商品详情
                if (!b.link_type || b.link_type === 'none') {
                    b.link_type = 'product';
                    b.link_value = String(b.product_id);
                }
                // 标题默认取商品名
                if (!b.title) {
                    b.title = b.product.name;
                }
                // 清除冗余的嵌套 product 对象（前端不需要）
                delete b.product;
            }
            return b;
        });

        // 弹窗广告配置
        let popupAd = { enabled: false };
        try {
            const popupRow = await AppConfig.findOne({
                where: { category: 'popup_ad', config_key: 'popup_ad_config', status: 1 }
            });
            if (popupRow?.config_value) {
                const parsed = JSON.parse(popupRow.config_value);
                popupAd = { enabled: false, ...parsed };
                if (popupAd.product_id && !popupAd.image_url) {
                    const popupProduct = await Product.findByPk(popupAd.product_id, { attributes: ['images', 'name'] });
                    if (popupProduct) {
                        let pImgs = popupProduct.images || [];
                        if (typeof pImgs === 'string') try { pImgs = JSON.parse(pImgs); } catch (_) { pImgs = []; }
                        if (pImgs.length > 0) popupAd.image_url = pImgs[0];
                        if (!popupAd.button_text) popupAd.button_text = popupProduct.name;
                    }
                }
                if (popupAd.product_id && (!popupAd.link_type || popupAd.link_type === 'none')) {
                    popupAd.link_type = 'product';
                    popupAd.link_value = String(popupAd.product_id);
                }
            }
        } catch (e) {
            logger.warn('CONFIG', '弹窗广告配置加载失败', { error: e.message });
        }

        const responseData = {
            configs,
            quickEntries,
            sections: homeSections,
            banners: resolvedBanners,
            featureCards,
            popupAd
        };

        // 写入 LRU 缓存
        homepageCache.set(cacheKey, responseData);

        res.json({
            code: 0,
            data: responseData
        });
    } catch (error) {
        logger.error('CONFIG', '获取首页配置失败', { error: error?.message || error });
        res.status(500).json({ code: -1, message: '获取首页配置失败' });
    }
};

// 提供清除缓存的钩子给后台管理接口调用
const clearHomepageCache = () => {
    homepageCache.clear();
    clearPagePayloadCache();
    logger.info('CONFIG_CTRL', '首页配置内存缓存已清空');
};

/**
 * 按位置获取 Banner 列表
 * GET /api/banners?position=category
 * 支持 position: home | category | activity（默认 home）
 */
const getBannersByPosition = async (req, res) => {
    try {
        const { position = 'home' } = req.query;
        const now = new Date();

        const banners = await Banner.findAll({
            where: {
                status: 1,
                position,
                [Op.or]: [
                    { start_time: null, end_time: null },
                    { start_time: { [Op.lte]: now }, end_time: { [Op.gte]: now } },
                    { start_time: { [Op.lte]: now }, end_time: null },
                    { start_time: null, end_time: { [Op.gte]: now } }
                ]
            },
            order: [['sort_order', 'DESC'], ['id', 'ASC']],
            attributes: ['id', 'title', 'subtitle', 'kicker', 'image_url', 'link_type', 'link_value', 'product_id', 'position'],
            include: [{
                model: Product,
                as: 'product',
                required: false,
                attributes: ['id', 'name', 'images', 'retail_price']
            }]
        });

        // 同 getHomePageConfig 的处理逻辑：商品关联自动补图和跳转
        const resolved = banners.map(banner => {
            const b = banner.get ? banner.get({ plain: true }) : { ...banner };
            if (b.product_id && b.product) {
                let productImages = b.product.images || [];
                if (typeof productImages === 'string') {
                    try { productImages = JSON.parse(productImages); } catch (e) { productImages = []; }
                }
                if (!b.image_url && productImages.length > 0) b.image_url = productImages[0];
                if (!b.link_type || b.link_type === 'none') {
                    b.link_type = 'product';
                    b.link_value = String(b.product_id);
                }
                if (!b.title) b.title = b.product.name;
                delete b.product;
            }
            return b;
        });

        res.json({ code: 0, data: resolved });
    } catch (error) {
        logger.error('CONFIG', '获取 Banner 失败', { error: error?.message || error });
        res.status(500).json({ code: -1, message: '获取 Banner 失败' });
    }
};

module.exports = {
    getPublicConfigs,
    getMiniProgramConfig,
    getQuickEntries,
    getHomeSections,
    getHomePageConfig,
    getBannersByPosition,
    clearHomepageCache
};
