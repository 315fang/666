// backend/controllers/activityController.js
const { Op } = require('sequelize');
const { AppConfig, Product } = require('../models');
const { normalizeFestivalConfig } = require('../utils/activityConfig');
const LimitedSpotService = require('../services/LimitedSpotService');
const { MALL_LIST_WHERE } = require('../utils/productMallVisibility');
const DEFAULT_GLOBAL_UI_CONFIG = {
    wallpaper: { enabled: false, preset: 'default' },
    card_style: { radius: 24, shadow: 'medium', gap: 18 },
    section_toggle: { show_featured_in_activity: true, show_featured_in_category: true },
    featured_products: { limit: 4, title: '精选好物', kicker: "EDITOR'S PICK", button_text: '去选购' }
};

/**
 * 气泡文案格式化：支持 {user} / {product} 占位符
 * 若模板不含占位符，则直接拼接（兼容旧文案如 "购买了"）
 */
function _formatBubble(template, user, product) {
    if (template.includes('{user}') || template.includes('{product}')) {
        return template.replace('{user}', user).replace('{product}', product);
    }
    return `${user} ${template} ${product}`;
}

/** 气泡用户展示：手机号脱敏或昵称缩写 */
function _maskBubbleUser(user) {
    if (!user) return null;
    const phone = user.phone || '';
    if (phone) return `用户**${phone.slice(-4)}`;
    if (user.nickname) return `${String(user.nickname).substring(0, 1)}**`;
    return '用户****';
}

/**
 * GET /api/activity/bubbles
 * 返回气泡通告数据：最近成交的订单/拼团记录，手机号脱敏
 * 查询参数：limit（条数，默认10，后台可配）
 */
exports.getBubbles = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 30);
        const bubbles = [];

        // ——— 读取气泡文案配置（从 AppConfig settings 表） ———
        let copyMap = { order: '购买了', group_buy: '拼团了', slash: '砍价了', lottery: '抽中了' };
        try {
            const { AppConfig } = require('../models');
            const copyKeys = ['bubble_copy_order', 'bubble_copy_group_buy', 'bubble_copy_slash', 'bubble_copy_lottery'];
            const rows = await AppConfig.findAll({
                where: { category: 'settings', config_key: copyKeys, status: 1 }
            });
            for (const row of rows) {
                if (row.config_value) {
                    if (row.config_key === 'bubble_copy_order') copyMap.order = row.config_value;
                    if (row.config_key === 'bubble_copy_group_buy') copyMap.group_buy = row.config_value;
                    if (row.config_key === 'bubble_copy_slash') copyMap.slash = row.config_value;
                    if (row.config_key === 'bubble_copy_lottery') copyMap.lottery = row.config_value;
                }
            }
        } catch (_) { /* 读取失败保持默认文案 */ }

        const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const fetchCap = Math.min(Math.max(limit * 2, 16), 40);
        /** @type {Array<{ type: string, nickname: string, product_name: string, text: string, created_at: Date }>} */
        const realRows = [];

        // ——— 订单：已支付及后续履约状态（算「购买」真实动销） ———
        try {
            const { Order, User, Product } = require('../models');

            const paidLikeStatuses = ['paid', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed'];

            const recentOrders = await Order.findAll({
                where: {
                    status: { [Op.in]: paidLikeStatuses },
                    created_at: { [Op.gte]: since7d }
                },
                include: [
                    {
                        model: User,
                        as: 'buyer',
                        attributes: ['phone', 'nickname']
                    }
                ],
                order: [['created_at', 'DESC']],
                limit: fetchCap,
                raw: false
            });

            for (const order of recentOrders) {
                const user = order.buyer;
                const maskedNickname = _maskBubbleUser(user);
                if (!maskedNickname) continue;

                let productName = '精选商品';
                try {
                    if (order.product_id) {
                        const prod = await Product.findByPk(order.product_id, { attributes: ['name'] });
                        if (prod) productName = prod.name;
                    }
                } catch (_) { /* 静默失败 */ }

                realRows.push({
                    type: 'order',
                    nickname: maskedNickname,
                    product_name: productName,
                    text: _formatBubble(copyMap.order, maskedNickname, productName),
                    created_at: order.created_at
                });
            }
        } catch (dbErr) {
            console.warn('[activityController] getBubbles orders query failed:', dbErr.message);
        }

        // ——— 抽奖：最近中奖记录（排除谢谢参与 / miss） ———
        try {
            const { LotteryRecord, User, LotteryPrize } = require('../models');

            const recentLottery = await LotteryRecord.findAll({
                where: {
                    prize_type: { [Op.ne]: 'miss' },
                    created_at: { [Op.gte]: since7d }
                },
                include: [
                    { model: User, as: 'user', attributes: ['phone', 'nickname'] },
                    { model: LotteryPrize, as: 'prize', attributes: ['name'], required: false }
                ],
                order: [['created_at', 'DESC']],
                limit: fetchCap
            });

            for (const record of recentLottery) {
                const maskedNickname = _maskBubbleUser(record.user);
                if (!maskedNickname) continue;
                const prizeName = record.prize_name || (record.prize && record.prize.name) || '精美奖品';
                realRows.push({
                    type: 'lottery',
                    nickname: maskedNickname,
                    product_name: prizeName,
                    text: _formatBubble(copyMap.lottery, maskedNickname, prizeName),
                    created_at: record.created_at
                });
            }
        } catch (lotErr) {
            console.warn('[activityController] getBubbles lottery query failed:', lotErr.message);
        }

        realRows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        bubbles.push(...realRows.slice(0, limit));

        // ——— 如果真实数据不足，补充模拟数据（问兰示例 SKU） ———
        if (bubbles.length < 3) {
            const mockNames = ['用户**28', '用户**74', '用户**91', '用户**53'];
            const mockProducts = [
                '问兰氨基酸洁面慕斯',
                '玻色因紧致面霜',
                '小极光焕彩面霜',
                '问兰护肤尊享礼盒'
            ];
            const mockTypes = ['order', 'order', 'lottery', 'order'];
            const needed = limit - bubbles.length;
            for (let i = 0; i < needed; i++) {
                const t = mockTypes[i % mockTypes.length];
                const nick = mockNames[i % mockNames.length];
                const prod = mockProducts[i % mockProducts.length];
                bubbles.push({
                    type: t,
                    nickname: nick,
                    product_name: prod,
                    text: _formatBubble(copyMap[t] || copyMap.order, nick, prod),
                    created_at: new Date(Date.now() - i * 3 * 60 * 1000)
                });
            }
        }

        res.json({
            code: 0,
            data: bubbles.slice(0, limit),
            message: 'ok'
        });
    } catch (err) {
        console.error('[activityController] getBubbles error:', err);
        res.json({ code: 0, data: [], message: 'ok' }); // 降级返回空数组，不报错
    }
};

/**
 * GET /api/activity/festival-config
 * 公开活动页配置（节日大卡 + 活动卡片 + 精选推荐 + 背景墙纸）
 */
exports.getFestivalConfig = async (req, res) => {
    try {
        const cfgRow = await AppConfig.findOne({
            where: {
                category: 'festival',
                config_key: 'festival_data',
                status: 1
            }
        });

        let raw = {};
        if (cfgRow?.config_value) {
            try {
                raw = JSON.parse(cfgRow.config_value) || {};
            } catch (_) {
                raw = {};
            }
        }

        const normalizedRaw = normalizeFestivalConfig(raw);
        const cardPosters = normalizedRaw.card_posters || [];

        const uiCfgRow = await AppConfig.findOne({
            where: { category: 'ui_theme', config_key: 'global_ui_config', status: 1 }
        });
        let uiCfg = {};
        if (uiCfgRow?.config_value) {
            try { uiCfg = JSON.parse(uiCfgRow.config_value) || {}; } catch (_) { uiCfg = {}; }
        }
        const globalUiConfig = {
            ...DEFAULT_GLOBAL_UI_CONFIG,
            ...uiCfg,
            wallpaper: { ...DEFAULT_GLOBAL_UI_CONFIG.wallpaper, ...(uiCfg.wallpaper || {}) },
            card_style: { ...DEFAULT_GLOBAL_UI_CONFIG.card_style, ...(uiCfg.card_style || {}) },
            section_toggle: { ...DEFAULT_GLOBAL_UI_CONFIG.section_toggle, ...(uiCfg.section_toggle || {}) },
            featured_products: { ...DEFAULT_GLOBAL_UI_CONFIG.featured_products, ...(uiCfg.featured_products || {}) }
        };

        const data = {
            active: !!normalizedRaw.active,
            // 兼容旧字段
            title: normalizedRaw.title || normalizedRaw.banner_title || normalizedRaw.name || '',
            subtitle: normalizedRaw.subtitle || normalizedRaw.banner_subtitle || '',
            tag: normalizedRaw.tag || '',
            banner: normalizedRaw.banner || normalizedRaw.banner_image || '',
            ctaText: normalizedRaw.ctaText || '进入活动',
            ctaPath: normalizedRaw.ctaPath || '',
            cta_link_type: normalizedRaw.cta_link_type || 'none',
            cta_link_value: normalizedRaw.cta_link_value || '',
            countdown: normalizedRaw.countdown || normalizedRaw.countdown_to || null,
            theme: normalizedRaw.theme && typeof normalizedRaw.theme === 'object' ? normalizedRaw.theme : {},
            card_posters: cardPosters,
            show_featured_products: !!normalizedRaw.show_featured_products,
            featured_products_limit: Math.min(Math.max(parseInt(normalizedRaw.featured_products_limit || 4, 10), 1), 12),
            global_wallpaper: {
                enabled: !!normalizedRaw.global_wallpaper?.enabled,
                preset: normalizedRaw.global_wallpaper?.preset || 'default'
            },
            global_ui: globalUiConfig,
            featured_products: []
        };
        if ((!data.theme || !Object.keys(data.theme).length) && normalizedRaw.theme_colors) {
            data.theme = {
                '--fest-primary': normalizedRaw.theme_colors.primary || '#C6A16E',
                '--fest-bg': normalizedRaw.theme_colors.bg || '#FFF8EE'
            };
        }

        const useFeatured = data.show_featured_products || !!globalUiConfig.section_toggle?.show_featured_in_activity;
        const featuredLimit = Math.min(
            Math.max(
                parseInt(
                    data.featured_products_limit ||
                    globalUiConfig.featured_products?.limit ||
                    4,
                    10
                ),
                1
            ),
            12
        );
        data.show_featured_products = useFeatured;
        data.featured_products_limit = featuredLimit;
        if (!data.global_wallpaper?.enabled && globalUiConfig.wallpaper?.enabled) {
            data.global_wallpaper = { ...globalUiConfig.wallpaper };
        }

        if (useFeatured) {
            const list = await Product.findAll({
                where: { status: 1, ...MALL_LIST_WHERE },
                attributes: ['id', 'name', 'images', 'retail_price', 'description', 'heat_score', 'purchase_count'],
                order: [['heat_score', 'DESC'], ['purchase_count', 'DESC'], ['created_at', 'DESC']],
                limit: featuredLimit
            });
            data.featured_products = list.map(p => {
                let images = p.images || [];
                if (typeof images === 'string') {
                    try { images = JSON.parse(images); } catch (_) { images = []; }
                }
                return {
                    id: p.id,
                    name: p.name,
                    image: Array.isArray(images) && images.length ? images[0] : '',
                    price: parseFloat(p.retail_price || 0),
                    description: p.description || ''
                };
            });
        }

        res.json({ code: 0, data });
    } catch (error) {
        console.error('获取活动页配置失败:', error);
        res.json({
            code: 0,
            data: {
                active: false,
                cta_link_type: 'none',
                cta_link_value: '',
                card_posters: [],
                show_featured_products: false,
                featured_products: [],
                global_wallpaper: { enabled: false, preset: 'default' }
            }
        });
    }
};

/**
 * GET /api/activity/global-ui-config
 * 全局UI配置（公开）
 */
exports.getGlobalUiConfig = async (req, res) => {
    try {
        const row = await AppConfig.findOne({
            where: { category: 'ui_theme', config_key: 'global_ui_config', status: 1 }
        });
        let parsed = {};
        if (row?.config_value) {
            try { parsed = JSON.parse(row.config_value) || {}; } catch (_) { parsed = {}; }
        }
        res.json({
            code: 0,
            data: {
                ...DEFAULT_GLOBAL_UI_CONFIG,
                ...parsed,
                wallpaper: { ...DEFAULT_GLOBAL_UI_CONFIG.wallpaper, ...(parsed.wallpaper || {}) },
                card_style: { ...DEFAULT_GLOBAL_UI_CONFIG.card_style, ...(parsed.card_style || {}) },
                section_toggle: { ...DEFAULT_GLOBAL_UI_CONFIG.section_toggle, ...(parsed.section_toggle || {}) },
                featured_products: { ...DEFAULT_GLOBAL_UI_CONFIG.featured_products, ...(parsed.featured_products || {}) }
            }
        });
    } catch (error) {
        console.error('获取全局UI配置失败:', error);
        res.json({ code: 0, data: DEFAULT_GLOBAL_UI_CONFIG });
    }
};

/**
 * GET /api/activity/links
 * 公开接口：读取活动链接配置（Banner / 常驻活动 / 限时活动）
 */
exports.getActivityLinksPublic = async (req, res) => {
    try {
        const row = await AppConfig.findOne({
            where: { category: 'activity', config_key: 'activity_links_config', status: 1 }
        });
        let data = { banners: [], permanent: [], limited: [] };
        if (row?.config_value) {
            try { data = { ...data, ...JSON.parse(row.config_value) }; } catch (_) {}
        }
        const sortByOrder = (arr) => [...(arr || [])].sort(
            (a, b) => (parseInt(a.sort_order, 10) || 0) - (parseInt(b.sort_order, 10) || 0)
        );
        data.banners = sortByOrder(data.banners);
        data.permanent = sortByOrder(data.permanent);
        // 过滤已过期的限时活动
        const now = Date.now();
        data.limited = sortByOrder(data.limited || []).filter((item) => {
            if (!item.end_time) return true;
            return new Date(item.end_time).getTime() > now;
        });
        res.json({ code: 0, data });
    } catch (error) {
        console.error('获取活动链接配置失败:', error);
        res.json({ code: 0, data: { banners: [], permanent: [], limited: [] } });
    }
};

/**
 * GET /api/activity/limited-spot/detail?card_id=
 * 限时活动卡片下的专享商品（公开）
 */
exports.getLimitedSpotDetail = async (req, res) => {
    try {
        const card_id = req.query.card_id;
        if (!card_id) {
            return res.status(400).json({ code: -1, message: '缺少 card_id' });
        }
        const data = await LimitedSpotService.getPublicDetail(String(card_id));
        if (!data) {
            return res.status(404).json({ code: -1, message: '活动不存在' });
        }
        res.json({ code: 0, data });
    } catch (error) {
        console.error('limited-spot detail:', error);
        res.status(400).json({ code: -1, message: error.message || '加载失败' });
    }
};
