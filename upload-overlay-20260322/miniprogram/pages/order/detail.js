// pages/order/detail.js - 订单详情
const { get, post } = require('../../utils/request');
const { parseImages } = require('../../utils/dataFormatter');
const { getConfigSection, getFeatureFlags } = require('../../utils/miniProgramConfig');
const app = getApp();

Page({
    data: {
        order: null,
        loading: true,
        loadError: false,
        orderBubbleVisible: false,
        orderBubbleText: '',
        canViewLogistics: true,
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
    },

    async loadOrder(idOrNo) {
        if (idOrNo === undefined || idOrNo === null || idOrNo === '') {
            this.setData({ loading: false, loadError: true });
            return;
        }
        try {
            const pathKey = encodeURIComponent(String(idOrNo));
            const orderRes = await get(`/orders/${pathKey}`);
            const order = orderRes.data;

            const refundsRes = await get('/refunds', { page: 1, limit: 100, order_id: order.id }).catch(() => ({
                data: { list: [] }
            }));

            if (order && order.product) {
                order.product.images = parseImages(order.product.images);
            }

            const allRefunds = refundsRes.data?.list || [];
            const activeRefund = allRefunds.find(
                (r) => r.order_id === order.id && ['pending', 'approved', 'processing'].includes(r.status)
            );
            const latestRefund = allRefunds.find((r) => r.order_id === order.id);

            this.setData({
                order,
                orderId: order.id,
                loading: false,
                loadError: false,
                activeRefund: activeRefund || null,
                hasActiveRefund: !!activeRefund,
                latestRefund: latestRefund || null,
                reviewed: !!(order && (order.reviewed || (order.remark && order.remark.includes('[已评价]'))))
            });

            this.showOrderBubble(order);

            if (order && order.status === 'pending') {
                this._maybeSyncWechatPayAfterLoad(order.id);
            }
        } catch (err) {
            console.error('加载订单失败:', err);
            this.setData({ loading: false, loadError: true });
        }
    },

    /** 待付款进入详情时向服务端查微信一次，缓解 notify 未到导致的「已扣款仍待付」 */
    _maybeSyncWechatPayAfterLoad(orderId) {
        this._pendingPaySyncTs = this._pendingPaySyncTs || {};
        const now = Date.now();
        if (now - (this._pendingPaySyncTs[orderId] || 0) < 25000) return;
        this._pendingPaySyncTs[orderId] = now;
        post(`/orders/${orderId}/sync-wechat-pay`, {}, { showError: false, maxRetries: 0, timeout: 12000 })
            .then((r) => {
                if (r && r.code === 0 && r.data && r.data.synced) {
                    this.loadOrder(orderId);
                }
            })
            .catch(() => {});
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

    _shouldUseWalletForOrder(orderId) {
        const roleLevel = app.globalData.userInfo?.role_level || 0;
        if (roleLevel < 3) return false;
        const preferredOrderIds = wx.getStorageSync('walletPayOrderIds') || [];
        if (Array.isArray(preferredOrderIds) && preferredOrderIds.includes(orderId)) {
            return true;
        }
        return !!wx.getStorageSync('useWalletPay');
    },

    _clearWalletPreference(orderId) {
        const preferredOrderIds = wx.getStorageSync('walletPayOrderIds') || [];
        if (Array.isArray(preferredOrderIds) && preferredOrderIds.length) {
            const nextIds = preferredOrderIds.filter(id => id !== orderId);
            if (nextIds.length > 0) wx.setStorageSync('walletPayOrderIds', nextIds);
            else wx.removeStorageSync('walletPayOrderIds');
        }
        wx.removeStorageSync('useWalletPay');
    },

    // 支付订单（微信 JSAPI 支付）
    async onPayOrder() {
        const { order } = this.data;
        if (!order?.id) return;

        let loadingVisible = false;
        const safeHideLoading = () => {
            if (loadingVisible) {
                wx.hideLoading();
                loadingVisible = false;
            }
        };

        wx.showLoading({ title: '支付中...' });
        loadingVisible = true;
        try {
            const useWallet = this._shouldUseWalletForOrder(order.id);

            const prepayRes = await post(`/orders/${order.id}/prepay`, {
                use_wallet_balance: useWallet
            });
            if (prepayRes.code !== 0) {
                safeHideLoading();
                wx.showToast({ title: prepayRes.message || '预下单失败', icon: 'none' });
                return;
            }

            const payParams = prepayRes.data;

            if (payParams.wallet_balance_insufficient) {
                wx.showToast({
                    title: `货款余额不足，已切换微信支付（余额¥${Number(payParams.wallet_balance || 0).toFixed(2)}）`,
                    icon: 'none'
                });
            }

            if (payParams.paid_by_wallet) {
                safeHideLoading();
                this._clearWalletPreference(order.id);
                wx.showToast({ title: '货款余额支付成功！', icon: 'success' });
                this.startPayStatusPolling(order.id);
                return;
            }

            if (payParams.paid_by_free) {
                safeHideLoading();
                this._clearWalletPreference(order.id);
                wx.showToast({
                    title: payParams.message || '订单已自动完成支付',
                    icon: 'success'
                });
                this.startPayStatusPolling(order.id);
                return;
            }

            wx.requestPayment({
                timeStamp: payParams.timeStamp,
                nonceStr: payParams.nonceStr,
                package: payParams.package,
                signType: payParams.signType || 'RSA',
                paySign: payParams.paySign,
                success: () => {
                    wx.showToast({ title: '支付成功！', icon: 'success' });
                    this.startPayStatusPolling(order.id);
                },
                fail: (err) => {
                    if (err.errMsg && err.errMsg.includes('cancel')) {
                        wx.showToast({ title: '已取消支付', icon: 'none' });
                    } else {
                        wx.showToast({ title: '支付失败，请重试', icon: 'none' });
                        console.error('wx.requestPayment fail:', err);
                    }
                },
                complete: () => {
                    safeHideLoading();
                }
            });
        } catch (err) {
            safeHideLoading();
            wx.showToast({ title: err.message || '支付失败', icon: 'none' });
            console.error('支付流程异常:', err);
        }
    },

    // 确认收货
    async onConfirmReceive() {
        const { order } = this.data;

        wx.showModal({
            title: '确认收货',
            content: '确认已收到商品？确认后佣金将在15天后结算给推荐人。',
            success: async (res) => {
                if (res.confirm) {
                    try {
                        const confirmRes = await post(`/orders/${order.id}/confirm`);
                        if (confirmRes.code === 0) {
                            wx.showToast({ title: '已确认收货', icon: 'success' });
                            this.loadOrder(order.id);
                        } else {
                            wx.showToast({ title: confirmRes.message || '确认收货失败', icon: 'none' });
                        }
                    } catch (err) {
                        wx.showToast({ title: '操作失败', icon: 'none' });
                    }
                }
            }
        });
    },

    // 取消订单
    async onCancelOrder() {
        const { order } = this.data;

        wx.showModal({
            title: '取消订单',
            content: '确定要取消该订单吗？',
            success: async (res) => {
                if (res.confirm) {
                    try {
                        await post(`/orders/${order.id}/cancel`);
                        wx.showToast({ title: '订单已取消', icon: 'success' });
                        this.loadOrder(order.id);
                    } catch (err) {
                        wx.showToast({ title: '取消失败', icon: 'none' });
                    }
                }
            }
        });
    },

    // 申请退款
    onApplyRefund() {
        const { order } = this.data;
        wx.navigateTo({
            url: `/pages/order/refund-apply?order_id=${order.id}`
        });
    },

    // 查看退款详情
    onViewRefund() {
        const { activeRefund, latestRefund } = this.data;
        const refund = activeRefund || latestRefund;
        if (refund) {
            wx.navigateTo({
                url: `/pages/order/refund-detail?id=${refund.id}`
            });
        }
    },

    // 查看物流
    onViewLogistics() {
        const { order } = this.data;
        const logisticsConfig = getConfigSection('logistics_config');
        if (!this.data.canViewLogistics) {
            wx.showToast({ title: logisticsConfig.manual_status_desc || '当前未开放物流查询', icon: 'none' });
            return;
        }
        if (order.tracking_no) {
            wx.navigateTo({
                url: `/pages/logistics/tracking?order_id=${order.id}`
            });
        } else {
            const commonCopy = getConfigSection('common_copy');
            wx.showToast({ title: commonCopy.no_logistics_text || '暂无物流信息', icon: 'none' });
        }
    },

    // 跳转评价页
    onGoReview() {
        const { order } = this.data;
        wx.navigateTo({
            url: `/pages/order/review?order_id=${order.id}&product_id=${order.product_id || (order.product && order.product.id) || ''}`
        });
    },

    // 复制单号并给出轻反馈
    onCopyTrackingNo() {
        const { order } = this.data;
        if (order.tracking_no) {
            wx.setClipboardData({
                data: order.tracking_no,
                success: () => {
                    if (this.brandAnimation) {
                        const commonCopy = getConfigSection('common_copy');
                        this.brandAnimation.showCopySuccess(commonCopy.copy_success_text || '单号已复制');
                    } else {
                        const commonCopy = getConfigSection('common_copy');
                        wx.showToast({ title: commonCopy.copy_success_text || '单号已复制', icon: 'success' });
                    }
                }
            });
        }
    },

    startPayStatusPolling(orderId) {
        if (this._payPollTimer) clearTimeout(this._payPollTimer);

        let attempts = 0;
        const maxAttempts = 10;
        const intervalMs = 2000;

        const poll = async () => {
            attempts += 1;
            try {
                // 先向服务端请求「微信查单补单」，避免仅依赖异步 notify 导致已扣款仍显示待付款
                await post(`/orders/${orderId}/sync-wechat-pay`, {}, { showError: false, maxRetries: 0, timeout: 12000 }).catch(() => {});
                const res = await get(`/orders/${orderId}`, {}, { showError: false, maxRetries: 0, timeout: 8000 });
                const latestOrder = res?.data;
                if (latestOrder && latestOrder.status && latestOrder.status !== 'pending') {
                    this._clearWalletPreference(orderId);
                    this.loadOrder(orderId);
                    return;
                }
            } catch (_) {
                // 支付状态兜底轮询不打断用户流程
            }

            if (attempts < maxAttempts) {
                this._payPollTimer = setTimeout(poll, intervalMs);
            } else {
                this.loadOrder(orderId);
                wx.showToast({ title: '支付结果同步稍慢，请稍后刷新查看', icon: 'none' });
            }
        };

        this._payPollTimer = setTimeout(poll, 1200);
    },

    onPickupCredentialTap() {
        const id = this.data.order && this.data.order.id;
        if (!id) return;
        wx.navigateTo({ url: `/pages/order/pickup-credential?id=${id}` });
    }
});
