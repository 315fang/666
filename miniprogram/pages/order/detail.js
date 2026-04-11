// pages/order/detail.js - 订单详情
const { get } = require('../../utils/request');
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

        statusMap: {
            pending: '待付款',
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
        // id 可为数字主键或商户订单号 order_no（与微信支付 out_trade_no 一致，微信订单中心跳转常用）
        if (options.id) {
            this.setData({ orderId: options.id });
            this.loadOrder(options.id);
        } else {
            this.setData({ loading: false, loadError: true });
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
        const statusMap = {
            pending: '订单已创建，请尽快完成支付。',
            paid: '订单已支付成功，正在等待发货。',
            agent_confirmed: '团队已确认订单，正在准备发货。',
            shipping_requested: '发货申请已提交，请耐心等待。',
            shipped: logisticsConfig.shipping_mode === 'manual'
                ? (logisticsConfig.manual_status_desc || '当前订单走手工发货模式，可查看单号和发货时间')
                : '商品已发出，可在此页查看物流。',
            completed: '订单已完成，感谢您的信任。'
        };
        const text = statusMap[order.status] || '可在此查看订单状态与物流进度。';
        if (this._bubbleTimer) clearTimeout(this._bubbleTimer);
        this.setData({ orderBubbleText: text, orderBubbleVisible: true });
        this._bubbleTimer = setTimeout(() => {
            this.setData({ orderBubbleVisible: false });
        }, 3200);
    },

    // ── 支付倒计时 ──
    startPayCountdown(expireAtStr) {
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
        const ORDER_TIMEOUT_MS = 30 * 60 * 1000; // 后端默认30分钟
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

    onViewActivity() {
        const activity = this.data.order && this.data.order.activityInfo;
        if (!activity) return;
        if (activity.type === 'group') {
            if (!activity.targetNo) {
                wx.showToast({ title: '支付成功后可查看拼团进度', icon: 'none' });
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
