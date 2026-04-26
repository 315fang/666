/**
 * requestRoutes.js — 小程序 REST 路由到云函数 action 的单一真相源
 */

const ROUTE_TABLE = {
    // ── 认证 ──────────────────────────────────
    'POST /login': { fn: 'login', action: null },

    // ── 用户 ──────────────────────────────────
    'GET /user/profile': { fn: 'user', action: 'getProfile' },
    'PUT /user/profile': { fn: 'user', action: 'updateProfile' },
    'GET /user/stats': { fn: 'user', action: 'getStats' },
    'GET /user/favorites': { fn: 'user', action: 'getFavorites' },
    'GET /user/favorites/status': { fn: 'user', action: 'favoriteStatus' },
    'POST /user/favorites/sync': { fn: 'user', action: 'syncFavorites' },
    'POST /user/favorites': { fn: 'user', action: 'addFavorite' },
    'DELETE /user/favorites': { fn: 'user', action: 'removeFavorite' },
    'POST /user/claim-welcome-coupons': { fn: 'user', action: 'claimWelcomeCoupons' },
    'POST /coupons/claim': { fn: 'user', action: 'claimCoupon' },
    'GET /coupons/info': { fn: 'user', action: 'getCouponInfo' },
    'POST /deposit-orders/prepay': { fn: 'payment', action: 'depositPrepay' },
    'GET /deposit-orders/mine': { fn: 'user', action: 'listDepositOrders' },
    'GET /deposit/applications': { fn: 'distribution', action: 'depositApplications' },
    'POST /deposit/applications': { fn: 'distribution', action: 'createDepositApplication' },
    'POST /deposit/claim': { fn: 'distribution', action: 'claimDepositToCommission' },
    'GET /user/dashboard-bootstrap': { fn: 'user', action: 'dashboardBootstrap' },

    // ── 商品 ──────────────────────────────────
    'GET /products': { fn: 'products', action: 'list' },
    'GET /products/:id': { fn: 'products', action: 'detail', idKey: 'product_id' },
    'GET /product-bundles': { fn: 'products', action: 'bundleList' },
    'GET /product-bundles/:id': { fn: 'products', action: 'bundleDetail', idKey: 'bundle_id' },
    'GET /categories': { fn: 'products', action: 'categories' },
    'GET /products/search': { fn: 'products', action: 'search' },

    // ── 购物车 ────────────────────────────────
    'GET /cart': { fn: 'cart', action: 'list' },
    'POST /cart': { fn: 'cart', action: 'add' },
    'PUT /cart/:id': { fn: 'cart', action: 'update', idKey: 'cart_id' },
    'DELETE /cart/:id': { fn: 'cart', action: 'remove', idKey: 'cart_id' },
    'DELETE /cart/clear': { fn: 'cart', action: 'clear' },
    'POST /cart/check': { fn: 'cart', action: 'check' },

    // ── 订单 ──────────────────────────────────
    'POST /orders': { fn: 'order', action: 'create' },
    'POST /orders/exchange': { fn: 'order', action: 'createExchangeOrder' },
    'GET /orders': { fn: 'order', action: 'list' },
    'GET /orders/counts': { fn: 'order', action: 'counts' },
    'GET /orders/:id': { fn: 'order', action: 'detail', idKey: 'order_id' },
    'POST /orders/:id/cancel': { fn: 'order', action: 'cancel', idKey: 'order_id' },
    'POST /orders/:id/confirm': { fn: 'order', action: 'confirm', idKey: 'order_id' },
    'POST /orders/:id/confirm-received': { fn: 'order', action: 'confirm', idKey: 'order_id' },
    'POST /orders/:id/review': { fn: 'order', action: 'review', idKey: 'order_id' },
    'GET /refunds': { fn: 'order', action: 'refundList' },
    'POST /refunds': { fn: 'order', action: 'applyRefund' },
    'GET /refunds/:id': { fn: 'order', action: 'refundDetail', idKey: 'refund_id' },

    // ── 支付 ──────────────────────────────────
    'POST /orders/:id/prepay': { fn: 'payment', action: 'prepay', idKey: 'order_id' },
    'GET /orders/:id/pay-status': { fn: 'payment', action: 'queryStatus', idKey: 'order_id' },
    'POST /orders/:id/sync-wechat-pay': { fn: 'payment', action: 'syncWechatPay', idKey: 'order_id' },
    'POST /orders/:id/retry-group-join': { fn: 'payment', action: 'retryGroupJoin', idKey: 'order_id' },

    // ── 地址 ──────────────────────────────────
    'GET /addresses': { fn: 'user', action: 'listAddresses' },
    'GET /addresses/default': { fn: 'user', action: 'getDefaultAddress' },
    'GET /addresses/:id': { fn: 'user', action: 'getAddressDetail', idKey: 'address_id' },
    'POST /addresses': { fn: 'user', action: 'addAddress' },
    'PUT /addresses/:id': { fn: 'user', action: 'updateAddress', idKey: 'address_id' },
    'DELETE /addresses/:id': { fn: 'user', action: 'deleteAddress', idKey: 'address_id' },

    // ── 分销 ──────────────────────────────────
    'GET /distribution/overview': { fn: 'distribution', action: 'center' },
    'GET /distribution/fund-pool': { fn: 'distribution', action: 'myFundPoolSummary' },
    'GET /distribution/team': { fn: 'distribution', action: 'team' },
    'GET /distribution/team/:id': { fn: 'distribution', action: 'teamDetail', idKey: 'member_id' },
    'POST /distribution/team/:id/goods-fund-transfer-applications': { fn: 'distribution', action: 'createGoodsFundTransferApplication', idKey: 'member_id' },
    'GET /distribution/goods-fund-transfer-applications': { fn: 'distribution', action: 'goodsFundTransferApplications' },
    'GET /distribution/directed-invites': { fn: 'distribution', action: 'listDirectedInvites' },
    'POST /distribution/directed-invites': { fn: 'distribution', action: 'createDirectedInvite' },
    'GET /distribution/directed-invites/ticket': { fn: 'distribution', action: 'getDirectedInviteTicket' },
    'POST /distribution/directed-invites/accept': { fn: 'distribution', action: 'acceptDirectedInvite' },
    'POST /distribution/directed-invites/:id/revoke': { fn: 'distribution', action: 'revokeDirectedInvite', idKey: 'invite_id' },
    'GET /distribution/commission-logs': { fn: 'distribution', action: 'commLogs' },
    'POST /distribution/withdraw': { fn: 'distribution', action: 'withdraw' },
    'GET /distribution/stats': { fn: 'distribution', action: 'stats' },
    'GET /distribution/wxacode-invite': { fn: 'distribution', action: 'wxacodeInvite' },
    'GET /stats/distribution': { fn: 'distribution', action: 'center' },
    'GET /agent/workbench': { fn: 'distribution', action: 'agentWorkbench' },
    'GET /agent/orders': { fn: 'distribution', action: 'agentOrders' },
    'GET /commissions': { fn: 'distribution', action: 'commLogs' },

    // ── 钱包/积分 ──────────────────────────────
    'POST /wallet/withdraw': { fn: 'distribution', action: 'withdraw' },
    'GET /wallet/withdraw-rules': { fn: 'distribution', action: 'withdrawRules' },
    'GET /wallet/withdrawals': { fn: 'distribution', action: 'withdrawList' },

    // ── 优惠券 ────────────────────────────────
    'GET /coupons/mine': { fn: 'user', action: 'listCoupons' },
    'GET /coupons/center': { fn: 'user', action: 'couponCenter' },

    // ── 配置 ──────────────────────────────────
    'GET /configs': { fn: 'config', action: 'getSystemConfig' },
    'GET /mini-program-config': { fn: 'config', action: 'miniProgramConfig' },
    'GET /page-content/home': { fn: 'config', action: 'homeContent' },
    'GET /page-content': { fn: 'config', action: 'pageContent' },
    'GET /homepage-config': { fn: 'config', action: 'homeContent' },
    'GET /splash/active': { fn: 'config', action: 'splash' },
    'GET /themes/active': { fn: 'config', action: 'activeTheme' },

    // ── 通知 ──────────────────────────────────
    'GET /notifications': { fn: 'user', action: 'listNotifications' },
    'PUT /notifications/:id/read': { fn: 'user', action: 'markRead', idKey: 'notification_id' },

    // ── 自提门店 ──────────────────────────────
    'GET /stations/my-scope': { fn: 'user', action: 'getPickupScope' },
    'GET /stations/store-manager/workbench': { fn: 'user', action: 'storeManagerWorkbench' },
    'POST /stations/store-manager/procurements': { fn: 'user', action: 'storeManagerCreateProcurement' },
    'GET /stations/region-from-point': { fn: 'user', action: 'regionFromPoint' },
    'GET /stations': { fn: 'user', action: 'listStations' },

    // ── 物流 ──────────────────────────────────
    'GET /logistics/order/:id': { fn: 'order', action: 'trackLogistics', idKey: 'order_id' },
    'GET /logistics/:id': { fn: 'order', action: 'trackLogistics', idKey: 'tracking_no' },

    // ── 活动/拼团/砍价 ────────────────────────
    'GET /activities': { fn: 'config', action: 'activities' },
    'GET /groups': { fn: 'config', action: 'groups' },
    'GET /groups/:id': { fn: 'config', action: 'groupDetail', idKey: 'group_id' },
    'POST /groups/:id/join': { fn: 'order', action: 'joinGroup', idKey: 'group_id' },
    'GET /slash': { fn: 'config', action: 'slashList' },
    'GET /slash/:id': { fn: 'order', action: 'slashDetail', idKey: 'slash_no' },
    'POST /slash/:id/help': { fn: 'order', action: 'slashHelp', idKey: 'slash_id' },

    // ── 抽奖 ──────────────────────────────────
    'GET /lottery': { fn: 'config', action: 'lottery' },
    'GET /lottery/prizes': { fn: 'config', action: 'lotteryPrizes' },
    'GET /lottery/records': { fn: 'order', action: 'lotteryRecords' },
    'GET /lottery/claims/:id': { fn: 'order', action: 'lotteryClaimDetail', idKey: 'record_id' },
    'POST /lottery/claims': { fn: 'order', action: 'submitLotteryClaim' },
    'POST /lottery/draw': { fn: 'order', action: 'lotteryDraw' },

    // ── 升级 ──────────────────────────────────
    'GET /upgrade/eligibility': { fn: 'user', action: 'upgradeEligibility' },
    'POST /upgrade': { fn: 'user', action: 'upgrade' },

    // ── 补充遗漏的版块和活动 ────────────────────────
    'GET /boards/map': { fn: 'config', action: 'boardsMap' },
    'GET /banners': { fn: 'config', action: 'banners' },
    'GET /activity/bubbles': { fn: 'config', action: 'activityBubbles' },
    'GET /activity/links': { fn: 'config', action: 'activityLinks' },
    'GET /activity/festival-config': { fn: 'config', action: 'festivalConfig' },
    'GET /points/account': { fn: 'user', action: 'pointsAccount' },
    'GET /coupons/available': { fn: 'user', action: 'availableCoupons' },

    // ── 佣金预览与定时结算 ────────────────────────
    'GET /commissions/preview': { fn: 'distribution', action: 'commissionPreview' },
    'POST /commissions/settle-matured': { fn: 'distribution', action: 'settleMatured' },

    // ── 积分与钱包 ──────────────────────────────
    'GET /points/sign-in/status': { fn: 'user', action: 'pointsSignInStatus' },
    'POST /points/sign-in': { fn: 'user', action: 'pointsSignIn' },
    'GET /points/tasks': { fn: 'user', action: 'pointsTasks' },
    'GET /points/logs': { fn: 'user', action: 'pointsLogs' },
    'GET /wallet/info': { fn: 'user', action: 'walletInfo' },
    'GET /wallet/estimated-commission': { fn: 'distribution', action: 'estimatedCommission' },
    'GET /wallet/commissions': { fn: 'user', action: 'walletCommissions' },
    'GET /user/member-tier-meta': { fn: 'user', action: 'memberTierMeta' },
    'GET /agent/wallet': { fn: 'distribution', action: 'agentWallet' },
    'GET /agent/goods-fund': { fn: 'distribution', action: 'agentGoodsFund' },
    'GET /agent/wallet/logs': { fn: 'distribution', action: 'agentWalletLogs' },
    'GET /agent/wallet/recharge-config': { fn: 'distribution', action: 'agentWalletRechargeConfig' },
    'POST /agent/wallet/prepay': { fn: 'distribution', action: 'agentWalletPrepay' },
    'GET /agent/wallet/recharge-orders/:id': { fn: 'distribution', action: 'agentWalletRechargeOrderDetail', idKey: 'recharge_order_id' },

    'POST /user/favorites/clear-all': { fn: 'user', action: 'clearAllFavorites' },
    'POST /user/portal/apply-initial-password': { fn: 'user', action: 'applyInitialPassword' },
    'POST /user/portal/change-password': { fn: 'user', action: 'changePortalPassword' },

    // ── 升级申请 ────────────────────────────────
    'POST /upgrade/apply': { fn: 'user', action: 'upgradeApply' },

    // ── 问卷 ────────────────────────────────────
    'GET /questionnaire/active': { fn: 'config', action: 'questionnaireActive' },

    // ── 规则 ────────────────────────────────────
    'GET /rules': { fn: 'config', action: 'rules' },

    // ── 拼团活动 ────────────────────────────────
    'GET /group/activities': { fn: 'config', action: 'groupActivities' },
    'GET /group/my': { fn: 'order', action: 'myGroups' },
    'POST /group/orders': { fn: 'order', action: 'joinGroup' },

    // ── 砍价活动 ────────────────────────────────
    'GET /slash/activities': { fn: 'config', action: 'slashActivities' },
    'GET /slash/my/list': { fn: 'order', action: 'mySlashList' },
    'POST /slash/start': { fn: 'order', action: 'slashStart' },

    // ── 自提核销 ────────────────────────────────
    'GET /pickup/pending-orders': { fn: 'order', action: 'pickupPendingOrders' },
    'GET /pickup/my/:id': { fn: 'order', action: 'pickupMyOrder', idKey: 'order_id' },
    'POST /pickup/verify-code': { fn: 'order', action: 'pickupVerifyCode' },
    'POST /pickup/verify-qr': { fn: 'order', action: 'pickupVerifyQr' },

    // ── 商品评价 ────────────────────────────────
    'GET /products/:id/reviews': { fn: 'products', action: 'reviews', idKey: 'product_id' },

    // ── 活动/内容补充 ────────────────────────────
    'GET /limited-sales/overview': { fn: 'config', action: 'limitedSalesOverview' },
    'GET /limited-sales/detail': { fn: 'config', action: 'limitedSalesDetail' },
    'GET /activity/limited-spot/detail': { fn: 'config', action: 'limitedSpotDetail' },
    'GET /page-content/brand-news': { fn: 'config', action: 'brandNews' },
    'GET /n/invite-card': { fn: 'config', action: 'nInviteCard' },

    // ── 自提站点补充 ────────────────────────────
    'GET /stations/pickup-options': { fn: 'user', action: 'pickupOptions' },

    // ── 拼团订单详情 ────────────────────────────
    'GET /group/orders/:id': { fn: 'order', action: 'groupOrderDetail', idKey: 'group_no' },

    // ── 收藏按商品ID删除 ────────────────────────
    'DELETE /user/favorites/:id': { fn: 'user', action: 'removeFavorite', idKey: 'product_id' },

    // ── 退款操作补充 ────────────────────────────
    'PUT /refunds/:id/cancel': { fn: 'order', action: 'cancelRefund', idKey: 'refund_id' },
    'PUT /refunds/:id/return-shipping': { fn: 'order', action: 'returnShipping', idKey: 'refund_id' },

    // ── 地址设默认(POST) ────────────────────────
    'POST /addresses/:id/default': { fn: 'user', action: 'setDefaultAddress', idKey: 'address_id' }
}

function parseQueryString(queryString = '') {
    const queryParams = {}
    if (!queryString) return queryParams
    queryString.split('&').forEach((pair) => {
        const eqIdx = pair.indexOf('=')
        if (eqIdx === -1) return
        const key = decodeURIComponent(pair.slice(0, eqIdx))
        const value = decodeURIComponent(pair.slice(eqIdx + 1))
        queryParams[key] = value
    })
    return queryParams
}

function resolveRoute(url, method) {
    let queryString = ''
    let urlWithoutQuery = url
    const qIdx = url.indexOf('?')
    if (qIdx !== -1) {
        queryString = url.slice(qIdx + 1)
        urlWithoutQuery = url.slice(0, qIdx)
    }

    const cleanUrl = urlWithoutQuery.replace(/\/$/, '') || '/'
    const queryParams = parseQueryString(queryString)
    const exactKey = `${method} ${cleanUrl}`
    if (ROUTE_TABLE[exactKey]) {
        return { ...ROUTE_TABLE[exactKey], pathId: null, queryParams }
    }

    const parts = cleanUrl.split('/')
    for (const [key, route] of Object.entries(ROUTE_TABLE)) {
        const [routeMethod, routePath] = key.split(' ')
        if (routeMethod !== method || !routePath.includes('/:id')) continue

        const routeParts = routePath.split('/')
        if (routeParts.length !== parts.length) continue

        let idSegment = null
        let matched = true
        for (let index = 0; index < routeParts.length; index += 1) {
            if (routeParts[index] === ':id') {
                idSegment = parts[index]
            } else if (routeParts[index] !== parts[index]) {
                matched = false
                break
            }
        }
        if (matched) {
            return { ...route, pathId: idSegment, queryParams }
        }
    }

    return null
}

module.exports = {
    ROUTE_TABLE,
    parseQueryString,
    resolveRoute
}
