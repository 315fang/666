// pages/user/user.js - 个人中心（全面升级版）
const app = getApp();
const { requireLogin } = require('../../utils/auth');
const { getConfigSection, getFeatureFlags, syncCustomTabBar } = require('../../utils/miniProgramConfig');
const QUAD_PLACEHOLDER = '/assets/images/placeholder.svg';
const {
    applyGrowthDisplay,
    clearSecondaryLoadState,
    loadAssetRow,
    loadDistributionInfo,
    loadNotificationsCount,
    loadOrderCounts,
    loadPageLayoutConfig,
    loadQuadPreviews,
    loadUserInfo,
    refreshBusinessCenterVisibility,
    scheduleSecondaryLoads
} = require('./userDashboard');
const {
    buildSharePayload,
    goTeamCenter: navigateTeamCenter,
    goAllProducts: navigateAllProducts,
    goCart: navigateCart,
    goCustomerService: navigateCustomerService,
    goFavoritesFootprints: navigateFavoritesFootprints,
    goLottery: navigateLottery,
    goPrivacy: navigatePrivacy,
    goShoppingBag: navigateShoppingBag,
    navigateIfLoggedIn,
    onAboutTap: showAboutModal,
    onLogout: handleLogout,
    onMenuTap: handleMenuTap,
    onOrderTap: handleOrderTap,
    onQuadExpressTap: handleQuadExpressTap,
    onQuadFavoriteTap: handleQuadFavoriteTap,
    onQuadFootprintTap: handleQuadFootprintTap,
    onQuadRecentTap: handleQuadRecentTap,
    onSettingsTap: handleSettingsTap
} = require('./userNavigation');
const {
    onCardTouchEnd: handleCardTouchEnd,
    onCardTouchMove: handleCardTouchMove,
    onCardTouchStart: handleCardTouchStart,
    onLightTipClose: handleLightTipClose,
    onShareTap: handleShareTap,
    preventTap: handlePreventTap,
    stopP: handleStopP,
    tryPendingRegisterLightTip: handlePendingRegisterLightTip
} = require('./userPageInteractions');

function getUserProfileActions() {
    return require('./userProfileActions');
}

Page({
    data: {
        userInfo: null,
        displayNickname: '微信用户',
        isLoggedIn: false,
        hasUserInfo: false,
        statusBarHeight: 20,
        // 资产卡数据（WXML 绑定用）
        stats: { frozenAmount: '0.00' },
        balance: '0',
        teamCount: 0,
        // 订单统计（WXML 用 orderStats）
        orderStats: {
            pending: 0,
            paid: 0,
            shipped: 0,
            pendingReview: 0,
            refund: 0
        },
        orderFreshFlags: {
            pending: false,
            paid: false,
            shipped: false,
            pendingReview: false,
            refund: false
        },
        unusedCouponCount: 0,
        pointsBalanceDisplay: '0',
        commissionBalance: '0',
        quadExpress: { sub: '暂无在途订单', image: QUAD_PLACEHOLDER, orderId: null },
        quadFavorite: { sub: '暂无收藏', image: QUAD_PLACEHOLDER, count: 0 },
        quadFootprint: { sub: '看过的商品', image: QUAD_PLACEHOLDER, count: 0 },
        quadRecent: {
            title: '会员',
            sub: '查看权益与等级',
            image: QUAD_PLACEHOLDER,
            mode: 'benefit',
            orderId: null
        },
        showQuadExpressCard: false,
        // 角色相关
        isAgent: false,
        // 分销原始信息
        distributionInfo: {
            totalEarnings: '0.00',
            availableAmount: '0.00',
            goodsFundBalance: '0.00',
            referee_count: 0,
            role_level: 0,
            role_name: 'VIP用户'
        },
        /** 代理/合伙人等级 1–6，与 ROLE_NAMES、后台 DEFAULT_ROLE_NAMES 一致 */
        displayAgentRoleLevel: 0,
        agentRoleBadgeName: 'VIP用户',
        agentPillSkinClass: 'hero-member-pill-agent',
        notificationsCount: 0,
        pageLayout: null,
        featureFlags: {
            show_station_entry: true,
            show_pickup_entry: true,
            show_agent_service_entry: false,
            enable_lottery_entry: false
        },
        showPortalPasswordEntry: false,
        loginAgreementHint: '登录后查看订单、积分、佣金等信息',
        showBusinessCenter: false,
        showPickupVerify: false,
        isStoreManager: false,
        storeManagerStationName: '',
        storeManagerStationCount: 0,
        /** 我的页成长值条（真实后端 growth_progress） */
        growthDisplay: null,
        // 昵称修改弹窗
        showNicknameModal: false,
        newNickname: '',
        /** 从「编辑 → 修改头像」进入后展示，内含 chooseAvatar 按钮 */
        showAvatarPickSheet: false,
        // 卡片下拉效果
        cardTransform: 0,
        isPulling: false,
        lightTipShow: false,
        lightTipTitle: '',
        lightTipContent: '',
        couponBanner: null
    },

    // 触摸开始
    onCardTouchStart(e) {
        return handleCardTouchStart(this, e);
    },

    // 触摸移动 - 实现卡片下拉效果
    onCardTouchMove(e) {
        return handleCardTouchMove(this, e);
    },

    // 触摸结束 - 卡片回弹
    onCardTouchEnd(e) {
        return handleCardTouchEnd(this, e);
    },

    onShow() {
        syncCustomTabBar(this);
        const featureFlags = getFeatureFlags();
        const membershipConfig = getConfigSection('membership_config');
        this.setData({ statusBarHeight: app.globalData.statusBarHeight || 20 });
        this.setData({
            featureFlags,
            loginAgreementHint: membershipConfig.login_agreement_hint || '登录后查看订单、积分、佣金等信息'
        });
        this._syncPortalPasswordEntryVisibility();
        this.loadPageLayoutConfig();
        this.loadUserInfo();
        this._refreshBusinessCenterVisibility();
        this._tryPendingRegisterLightTip();
    },

    _tryPendingRegisterLightTip() {
        return handlePendingRegisterLightTip(this);
    },

    onLightTipClose() {
        return handleLightTipClose(this);
    },

    onHide() {
        clearSecondaryLoadState(this);
    },

    onUnload() {
        clearSecondaryLoadState(this);
    },

    async loadPageLayoutConfig() {
        return loadPageLayoutConfig(this);
    },

    // 从服务端加载用户最新信息
    async loadUserInfo(forceRefresh = false) {
        const result = await loadUserInfo(this, forceRefresh);
        this._syncPortalPasswordEntryVisibility();
        return result;
    },

    _applyGrowthDisplay(info) {
        return applyGrowthDisplay(this, info);
    },

    onGrowthPrivilegesTap() {
        if (!requireLogin()) return;
        wx.navigateTo({ url: '/pages/user/membership-center' });
    },

    /** 团队中心入口（原 business-center 页）：由后台 membership_config.business_center_min_role_level 控制（默认 1 = C1/初级会员） */
    _refreshBusinessCenterVisibility() {
        return refreshBusinessCenterVisibility(this);
    },

    _syncPortalPasswordEntryVisibility() {
        const userInfo = this.data.userInfo || app.globalData.userInfo || {};
        const roleLevel = Number(userInfo.role_level || this.data.displayAgentRoleLevel || 0);
        const shouldShow = !!(
            this.data.isLoggedIn
            && (
                this.data.featureFlags.show_agent_service_entry
                || roleLevel >= 1
                || userInfo.portal_password_enabled
                || userInfo.portal_password_change_required
            )
        );
        if (shouldShow !== this.data.showPortalPasswordEntry) {
            this.setData({ showPortalPasswordEntry: shouldShow });
        }
    },

    _scheduleSecondaryLoads(forceRefresh = false) {
        return scheduleSecondaryLoads(this, forceRefresh);
    },

    async loadAssetRow() {
        return loadAssetRow(this);
    },

    async loadQuadPreviews() {
        return loadQuadPreviews(this);
    },

    onAssetCouponsTap() {
        this.goCoupons();
    },

    onAssetPointsTap() {
        this.goPoints();
    },

    onAssetBalanceTap() {
        if (!requireLogin()) return;
        wx.navigateTo({ url: '/pages/wallet/agent-wallet' });
    },

    onCommissionWalletTap() {
        this.onWalletTap();
    },

    onQuadExpressTap() {
        return handleQuadExpressTap(this);
    },

    onQuadFavoriteTap() {
        return handleQuadFavoriteTap();
    },

    onQuadFootprintTap() {
        return handleQuadFootprintTap();
    },

    onQuadRecentTap() {
        return handleQuadRecentTap(this);
    },

    // ====== 订单数量（含退款） ======
    async loadOrderCounts() {
        return loadOrderCounts(this);
    },

    markOrderBadgesSeen(statuses) {
        const { markOrderBadgesSeen } = require('./userDashboard');
        return markOrderBadgesSeen(this, statuses);
    },

    // ====== 分销信息 ======
    async loadDistributionInfo() {
        return loadDistributionInfo(this);
    },

    // ====== ★ 通知未读数 ======
    async loadNotificationsCount() {
        return loadNotificationsCount(this);
    },

    onEditProfile() {
        if (!requireLogin()) return;
        wx.navigateTo({ url: '/pages/user/edit-profile' });
    },

    promptProfileBootstrapIfNeeded(userInfo = {}, loginResult = {}) {
        const openid = String(userInfo.openid || app.globalData.openid || '').trim();
        if (!openid) return;
        if (this._profileBootstrapPrompting) return;
        this._profileBootstrapPrompting = true;
        const title = loginResult?.is_new_user ? '首次登录建议完善资料' : '建议完善默认资料';
        wx.showModal({
            title,
            content: '微信小程序不能静默读取你的真实头像和昵称。现在去完善后，后续将默认显示你的微信头像和昵称。',
            confirmText: '去完善',
            cancelText: '稍后',
            success: (res) => {
                if (res.confirm) {
                    wx.navigateTo({ url: '/pages/user/edit-profile?bootstrap=1' });
                }
            },
            complete: () => {
                this._profileBootstrapPrompting = false;
            }
        });
    },

    onMemberLevelTap() {
        if (!requireLogin()) return;
        wx.navigateTo({ url: '/pages/user/membership-center' });
    },

    onCopyMemberCode() {
        const userInfo = this.data.userInfo || {};
        const memberCode = String(userInfo.invite_code || '').trim();
        if (!memberCode) {
            wx.showToast({ title: '暂无可复制ID', icon: 'none' });
            return;
        }
        wx.setClipboardData({
            data: memberCode,
            success: () => wx.showToast({ title: '我的ID已复制', icon: 'success' })
        });
    },

    // ======== 编辑资料：先选「头像 / 昵称」 ========
    onTapEditProfile() {
        if (!requireLogin()) return;
        return getUserProfileActions().onTapEditProfile(this);
    },

    onCancelAvatarPick() {
        return getUserProfileActions().onCancelAvatarPick(this);
    },

    // ======== 头像（仅通过「编辑 → 修改头像 → 选择头像」进入） ========
    async onChooseAvatar(e) {
        return getUserProfileActions().onChooseAvatar(this, e);
    },

    // ======== 登录（WXML 用 onLoginTap / onLoginBtnTap） ========
    async confirmLoginAuthorization() {
        const { confirmLoginAuthorization } = require('./userProfileActions');
        return confirmLoginAuthorization();
    },

    async onLogin() {
        return getUserProfileActions().onLogin(this);
    },

    onLoginBtnTap() {
        this.onLogin();
    },

    // WXML 绑定别名 — 登录/授权
    async onLoginTap() {
        if (!this.data.isLoggedIn) {
            this.onLogin();
        }
    },

    // ======== 修改昵称（由「编辑」选「修改昵称」进入） ========
    onEditNickname() {
        if (!requireLogin()) return;
        return getUserProfileActions().onEditNickname(this);
    },

    onNicknameInput(e) {
        return getUserProfileActions().onNicknameInput(this, e);
    },

    onCancelNickname() {
        return getUserProfileActions().onCancelNickname(this);
    },

    preventTap() {
        return handlePreventTap();
    },

    // 阻止事件冒泡（WXML 中 catchtap="stopP"）
    stopP() {
        return handleStopP();
    },

    async onConfirmNickname() {
        return getUserProfileActions().onConfirmNickname(this);
    },

    // ======== ★ 佣金中心 ========
    onCommissionTap() {
        navigateIfLoggedIn('/pages/distribution/commission-logs');
    },
    goCommission() { this.onCommissionTap(); },

    // ======== ★ 钱包/提现 ========
    onWalletTap() {
        navigateIfLoggedIn('/pages/wallet/index');
    },
    goWallet() { this.onWalletTap(); },

    goTeamCenter() {
        return navigateTeamCenter(this);
    },

    /** @deprecated 请使用 goTeamCenter */
    goCommerceHub() {
        this.goTeamCenter();
    },

    // ======== ★ 团队（旧 team 页仍可从分销中心等入口进入） ========

    // ======== 地址管理 ========
    goAddress() {
        navigateIfLoggedIn('/pages/address/list');
    },

    goCustomerService() {
        return navigateCustomerService();
    },

    /** 收藏 + 浏览足迹（双 Tab 合并页；未登录也可用本地足迹/收藏） */
    goFavoritesFootprints() {
        return navigateFavoritesFootprints();
    },

    goPortalPassword() {
        navigateIfLoggedIn('/pages/user/portal-password');
    },

    goStationsMap() {
        wx.navigateTo({ url: '/pages/stations/map' });
    },

    goPickupVerify() {
        navigateIfLoggedIn('/pages/pickup/verify');
    },

    // ======== 工作台（已废弃，保留方法避免报错） ========
    goWorkbench() {
        if (!requireLogin()) return;
        this.goTeamCenter();
    },

    // ======== 订单入口 ========
    onOrderAllTap() {
        if (!requireLogin()) return;
        this.markOrderBadgesSeen();
        wx.navigateTo({ url: '/pages/order/list' });
    },

    onOrderTap(e) {
        return handleOrderTap(this, e);
    },

    // ======== ★ 售后/退款入口 ========
    onRefundTap() {
        if (!requireLogin()) return;
        this.markOrderBadgesSeen(['refund']);
        wx.navigateTo({ url: '/pages/order/refund-list' });
    },

    // ======== 通知入口 ========
    onNotificationsTap() {
        navigateIfLoggedIn('/pages/user/notifications');
    },

    // ======== 设置 ========
    onSettingsTap() {
        return handleSettingsTap(this);
    },

    // ======== 隐私协议 ========
    goPrivacy() {
        return navigatePrivacy();
    },

    // ======== 关于 ========
    onAboutTap() {
        return showAboutModal();
    },

    // ======== 菜单入口 ========
    onMenuTap(e) {
        return handleMenuTap(e);
    },

    // ======== 分享入口 ========
    onShowInvite() {
        if (!requireLogin()) return;
        this.goInvitePoster();
    },

    goInvitePoster() {
        navigateIfLoggedIn('/pages/distribution/invite-poster');
    },

    // ★ 跳转积分中心
    goPoints() {
        wx.navigateTo({ url: '/pages/points/index' });
    },

    onUseCouponBanner() {
        this.goCoupons();
    },

    goShoppingBag() {
        return navigateShoppingBag();
    },

    // ★ 全部商品（从首页迁移迁移）
    goAllProducts() {
        return navigateAllProducts();
    },

    // ★ 购物袋（从首页迁移）
    goCart() {
        return navigateCart();
    },

    // Phase 2: 我的优惠券
    goCoupons() {
        navigateIfLoggedIn('/pages/coupon/list');
    },

    // Phase 2: 积分抽奖
    goLottery() {
        return navigateLottery(this);
    },

    // ======== 分享入口（跳转团队页邀请海报） ========
    goShareCenter() {
        this.goInvitePoster();
    },

    // ======== ★ 分享邀请 ========
    onShareTap() {
        return handleShareTap();
    },

    // ======== 退出登录 ========
    onLogout() {
        return handleLogout(this);
    },

    // ======== 分享功能 ========
    onShareAppMessage() {
        return buildSharePayload(this);
    }
});
