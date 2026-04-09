'use strict';
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function toObject(value, fallback = {}) {
    if (!value) return fallback;
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed : fallback;
        } catch (_) {
            return fallback;
        }
    }
    return fallback;
}

function toArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }
    return [];
}

async function getSingletonDoc(collectionName) {
    const res = await db.collection(collectionName).limit(1).get().catch(() => ({ data: [] }));
    return res.data[0] || null;
}

async function getMiniProgramConfig() {
    const directDoc = await getSingletonDoc('mini-program-config');
    if (directDoc) return directDoc;

    const appConfigs = await db.collection('app_configs')
        .where({ is_public: true, status: _.in([true, 1, '1']) })
        .limit(200)
        .get()
        .catch(() => ({ data: [] }));

    const result = {};
    appConfigs.data.forEach((row) => {
        let value = row.config_value;
        if (row.config_type === 'json' || row.config_type === 'object' || row.config_type === 'array') value = toObject(value, value);
        else if (row.config_type === 'number') value = toNumber(value, 0);
        else if (row.config_type === 'boolean') value = value === 'true' || value === '1';
        if (row.category) {
            if (!result[row.category]) result[row.category] = {};
            result[row.category][row.config_key] = value;
        } else {
            result[row.config_key] = value;
        }
    });
    return result;
}

async function getSettingsConfig() {
    const directDoc = await getSingletonDoc('settings');
    if (directDoc) return directDoc;
    const rows = await db.collection('configs').limit(200).get().catch(() => ({ data: [] }));
    const result = {};
    rows.data.forEach((row) => {
        const group = row.config_group || row.category || 'SYSTEM';
        if (!result[group]) result[group] = {};
        let value = row.config_value;
        try {
            value = JSON.parse(value);
        } catch (_) {}
        result[group][row.config_key] = value;
    });
    return result;
}

function normalizeBanner(item) {
    return {
        id: item._id || item.id,
        title: item.title || '',
        subtitle: item.subtitle || item.kicker || '',
        image_url: item.image_url || item.image || '',
        image: item.image_url || item.image || '',
        link_type: item.link_type || 'none',
        link_value: String(item.link_value || item.product_id || ''),
        position: item.position || 'home',
        sort_order: toNumber(item.sort_order, 0)
    };
}

function normalizeProduct(product) {
    const images = toArray(product.images);
    return {
        id: product._id || product.id,
        name: product.name || '',
        cover_image: product.cover_image || images[0] || '',
        images,
        description: product.description || '',
        retail_price: toNumber(product.retail_price != null ? product.retail_price : product.min_price, 0),
        market_price: toNumber(product.market_price != null ? product.market_price : product.original_price, 0),
        stock: toNumber(product.stock, 0),
        sales_count: toNumber(product.sales_count != null ? product.sales_count : product.purchase_count, 0),
        heat_label: product.heat_label || '',
        status: product.status,
        visible_in_mall: product.visible_in_mall,
        enable_group_buy: product.enable_group_buy
    };
}

async function loadProductsByIds(productIds = []) {
    const ids = [...new Set(
        productIds
            .map((item) => toNumber(item, NaN))
            .filter((item) => Number.isFinite(item))
    )];

    if (!ids.length) return {};

    const res = await db.collection('products')
        .where({ id: _.in(ids) })
        .limit(Math.min(ids.length, 100))
        .get()
        .catch(() => ({ data: [] }));

    return (res.data || []).reduce((acc, item) => {
        const key = String(item.id != null ? item.id : item._id);
        acc[key] = normalizeProduct(item);
        return acc;
    }, {});
}

async function loadActivityList(collectionName, where = {}, formatter = null) {
    const res = await db.collection(collectionName)
        .where(where)
        .orderBy('created_at', 'desc')
        .limit(20)
        .get()
        .catch(() => ({ data: [] }));

    const rows = Array.isArray(res.data) ? res.data : [];
    const productsById = await loadProductsByIds(rows.map((item) => item.product_id));

    return rows.map((item) => {
        const normalized = formatter ? formatter(item) : { ...item, id: item._id || item.id };
        const productKey = String(item.product_id != null ? item.product_id : '');
        return {
            ...normalized,
            product: productsById[productKey] || null
        };
    });
}

async function getActiveProducts(limit = 6) {
    const query = await db.collection('products')
        .where({ status: _.in([true, 1, '1', 'active', 'on_sale']) })
        .orderBy('manual_weight', 'desc')
        .limit(limit)
        .get()
        .catch(() => ({ data: [] }));
    return query.data.map(normalizeProduct);
}

exports.main = async (event) => {
    const { action } = event;
    const wxContext = cloud.getWXContext();
    const currentOpenid = wxContext.OPENID;

    if (action === 'miniProgramConfig') {
        return { code: 0, success: true, data: await getMiniProgramConfig() };
    }

    if (action === 'homeContent') {
        const [miniProgramConfig, bannersRes, featuredProducts] = await Promise.all([
            getMiniProgramConfig(),
            db.collection('banners')
                .where({ status: _.in([true, 1, '1']) })
                .orderBy('sort_order', 'asc')
                .limit(20)
                .get()
                .catch(() => ({ data: [] })),
            getActiveProducts(6)
        ]);

        const bannersByPosition = { home: [], home_mid: [], home_bottom: [], category: [] };
        bannersRes.data.map(normalizeBanner).forEach((item) => {
            const position = item.position || 'home';
            if (!bannersByPosition[position]) bannersByPosition[position] = [];
            bannersByPosition[position].push(item);
        });

        return {
            code: 0,
            success: true,
            data: {
                banners: bannersByPosition.home,
                configs: miniProgramConfig,
                latestActivity: null,
                popupAd: {},
                _resources: {
                    layoutSchema: [],
                    dataSources: {},
                    banners: bannersByPosition,
                    boards: { 'home.featuredProducts': { products: featuredProducts } }
                }
            },
            resources: {
                legacy_payload: { banners: bannersByPosition.home, configs: miniProgramConfig },
                layout: null,
                boards: { 'home.featuredProducts': { products: featuredProducts } },
                banners: bannersByPosition
            }
        };
    }

    if (action === 'splash') {
        const res = await db.collection('splash_screens').where({ is_active: true }).limit(1).get().catch(() => ({ data: [] }));
        if (!res.data.length) return { code: 0, success: true, data: null };
        const item = res.data[0];
        return {
            code: 0,
            success: true,
            data: {
                show_mode: item.show_mode || 'image',
                image_url: item.image_url || '',
                title: item.title || '',
                subtitle: item.subtitle || '',
                duration: toNumber(item.duration, 3000),
                skip_text: item.skip_text || '跳过',
                bg_color_start: item.bg_color_start || '#FFFFFF',
                bg_color_end: item.bg_color_end || '#FFFFFF',
                layers: toArray(item.layers)
            }
        };
    }

    if (action === 'activeTheme') {
        const settings = await getSettingsConfig();
        return { code: 0, success: true, data: settings.theme || settings.THEME || {} };
    }

    if (action === 'getSystemConfig') {
        const settings = await getSettingsConfig();
        if (event.key) {
            const result = {};
            Object.keys(settings).forEach((group) => {
                if (settings[group] && Object.prototype.hasOwnProperty.call(settings[group], event.key)) {
                    result[event.key] = settings[group][event.key];
                }
            });
            return { code: 0, success: true, data: result };
        }
        if (event.group) return { code: 0, success: true, data: settings[event.group] || {} };
        return { code: 0, success: true, data: settings };
    }

    // ── 活动列表 ────────────────────────────────
    if (action === 'activities') {
        const res = await db.collection('activities')
            .where({ status: _.in([true, 1, '1', 'active']) })
            .orderBy('created_at', 'desc')
            .limit(20)
            .get()
            .catch(() => ({ data: [] }));
        return { code: 0, success: true, data: res.data.map((item) => ({ ...item, id: item._id || item.id })) };
    }

    // ── 拼团列表 ────────────────────────────────
    if (action === 'groups') {
        const res = await db.collection('group_activities')
            .where({ status: _.in([true, 1, '1', 'active']) })
            .orderBy('created_at', 'desc')
            .limit(20)
            .get()
            .catch(() => ({ data: [] }));
        return {
            code: 0,
            success: true,
            data: {
                list: res.data.map((item) => ({
                    ...item,
                    id: item._id || item.id,
                    current_count: toNumber(item.current_count || item.member_count, 0),
                    target_count: toNumber(item.target_count, 1)
                })),
                total: res.data.length
            }
        };
    }

    // ── 拼团详情 ────────────────────────────────
    if (action === 'groupDetail') {
        const groupId = event.group_id;
        if (!groupId) return { code: 400, success: false, message: '缺少拼团ID' };
        const [byDocId, byLegacyId] = await Promise.all([
            db.collection('group_activities').doc(String(groupId)).get().catch(() => ({ data: null })),
            db.collection('group_activities').where({ id: toNumber(groupId, NaN) }).limit(1).get().catch(() => ({ data: [] }))
        ]);
        const item = byDocId.data || byLegacyId.data[0] || null;
        if (!item) return { code: 404, success: false, message: '拼团不存在' };
        return {
            code: 0,
            success: true,
            data: {
                ...item,
                id: item._id || item.id,
                current_count: toNumber(item.current_count || item.member_count, 0),
                target_count: toNumber(item.target_count, 1),
                members: toArray(item.members)
            }
        };
    }

    // ── 砍价列表 ────────────────────────────────
    if (action === 'slashList') {
        const res = await db.collection('slash_activities')
            .where({ status: _.in([true, 1, '1', 'active']) })
            .orderBy('created_at', 'desc')
            .limit(20)
            .get()
            .catch(() => ({ data: [] }));
        return {
            code: 0,
            success: true,
            data: {
                list: res.data.map((item) => ({
                    ...item,
                    id: item._id || item.id,
                    current_price: toNumber(item.current_price || item.min_price, 0),
                    target_price: toNumber(item.target_price, 0),
                    original_price: toNumber(item.original_price || item.retail_price, 0)
                })),
                total: res.data.length
            }
        };
    }

    // ── 砍价详情 ────────────────────────────────
    if (action === 'slashDetail') {
        const slashId = event.slash_id;
        if (!slashId) return { code: 400, success: false, message: '缺少砍价ID' };
        // 优先从 slash_records 查询（砍价记录详情）
        const [recordByDocId, recordByNo] = await Promise.all([
            db.collection('slash_records').doc(String(slashId)).get().catch(() => ({ data: null })),
            db.collection('slash_records').where({ slash_no: String(slashId) }).limit(1).get().catch(() => ({ data: [] }))
        ]);
        const record = recordByDocId.data || recordByNo.data[0] || null;
        if (record) {
            // 找到记录了，补充活动详情
            const activityId = record.activity_id;
            let activity = null;
            let product = null;
            if (activityId) {
                const [actByDocId, actByLegacyId] = await Promise.all([
                    db.collection('slash_activities').doc(String(activityId)).get().catch(() => ({ data: null })),
                    db.collection('slash_activities').where({ id: toNumber(activityId, NaN) }).limit(1).get().catch(() => ({ data: [] }))
                ]);
                activity = actByDocId.data || actByLegacyId.data[0] || null;
                if (activity?.product_id) {
                    const prodRes = await db.collection('products').where({ _id: String(activity.product_id) }).limit(1).get().catch(() => ({ data: [] }));
                    const prodAlt = await db.collection('products').where({ id: toNumber(activity.product_id, NaN) }).limit(1).get().catch(() => ({ data: [] }));
                    const prod = prodRes.data[0] || prodAlt.data[0] || null;
                    if (prod) {
                        const images = toArray(prod.images);
                        product = { id: prod._id || prod.id, name: prod.name || '', images, retail_price: toNumber(prod.retail_price, 0) };
                    }
                }
            }
            const helpers = toArray(record.helpers);
            const originalPrice = toNumber(activity?.original_price || activity?.retail_price || record.original_price, 0);
            const floorPrice = toNumber(activity?.target_price || activity?.floor_price || record.target_price || 0, 0);
            const currentPrice = toNumber(record.current_price, originalPrice);
            const maxHelpers = toNumber(activity?.max_helpers, -1);
            const stockLimit = toNumber(activity?.stock_limit, 0);
            const soldCount = toNumber(activity?.sold_count, 0);
            const remainSeconds = record.expire_at ? Math.max(0, Math.floor((new Date(record.expire_at).getTime() - Date.now()) / 1000)) : 0;
            return {
                code: 0,
                success: true,
                data: {
                    ...record,
                    id: record._id || record.id,
                    slash_no: record.slash_no || record._id,
                    original_price: originalPrice,
                    current_price: currentPrice,
                    floor_price: floorPrice,
                    target_price: floorPrice,
                    helpers,
                    helper_count: helpers.length,
                    max_helpers: maxHelpers,
                    remain_seconds: remainSeconds,
                    product,
                    activity: activity ? { ...activity, id: activity._id || activity.id, max_helpers: maxHelpers, stock_limit: stockLimit, sold_count: soldCount } : null
                }
            };
        }
        // 兜底：从 slash_activities 查询（活动详情，而非砍价记录）
        const [byDocId, byLegacyId] = await Promise.all([
            db.collection('slash_activities').doc(String(slashId)).get().catch(() => ({ data: null })),
            db.collection('slash_activities').where({ id: toNumber(slashId, NaN) }).limit(1).get().catch(() => ({ data: [] }))
        ]);
        const item = byDocId.data || byLegacyId.data[0] || null;
        if (!item) return { code: 404, success: false, message: '砍价不存在' };
        return {
            code: 0,
            success: true,
            data: {
                ...item,
                id: item._id || item.id,
                current_price: toNumber(item.current_price || item.min_price, 0),
                target_price: toNumber(item.target_price, 0),
                original_price: toNumber(item.original_price || item.retail_price, 0),
                helpers: toArray(item.helpers)
            }
        };
    }

    // ── 抽奖活动配置 ──────────────────────────────
    if (action === 'lottery') {
        const res = await db.collection('lottery_configs')
            .where({ is_active: _.in([true, 1, '1']) })
            .orderBy('created_at', 'desc')
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        const config = res.data[0] || null;
        if (!config) return { code: 0, success: true, data: { status: 0, message: '暂无活动' } };
        return {
            code: 0,
            success: true,
            data: {
                ...config,
                id: config._id || config.id,
                status: 1,
                prizes: toArray(config.prizes),
                rules: config.rules || '',
                chances_per_day: toNumber(config.chances_per_day, 1),
                start_time: config.start_time || '',
                end_time: config.end_time || ''
            }
        };
    }

    if (action === 'lotteryPrizes') {
        const query = { is_active: _.in([true, 1, '1']) };
        const res = await db.collection('lottery_prizes').where(query)
            .orderBy('sort_order', 'asc').limit(20).get().catch(() => ({ data: [] }));
        return { code: 0, success: true, data: res.data };
    }

    if (action === 'lotteryRecords') {
        const openid = currentOpenid;
        const page = toNumber(event.page, 1);
        const limit = Math.min(toNumber(event.limit, 10), 50);
        if (!openid) return { code: 0, success: true, data: { list: [], total: 0 } };
        const countRes = await db.collection('lottery_records').where({ openid }).count().catch(() => ({ total: 0 }));
        const res = await db.collection('lottery_records').where({ openid })
            .orderBy('created_at', 'desc').skip((page - 1) * limit).limit(limit).get().catch(() => ({ data: [] }));
        return { code: 0, success: true, data: { list: res.data, total: countRes.total } };
    }

    if (action === 'boardsMap') {
        const keyList = String(event.keys || '').split(',').filter(Boolean);
        const result = {};
        const featuredProducts = await getActiveProducts(6);
        keyList.forEach((key) => {
            result[key] = { products: key === 'home.featuredProducts' ? featuredProducts : [] };
        });
        return { code: 0, success: true, data: result };
    }

    if (action === 'banners') {
        const query = { status: _.in([true, 1, '1']) };
        if (event.position) query.position = event.position;
        const res = await db.collection('banners').where(query).orderBy('sort_order', 'asc').limit(20).get().catch(() => ({ data: [] }));
        return { code: 0, success: true, data: res.data.map(normalizeBanner) };
    }

    // ── 活动气泡 ────────────────────────────────
    if (action === 'activityBubbles') {
        const res = await db.collection('activity_bubbles')
            .where({ status: _.in([true, 1, '1']) })
            .orderBy('sort_order', 'asc')
            .limit(10)
            .get()
            .catch(() => ({ data: [] }));
        return { code: 0, success: true, data: res.data.map((item) => ({ ...item, id: item._id || item.id })) };
    }

    // ── 活动链接 ────────────────────────────────
    if (action === 'activityLinks') {
        const res = await db.collection('activity_links')
            .where({ status: _.in([true, 1, '1']) })
            .orderBy('sort_order', 'asc')
            .limit(100)
            .get()
            .catch(() => ({ data: [] }));
        const allLinks = res.data.map((item) => ({ ...item, id: item._id || item.id }));
        // 按 section 分组返回结构化对象，匹配 activityLoader 期望的格式
        const banners = allLinks.filter((item) => item.section === 'banner' || item.position === 'banner');
        const permanent = allLinks.filter((item) => item.section === 'permanent' || item.position === 'permanent' || item.type === 'permanent');
        const limited = allLinks.filter((item) => item.section === 'limited' || item.position === 'limited' || item.type === 'limited');
        const brandNews = allLinks.filter((item) => item.section === 'brand_news' || item.position === 'brand_news' || item.type === 'brand_news');
        return {
            code: 0,
            success: true,
            data: {
                banners,
                permanent,
                limited,
                brand_news: brandNews,
                brand_news_section_title: '品牌动态',
                permanent_section_enabled: true,
                activity_links: allLinks
            }
        };
    }

    // ── 节日活动配置 ──────────────────────────────
    if (action === 'festivalConfig') {
        const res = await db.collection('festival_configs')
            .where({ is_active: _.in([true, 1, '1']) })
            .orderBy('created_at', 'desc')
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        const config = res.data[0] || null;
        return { code: 0, success: true, data: config ? { ...config, id: config._id || config.id } : null };
    }

    // ── 规则页面 ────────────────────────────────
    if (action === 'rules') {
        const doc = await getSingletonDoc('rules');
        return { code: 0, success: true, data: doc || { title: '平台规则', content: '' } };
    }

    // ── 问卷 ────────────────────────────────────
    if (action === 'questionnaireActive') {
        const res = await db.collection('questionnaires')
            .where({ is_active: _.in([true, 1, '1']) })
            .orderBy('created_at', 'desc')
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        return { code: 0, success: true, data: res.data[0] || null };
    }

    // ── 拼团活动列表 ──────────────────────────────
    if (action === 'groupActivities') {
        const where = { status: _.in([true, 1, '1', 'active']) };
        const productId = toNumber(event.product_id, NaN);
        if (Number.isFinite(productId)) where.product_id = productId;
        const list = await loadActivityList('group_activities', where, (item) => ({ ...item, id: item._id || item.id }));
        return { code: 0, success: true, data: list };
    }

    // ── 砍价活动列表 ──────────────────────────────
    if (action === 'slashActivities') {
        const where = { status: _.in([true, 1, '1', 'active']) };
        const productId = toNumber(event.product_id, NaN);
        if (Number.isFinite(productId)) where.product_id = productId;
        const list = await loadActivityList('slash_activities', where, (item) => ({ ...item, id: item._id || item.id }));
        return { code: 0, success: true, data: list };
    }

    // ── 限时抢购详情 ──────────────────────────────
    if (action === 'limitedSpotDetail') {
        const cardId = event.card_id;
        if (!cardId) return { code: 0, success: true, data: null };
        const res = await db.collection('flash_sale_cards')
            .where({ _id: cardId }).limit(1).get().catch(() => ({ data: [] }));
        const altRes = !res.data.length
            ? await db.collection('limited_spot_cards').where({ id: toNumber(cardId, NaN) }).limit(1).get().catch(() => ({ data: [] }))
            : { data: [] };
        const card = res.data[0] || altRes.data[0] || null;
        return { code: 0, success: true, data: card ? { ...card, id: card._id || card.id } : null };
    }

    // ── 品牌动态详情 ──────────────────────────────
    if (action === 'brandNews') {
        const newsId = event.id;
        if (!newsId) return { code: 0, success: true, data: null };
        const res = await db.collection('brand_news')
            .where({ _id: String(newsId) }).limit(1).get().catch(() => ({ data: [] }));
        const altRes = !res.data.length
            ? await db.collection('page_contents').where({ _id: String(newsId) }).limit(1).get().catch(() => ({ data: [] }))
            : { data: [] };
        const doc = res.data[0] || altRes.data[0] || null;
        return { code: 0, success: true, data: doc ? { ...doc, id: doc._id || doc.id } : null };
    }

    // ── N人团邀请卡 ──────────────────────────────
    if (action === 'nInviteCard') {
        const leaderId = event.leader_id;
        if (!leaderId) return { code: 0, success: true, data: null };
        const users = await db.collection('users')
            .where({ openid: String(leaderId) }).limit(1).get().catch(() => ({ data: [] }));
        const user = users.data[0] || null;
        if (!user) return { code: 0, success: true, data: null };
        return {
            code: 0,
            success: true,
            data: {
                leader_openid: user.openid,
                nickname: user.nickName || user.nickname || '',
                avatar_url: user.avatarUrl || user.avatar_url || '',
                invite_code: user.my_invite_code || user.invite_code || ''
            }
        };
    }

    return { code: 400, success: false, message: `未知 action: ${action}` };
};
