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

// ==================== 子模块导入 ====================
const configLoader = require('./config-loader');
const configCache = require('./config-cache');

// ==================== 主处理函数 ====================
const asyncHandler = (handler) => async (...args) => {
    try {
        return await handler(...args);
    } catch (err) {
        if (err instanceof CloudBaseError) throw err;
        throw serverError(err.message || '操作失败');
    }
};

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
        return success(config);
    }),

    // ===== 首页内容 =====
    'homeContent': asyncHandler(async (params) => {
        // 兼容旧数据字段：banners 用 status, products 用 status:true, page_layouts 用 page_key+status
        const [bannersRes, layoutsRes, productsRes] = await Promise.all([
            db.collection('banners').where({ status: true }).orderBy('sort_order', 'asc').limit(10).get().catch(() => ({ data: [] })),
            db.collection('page_layouts').where({ page_key: 'home', status: true }).limit(1).get().catch(() => ({ data: [] })),
            db.collection('products').where({ status: true }).orderBy('sales_count', 'desc').limit(10).get().catch(() => ({ data: [] })),
        ]);

        const layout = layoutsRes.data && layoutsRes.data[0] ? layoutsRes.data[0] : null;

        return success({
            banners: bannersRes.data || [],
            layout: layout ? layout.layout_schema || layout.sections || layout : null,
            hot_products: (productsRes.data || []).map(p => ({
                _id: p._id,
                name: p.name,
                images: p.images || [],
                min_price: p.min_price || p.retail_price,
                original_price: p.original_price || p.market_price,
                sales_count: p.sales_count || p.purchase_count || 0,
            })),
        });
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
        const res = await db.collection('splash_screens')
            .where({ is_active: true })
            .orderBy('created_at', 'desc')
            .limit(1)
            .get().catch(() => ({ data: [] }));
        return success(res.data && res.data[0] ? res.data[0] : null);
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
        return success({ list: res.data || [] });
    }),

    'groupDetail': asyncHandler(async (params) => {
        const id = params.group_id || params.id;
        if (!id) throw badRequest('缺少拼团 ID');
        const res = await db.collection('group_activities').doc(id).get().catch(() => ({ data: null }));
        if (!res.data) throw badRequest('拼团活动不存在');
        return success(res.data);
    }),

    'groupActivities': asyncHandler(async (params) => {
        const res = await db.collection('group_activities')
            .where({ status: true })
            .orderBy('created_at', 'desc')
            .limit(20)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    // ===== 砍价 =====
    'slashList': asyncHandler(async (params) => {
        const res = await db.collection('slash_activities')
            .where({ status: true })
            .orderBy('created_at', 'desc')
            .limit(20)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    'slashDetail': asyncHandler(async (params) => {
        const id = params.slash_id || params.id;
        if (!id) throw badRequest('缺少砍价活动 ID');
        const res = await db.collection('slash_activities').doc(id).get().catch(() => ({ data: null }));
        if (!res.data) throw badRequest('砍价活动不存在');
        return success(res.data);
    }),

    'slashActivities': asyncHandler(async (params) => {
        const res = await db.collection('slash_activities')
            .where({ status: true })
            .orderBy('created_at', 'desc')
            .limit(20)
            .get().catch(() => ({ data: [] }));
        return success({ list: res.data || [] });
    }),

    // ===== 抽奖 =====
    'lottery': asyncHandler(async (params) => {
        const res = await db.collection('configs')
            .where({ config_group: 'lottery' })
            .limit(1)
            .get().catch(() => ({ data: [] }));
        return success(res.data && res.data[0] ? (res.data[0].config_value || res.data[0].value) : {});
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
        return success(res.data && res.data[0] ? (res.data[0].config_value || res.data[0].value) : {});
    }),

    // ===== 限量抢购 =====
    'limitedSpotDetail': asyncHandler(async (params) => {
        const res = await db.collection('configs')
            .where({ config_group: 'limited-spot' })
            .limit(1)
            .get().catch(() => ({ data: [] }));
        return success(res.data && res.data[0] ? (res.data[0].config_value || res.data[0].value) : {});
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

    // lotteryRecords 需要 openid
    if (action === 'lotteryRecords' && !params.openid) {
        const wxContext = cloud.getWXContext();
        params.openid = wxContext.OPENID;
    }

    const handler = handleAction[action];
    if (!handler) {
        throw badRequest(`未知 action: ${action}`);
    }

    return handler(params);
});
