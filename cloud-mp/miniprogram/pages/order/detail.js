// pages/order/detail.js - 订单详情
const { get, post } = require('../../utils/request');
const { getConfigSection, getFeatureFlags } = require('../../utils/miniProgramConfig');
const { loadOrder, maybeSyncWechatPayAfterLoad } = require('./orderDetailData');
const {
    shouldUseWalletForOrder,
    clearWalletPreference,
    onPayOrder,
    onPayOrderWithWallet: payOrderWithWallet,
    startPayStatusPolling
} = require('./orderDetailPayment');
const {
    onConfirmReceive,
    onCancelOrder,
    onApplyRefund,
    onViewRefund,
    onViewLogistics,
    onGoReview,
    onCopyTrackingNo,
    onPickupCredentialTap
} = require('./orderDetailActions');
const { resolveNextProductImage } = require('./orderImageResolver');
const app = getApp();

Page({
    data: {
        order: null,
        loading: true,
        loadError: false,
        orderBubbleVisible: false,
        orderBubbleText: '',
        canViewLogistics: true,
        payCountdownText: '',
        // 退款相关
        activeRefund: null,
        hasActiveRefund: false,
        // 货款余额支付（代理商待付款时展示）
        isAgent: false,
        walletBalance: 0,

        statusMap: {
            pending: '待付款',
            pending_payment: '待付款',
            pending_group: '待成团',
            paid: '待发货',
            pickup_pending: '待核销',
            agent_confirmed: '代理已确认',
            shipping_requested: '发货申请中',
            shipped: '待收货',
            completed: '已完成',
            cancelled: '已取消',
            refunding: '退款中',
            refunded: '已退款'
        },
        statusDescMap: {
            pending: '请尽快完成支付',
            pending_payment: '请尽快完成支付',
            pending_group: '已支付，等待成团',
            paid: '已支付，等待发货',
            pickup_pending: '已支付，请到指定门店提货',
            agent_confirmed: '订单已确认，正在备货',
            shipping_requested: '发货申请已提交',
            shipped: '商品已发出，请注意查收',
            completed: '订单已完成',
            cancelled: '订单已取消',
            refunding: '售后申请处理中',
            refunded: '退款已完成'
        },
        refundStatusText: {
            pending: '审核中',
            approved: '已通过',
            processing: '退款中',
            completed: '退款完成',
            rejected: '已驳回',
            cancelled: '已取消'
        }
    },

    onLoad(options) {
        const logisticsConfig = getConfigSection('logistics_config');
        const featureFlags = getFeatureFlags();
        this.setData({
            canViewLogistics: featureFlags.enable_logistics_entry !== false && (
                logisticsConfig.shipping_mode !== 'manual' || logisticsConfig.shipping_manual_tracking_page_enabled !== false
            )
        });
        this._loadWalletBalance();
        // id 可为数字主键或商户订单号 order_no（与微信支付 out_trade_no 一致，微信订单中心跳转常用）
        if (options.id) {
            this.setData({ orderId: options.id });
            this.loadOrder(options.id);
        } else {
            this.setData({ loading: false, loadError: true });
        }
    },

    async _loadWalletBalance() {
        try {
            const { get: httpGet } = require('../../utils/request');
            const res = await httpGet('/agent/wallet');
            if (res && res.code === 0 && res.data) {
                const balance = Number(res.data.goods_fund_balance || res.data.balance || 0);
                const normalizedBalance = Number.isFinite(balance)
                    ? Math.round(balance * 100) / 100
                    : 0;
                this.setData({
                    isAgent: normalizedBalance > 0,
                    walletBalance: normalizedBalance,
                    walletBalanceDisplay: normalizedBalance.toFixed(2)
                });
            } else {
                this.setData({ isAgent: false, walletBalance: 0, walletBalanceDisplay: '0.00' });
            }
        } catch (_e) {
            this.setData({ isAgent: false, walletBalance: 0, walletBalanceDisplay: '0.00' });
        }
    },

    onReady() {
        this.brandAnimation = this.selectComponent('#brandAnimation');
    },

    // 页面重新显示时刷新订单状态
    onShow() {
        if (this.data.orderId) {
            this.loadOrder(this.data.orderId);
        }
    },

    onUnload() {
        if (this._bubbleTimer) clearTimeout(this._bubbleTimer);
        if (this._payPollTimer) clearTimeout(this._payPollTimer);
        if (this._countdownTimer) clearInterval(this._countdownTimer);
    },

    async loadOrder(idOrNo) {
        return loadOrder(this, idOrNo);
    },

    /** 待付款进入详情时向服务端查微信一次，缓解 notify 未到导致的「已扣款仍待付」 */
    _maybeSyncWechatPayAfterLoad(orderId) {
        return maybeSyncWechatPayAfterLoad(this, orderId);
    },

    onRetryLoad() {
        this.setData({ loadError: false, loading: true });
        this.loadOrder(this.data.orderId);
    },

    showOrderBubble(order) {
        if (!order) return;
        const logisticsConfig = getConfigSection('logistics_config');
        const canonicalDesc = order.display_status_desc || order.status_desc || (this.data.activeRefund && (this.data.activeRefund.display_status_desc || this.data.activeRefund.status_desc)) || '';
        const statusMap = {
            pending: '订单已创建，请尽快完成支付。',
            pending_payment: '订单已创建，请尽快完成支付。',
            pending_group: '已支付，等待成团。',
            paid: '已支付，等待发货。',
            pickup_pending: '已支付，请前往指定门店提货。',
            agent_confirmed: '订单已确认，正在备货。',
            shipping_requested: '发货申请已提交。',
            shipped: logisticsConfig.shipping_mode === 'manual'
                ? (logisticsConfig.manual_status_desc || '当前订单走手工发货模式，可查看单号和发货时间')
                : '商品已发出，可在此页查看物流。',
            completed: '订单已完成，感谢您的信任。',
            refunding: '售后申请已提交，正在处理中。',
            refunded: '退款已完成。'
        };
        const text = canonicalDesc || statusMap[order.status] || '可在此查看订单状态与物流进度。';
        if (this._bubbleTimer) clearTimeout(this._bubbleTimer);
        this.setData({ orderBubbleText: text, orderBubbleVisible: true });
        this._bubbleTimer = setTimeout(() => {
            this.setData({ orderBubbleVisible: false });
        }, 3200);
    },

    // ── 支付倒计时 ──
    startPayCountdown(expireAtStr, timeoutMinutes) {
        if (this._countdownTimer) clearInterval(this._countdownTimer);
        if (!expireAtStr) {
            this.setData({ payCountdownText: '' });
            return;
        }
        const expireTs = new Date(expireAtStr).getTime();
        if (isNaN(expireTs)) {
            this.setData({ payCountdownText: '' });
            return;
        }
        const ORDER_TIMEOUT_MS = Math.max(1, Number(timeoutMinutes) || 30) * 60 * 1000;
        const fallbackExpireTs = Date.now() + ORDER_TIMEOUT_MS;
        const targetTs = expireTs > 0 ? expireTs : fallbackExpireTs;

        const tick = () => {
            const remainMs = targetTs - Date.now();
            if (remainMs <= 0) {
                this.setData({ payCountdownText: '已超时' });
                clearInterval(this._countdownTimer);
                // 超时后自动刷新订单状态
                setTimeout(() => {
                    if (this.data.orderId) this.loadOrder(this.data.orderId);
                }, 1500);
                return;
            }
            const totalSec = Math.ceil(remainMs / 1000);
            const min = Math.floor(totalSec / 60);
            const sec = totalSec % 60;
            this.setData({
                payCountdownText: `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
            });
        };
        tick();
        this._countdownTimer = setInterval(tick, 1000);
    },

    _shouldUseWalletForOrder(orderId) {
        return shouldUseWalletForOrder(this, app, orderId);
    },

    _clearWalletPreference(orderId) {
        return clearWalletPreference(orderId);
    },

    // 支付订单（微信 JSAPI 支付）
    async onPayOrder() {
        return onPayOrder(this, app);
    },

    // 货款余额支付（代理商专属，从详情页直接扣余额）
    async onPayOrderWithWallet() {
        return payOrderWithWallet(this);
    },

    // 确认收货
    async onConfirmReceive() {
        return onConfirmReceive(this);
    },

    // 取消订单
    async onCancelOrder() {
        return onCancelOrder(this);
    },

    // 申请退款
    onApplyRefund() {
        return onApplyRefund(this);
    },

    // 查看退款详情
    onViewRefund() {
        return onViewRefund(this);
    },

    // 查看物流
    onViewLogistics() {
        return onViewLogistics(this);
    },

    // 跳转评价页（仅已完成订单展示入口）
    onGoReview() {
        return onGoReview(this);
    },

    // 复制单号并给出轻反馈
    onCopyTrackingNo() {
        return onCopyTrackingNo(this);
    },

    async onProductImageError() {
        const order = this.data.order;
        if (!order || !order.product) return;
        const nextImage = await resolveNextProductImage(order.product);
        this.setData({
            'order.product.image': nextImage.image,
            'order.product.images': nextImage.image ? [nextImage.image] : [],
            'order.product.image_candidates': nextImage.image_candidates,
            'order.product.image_candidate_index': nextImage.image_candidate_index
        });
    },

    async onBundleItemImageError(e) {
        const index = Number(e.currentTarget.dataset.index);
        const order = this.data.order;
        const item = order && Array.isArray(order.items) ? order.items[index] : null;
        if (!Number.isInteger(index) || !item || !item.product) return;
        const nextImage = await resolveNextProductImage(item.product);
        this.setData({
            [`order.items[${index}].product.image`]: nextImage.image,
            [`order.items[${index}].product.images`]: nextImage.image ? [nextImage.image] : [],
            [`order.items[${index}].product.image_candidates`]: nextImage.image_candidates,
            [`order.items[${index}].product.image_candidate_index`]: nextImage.image_candidate_index
        });
    },

    startPayStatusPolling(orderId) {
        return startPayStatusPolling(this, orderId);
    },

    onPickupCredentialTap() {
        return onPickupCredentialTap(this);
    },

    async onViewActivity() {
        const activity = this.data.order && this.data.order.activityInfo;
        if (!activity) return;
        if (activity.type === 'group') {
            if (!activity.targetNo) {
                const order = this.data.order;
                const isPaid = order && order.status !== 'pending' && order.status !== 'pending_payment' && order.status !== 'cancelled';
                if (isPaid) {
                    wx.showLoading({ title: '正在生成拼团...' });
                    try {
                        const orderId = order.id || order._id || order.order_no;
                        const res = await post(`/orders/${encodeURIComponent(orderId)}/retry-group-join`);
                        wx.hideLoading();
                        const groupNo = res && res.data && res.data.group_no;
                        if (groupNo) {
                            wx.navigateTo({ url: `/pages/group/detail?group_no=${groupNo}` });
                            return;
                        }
                        wx.showToast({ title: '拼团记录生成中，请稍后再试', icon: 'none' });
                        this.loadOrder(orderId);
                    } catch (err) {
                        wx.hideLoading();
                        wx.showToast({ title: err.message || '操作失败', icon: 'none' });
                        this.loadOrder(order.id || order._id || order.order_no);
                    }
                } else {
                    wx.showToast({ title: '请先完成支付', icon: 'none' });
                }
                return;
            }
            wx.navigateTo({ url: `/pages/group/detail?group_no=${activity.targetNo}` });
            return;
        }
        if (activity.type === 'slash') {
            if (!activity.targetNo) {
                wx.navigateTo({ url: '/pages/slash/list?tab=my' });
                return;
            }
            wx.navigateTo({ url: `/pages/slash/detail?slash_no=${activity.targetNo}` });
        }
    }
});
