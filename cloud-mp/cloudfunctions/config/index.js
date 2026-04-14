'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const {
    CloudBaseError, cloudFunctionWrapper
} = require('./shared/errors');
const {
    success, badRequest, serverError
} = require('./shared/response');

const db = cloud.database();
const _ = db.command;

// ==================== 子模块导入 ====================
const configLoader = require('./config-loader');
const configCache = require('./config-cache');
const configContract = require('./config-contract');

// ==================== 主处理函数 ====================
const asyncHandler = (handler) => async (...args) => {
    try {
        return await handler(...args);
    } catch (err) {
        if (err instanceof CloudBaseError) throw err;
        if (err && typeof err === 'object' && 'code' in err && 'success' in err && 'message' in err) throw err;
        throw serverError(err.message || '操作失败');
    }
};

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function toArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (!hasValue(value)) return [];
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];
        if (trimmed[0] === '[') {
            try {
                const parsed = JSON.parse(trimmed);
                return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
            } catch (_) {
                return [trimmed];
            }
        }
        return [trimmed];
    }
    return [];
}

function toDisplayPrice(value, centsField) {
    if (!hasValue(value)) return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    if (centsField && Math.abs(num) >= 1000) return +(num / 100).toFixed(2);
    return +num.toFixed(2);
}

function firstPrice(values) {
    let fallback = 0;
    for (let i = 0; i < values.length; i += 1) {
        const value = values[i];
        if (value == null) continue;
        fallback = value;
        if (Number(value) > 0) return value;
    }
    return fallback;
}

function productSummary(product) {
    if (!product) return null;
    const images = toArray(product.images);
    const price = firstPrice([
        toDisplayPrice(product.retail_price, false),
        toDisplayPrice(product.price, false),
        toDisplayPrice(product.min_price, true)
    ]);
    const marketPrice = firstPrice([
        toDisplayPrice(product.market_price, false),
        toDisplayPrice(product.original_price, true)
    ]);
    const id = hasValue(product.id)
        ? product.id
        : (hasValue(product._legacy_id) ? product._legacy_id : product._id);

    return {
        _id: product._id,
        id,
        _legacy_id: product._legacy_id,
        name: product.name || product.title || '商品',
        description: product.description || product.subtitle || '',
        image: product.image || product.cover || images[0] || '',
        images,
        price,
        retail_price: price,
        min_price: price,
        displayPrice: price > 0 ? price.toFixed(2) : '0.00',
        market_price: marketPrice,
        original_price: marketPrice,
        stock: Number(product.stock || product.stock_quantity || 0),
        sales_count: Number(product.sales_count || product.sold_count || product.purchase_count || 0)
    };
}

function uniqueValues(values) {
    const seen = {};
    const list = [];
    values.forEach((value) => {
        if (!hasValue(value)) return;
        const key = String(value);
        if (seen[key]) return;
        seen[key] = true;
        list.push(value);
    });
    return list;
}

async function loadProductsByActivityIds(productIds) {
    const ids = uniqueValues(productIds);
    if (!ids.length) return {};

    const numberIds = uniqueValues(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id)));
    const stringIds = uniqueValues(ids.map((id) => String(id)));
    const queries = [];

    if (numberIds.length) {
        queries.push(db.collection('products').where({ id: _.in(numberIds) }).limit(100).get());
        queries.push(db.collection('products').where({ _legacy_id: _.in(numberIds) }).limit(100).get());
    }
    if (stringIds.length) {
        queries.push(db.collection('products').where({ _id: _.in(stringIds) }).limit(100).get());
        queries.push(db.collection('products').where({ id: _.in(stringIds) }).limit(100).get());
        queries.push(db.collection('products').where({ _legacy_id: _.in(stringIds) }).limit(100).get());
    }

    const results = await Promise.all(queries.map((query) => query.catch(() => ({ data: [] }))));
    const productMap = {};
    results.forEach((res) => {
        (res.data || []).forEach((product) => {
            const summary = productSummary(product);
            if (!summary) return;
            [summary._id, summary.id, summary._legacy_id].forEach((key) => {
                if (hasValue(key)) productMap[String(key)] = summary;
            });
        });
    });
    return productMap;
}

async function hydrateActivitiesWithProducts(activities) {
    const list = Array.isArray(activities) ? activities : [];
    const productIds = list.map((activity) => activity && activity.product_id);
    const products = await loadProductsByActivityIds(productIds);
    return list.map((activity) => {
        if (!activity) return activity;
        const product = activity.product || products[String(activity.product_id)] || null;
        return {
            ...activity,
            product
        };
    });
}

async function getAppConfigValue(key, fallback = null) {
    const res = await db.collection('app_configs')
        .where({ config_key: key, status: true })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    if (res.data && res.data[0]) {
        const row = res.data[0];
        return row.config_value !== undefined ? row.config_value : (row.value !== undefined ? row.value : row);
    }
    return fallback;
}

async function getSingletonValue(key, fallback = null) {
    const doc = await db.collection('admin_singletons')
        .doc(String(key))
        .get()
        .catch(() => ({ data: null }));
    if (!doc.data) return fallback;
    return doc.data.value !== undefined ? doc.data.value : fallback;
}

async function getHomepageSettings() {
    const settings = await getSingletonValue('settings', {});
    return (settings && (settings.homepage || settings.HOMEPAGE)) || {};
}

async function getPopupAdConfig() {
    const popup = await getSingletonValue('popup-ad-config', null);
    return configContract.normalizePopupAdConfig(popup || {});
}

async function findOneByAnyId(collectionName, rawId) {
    if (!hasValue(rawId)) return null;
    const id = String(rawId);
    const byDocId = await db.collection(collectionName).doc(id).get().catch(() => ({ data: null }));
    if (byDocId.data) return byDocId.data;
    const candidates = [id];
    const numericId = Number(id);
    if (Number.isFinite(numericId)) candidates.push(numericId);
    const res = await db.collection(collectionName)
        .where(_.or([
            { id: _.in(candidates) },
            { _legacy_id: _.in(candidates) }
        ]))
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

const handleAction = {
    // ===== 基础配置 =====
    'init': asyncHandler(async (params) => {
        const config = await configLoader.loadConfig();
        return success(config);
    }),

    'list': asyncHandler(async (params) => {
        const config = await configLoader.loadConfig();
        return success(config);
    }),

    'get': asyncHandler(async (params) => {
        const key = params.key;
        if (!key) throw badRequest('缺少 key 参数');
        const value = await configCache.getConfig(key);
        return success({ [key]: value });
    }),

    'getSystemConfig': asyncHandler(async (params) => {
        const config = await configLoader.loadConfig();
        return success(config);
    }),

    'miniProgramConfig': asyncHandler(async (params) => {
        const config = await configLoader.loadConfig();
        return success(configContract.normalizeMiniProgramConfig(config.mini_program_config || config));
    }),

    // ===== 首页内容 =====
    'homeContent': asyncHandler(async (params) => {
        // 兼容旧数据字段：banners 用 status, products 用 status:true, page_layouts 用 page_key+status
        const [homeBannerRes, midBannerRes, bottomBannerRes, layoutsRes, productsRes, miniProgramConfig, homepageSettings, popupAd] = await Promise.all([
            db.collection('banners').where({ status: true, position: 'home' }).orderBy('sort_order', 'asc').limit(10).get().catch(() => ({ data: [] })),
            db.collection('banners').where({ status: true, position: 'home_mid' }).orderBy('sort_order', 'asc').limit(10).get().catch(() => ({ data: [] })),
            db.collection('banners').where({ status: true, position: 'home_bottom' }).orderBy('sort_order', 'asc').limit(10).get().catch(() => ({ data: [] })),
            db.collection('page_layouts').where({ page_key: 'home', status: true }).limit(1).get().catch(() => ({ data: [] })),
            db.collection('products').where({ status: true }).orderBy('sales_count', 'desc').limit(10).get().catch(() => ({ data: [] })),
            (async () => {
                const allConfig = await configLoader.loadConfig();
                return configContract.normalizeMiniProgramConfig(allConfig.mini_program_config || allConfig);
            })(),
            getHomepageSettings(),
            getPopupAdConfig()
        ]);

        const layout = layoutsRes.data && layoutsRes.data[0] ? layoutsRes.data[0] : null;
        const hotProducts = (productsRes.data || []).map((p) => ({
            _id: p._id,
            id: p.id || p._legacy_id || p._id,
            name: p.name,
            images: p.images || [],
            min_price: p.min_price || p.retail_price,
            retail_price: p.retail_price || p.min_price,
            original_price: p.original_price || p.market_price,
            sales_count: p.sales_count || p.purchase_count || 0,
        }));

        return success(configContract.normalizeHomeContentPayload({
            miniProgramConfig,
            homepageSettings,
            bannersByPosition: {
                home: homeBannerRes.data || [],
                home_mid: midBannerRes.data || [],
                home_bottom: bottomBannerRes.data || []
            },
            hotProducts,
            popupAd,
            layout: layout ? layout.layout_schema || layout.sections || layout : null,
            latestActivity: {}
        }));
    }),

    // ===== Banners =====
    'banners': asyncHandler(async (params) => {
        const position = params.position || null;
        const query = position
            ? { status: true, position }
            : { status: true };
        const res = await db.collection('banners')
            .where(query)
            .orderBy('sort_order', 'asc')
            .limit(10)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    // ===== 开屏广告 =====
    'splash': asyncHandler(async (params) => {
        const singletonConfig = await getSingletonValue('splash_config', null);
        if (singletonConfig) {
            return success(configContract.normalizeSplashConfig(singletonConfig));
        }
        const res = await db.collection('splash_screens')
            .where({ is_active: true })
            .orderBy('created_at', 'desc')
            .limit(1)
            .get().catch(() => ({ data: [] }));
        return success(configContract.normalizeSplashConfig(res.data && res.data[0] ? res.data[0] : null));
    }),

    // ===== 主题 =====
    'activeTheme': asyncHandler(async (params) => {
        const res = await db.collection('configs')
            .where({ config_group: 'theme' })
            .limit(1)
            .get().catch(() => ({ data: [] }));
        return success(res.data && res.data[0] ? (res.data[0].config_value || res.data[0].value) : { primary_color: '#ff6b35' });
    }),

    // ===== 活动列表 =====
    'activities': asyncHandler(async (params) => {
        const res = await db.collection('activities')
            .where({ status: true })
            .orderBy('created_at', 'desc')
            .limit(20)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    // ===== 拼团 =====
    'groups': asyncHandler(async (params) => {
        const res = await db.collection('group_activities')
            .where({ status: true })
            .orderBy('created_at', 'desc')
            .limit(20)
            .get().catch(() => ({ data: [] }));
        const list = await hydrateActivitiesWithProducts(res.data || []);
        return success({ list });
    }),

    'groupDetail': asyncHandler(async (params) => {
        const id = params.group_id || params.id;
        if (!id) throw badRequest('缺少拼团 ID');
        const activity = await findOneByAnyId('group_activities', id);
        if (!activity) throw badRequest('拼团活动不存在');
        const list = await hydrateActivitiesWithProducts([activity]);
        return success(list[0] || activity);
    }),

    'groupActivities': asyncHandler(async (params) => {
        const res = await db.collection('group_activities')
            .where({ status: true })
            .orderBy('created_at', 'desc')
            .limit(20)
            .get().catch(() => ({ data: [] }));
        const list = await hydrateActivitiesWithProducts(res.data || []);
        return success({ list });
    }),

    // ===== 砍价 =====
    'slashList': asyncHandler(async (params) => {
        const res = await db.collection('slash_activities')
            .where({ status: true })
            .orderBy('created_at', 'desc')
            .limit(20)
            .get().catch(() => ({ data: [] }));
        const list = await hydrateActivitiesWithProducts(res.data || []);
        return success({ list });
    }),

    'slashDetail': asyncHandler(async (params) => {
        const id = params.slash_id || params.id;
        if (!id) throw badRequest('缺少砍价活动 ID');
        const activity = await findOneByAnyId('slash_activities', id);
        if (!activity) throw badRequest('砍价活动不存在');
        const list = await hydrateActivitiesWithProducts([activity]);
        return success(list[0] || activity);
    }),

    'slashActivities': asyncHandler(async (params) => {
        const res = await db.collection('slash_activities')
            .where({ status: true })
            .orderBy('created_at', 'desc')
            .limit(20)
            .get().catch(() => ({ data: [] }));
        const list = await hydrateActivitiesWithProducts(res.data || []);
        return success({ list });
    }),

    // ===== 抽奖 =====
    'lottery': asyncHandler(async (params) => {
        const collectionRes = await db.collection('lottery_configs')
            .where({ is_active: true })
            .orderBy('updated_at', 'desc')
            .limit(1)
            .get().catch(() => ({ data: [] }));
        if (collectionRes.data && collectionRes.data[0]) {
            return success(collectionRes.data[0]);
        }
        const res = await db.collection('configs')
            .where({ config_group: 'lottery' })
            .limit(1)
            .get().catch(() => ({ data: [] }));
        if (res.data && res.data[0]) return success(res.data[0].config_value || res.data[0].value || {});
        return success(await getAppConfigValue('lottery_config', {}));
    }),

    'lotteryPrizes': asyncHandler(async (params) => {
        const res = await db.collection('lottery_prizes')
            .where({ is_active: true })
            .orderBy('sort_order', 'asc')
            .limit(20)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    'lotteryRecords': asyncHandler(async (params) => {
        const openid = params.openid;
        if (!openid) return success({ list: [] });
        const res = await db.collection('lottery_records')
            .where({ openid })
            .orderBy('created_at', 'desc')
            .limit(50)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    // ===== 内容板块 =====
    'boardsMap': asyncHandler(async (params) => {
        const res = await db.collection('content_boards')
            .where({ is_active: true })
            .get().catch(() => ({ data: [] }));
        const map = {};
        (res.data || []).forEach(b => { map[b.board_key || b.key || b._id] = b; });
        return success(map);
    }),

    // ===== 活动气泡/链接 =====
    'activityBubbles': asyncHandler(async (params) => {
        const res = await db.collection('activity_bubbles')
            .where({ is_active: true })
            .orderBy('sort_order', 'asc')
            .limit(10)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    'activityLinks': asyncHandler(async (params) => {
        const configValue = await getAppConfigValue('activity_links_config', null);
        if (configValue && typeof configValue === 'object') {
            return success(configValue);
        }
        const res = await db.collection('activity_links')
            .where({ is_active: true })
            .orderBy('sort_order', 'asc')
            .limit(20)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    'festivalConfig': asyncHandler(async (params) => {
        const res = await db.collection('configs')
            .where({ config_group: 'festival' })
            .limit(1)
            .get().catch(() => ({ data: [] }));
        if (res.data && res.data[0]) return success(res.data[0].config_value || res.data[0].value || {});
        return success(await getAppConfigValue('activity_links_config', {}));
    }),

    // ===== 限量抢购 =====
    'limitedSpotDetail': asyncHandler(async (params) => {
        const cardId = String(params.card_id || params.id || '').trim();
        if (!cardId) throw badRequest('缺少 card_id 参数');

        const configValue = await getAppConfigValue('activity_links_config', null);
        const normalizedLinks = (configValue && typeof configValue === 'object')
            ? configValue
            : {};
        const limitedCards = Array.isArray(normalizedLinks.limited) ? normalizedLinks.limited : [];
        const card = limitedCards.find((item) => String(item.id || '') === cardId) || null;

        if (!card) {
            return success({ card: null, products: [] });
        }

        const spotProducts = Array.isArray(card.spot_products) ? card.spot_products : [];
        const productMap = await loadProductsByActivityIds(spotProducts.map((item) => item.product_id));

        const products = spotProducts.map((offer, index) => {
            const product = productSummary(productMap[String(offer.product_id)] || null);
            const remaining = Math.max(0, Number(offer.stock_limit || 0) - Number(offer.sold_count || 0));
            return {
                offer_id: offer.id || offer.offer_id || `${cardId}-${index}`,
                product_id: offer.product_id || '',
                sku_id: offer.sku_id || '',
                enable_points: offer.enable_points !== false,
                enable_money: offer.enable_money !== false,
                points_price: Number(offer.points_price || 0),
                money_price: Number(offer.money_price || 0),
                stock_limit: Number(offer.stock_limit || 0),
                sold_count: Number(offer.sold_count || 0),
                remaining,
                product: product || {
                    id: offer.product_id || '',
                    name: '商品',
                    image: '',
                    images: []
                }
            };
        });

        return success({
            card: {
                id: card.id || cardId,
                title: card.title || '',
                subtitle: card.subtitle || card.subTitle || '',
                image: card.file_id || card.image || card.image_url || card.cover_image || '',
                end_time: card.end_time || null
            },
            products
        });
    }),

    // ===== 品牌动态 =====
    'brandNews': asyncHandler(async (params) => {
        const res = await db.collection('brand_news')
            .where({ is_active: true })
            .orderBy('created_at', 'desc')
            .limit(10)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    // ===== 邀请卡 =====
    'nInviteCard': asyncHandler(async (params) => {
        const res = await db.collection('configs')
            .where({ config_group: 'invite-card' })
            .limit(1)
            .get().catch(() => ({ data: [] }));
        return success(res.data && res.data[0] ? (res.data[0].config_value || res.data[0].value) : {});
    }),

    // ===== 问卷 =====
    'questionnaireActive': asyncHandler(async (params) => {
        const res = await db.collection('configs')
            .where({ config_group: 'questionnaire' })
            .limit(1)
            .get().catch(() => ({ data: [] }));
        return success(res.data && res.data[0] ? (res.data[0].config_value || res.data[0].value) : null);
    }),

    // ===== 规则 =====
    'rules': asyncHandler(async (params) => {
        const key = params.key || 'general';
        const value = await configCache.getConfig(`rules_${key}`);
        if (value) return success(value);
        const res = await db.collection('configs')
            .where({ config_group: 'rules', config_key: `rules_${key}` })
            .limit(1)
            .get().catch(() => ({ data: [] }));
        return success(res.data && res.data[0] ? (res.data[0].config_value || res.data[0].value) : {});
    }),
};

// ==================== 云函数导出 ====================
exports.main = cloudFunctionWrapper(async (event) => {
    const { action, ...params } = event;

    // config 云函数部分 action 不需要登录（如首页配置）
    const publicActions = ['init', 'list', 'getSystemConfig', 'miniProgramConfig', 'homeContent',
        'banners', 'splash', 'activeTheme', 'activities', 'groups', 'groupDetail', 'groupActivities',
        'slashList', 'slashDetail', 'slashActivities', 'lottery', 'lotteryPrizes', 'boardsMap',
        'activityBubbles', 'activityLinks', 'festivalConfig', 'limitedSpotDetail', 'brandNews',
        'nInviteCard', 'questionnaireActive', 'rules', 'get'];

    // lotteryRecords 必须使用当前登录用户的 openid，忽略 params.openid 防止枚举他人记录
    if (action === 'lotteryRecords') {
        const wxContext = cloud.getWXContext();
        params.openid = wxContext.OPENID || '';  // 强制覆盖，不允许查他人
    }

    const handler = handleAction[action];
    if (!handler) {
        throw badRequest(`未知 action: ${action}`);
    }

    return handler(params);
});
