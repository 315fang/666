/**
 * utils/request.js — 云开发兼容层（Cloud Function Router）
 */

const { callFn, uploadToCloud } = require('./cloud');

const ROUTE_TABLE = {
    'POST /login': { fn: 'login', action: null },
    'GET /user/profile': { fn: 'user', action: 'getProfile' },
    'PUT /user/profile': { fn: 'user', action: 'updateProfile' },
    'GET /user/info': { fn: 'user', action: 'getProfile' },
    'PUT /user/info': { fn: 'user', action: 'updateProfile' },
    'GET /user/stats': { fn: 'user', action: 'getStats' },
    'GET /user/favorites': { fn: 'user', action: 'getFavorites' },
    'POST /user/favorites/sync': { fn: 'user', action: 'syncFavorites' },
    'POST /user/favorites': { fn: 'user', action: 'addFavorite' },
    'DELETE /user/favorites': { fn: 'user', action: 'removeFavorite' },
    'GET /products': { fn: 'products', action: 'list' },
    'GET /products/:id': { fn: 'products', action: 'detail', idKey: 'product_id' },
    'GET /categories': { fn: 'products', action: 'categories' },
    'GET /search': { fn: 'products', action: 'search' },
    'GET /products/search': { fn: 'products', action: 'search' },
    'GET /cart': { fn: 'cart', action: 'list' },
    'POST /cart': { fn: 'cart', action: 'add' },
    'PUT /cart/:id': { fn: 'cart', action: 'update', idKey: 'cart_id' },
    'DELETE /cart/:id': { fn: 'cart', action: 'remove', idKey: 'cart_id' },
    'DELETE /cart/clear': { fn: 'cart', action: 'clear' },
    'POST /cart/check': { fn: 'cart', action: 'check' },
    'POST /orders': { fn: 'order', action: 'create' },
    'GET /orders': { fn: 'order', action: 'list' },
    'GET /orders/:id': { fn: 'order', action: 'detail', idKey: 'order_id' },
    'POST /orders/:id/cancel': { fn: 'order', action: 'cancel', idKey: 'order_id' },
    'POST /orders/:id/confirm': { fn: 'order', action: 'confirm', idKey: 'order_id' },
    'POST /orders/:id/confirm-received': { fn: 'order', action: 'confirm', idKey: 'order_id' },
    'POST /orders/:id/review': { fn: 'order', action: 'review', idKey: 'order_id' },
    'GET /refunds': { fn: 'order', action: 'refundList' },
    'POST /refunds': { fn: 'order', action: 'applyRefund' },
    'GET /refunds/:id': { fn: 'order', action: 'refundDetail', idKey: 'refund_id' },
    'POST /orders/:id/pay': { fn: 'payment', action: 'prepay', idKey: 'order_id' },
    'POST /orders/:id/prepay': { fn: 'payment', action: 'prepay', idKey: 'order_id' },
    'GET /orders/:id/pay-status': { fn: 'payment', action: 'queryStatus', idKey: 'order_id' },
    'POST /orders/:id/sync-wechat-pay': { fn: 'payment', action: 'syncWechatPay', idKey: 'order_id' },
    'GET /addresses': { fn: 'user', action: 'listAddresses' },
    'GET /addresses/:id': { fn: 'user', action: 'getAddressDetail', idKey: 'address_id' },
    'POST /addresses': { fn: 'user', action: 'addAddress' },
    'PUT /addresses/:id': { fn: 'user', action: 'updateAddress', idKey: 'address_id' },
    'DELETE /addresses/:id': { fn: 'user', action: 'deleteAddress', idKey: 'address_id' },
    'PUT /addresses/:id/default': { fn: 'user', action: 'setDefaultAddress', idKey: 'address_id' },
    'POST /addresses/:id/default': { fn: 'user', action: 'setDefaultAddress', idKey: 'address_id' },
    'GET /distribution/overview': { fn: 'distribution', action: 'center' },
    'GET /distribution/center': { fn: 'distribution', action: 'center' },
    'GET /distribution/team': { fn: 'distribution', action: 'team' },
    'GET /distribution/team/:id': { fn: 'distribution', action: 'teamDetail', idKey: 'member_id' },
    'GET /distribution/commission-logs': { fn: 'distribution', action: 'commLogs' },
    'POST /distribution/withdraw': { fn: 'distribution', action: 'withdraw' },
    'GET /distribution/stats': { fn: 'distribution', action: 'stats' },
    'GET /stats/distribution': { fn: 'distribution', action: 'center' },
    'GET /agent': { fn: 'distribution', action: 'center' },
    'GET /agent/workbench': { fn: 'distribution', action: 'agentWorkbench' },
    'GET /agent/orders': { fn: 'distribution', action: 'agentOrders' },
    'POST /agent/restock': { fn: 'distribution', action: 'agentRestock' },
    'GET /commissions': { fn: 'distribution', action: 'commLogs' },
    'GET /wallet': { fn: 'distribution', action: 'center' },
    'POST /wallet/withdraw': { fn: 'distribution', action: 'withdraw' },
    'GET /wallet/withdrawals': { fn: 'distribution', action: 'withdrawList' },
    'GET /points': { fn: 'user', action: 'getStats' },
    'GET /points/summary': { fn: 'user', action: 'getStats' },
    'GET /coupons/mine': { fn: 'user', action: 'listCoupons' },
    'GET /coupons': { fn: 'user', action: 'listCoupons' },
    'GET /configs': { fn: 'config', action: 'getSystemConfig' },
    'GET /mini-program-config': { fn: 'config', action: 'miniProgramConfig' },
    'GET /page-content/home': { fn: 'config', action: 'homeContent' },
    'GET /page-content': { fn: 'config', action: 'homeContent' },
    'GET /homepage-config': { fn: 'config', action: 'homeContent' },
    'GET /splash/active': { fn: 'config', action: 'splash' },
    'GET /themes/active': { fn: 'config', action: 'activeTheme' },
    'GET /notifications': { fn: 'user', action: 'listNotifications' },
    'PUT /notifications/:id/read': { fn: 'user', action: 'markRead', idKey: 'notification_id' },
    'GET /stations/my-scope': { fn: 'user', action: 'getPickupScope' },
    'GET /stations': { fn: 'user', action: 'listStations' },
    'GET /logistics/:id': { fn: 'order', action: 'trackLogistics', idKey: 'order_id' },
    'GET /activities': { fn: 'config', action: 'activities' },
    'GET /groups': { fn: 'config', action: 'groups' },
    'GET /groups/:id': { fn: 'config', action: 'groupDetail', idKey: 'group_id' },
    'POST /groups/:id/join': { fn: 'order', action: 'joinGroup', idKey: 'group_id' },
    'GET /group/activities': { fn: 'config', action: 'groupActivities' },
    'GET /slash': { fn: 'config', action: 'slashList' },
    'GET /slash/:id': { fn: 'config', action: 'slashDetail', idKey: 'slash_id' },
    'POST /slash/:id/help': { fn: 'order', action: 'slashHelp', idKey: 'slash_id' },
    'GET /lottery': { fn: 'config', action: 'lottery' },
    'GET /lottery/prizes': { fn: 'config', action: 'lotteryPrizes' },
    'GET /lottery/records': { fn: 'config', action: 'lotteryRecords' },
    'POST /lottery/draw': { fn: 'order', action: 'lotteryDraw' },
    'GET /upgrade/eligibility': { fn: 'user', action: 'upgradeEligibility' },
    'POST /upgrade': { fn: 'user', action: 'upgrade' },
    'GET /boards/map': { fn: 'config', action: 'boardsMap' },
    'GET /banners': { fn: 'config', action: 'banners' },
    'GET /activity/bubbles': { fn: 'config', action: 'activityBubbles' },
    'GET /activity/links': { fn: 'config', action: 'activityLinks' },
    'GET /activity/festival-config': { fn: 'config', action: 'festivalConfig' },
    'GET /points/account': { fn: 'user', action: 'pointsAccount' },
    'GET /coupons/available': { fn: 'user', action: 'availableCoupons' },
    'GET /commissions/preview': { fn: 'distribution', action: 'commissionPreview' },
    'POST /commissions/settle-matured': { fn: 'distribution', action: 'settleMatured' },
    'GET /points/sign-in/status': { fn: 'user', action: 'pointsSignInStatus' },
    'POST /points/sign-in': { fn: 'user', action: 'pointsSignIn' },
    'GET /points/tasks': { fn: 'user', action: 'pointsTasks' },
    'GET /points/logs': { fn: 'user', action: 'pointsLogs' },
    'GET /wallet/info': { fn: 'user', action: 'walletInfo' },
    'GET /wallet/commissions': { fn: 'user', action: 'walletCommissions' },
    'GET /user/member-tier-meta': { fn: 'user', action: 'memberTierMeta' },
    'GET /agent/wallet': { fn: 'distribution', action: 'agentWallet' },
    'GET /agent/wallet/logs': { fn: 'distribution', action: 'agentWalletLogs' },
    'GET /agent/wallet/recharge-config': { fn: 'distribution', action: 'agentWalletRechargeConfig' },
    'POST /agent/wallet/prepay': { fn: 'distribution', action: 'agentWalletPrepay' },
    'GET /agent/wallet/recharge-orders/:id': { fn: 'distribution', action: 'agentWalletRechargeOrderDetail', idKey: 'recharge_order_id' },
    'GET /user/preferences': { fn: 'user', action: 'getPreferences' },
    'POST /user/preferences/submit': { fn: 'user', action: 'submitPreferences' },
    'POST /user/favorites/clear-all': { fn: 'user', action: 'clearAllFavorites' },
    'POST /user/portal/apply-initial-password': { fn: 'user', action: 'applyInitialPassword' },
    'POST /upgrade/apply': { fn: 'user', action: 'upgradeApply' },
    'GET /customer-service/tickets': { fn: 'user', action: 'listTickets' },
    'GET /questionnaire/active': { fn: 'config', action: 'questionnaireActive' },
    'GET /questionnaire/share-eligibility': { fn: 'user', action: 'shareEligibility' },
    'POST /questionnaire/submit': { fn: 'user', action: 'submitQuestionnaire' },
    'GET /rules': { fn: 'config', action: 'rules' },
    'GET /group/my': { fn: 'order', action: 'myGroups' },
    'POST /group/orders': { fn: 'order', action: 'joinGroup' },
    'GET /slash/activities': { fn: 'config', action: 'slashActivities' },
    'GET /slash/my/list': { fn: 'order', action: 'mySlashList' },
    'POST /slash/start': { fn: 'order', action: 'slashStart' },
    'GET /pickup/pending-orders': { fn: 'order', action: 'pickupPendingOrders' },
    'GET /pickup/my/:id': { fn: 'order', action: 'pickupMyOrder', idKey: 'order_id' },
    'POST /pickup/verify-code': { fn: 'order', action: 'pickupVerifyCode' },
    'POST /pickup/verify-qr': { fn: 'order', action: 'pickupVerifyQr' },
    'GET /products/:id/reviews': { fn: 'products', action: 'reviews', idKey: 'product_id' },
    'GET /activity/limited-spot/detail': { fn: 'config', action: 'limitedSpotDetail' },
    'GET /page-content/brand-news': { fn: 'config', action: 'brandNews' },
    'GET /n/invite-card': { fn: 'config', action: 'nInviteCard' },
    'GET /stations/pickup-options': { fn: 'user', action: 'pickupOptions' },
    'GET /group/orders/:id': { fn: 'order', action: 'groupOrderDetail', idKey: 'group_no' },
    'DELETE /user/favorites/:id': { fn: 'user', action: 'removeFavoriteById', idKey: 'favorite_id' },
    'PUT /refunds/:id/cancel': { fn: 'order', action: 'cancelRefund', idKey: 'refund_id' },
    'PUT /refunds/:id/return-shipping': { fn: 'order', action: 'returnShipping', idKey: 'refund_id' }
};

function resolveRoute(url, method) {
    let queryString = '';
    let urlWithoutQuery = url;
    const queryIndex = url.indexOf('?');
    if (queryIndex !== -1) {
        queryString = url.slice(queryIndex + 1);
        urlWithoutQuery = url.slice(0, queryIndex);
    }

    const cleanUrl = urlWithoutQuery.replace(/\/$/, '') || '/';
    const queryParams = {};

    if (queryString) {
        queryString.split('&').forEach((pair) => {
            const eqIndex = pair.indexOf('=');
            if (eqIndex !== -1) {
                const key = decodeURIComponent(pair.slice(0, eqIndex));
                const value = decodeURIComponent(pair.slice(eqIndex + 1));
                queryParams[key] = value;
            }
        });
    }

    const exactKey = `${method} ${cleanUrl}`;
    if (ROUTE_TABLE[exactKey]) {
        return { ...ROUTE_TABLE[exactKey], pathId: null, queryParams };
    }

    const parts = cleanUrl.split('/');
    for (const [key, route] of Object.entries(ROUTE_TABLE)) {
        const [routeMethod, routePath] = key.split(' ');
        if (routeMethod !== method) continue;
        if (!routePath.includes('/:id')) continue;

        const routeParts = routePath.split('/');
        if (routeParts.length !== parts.length) continue;

        let idSegment = null;
        let matched = true;
        for (let index = 0; index < routeParts.length; index += 1) {
            if (routeParts[index] === ':id') {
                idSegment = parts[index];
            } else if (routeParts[index] !== parts[index]) {
                matched = false;
                break;
            }
        }

        if (matched) {
            return { ...route, pathId: idSegment, queryParams };
        }
    }

    return null;
}

function request(options = {}) {
    const {
        url = '',
        method = 'GET',
        data = {},
        showLoading = false,
        showError = true
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
        .then((fileID) => ({ code: 0, success: true, data: { url: fileID, fileID } }));
}

function addRequestInterceptor() {}
function addResponseInterceptor() {}

const config = {
    baseUrl: '',
    timeout: 15000,
    maxRetries: 1,
    retryDelay: 1000
};

module.exports = {
    request,
    get,
    post,
    put,
    del,
    uploadFile,
    addRequestInterceptor,
    addResponseInterceptor,
    config
};
