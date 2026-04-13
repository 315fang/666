const app = getApp();
const { requireLogin } = require('../../utils/auth');
const { getConfigSection } = require('../../utils/miniProgramConfig');
const { clearUserCache } = require('./userDashboard');

function navigateIfLoggedIn(url) {
    if (!requireLogin()) return false;
    wx.navigateTo({ url });
    return true;
}

function goBusinessCenter() {
    if (!requireLogin()) return;
    wx.navigateTo({ url: '/pages/distribution/business-center' });
}

function onOrderTap(page, event) {
    if (!requireLogin()) return;
    const type = event.currentTarget.dataset.type;
    if (page && typeof page.markOrderBadgesSeen === 'function') {
        if (type && type !== 'all') {
            page.markOrderBadgesSeen([type]);
        } else {
            page.markOrderBadgesSeen();
        }
    }
    let url = '/pages/order/list';
    if (type && type !== 'all') {
        url += '?status=' + type;
    }
    wx.navigateTo({ url });
}

function onSettingsTap() {
    wx.showActionSheet({
        itemList: ['清除缓存', '意见反馈'],
        success: (res) => {
            if (res.tapIndex === 0) {
                clearUserCache();
                wx.showToast({ title: '页面缓存已清除', icon: 'success' });
            }
        }
    });
}

function onAboutTap() {
    const brandConfig = getConfigSection('brand_config');
    const brandName = app.globalData.brandName || brandConfig.brand_name || '问兰';
    const customerServiceWechat = app.globalData.customerServiceWechat || brandConfig.customer_service_wechat || 'wl_service';
    wx.showModal({
        title: '关于' + brandName,
        content: `${brandName} ${brandConfig.app_version_text || 'v1.0.0'}\n${brandConfig.about_summary || '品牌甄选，值得信赖。'}\n\n客服微信：${customerServiceWechat}`,
        showCancel: false
    });
}

function onMenuTap(event) {
    if (!requireLogin()) return;
    const url = event.currentTarget.dataset.url;
    if (url) {
        wx.navigateTo({ url });
    } else {
        wx.showToast({ title: '该功能未配置入口', icon: 'none' });
    }
}

function onLogout(page) {
    wx.showModal({
        title: '提示',
        content: '确认退出登录吗？',
        success: (res) => {
            if (res.confirm) {
                app.logout();
                page.setData({
                    userInfo: null,
                    isLoggedIn: false,
                    notificationsCount: 0,
                    growthDisplay: null,
                    unusedCouponCount: 0,
                    pointsBalanceDisplay: '--',
                    balance: '0',
                    commissionBalance: '0',
                    couponBanner: null,
                    orderStats: { pending: 0, paid: 0, shipped: 0, pendingReview: 0, refund: 0 }
                });
                page.loadQuadPreviews();
                wx.showToast({ title: '已退出', icon: 'success' });
            }
        }
    });
}

function goCustomerService() {
    wx.navigateTo({ url: '/pages/user/customer-service' });
}

function goFavoritesFootprints() {
    wx.navigateTo({ url: '/pages/user/favorites-footprints' });
}

function goPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
}

function goShoppingBag() {
    wx.switchTab({ url: '/pages/category/category' });
}

function goAllProducts() {
    wx.switchTab({ url: '/pages/category/category' });
}

function goCart() {
    wx.navigateTo({ url: '/pages/cart/cart' });
}

function goLottery(page) {
    if (!requireLogin()) return;
    if (page.data.featureFlags.enable_lottery_entry === false) {
        wx.showToast({ title: '抽奖入口暂未开放', icon: 'none' });
        return;
    }
    wx.navigateTo({ url: '/pages/lottery/lottery' });
}

function onQuadExpressTap(page) {
    if (!requireLogin()) return;
    const id = page.data.quadExpress && page.data.quadExpress.orderId;
    if (id) {
        wx.navigateTo({ url: `/pages/order/detail?id=${id}` });
    } else {
        wx.navigateTo({ url: '/pages/order/list?status=shipped' });
    }
}

function onQuadFavoriteTap() {
    wx.navigateTo({ url: '/pages/user/favorites-footprints?tab=favorites' });
}

function onQuadFootprintTap() {
    wx.navigateTo({ url: '/pages/user/favorites-footprints?tab=footprints' });
}

function onQuadRecentTap(page) {
    if (page.data.quadRecent && page.data.quadRecent.mode === 'order' && page.data.quadRecent.orderId) {
        if (!requireLogin()) return;
        wx.navigateTo({ url: `/pages/order/detail?id=${page.data.quadRecent.orderId}` });
        return;
    }
    page.onGrowthPrivilegesTap();
}

function buildSharePayload(page) {
    const shareTitle = app.globalData.shareTitle || '问兰 · 品牌甄选';
    const code = page.data.userInfo?.invite_code || app.globalData.userInfo?.invite_code || '';
    // 分享参数中携带会员码；落地页与 app 启动写入 pending_invite_code，登录时绑 parent_id
    return {
        title: shareTitle,
        path: `/pages/index/index${code ? `?invite=${encodeURIComponent(code)}` : ''}`,
        imageUrl: ''
    };
}

module.exports = {
    buildSharePayload,
    goBusinessCenter,
    goAllProducts,
    goCart,
    goCustomerService,
    goFavoritesFootprints,
    goLottery,
    goPrivacy,
    goShoppingBag,
    navigateIfLoggedIn,
    onAboutTap,
    onLogout,
    onMenuTap,
    onOrderTap,
    onQuadExpressTap,
    onQuadFavoriteTap,
    onQuadFootprintTap,
    onQuadRecentTap,
    onSettingsTap
};
