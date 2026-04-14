// pages/order/detail.js - 订单详情
const { get, post } = require('../../utils/request');
const { getConfigSection, getFeatureFlags } = require('../../utils/miniProgramConfig');
const { loadOrder, maybeSyncWechatPayAfterLoad } = require('./orderDetailData');
const {
    shouldUseWalletForOrder,
    clearWalletPreference,
    onPayOrder,
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
            pending_group: '已支付成功，等待其他团员加入后成团',
            paid: '已支付成功，等待商家发货',
            agent_confirmed: '代理已确认，正在准备发货',
            shipping_requested: '发货申请已提交，等待仓库处理',
            shipped: '商品已发出，请注意查收快递',
            completed: '交易已完成，佣金将在确认收货后15天结算',
            cancelled: '订单已取消',
            refunding: '退款申请处理中，请耐心等待',
            refunded: '退款已完成'
        },
        refundStatusText: {
            pending: '审核中',
            approved: '审核通过',
            processing: '退款处理中',
            completed: '退款完成',
            rejected: '申请被拒绝',
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
                const balance = parseFloat(res.data.goods_fund_balance || res.data.balance || 0);
                this.setData({ isAgent: balance > 0, walletBalance: balance });
            } else {
                this.setData({ isAgent: false, walletBalance: 0 });
            }
        } catch (_e) {
            this.setData({ isAgent: false, walletBalance: 0 });
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
            pending_group: '已支付成功，等待其他成员加入成团。',
            paid: '订单已支付成功，正在等待发货。',
            agent_confirmed: '团队已确认订单，正在准备发货。',
            shipping_requested: '发货申请已提交，请耐心等待。',
            shipped: logisticsConfig.shipping_mode === 'manual'
                ? (logisticsConfig.manual_status_desc || '当前订单走手工发货模式，可查看单号和发货时间')
                : '商品已发出，可在此页查看物流。',
            completed: '订单已完成，感谢您的信任。',
            refunding: '退款申请已提交，正在处理中。',
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
        const { order, walletBalance } = this.data;
        if (!order) return;
        if (walletBalance <= 0) {
            wx.showToast({ title: '货款余额不足，请先充值', icon: 'none' });
            return;
        }
        if (this._payingWallet) return;
        this._payingWallet = true;
        wx.showLoading({ title: '支付中...', mask: true });
        try {
            const { post } = require('../../utils/request');
            const res = await post(`/orders/${order.id}/prepay`, { use_wallet_balance: true });
            wx.hideLoading();
            if (res.code !== 0) {
                wx.showToast({ title: res.message || '货款支付失败', icon: 'none' });
                return;
            }
            const payParams = res.data || {};
            if (payParams.paid_by_wallet) {
                wx.showToast({ title: '货款余额支付成功！', icon: 'success' });
                this.startPayStatusPolling(order.id);
                this._loadWalletBalance(); // 刷新余额显示
            } else if (payParams.wallet_balance_insufficient) {
                wx.showToast({ title: `货款余额不足（¥${Number(payParams.wallet_balance || 0).toFixed(2)}），请充值后重试`, icon: 'none', duration: 3000 });
            } else {
                wx.showToast({ title: '货款支付失败，请重试', icon: 'none' });
            }
        } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: err.message || '支付失败，请重试', icon: 'none' });
        } finally {
            this._payingWallet = false;
        }
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

    // 跳转评价页
    onGoReview() {
        return onGoReview(this);
    },

    // 复制单号并给出轻反馈
    onCopyTrackingNo() {
        return onCopyTrackingNo(this);
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
                        wx.showToast({ title: '拼团进度生成中，请稍后再试', icon: 'none' });
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
