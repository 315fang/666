// backend/routes/admin/controllers/adminActivityController.js
const { SlashActivity, LotteryPrize, Product, AppConfig, GroupActivity, sequelize } = require('../../../models');
const LimitedSpotService = require('../../../services/LimitedSpotService');
const { Op } = require('sequelize');
const { normalizeFestivalConfig, getActivityOptionKey } = require('../../../utils/activityConfig');
const {
    applyLotteryPrizeStyle,
    loadLotteryPrizeStyleConfig,
    saveLotteryPrizeStyleConfig,
    upsertLotteryPrizeStyle,
    removeLotteryPrizeStyle
} = require('../../../utils/lotteryPrizeDisplay');
const { clearPagePayloadCache } = require('../../../services/PageLayoutService');

const getFirstImage = (images) => {
    let list = images || [];
    if (typeof list === 'string') {
        try { list = JSON.parse(list); } catch (_) { list = []; }
    }
    return Array.isArray(list) && list.length ? list[0] : '';
};

const pickLotteryPrizeBasePayload = (body = {}) => ({
    name: body.name,
    image_url: body.image_url,
    cost_points: body.cost_points,
    probability: body.probability,
    stock: body.stock ?? -1,
    type: body.type || 'miss',
    prize_value: body.prize_value || 0,
    sort_order: body.sort_order || 0,
    is_active: body.is_active ?? 1
});

const pickLotteryPrizeStylePayload = (body = {}) => ({
    display_emoji: body.display_emoji,
    theme_color: body.theme_color,
    accent_color: body.accent_color,
    badge_text: body.badge_text
});

// ==================== 砍价活动 ====================

const getSlashActivities = async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const where = {};
        if (status !== undefined) where.status = parseInt(status);

        const offset = (parseInt(page) - 1) * parseInt(limit);
        const { count, rows } = await SlashActivity.findAndCountAll({
            where,
            include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'images'] }],
            order: [['id', 'DESC']],
            limit: parseInt(limit),
            offset
        });

        res.json({ code: 0, data: { list: rows, total: count, page: parseInt(page), limit: parseInt(limit) } });
    } catch (error) {
        console.error('获取砍价活动失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

const getSlashActivityById = async (req, res) => {
    try {
        const activity = await SlashActivity.findByPk(req.params.id, {
            include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'images', 'price'] }]
        });
        if (!activity) return res.status(404).json({ code: -1, message: '活动不存在' });
        res.json({ code: 0, data: activity });
    } catch (error) {
        console.error('获取砍价活动详情失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

const createSlashActivity = async (req, res) => {
    try {
        const {
            product_id, sku_id, original_price, floor_price, initial_price,
            max_slash_per_helper, min_slash_per_helper, max_helpers,
            expire_hours, stock_limit, start_at, end_at, status
        } = req.body;

        if (!product_id || !original_price || !floor_price || !initial_price) {
            return res.status(400).json({ code: -1, message: '商品ID、原价、底价、开始价格必填' });
        }
        if (parseFloat(floor_price) >= parseFloat(original_price)) {
            return res.status(400).json({ code: -1, message: '底价必须低于原价' });
        }

        const activity = await SlashActivity.create({
            product_id, sku_id: sku_id || null,
            original_price, floor_price, initial_price,
            max_slash_per_helper: max_slash_per_helper || 5.00,
            min_slash_per_helper: min_slash_per_helper || 0.10,
            max_helpers: max_helpers || 20,
            expire_hours: expire_hours || 48,
            stock_limit: stock_limit || 999,
            start_at: start_at || null, end_at: end_at || null,
            status: status ?? 1
        });

        res.json({ code: 0, data: activity, message: '创建成功' });
    } catch (error) {
        console.error('创建砍价活动失败:', error);
        res.status(500).json({ code: -1, message: '创建失败' });
    }
};

const updateSlashActivity = async (req, res) => {
    try {
        const activity = await SlashActivity.findByPk(req.params.id);
        if (!activity) return res.status(404).json({ code: -1, message: '活动不存在' });
        const allowedFields = [
            'product_id', 'sku_id', 'original_price', 'floor_price', 'initial_price',
            'max_slash_per_helper', 'min_slash_per_helper', 'max_helpers',
            'expire_hours', 'stock_limit', 'start_at', 'end_at', 'status'
        ];
        const updates = {};
        for (const key of allowedFields) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }
        await activity.update(updates);
        res.json({ code: 0, data: activity, message: '更新成功' });
    } catch (error) {
        console.error('更新砍价活动失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

const deleteSlashActivity = async (req, res) => {
    try {
        await SlashActivity.destroy({ where: { id: req.params.id } });
        res.json({ code: 0, message: '删除成功' });
    } catch (error) {
        console.error('删除砍价活动失败:', error);
        res.status(500).json({ code: -1, message: '删除失败' });
    }
};

// ==================== 抽奖奖品 ====================

const getLotteryPrizes = async (req, res) => {
    try {
        const [prizes, styleConfig] = await Promise.all([
            LotteryPrize.findAll({
                order: [['sort_order', 'ASC'], ['id', 'ASC']]
            }),
            loadLotteryPrizeStyleConfig(AppConfig)
        ]);
        res.json({
            code: 0,
            data: prizes.map((prize) => applyLotteryPrizeStyle(prize, styleConfig))
        });
    } catch (error) {
        console.error('获取抽奖奖品失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

const createLotteryPrize = async (req, res) => {
    try {
        const { name, cost_points, probability } = req.body;
        if (!name || probability === undefined || !cost_points) {
            return res.status(400).json({ code: -1, message: '奖品名称、消耗积分、中奖概率必填' });
        }

        const prize = await LotteryPrize.create(pickLotteryPrizeBasePayload(req.body));
        const styleConfig = await loadLotteryPrizeStyleConfig(AppConfig);
        const nextStyleConfig = upsertLotteryPrizeStyle(
            styleConfig,
            prize.id,
            prize.type,
            pickLotteryPrizeStylePayload(req.body)
        );
        await saveLotteryPrizeStyleConfig(AppConfig, nextStyleConfig);

        res.json({
            code: 0,
            data: applyLotteryPrizeStyle(prize, nextStyleConfig),
            message: '创建成功'
        });
    } catch (error) {
        console.error('创建抽奖奖品失败:', error);
        res.status(500).json({ code: -1, message: '创建失败' });
    }
};

const updateLotteryPrize = async (req, res) => {
    try {
        const prize = await LotteryPrize.findByPk(req.params.id);
        if (!prize) return res.status(404).json({ code: -1, message: '奖品不存在' });
        await prize.update(pickLotteryPrizeBasePayload(req.body));

        const styleConfig = await loadLotteryPrizeStyleConfig(AppConfig);
        const nextStyleConfig = upsertLotteryPrizeStyle(
            styleConfig,
            prize.id,
            prize.type,
            pickLotteryPrizeStylePayload(req.body)
        );
        await saveLotteryPrizeStyleConfig(AppConfig, nextStyleConfig);

        res.json({
            code: 0,
            data: applyLotteryPrizeStyle(prize, nextStyleConfig),
            message: '更新成功'
        });
    } catch (error) {
        console.error('更新抽奖奖品失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

const deleteLotteryPrize = async (req, res) => {
    try {
        await LotteryPrize.destroy({ where: { id: req.params.id } });
        const styleConfig = await loadLotteryPrizeStyleConfig(AppConfig);
        const nextStyleConfig = removeLotteryPrizeStyle(styleConfig, req.params.id);
        await saveLotteryPrizeStyleConfig(AppConfig, nextStyleConfig);
        res.json({ code: 0, message: '删除成功' });
    } catch (error) {
        console.error('删除抽奖奖品失败:', error);
        res.status(500).json({ code: -1, message: '删除失败' });
    }
};

// ==================== 活动入口选项 ====================

const getActivityOptions = async (req, res) => {
    try {
        const [
            groupCount,
            slashCount,
            lotteryCount,
            groupSample,
            slashSample,
            lotterySample
        ] = await Promise.all([
            GroupActivity.count({ where: { status: 1 } }),
            SlashActivity.count({ where: { status: 1 } }),
            LotteryPrize.count({ where: { is_active: 1 } }),
            GroupActivity.findOne({
                where: { status: 1 },
                include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'images', 'retail_price'] }],
                order: [['created_at', 'DESC']]
            }),
            SlashActivity.findOne({
                where: { status: 1 },
                include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'images', 'retail_price'] }],
                order: [['created_at', 'DESC']]
            }),
            LotteryPrize.findOne({
                where: { is_active: 1 },
                order: [['sort_order', 'ASC'], ['id', 'ASC']]
            })
        ]);

        const options = [
            {
                key: getActivityOptionKey('page', '/pages/group/list'),
                source_type: 'group_buy',
                title: '拼团活动',
                subtitle: '进入拼团列表页后选择商品',
                link_type: 'page',
                link_value: '/pages/group/list',
                cover_image: getFirstImage(groupSample?.product?.images),
                badge: groupCount > 0 ? `${groupCount}个活动` : '暂无活动',
                note: '用于活动中心入口，用户进入拼团页后再选择具体商品',
                disabled: false
            },
            {
                key: getActivityOptionKey('page', '/pages/slash/list'),
                source_type: 'slash',
                title: '砍价专区',
                subtitle: '进入砍价列表页发起或查看活动',
                link_type: 'page',
                link_value: '/pages/slash/list',
                cover_image: getFirstImage(slashSample?.product?.images),
                badge: slashCount > 0 ? `${slashCount}个活动` : '暂无活动',
                note: '用于活动中心入口，用户进入砍价页后再选择商品',
                disabled: false
            },
            {
                key: getActivityOptionKey('page', '/pages/lottery/lottery'),
                source_type: 'lottery',
                title: '积分抽奖',
                subtitle: '进入抽奖页面参与当前奖池',
                link_type: 'page',
                link_value: '/pages/lottery/lottery',
                cover_image: lotterySample?.image_url || '',
                badge: lotteryCount > 0 ? `${lotteryCount}个奖品` : '奖池待配置',
                note: '当前是单奖池模式，进入页面后直接参与抽奖',
                disabled: false
            },
            {
                key: 'coming_soon:festival_calendar',
                source_type: 'festival_calendar',
                title: '节日日历',
                subtitle: '节日时间轴与主题活动聚合页',
                link_type: 'none',
                link_value: '',
                cover_image: '',
                badge: '待建设',
                note: '节日日历页面尚未完成，当前不可选',
                disabled: true
            }
        ];

        res.json({ code: 0, data: options });
    } catch (error) {
        console.error('获取活动入口选项失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

// ==================== 节日活动配置 ====================
// 使用 AppConfig 表存储，category='festival'

const getFestivalConfig = async (req, res) => {
    try {
        const configs = await AppConfig.findAll({
            where: { category: 'festival' },
            order: [['config_key', 'ASC']]
        });

        let festivalData = null;
        const configMap = {};
        configs.forEach(c => {
            let val = c.config_value;
            if (c.config_type === 'json') { try { val = JSON.parse(val); } catch (_) {} }
            if (c.config_type === 'boolean') val = val === 'true';
            if (c.config_type === 'number') val = parseFloat(val);
            configMap[c.config_key] = val;
        });

        if (configMap.festival_data) {
            festivalData = normalizeFestivalConfig(configMap.festival_data);
        }

        const defaults = {
            active: false,
            name: '',
            banner_title: '',
            banner_subtitle: '',
            tag: '',
            banner: '',
            ctaText: '进入活动',
            ctaPath: '',
            cta_link_type: 'none',
            cta_link_value: '',
            countdown_to: null,
            theme_colors: { primary: '#C6A16E', bg: '#FFF8EE' },
            card_posters: [],
            show_featured_products: false,
            featured_products_limit: 4,
            global_wallpaper: { enabled: false, preset: 'default' }
        };
        res.json({ code: 0, data: { ...defaults, ...(festivalData || {}) } });
    } catch (error) {
        console.error('获取节日配置失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

const updateFestivalConfig = async (req, res) => {
    try {
        const festivalData = normalizeFestivalConfig(req.body || {});
        const normalized = {
            ...festivalData,
            card_posters: Array.isArray(festivalData.card_posters) ? festivalData.card_posters : [],
            show_featured_products: !!festivalData.show_featured_products,
            featured_products_limit: Math.min(Math.max(parseInt(festivalData.featured_products_limit || 4, 10), 1), 12),
            global_wallpaper: {
                enabled: !!festivalData.global_wallpaper?.enabled,
                preset: festivalData.global_wallpaper?.preset || 'default'
            }
        };

        await AppConfig.upsert({
            config_key: 'festival_data',
            config_value: JSON.stringify(normalized),
            config_type: 'json',
            category: 'festival',
            description: '节日活动配置',
            is_public: true,
            status: 1
        });
        clearPagePayloadCache('activity');

        res.json({ code: 0, message: '保存成功' });
    } catch (error) {
        console.error('更新节日配置失败:', error);
        res.status(500).json({ code: -1, message: '保存失败' });
    }
};

// ==================== 全局活动UI配置 ====================
// 使用 AppConfig：category='ui_theme', config_key='global_ui_config'
const DEFAULT_GLOBAL_UI_CONFIG = {
    wallpaper: {
        enabled: false,
        preset: 'default' // default | warm-gold | mist-blue | dark
    },
    card_style: {
        radius: 24,
        shadow: 'medium', // none | light | medium | heavy
        gap: 18
    },
    section_toggle: {
        show_featured_in_activity: true,
        show_featured_in_category: true
    },
    featured_products: {
        limit: 4,
        title: '精选好物',
        kicker: "EDITOR'S PICK",
        button_text: '去选购'
    }
};

const getGlobalUiConfig = async (req, res) => {
    try {
        const row = await AppConfig.findOne({
            where: {
                category: 'ui_theme',
                config_key: 'global_ui_config',
                status: 1
            }
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
        console.error('获取全局活动UI配置失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

const updateGlobalUiConfig = async (req, res) => {
    try {
        const body = req.body || {};
        const normalized = {
            ...DEFAULT_GLOBAL_UI_CONFIG,
            ...body,
            wallpaper: { ...DEFAULT_GLOBAL_UI_CONFIG.wallpaper, ...(body.wallpaper || {}) },
            card_style: {
                ...DEFAULT_GLOBAL_UI_CONFIG.card_style,
                ...(body.card_style || {}),
                radius: Math.min(Math.max(parseInt(body.card_style?.radius ?? DEFAULT_GLOBAL_UI_CONFIG.card_style.radius, 10), 8), 40),
                gap: Math.min(Math.max(parseInt(body.card_style?.gap ?? DEFAULT_GLOBAL_UI_CONFIG.card_style.gap, 10), 8), 40)
            },
            section_toggle: { ...DEFAULT_GLOBAL_UI_CONFIG.section_toggle, ...(body.section_toggle || {}) },
            featured_products: {
                ...DEFAULT_GLOBAL_UI_CONFIG.featured_products,
                ...(body.featured_products || {}),
                limit: Math.min(Math.max(parseInt(body.featured_products?.limit ?? DEFAULT_GLOBAL_UI_CONFIG.featured_products.limit, 10), 1), 12)
            }
        };

        await AppConfig.upsert({
            config_key: 'global_ui_config',
            config_value: JSON.stringify(normalized),
            config_type: 'json',
            category: 'ui_theme',
            description: '全局活动UI配置',
            is_public: true,
            status: 1
        });
        clearPagePayloadCache('activity');
        res.json({ code: 0, message: '保存成功' });
    } catch (error) {
        console.error('更新全局活动UI配置失败:', error);
        res.status(500).json({ code: -1, message: '保存失败' });
    }
};

// ─── 活动链接配置（banners / 常驻活动 / 限时活动） ─────────────────────────

const ACTIVITY_LINKS_CONFIG_KEY = 'activity_links_config';
const ACTIVITY_LINKS_CATEGORY   = 'activity';
const ACTIVITY_LINK_PAGE_WHITELIST = [
    '/pages/group/',
    '/pages/slash/',
    '/pages/lottery/',
    '/pages/activity/',
    '/pages/product/detail',
    '/pages/index/',
    '/pages/category/',
    '/pages/user/',
    '/pages/rules/',
    '/pages/coupon/',
    '/pages/points/',
    '/pages/activity/limited-spot'
];

const isValidActivityLinkValue = (linkType, linkValue) => {
    if (!linkType || linkType === 'none') return false;
    const value = String(linkValue || '').trim();
    if (!value) return false;
    if (linkType === 'page') {
        return value.startsWith('/pages/') && ACTIVITY_LINK_PAGE_WHITELIST.some(prefix => value.startsWith(prefix));
    }
    if (linkType === 'url') {
        return /^https?:\/\//i.test(value);
    }
    if (linkType === 'product') {
        return /^\d+$/.test(value);
    }
    return true;
};

const normalizeActivityLinksMeta = (body = {}) => {
    const order = body.activity_sections_order === 'limited_first' ? 'limited_first' : 'permanent_first';
    const newsTitle = String(body.brand_news_section_title || '品牌动态').trim().slice(0, 20);
    return {
        permanent_section_enabled: body.permanent_section_enabled !== false,
        activity_sections_order: order,
        brand_news_section_title: newsTitle || '品牌动态'
    };
};

const normalizeBrandNewsItem = (item, idx) => {
    const enabled = item.enabled !== false;
    const o = {
        id: item.id || `news_${Date.now()}_${idx}`,
        title: (item.title || '').trim().slice(0, 80),
        summary: (item.summary || '').trim().slice(0, 500),
        cover_image: (item.cover_image || item.image || '').trim().slice(0, 500),
        content_html: String(item.content_html || ''),
        sort_order: Number.isFinite(parseInt(item.sort_order, 10)) ? parseInt(item.sort_order, 10) : idx * 10,
        enabled
    };
    if (enabled) {
        if (!o.title) {
            throw new Error(`品牌新闻第 ${idx + 1} 条缺少标题`);
        }
        if (!o.summary.trim() && !o.content_html.trim()) {
            throw new Error(`品牌新闻第 ${idx + 1} 条请填写摘要或正文`);
        }
    } else if (!o.title) {
        o.title = `未发布-${idx + 1}`;
    }
    return o;
};

const normalizeActivityLinkItem = (item, idx, section) => {
    if (section === '常驻活动' && item.enabled === false) {
        return {
            id:         item.id         || String(Date.now()) + idx,
            title:      (item.title     || '').trim().slice(0, 40) || '未命名（已隐藏）',
            subtitle:   (item.subtitle  || '').trim().slice(0, 80),
            tag:        (item.tag       || '').trim().slice(0, 12),
            image:      item.image      || '',
            gradient:   item.gradient   || 'linear-gradient(135deg,#3D2F22,#5A4535)',
            link_type:  item.link_type  || 'none',
            link_value: item.link_value || '',
            end_time:   item.end_time   || null,
            sort_order: Number.isFinite(parseInt(item.sort_order, 10)) ? parseInt(item.sort_order, 10) : idx * 10,
            spot_products: [],
            direct_product_id: null,
            enabled: false
        };
    }

    const normalized = {
        id:         item.id         || String(Date.now()) + idx,
        title:      (item.title     || '').trim().slice(0, 40),
        subtitle:   (item.subtitle  || '').trim().slice(0, 80),
        tag:        (item.tag       || '').trim().slice(0, 12),
        image:      item.image      || '',
        gradient:   item.gradient   || 'linear-gradient(135deg,#3D2F22,#5A4535)',
        link_type:  item.link_type  || 'none',
        link_value: item.link_value || '',
        end_time:   item.end_time   || null,
        sort_order: Number.isFinite(parseInt(item.sort_order, 10)) ? parseInt(item.sort_order, 10) : idx * 10,
        spot_products: [],
        direct_product_id: null
    };

    if (section === '常驻活动') {
        normalized.enabled = item.enabled !== false;
    }

    if (section === '限时活动') {
        const dp = parseInt(item.direct_product_id, 10);
        if (Number.isFinite(dp) && dp > 0) {
            normalized.direct_product_id = dp;
        }
    }

    if (section === '限时活动' && Array.isArray(item.spot_products) && item.spot_products.length) {
        normalized.spot_products = item.spot_products.map((p, i) => LimitedSpotService.normalizeOffer(p, i));
        normalized.link_type = 'page';
        normalized.link_value = `/pages/activity/limited-spot?id=${encodeURIComponent(normalized.id)}`;
    } else if (
        section === '限时活动'
        && normalized.direct_product_id
        && (!normalized.link_type || normalized.link_type === 'none' || !String(normalized.link_value || '').trim())
    ) {
        normalized.link_type = 'product';
        normalized.link_value = String(normalized.direct_product_id);
    }

    if (!normalized.title) {
        throw new Error(`${section} 第 ${idx + 1} 项缺少活动标题`);
    }
    if (!isValidActivityLinkValue(normalized.link_type, normalized.link_value)) {
        throw new Error(`${section} 第 ${idx + 1} 项跳转目标无效`);
    }
    if (!normalized.image && !normalized.gradient) {
        throw new Error(`${section} 第 ${idx + 1} 项必须填写图片或渐变背景`);
    }
    if (section === '限时活动') {
        if (!normalized.end_time) {
            throw new Error(`限时活动第 ${idx + 1} 项必须填写截止时间`);
        }
        if (Number.isNaN(new Date(normalized.end_time).getTime()) || new Date(normalized.end_time) <= new Date()) {
            throw new Error(`限时活动第 ${idx + 1} 项截止时间无效`);
        }
    }

    return normalized;
};

/**
 * GET /admin/api/activity-links
 * 读取活动链接配置（banners、常驻活动卡片、限时活动卡片）
 */
const getActivityLinks = async (req, res) => {
    try {
        const row = await AppConfig.findOne({
            where: { category: ACTIVITY_LINKS_CATEGORY, config_key: ACTIVITY_LINKS_CONFIG_KEY, status: 1 }
        });
        let data = {
            banners: [],
            permanent: [],
            limited: [],
            brand_news: [],
            brand_news_section_title: '品牌动态'
        };
        if (row?.config_value) {
            try { data = { ...data, ...JSON.parse(row.config_value) }; } catch (_) {}
        }
        res.json({ code: 0, data });
    } catch (error) {
        console.error('读取活动链接配置失败:', error);
        res.status(500).json({ code: -1, message: '读取失败' });
    }
};

/**
 * PUT /admin/api/activity-links
 * 保存活动链接配置
 * Body: {
 *   permanent_section_enabled?: boolean,  // 默认 true；false 时小程序隐藏整块常驻区
 *   activity_sections_order?: 'permanent_first'|'limited_first',
 *   banners: [...], permanent: [...], limited: [...]
 * }
 *
 * 每项结构：
 * {
 *   id: string,
 *   title: string,
 *   subtitle?: string,
 *   tag?: string,
 *   image?: string,
 *   gradient?: string,
 *   link_type: 'page'|'product'|'url'|'none',
 *   link_value: string,
 *   end_time?: string,   // 仅限时活动用，ISO 日期字符串
 *   enabled?: boolean    // 仅常驻活动：false 时公开侧不展示该卡片
 * }
 */
const updateActivityLinks = async (req, res) => {
    try {
        const body = req.body || {};

        const normalize = (arr, section) => {
            if (!Array.isArray(arr)) return [];
            return arr.map((item, idx) => normalizeActivityLinkItem(item, idx, section));
        };

        const meta = normalizeActivityLinksMeta(body);
        const newsList = Array.isArray(body.brand_news) ? body.brand_news.map(normalizeBrandNewsItem) : [];
        const payload = {
            ...meta,
            banners:   normalize(body.banners, 'Banner'),
            permanent: normalize(body.permanent, '常驻活动'),
            limited:   normalize(body.limited, '限时活动'),
            brand_news: newsList
        };
        const bySort = (a, b) => (a.sort_order || 0) - (b.sort_order || 0);
        payload.banners.sort(bySort);
        payload.permanent.sort(bySort);
        payload.limited.sort(bySort);
        payload.brand_news.sort(bySort);

        await AppConfig.upsert({
            config_key:   ACTIVITY_LINKS_CONFIG_KEY,
            config_value: JSON.stringify(payload),
            config_type:  'json',
            category:     ACTIVITY_LINKS_CATEGORY,
            description:  '活动页链接配置（Banner/常驻/限时）',
            is_public:    true,
            status:       1
        });
        clearPagePayloadCache('activity');

        res.json({ code: 0, message: '保存成功' });
    } catch (error) {
        console.error('保存活动链接配置失败:', error);
        res.status(500).json({ code: -1, message: error.message || '保存失败' });
    }
};

module.exports = {
    getSlashActivities, getSlashActivityById, createSlashActivity, updateSlashActivity, deleteSlashActivity,
    getLotteryPrizes, createLotteryPrize, updateLotteryPrize, deleteLotteryPrize,
    getActivityOptions,
    getFestivalConfig, updateFestivalConfig,
    getGlobalUiConfig, updateGlobalUiConfig,
    getActivityLinks, updateActivityLinks
};
