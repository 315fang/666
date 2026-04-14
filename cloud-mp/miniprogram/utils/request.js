/**
 * utils/request.js — 云开发兼容层（Cloud Function Router）
 *
 * ★ 策略：原页面 JS 不做任何改动，此文件把所有 REST 风格调用
 *   路由到对应云函数，完全透明替换旧 wx.request 方案。
 *
 * 原用法（已复制的页面文件中依然是这样写）：
 *   const { get, post, put, del } = require('../../utils/request');
 *   get('/products', { page: 1 })
 *   post('/orders', payload)
 *
 * 实际执行（本文件内部）：
 *   wx.cloud.callFunction({ name: 'products', data: { action: 'list', page: 1 } })
 *   wx.cloud.callFunction({ name: 'order',    data: { action: 'create', ...payload } })
 */

const { callFn, uploadToCloud } = require('./cloud');

/* ─────────────────────────────────────────────────────────────────
   URL → 云函数路由表
   格式：{ fn: '云函数名', action: 'action字段值', idKey: '路径参数key' }
───────────────────────────────────────────────────────────────── */
const ROUTE_TABLE = {
    // ── 认证 ──────────────────────────────────
    'POST /login':                          { fn: 'login',        action: null },

    // ── 用户 ──────────────────────────────────
    'GET /user/profile':                    { fn: 'user',         action: 'getProfile' },
    'PUT /user/profile':                    { fn: 'user',         action: 'updateProfile' },
    'GET /user/stats':                      { fn: 'user',         action: 'getStats' },
    'GET /user/favorites':                  { fn: 'user',         action: 'getFavorites' },
    'GET /user/favorites/status':           { fn: 'user',         action: 'favoriteStatus' },
    'POST /user/favorites/sync':            { fn: 'user',         action: 'syncFavorites' },
    'POST /user/favorites':                 { fn: 'user',         action: 'addFavorite' },
    'DELETE /user/favorites':               { fn: 'user',         action: 'removeFavorite' },
    'POST /user/claim-welcome-coupons':     { fn: 'user',         action: 'claimWelcomeCoupons' },
    'POST /coupons/claim':                  { fn: 'user',         action: 'claimCoupon' },
    'GET /coupons/info':                    { fn: 'user',         action: 'getCouponInfo' },

    // ── 商品 ──────────────────────────────────
    'GET /products':                        { fn: 'products',     action: 'list' },
    'GET /products/:id':                    { fn: 'products',     action: 'detail',             idKey: 'product_id' },
    'GET /categories':                      { fn: 'products',     action: 'categories' },
    'GET /products/search':                 { fn: 'products',     action: 'search' },

    // ── 购物车 ────────────────────────────────
    'GET /cart':                            { fn: 'cart',         action: 'list' },
    'POST /cart':                           { fn: 'cart',         action: 'add' },
    'PUT /cart/:id':                        { fn: 'cart',         action: 'update',             idKey: 'cart_id' },
    'DELETE /cart/:id':                     { fn: 'cart',         action: 'remove',             idKey: 'cart_id' },
    'DELETE /cart/clear':                   { fn: 'cart',         action: 'clear' },
    'POST /cart/check':                     { fn: 'cart',         action: 'check' },

    // ── 订单 ──────────────────────────────────
    'POST /orders':                         { fn: 'order',        action: 'create' },
    'GET /orders':                          { fn: 'order',        action: 'list' },
    'GET /orders/counts':                   { fn: 'order',        action: 'counts' },
    'GET /orders/:id':                      { fn: 'order',        action: 'detail',             idKey: 'order_id' },
    'POST /orders/:id/cancel':              { fn: 'order',        action: 'cancel',             idKey: 'order_id' },
    'POST /orders/:id/confirm':             { fn: 'order',        action: 'confirm',            idKey: 'order_id' },
    'POST /orders/:id/confirm-received':    { fn: 'order',        action: 'confirm',            idKey: 'order_id' },
    'POST /orders/:id/review':              { fn: 'order',        action: 'review',             idKey: 'order_id' },
    'GET /refunds':                         { fn: 'order',        action: 'refundList' },
    'POST /refunds':                        { fn: 'order',        action: 'applyRefund' },
    'GET /refunds/:id':                     { fn: 'order',        action: 'refundDetail',       idKey: 'refund_id' },

    // ── 支付 ──────────────────────────────────
    'POST /orders/:id/prepay':              { fn: 'payment',      action: 'prepay',             idKey: 'order_id' },
    'GET /orders/:id/pay-status':           { fn: 'payment',      action: 'queryStatus',        idKey: 'order_id' },
    'POST /orders/:id/sync-wechat-pay':     { fn: 'payment',      action: 'syncWechatPay',      idKey: 'order_id' },
    'POST /orders/:id/retry-group-join':    { fn: 'payment',      action: 'retryGroupJoin',     idKey: 'order_id' },

    // ── 地址 ──────────────────────────────────
    'GET /addresses':                       { fn: 'user',         action: 'listAddresses' },
    'GET /addresses/:id':                   { fn: 'user',         action: 'getAddressDetail',    idKey: 'address_id' },
    'POST /addresses':                      { fn: 'user',         action: 'addAddress' },
    'PUT /addresses/:id':                   { fn: 'user',         action: 'updateAddress',      idKey: 'address_id' },
    'DELETE /addresses/:id':                { fn: 'user',         action: 'deleteAddress',      idKey: 'address_id' },

    // ── 分销 ──────────────────────────────────
    'GET /distribution/overview':           { fn: 'distribution', action: 'center' },
    'GET /distribution/fund-pool':         { fn: 'distribution', action: 'myFundPoolSummary' },
    'GET /distribution/team':               { fn: 'distribution', action: 'team' },
    'GET /distribution/team/:id':           { fn: 'distribution', action: 'teamDetail',         idKey: 'member_id' },
    'GET /distribution/commission-logs':    { fn: 'distribution', action: 'commLogs' },
    'POST /distribution/withdraw':          { fn: 'distribution', action: 'withdraw' },
    'GET /distribution/stats':              { fn: 'distribution', action: 'stats' },
    'GET /distribution/wxacode-invite':     { fn: 'distribution', action: 'wxacodeInvite' },
    'GET /stats/distribution':              { fn: 'distribution', action: 'center' },
    'GET /agent/workbench':                 { fn: 'distribution', action: 'agentWorkbench' },
    'GET /agent/orders':                    { fn: 'distribution', action: 'agentOrders' },
    'GET /commissions':                     { fn: 'distribution', action: 'commLogs' },

    // ── 钱包/积分 ──────────────────────────────
    'POST /wallet/withdraw':                { fn: 'distribution', action: 'withdraw' },
    'GET /wallet/withdrawals':              { fn: 'distribution', action: 'withdrawList' },

    // ── 优惠券 ────────────────────────────────
    'GET /coupons/mine':                    { fn: 'user',         action: 'listCoupons' },

    // ── 配置 ──────────────────────────────────
    'GET /configs':                          { fn: 'config',       action: 'getSystemConfig' },
    'GET /mini-program-config':             { fn: 'config',       action: 'miniProgramConfig' },
    'GET /page-content/home':               { fn: 'config',       action: 'homeContent' },
    'GET /page-content':                    { fn: 'config',       action: 'homeContent' },
    'GET /homepage-config':                 { fn: 'config',       action: 'homeContent' },
    'GET /splash/active':                   { fn: 'config',       action: 'splash' },
    'GET /themes/active':                   { fn: 'config',       action: 'activeTheme' },

    // ── 通知 ──────────────────────────────────
    'GET /notifications':                   { fn: 'user',         action: 'listNotifications' },
    'PUT /notifications/:id/read':          { fn: 'user',         action: 'markRead',           idKey: 'notification_id' },

    // ── 自提门店 ──────────────────────────────
    'GET /stations/my-scope':               { fn: 'user',         action: 'getPickupScope' },
    'GET /stations/region-from-point':      { fn: 'user',         action: 'regionFromPoint' },
    'GET /stations':                        { fn: 'user',         action: 'listStations' },

    // ── 物流 ──────────────────────────────────
    'GET /logistics/order/:id':             { fn: 'order',        action: 'trackLogistics',     idKey: 'order_id' },
    'GET /logistics/:id':                   { fn: 'order',        action: 'trackLogistics',     idKey: 'tracking_no' },

    // ── 活动/拼团/砍价 ────────────────────────
    'GET /activities':                      { fn: 'config',       action: 'activities' },
    'GET /groups':                          { fn: 'config',       action: 'groups' },
    'GET /groups/:id':                      { fn: 'config',       action: 'groupDetail',        idKey: 'group_id' },
    'POST /groups/:id/join':                { fn: 'order',        action: 'joinGroup',          idKey: 'group_id' },
    'GET /slash':                           { fn: 'config',       action: 'slashList' },
    'GET /slash/:id':                       { fn: 'order',        action: 'slashDetail',        idKey: 'slash_no' },
    'POST /slash/:id/help':                 { fn: 'order',        action: 'slashHelp',          idKey: 'slash_id' },

    // ── 抽奖 ──────────────────────────────────
    'GET /lottery':                         { fn: 'config',       action: 'lottery' },
    'GET /lottery/prizes':                  { fn: 'config',       action: 'lotteryPrizes' },
    'GET /lottery/records':                 { fn: 'config',       action: 'lotteryRecords' },
    'POST /lottery/draw':                   { fn: 'order',        action: 'lotteryDraw' },

    // ── 升级 ──────────────────────────────────
    'GET /upgrade/eligibility':             { fn: 'user',         action: 'upgradeEligibility' },
    'POST /upgrade':                        { fn: 'user',         action: 'upgrade' },

    // ── 补充遗漏的版块和活动 ────────────────────────
    'GET /boards/map':                      { fn: 'config',       action: 'boardsMap' },
    'GET /banners':                         { fn: 'config',       action: 'banners' },
    'GET /activity/bubbles':                { fn: 'config',       action: 'activityBubbles' },
    'GET /activity/links':                  { fn: 'config',       action: 'activityLinks' },
    'GET /activity/festival-config':        { fn: 'config',       action: 'festivalConfig' },
    'GET /points/account':                  { fn: 'user',         action: 'pointsAccount' },
    'GET /coupons/available':               { fn: 'user',         action: 'availableCoupons' },

    // ── 佣金预览与定时结算 ────────────────────────
    'GET /commissions/preview':             { fn: 'distribution', action: 'commissionPreview' },
    'POST /commissions/settle-matured':     { fn: 'distribution', action: 'settleMatured' },

    // ── 积分与钱包 ──────────────────────────────
    'GET /points/sign-in/status':           { fn: 'user',         action: 'pointsSignInStatus' },
    'POST /points/sign-in':                 { fn: 'user',         action: 'pointsSignIn' },
    'GET /points/tasks':                    { fn: 'user',         action: 'pointsTasks' },
    'GET /points/logs':                     { fn: 'user',         action: 'pointsLogs' },
    'GET /wallet/info':                     { fn: 'user',         action: 'walletInfo' },
    'GET /wallet/estimated-commission':    { fn: 'distribution', action: 'estimatedCommission' },
    'GET /wallet/commissions':              { fn: 'user',         action: 'walletCommissions' },
    'GET /user/member-tier-meta':           { fn: 'user',         action: 'memberTierMeta' },
    'GET /agent/wallet':                    { fn: 'distribution', action: 'agentWallet' },
    'GET /agent/wallet/logs':               { fn: 'distribution', action: 'agentWalletLogs' },
    'GET /agent/wallet/recharge-config':    { fn: 'distribution', action: 'agentWalletRechargeConfig' },
    'POST /agent/wallet/prepay':            { fn: 'distribution', action: 'agentWalletPrepay' },
    'GET /agent/wallet/recharge-orders/:id': { fn: 'distribution', action: 'agentWalletRechargeOrderDetail', idKey: 'recharge_order_id' },

    // ── 用户偏好 ────────────────────────────────
    'GET /user/preferences':                { fn: 'user',         action: 'getPreferences' },
    'POST /user/preferences/submit':        { fn: 'user',         action: 'submitPreferences' },
    'POST /user/favorites/clear-all':       { fn: 'user',         action: 'clearAllFavorites' },
    'POST /user/portal/apply-initial-password': { fn: 'user',     action: 'applyInitialPassword' },

    // ── 升级申请 ────────────────────────────────
    'POST /upgrade/apply':                  { fn: 'user',         action: 'upgradeApply' },

    // ── 工单 / 客服 ─────────────────────────────
    'GET /customer-service/tickets':        { fn: 'user',         action: 'listTickets' },

    // ── 问卷 ────────────────────────────────────
    'GET /questionnaire/active':            { fn: 'config',       action: 'questionnaireActive' },

    // ── 规则 ────────────────────────────────────
    'GET /rules':                           { fn: 'config',       action: 'rules' },

    // ── 拼团活动 ────────────────────────────────
    'GET /group/activities':                { fn: 'config',       action: 'groupActivities' },
    'GET /group/my':                        { fn: 'order',        action: 'myGroups' },
    'POST /group/orders':                   { fn: 'order',        action: 'joinGroup' },

    // ── 砍价活动 ────────────────────────────────
    'GET /slash/activities':                { fn: 'config',       action: 'slashActivities' },
    'GET /slash/my/list':                   { fn: 'order',        action: 'mySlashList' },
    'POST /slash/start':                    { fn: 'order',        action: 'slashStart' },

    // ── 自提核销 ────────────────────────────────
    'GET /pickup/pending-orders':           { fn: 'order',        action: 'pickupPendingOrders' },
    'GET /pickup/my/:id':                   { fn: 'order',        action: 'pickupMyOrder',       idKey: 'order_id' },
    'POST /pickup/verify-code':             { fn: 'order',        action: 'pickupVerifyCode' },
    'POST /pickup/verify-qr':               { fn: 'order',        action: 'pickupVerifyQr' },

    // ── 商品评价 ────────────────────────────────
    'GET /products/:id/reviews':            { fn: 'products',     action: 'reviews',             idKey: 'product_id' },

    // ── 活动/内容补充 ────────────────────────────
    'GET /activity/limited-spot/detail':    { fn: 'config',       action: 'limitedSpotDetail' },
    'GET /page-content/brand-news':         { fn: 'config',       action: 'brandNews' },
    'GET /n/invite-card':                   { fn: 'config',       action: 'nInviteCard' },

    // ── 自提站点补充 ────────────────────────────
    'GET /stations/pickup-options':         { fn: 'user',         action: 'pickupOptions' },

    // ── 拼团订单详情 ────────────────────────────
    'GET /group/orders/:id':                { fn: 'order',        action: 'groupOrderDetail',    idKey: 'group_no' },

    // ── 收藏按ID删除 ────────────────────────────
    'DELETE /user/favorites/:id':           { fn: 'user',         action: 'removeFavoriteById',  idKey: 'favorite_id' },

    // ── 退款操作补充 ────────────────────────────
    'PUT /refunds/:id/cancel':              { fn: 'order',        action: 'cancelRefund',        idKey: 'refund_id' },
    'PUT /refunds/:id/return-shipping':     { fn: 'order',        action: 'returnShipping',      idKey: 'refund_id' },

    // ── 地址设默认(POST) ────────────────────────
    'POST /addresses/:id/default':          { fn: 'user',         action: 'setDefaultAddress',   idKey: 'address_id' }
};

/* ─────────────────────────────────────────────────────────────────
   URL 路由解析
───────────────────────────────────────────────────────────────── */
function resolveRoute(url, method) {
    // 提取 query string 参数
    let queryString = '';
    let urlWithoutQuery = url;
    const qIdx = url.indexOf('?');
    if (qIdx !== -1) {
        queryString = url.slice(qIdx + 1);
        urlWithoutQuery = url.slice(0, qIdx);
    }

    const cleanUrl = urlWithoutQuery.replace(/\/$/, '') || '/';

    // 解析 query string 到对象
    const queryParams = {};
    if (queryString) {
        queryString.split('&').forEach((pair) => {
            const eqIdx = pair.indexOf('=');
            if (eqIdx !== -1) {
                const k = decodeURIComponent(pair.slice(0, eqIdx));
                const v = decodeURIComponent(pair.slice(eqIdx + 1));
                queryParams[k] = v;
            }
        });
    }

    // 精确匹配
    const exactKey = `${method} ${cleanUrl}`;
    if (ROUTE_TABLE[exactKey]) {
        return { ...ROUTE_TABLE[exactKey], pathId: null, queryParams };
    }

    // 带 :id 的模式匹配
    const parts = cleanUrl.split('/');
    for (const [key, route] of Object.entries(ROUTE_TABLE)) {
        const [kMethod, kPath] = key.split(' ');
        if (kMethod !== method) continue;
        if (!kPath.includes('/:id')) continue;

        const kParts = kPath.split('/');
        if (kParts.length !== parts.length) continue;

        let idSegment = null;
        let matched = true;
        for (let i = 0; i < kParts.length; i++) {
            if (kParts[i] === ':id') {
                idSegment = parts[i];
            } else if (kParts[i] !== parts[i]) {
                matched = false;
                break;
            }
        }
        if (matched) return { ...route, pathId: idSegment, queryParams };
    }

    return null;
}

/* ─────────────────────────────────────────────────────────────────
   核心请求函数
───────────────────────────────────────────────────────────────── */
function request(options = {}) {
    const {
        url = '',
        method = 'GET',
        data = {},
        showLoading = false,
        showError = true,
        ignore401 = false,
        timeout,
        maxRetries,
        retryCount
    } = options;

    const upperMethod = String(method).toUpperCase();
    const route = resolveRoute(url, upperMethod);

    if (!route) {
        const errMsg = `[request/cloud-shim] 未映射接口: ${upperMethod} ${url}`;
        console.error(errMsg);
        if (showError) {
            wx.showToast({ title: '接口未适配云开发', icon: 'none', duration: 2500 });
        }
        return Promise.reject({ code: -1, message: errMsg, _unmapped: true });
    }

    const fnData = {};
    if (route.action) fnData.action = route.action;
    if (route.pathId && route.idKey) fnData[route.idKey] = route.pathId;
    if (route.queryParams) Object.assign(fnData, route.queryParams);
    Object.assign(fnData, data);

    return callFn(route.fn, fnData, { showLoading, showError });
}

// 快捷方法（与旧 request.js 完全相同的接口）
const get = (url, data, options = {}) => request({ url, method: 'GET', data, ...options });
const post = (url, data, options = {}) => request({ url, method: 'POST', data, ...options });
const put = (url, data, options = {}) => request({ url, method: 'PUT', data, ...options });
const del = (url, data, options = {}) => request({ url, method: 'DELETE', data, ...options });

function uploadFile(url, filePath, name = 'file', formData = {}, options = {}) {
    const ext = filePath.split('.').pop() || 'jpg';
    const ts = Date.now();
    const openid = wx.getStorageSync('openid') || 'unknown';
    let dir = 'uploads';
    if (url.includes('avatar')) dir = 'avatars';
    else if (url.includes('review') || url.includes('refund')) dir = 'reviews';
    const cloudPath = `${dir}/${openid}_${ts}.${ext}`;
    return uploadToCloud(filePath, cloudPath, { showLoading: options.showLoading !== false })
        .then(fileID => ({ code: 0, success: true, data: { url: fileID, fileID } }));
}

function addRequestInterceptor() {}
function addResponseInterceptor() {}
const config = { baseUrl: '', timeout: 15000, maxRetries: 1, retryDelay: 1000 };

module.exports = { request, get, post, put, del, uploadFile, addRequestInterceptor, addResponseInterceptor, config };
