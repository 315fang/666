// pages/order/list.js
const { get, post } = require('../../utils/request');
const { parseImages } = require('../../utils/dataFormatter');
const { ErrorHandler } = require('../../utils/errorHandler');
const { normalizeOrderConsumer, normalizeRefundConsumer, getRefundStatusText } = require('./orderConsumerFields');

function buildOrderActivityInfo(order = {}) {
    const firstItem = Array.isArray(order.items) ? (order.items[0] || {}) : {};
    const type = order.type || order.order_type || firstItem.activity_type || '';
    const groupNo = order.group_no || firstItem.group_no || '';
    const slashNo = order.slash_no || firstItem.slash_no || '';

    if (type === 'group' || groupNo || order.group_activity_id || firstItem.group_activity_id) {
        const isPaid = order.status && order.status !== 'pending' && order.status !== 'pending_payment' && order.status !== 'cancelled';
        let actionText, disabled;
        if (groupNo && order.status === 'cancelled') {
            actionText = '查看当前团状态';
            disabled = false;
        } else if (groupNo) {
            actionText = '查看进度';
            disabled = false;
        } else if (isPaid) {
            actionText = '查看拼团';
            disabled = false;
        } else {
            actionText = '支付后查看';
            disabled = true;
        }
        return {
            type: 'group',
            label: '拼团',
            actionText,
            targetNo: groupNo,
            disabled
        };
    }

    if (type === 'slash' || slashNo) {
        return {
            type: 'slash',
            label: '砍价',
            actionText: slashNo ? '查看详情' : '去我的砍价',
            targetNo: slashNo,
            disabled: false
        };
    }

    return null;
}

Page({
    data: {
        orders: [],
        currentStatus: '',
        loading: false,
        hasMore: true,
        page: 1,
        limit: 10
    },

    onLoad(options) {
        let status = options.status;
        if (!status && options.type === 'distribution') {
            status = 'all';
        }
        if (status === 'all') status = '';
        if (status) {
            // 只更新 status，不加载数据 — onShow 会紧接着触发并加载
            this.setData({ currentStatus: status });
        }
    },

    onShow() {
        const latestCreatedOrderHint = wx.getStorageSync('latestCreatedOrderHint');
        if (latestCreatedOrderHint) {
            wx.removeStorageSync('latestCreatedOrderHint');
            wx.showToast({ title: latestCreatedOrderHint, icon: 'none', duration: 2500 });
        }
        // 每次显示时刷新（从详情页/退款页返回后应看到最新状态）
        this.setData({ page: 1, hasMore: true }, () => {
            this.loadOrders();
        });
    },

    onUnload() {
        if (this._listCountdownTimer) clearInterval(this._listCountdownTimer);
    },

    onPullDownRefresh() {
        this.setData({ page: 1, hasMore: true });
        this.loadOrders().then(() => {
            wx.stopPullDownRefresh();
        });
    },

    // ★ 核心：加载订单 + 退款状态
    async loadOrders(append = false) {
        if (this.data.loading) return;

        this.setData({ loading: true });

        try {
            const { currentStatus, page, limit } = this.data;
            const params = { page, limit };

            if (currentStatus === 'refund') {
                await this._loadRefundOrders(append);
                return;
            }

            if (currentStatus) params.status = currentStatus;

            // 普通 Tab：只加载订单；退款角标数量通过 user.js 的 loadOrderCounts 已有，
            // 这里按需拉取活跃退款用于在列表中标注"退款中"状态
            const ordersRes = await get('/orders', params);

            let newOrders = ordersRes.data?.list || ordersRes.data || [];

            // 只有订单列表包含"已发货/已完成"状态时才需要查退款角标，
            // 避免在"待付款""待发货"等Tab造成无意义的额外请求
            let activeRefunds = [];
            const statusNeedsRefundCheck = !currentStatus || currentStatus === 'shipped' || currentStatus === 'completed' || currentStatus === 'pending_review';
            if (statusNeedsRefundCheck && newOrders.length > 0) {
                try {
                    // 只传 order_ids 过滤（若后端支持），否则限量拉取并在前端过滤
                    const refundsRes = await get('/refunds', { page: 1, limit: 20 }).catch(() => ({ data: { list: [] } }));
                    activeRefunds = (refundsRes.data?.list || [])
                        .filter(r => ['pending', 'approved', 'processing'].includes(r.status));
                } catch (_) { /* 退款状态查询失败不影响主列表 */ }
            }

            // 建立 order_id → refund 映射
            const refundMap = {};
            activeRefunds.forEach(r => {
                refundMap[r.order_id] = r;
            });

            // 处理每个订单
            newOrders = newOrders.map((rawOrder) => {
                const order = normalizeOrderConsumer(rawOrder);
                if (order.product && order.product.images) {
                    order.product.images = parseImages(order.product.images);
                }
                const quantity = Number(order.quantity || order.qty || 1);
                const unitPriceBase = order.total_amount != null ? order.total_amount : order.pay_amount;
                order.price = order.price || order.unit_price || Number((parseFloat(unitPriceBase || 0) / Math.max(quantity, 1)).toFixed(2));
                order.display_price = Number.isFinite(Number(order.price)) ? Number(order.price).toFixed(2) : order.display_total_amount;

                // ★ 待付款倒计时文字
                if (order.status === 'pending' || order.status === 'pending_payment') {
                    order.countdownText = this._calcCountdownText(order.expire_at, order.created_at, order.payment_timeout_minutes);
                }

                // ★ 检查该订单是否有活跃退款
                const activeRefund = refundMap[order.id];
                if (activeRefund) {
                    const normalizedRefund = normalizeRefundConsumer(activeRefund);
                    order.hasActiveRefund = true;
                    order.refundId = normalizedRefund.id;
                    order.refundStatus = normalizedRefund.status;
                    order.activeRefund = normalizedRefund;
                    order.display_status_text = normalizedRefund.display_status_text || '退款中';
                    order.display_status_desc = normalizedRefund.display_status_desc || order.display_status_desc;
                    order.display_refund_target_text = normalizedRefund.display_refund_target_text || order.display_refund_target_text;
                    order.displayStatus = 'refunding';
                } else {
                    order.hasActiveRefund = false;
                    order.displayStatus = order.status;
                }
                order.activityInfo = buildOrderActivityInfo(order);

                return order;
            });

            this._applyAnimAndSet(newOrders, append, newOrders.length >= limit);
        } catch (err) {
            ErrorHandler.handle(err, {
                customMessage: '加载订单失败，请稍后重试'
            });
            this.setData({ loading: false });
        }
    },

    // ★ 退款/售后 Tab 专用加载
    async _loadRefundOrders(append) {
        try {
            const { page, limit } = this.data;
            const res = await get('/refunds', { page, limit });
            const refundList = res.data?.list || [];

            // 将退款记录转换为类订单结构（便于复用同一个模板）
            const newOrders = refundList.map((rawRefund) => {
                const refund = normalizeRefundConsumer(rawRefund);
                const order = refund.order || {};
                if (order.product) {
                    order.product.images = parseImages(order.product.images); // ★ 统一使用 dataFormatter.parseImages
                }

                const item = {
                    ...order,
                    id: order.id,
                    hasActiveRefund: ['pending', 'approved', 'processing'].includes(refund.status),
                    refundId: refund.id,
                    refundStatus: refund.status,
                    activeRefund: refund,
                    display_status_text: refund.display_status_text,
                    display_status_desc: refund.display_status_desc,
                    displayStatus: 'refund_' + refund.status,
                    refundType: refund.type,
                    refundAmount: refund.amount,
                    display_refund_target_text: refund.display_refund_target_text,
                    display_payment_method_text: refund.display_payment_method_text
                };
                item.activityInfo = buildOrderActivityInfo(item);
                return item;
            });

            this._applyAnimAndSet(newOrders, append, refundList.length >= limit);
        } catch (err) {
            console.error('加载退款列表失败:', err);
            this.setData({ loading: false });
        }
    },

    /**
     * ★ 私有方法：添加入场动画标记并更新 data，动画结束后自动清除标记
     * @param {Array} orders - 订单/退款列表
     * @param {boolean} append - 是否追加（加载更多
     * @param {boolean} hasMore - 是否还有更多
     */
    _applyAnimAndSet(orders, append, hasMore) {
        const ordersWithAnim = orders.map(order => ({ ...order, animateIn: !append }));
        this.setData({
            orders: append ? [...this.data.orders, ...ordersWithAnim] : ordersWithAnim,
            hasMore,
            loading: false
        });
        if (!append) {
            setTimeout(() => {
                this.setData({
                    orders: this.data.orders.map(o => ({ ...o, animateIn: false }))
                });
            }, 800);
        }
        // 启动列表倒计时定时器
        this._startListCountdown();
    },

    // ── 列表倒计时相关 ──
    _calcCountdownText(expireAt, createdAt, timeoutMinutes) {
        const ORDER_TIMEOUT_MS = Math.max(1, Number(timeoutMinutes) || 30) * 60 * 1000;
        let targetTs = expireAt ? new Date(expireAt).getTime() : 0;
        if (!targetTs || isNaN(targetTs)) {
            const createdTs = createdAt ? new Date(createdAt).getTime() : 0;
            targetTs = createdTs > 0 ? createdTs + ORDER_TIMEOUT_MS : 0;
        }
        if (!targetTs) return '';
        const remainMs = targetTs - Date.now();
        if (remainMs <= 0) return '已超时';
        const totalSec = Math.ceil(remainMs / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        if (min > 0) return `${min}分${sec.toString().padStart(2, '0')}秒`;
        return `${sec}秒`;
    },

    _startListCountdown() {
        if (this._listCountdownTimer) clearInterval(this._listCountdownTimer);
        const hasPending = this.data.orders.some(o => o.status === 'pending' || o.status === 'pending_payment');
        if (!hasPending) return;
        this._listCountdownTimer = setInterval(() => {
            const orders = this.data.orders;
            let needUpdate = false;
            const updated = orders.map(o => {
                if (o.status !== 'pending' && o.status !== 'pending_payment') return o;
                const text = this._calcCountdownText(o.expire_at, o.created_at, o.payment_timeout_minutes);
                if (text !== o.countdownText) {
                    needUpdate = true;
                    return { ...o, countdownText: text };
                }
                return o;
            });
            if (needUpdate) this.setData({ orders: updated });
        }, 10000); // 列表每10秒刷新一次倒计时
    },

    _getRefundStatusText(status) {
        return getRefundStatusText(status) || '退款中';
    },

    // Tab切换
    onTabChange(e) {
        const status = e.currentTarget.dataset.status;
        this.setData({
            currentStatus: status,
            page: 1,
            hasMore: true,
            orders: []  // 清空旧数据，触发骨架屏
        }, () => {
            this.loadOrders();
        });
    },

    // 加载更多（先加载再自增page，防止失败时跳页）
    async onLoadMore() {
        if (!this.data.hasMore || this.data.loading) return;
        const nextPage = this.data.page + 1;
        this.setData({ page: nextPage });
        try {
            await this.loadOrders(true);
        } catch (_) {
            this.setData({ page: nextPage - 1 });
        }
    },

    // 订单点击
    onOrderTap(e) {
        const order = e.currentTarget.dataset.order;
        wx.navigateTo({ url: `/pages/order/detail?id=${order.id}` });
    },

    // 取消订单
    onCancelOrder(e) {
        const order = e.currentTarget.dataset.order;

        wx.showModal({
            title: '确认取消',
            content: '确定要取消该订单吗？',
            success: async (res) => {
                if (res.confirm) {
                    try {
                        await post(`/orders/${order.id}/cancel`);
                        wx.showToast({ title: '订单已取消', icon: 'success' });
                        this.loadOrders();
                    } catch (err) {
                        wx.showToast({ title: '取消失败', icon: 'none' });
                    }
                }
            }
        });
    },

    // 去付款
    onPayOrder(e) {
        const order = e.currentTarget.dataset.order;
        wx.navigateTo({ url: `/pages/order/detail?id=${order.id}` });
    },

    // 确认收货
    onConfirmReceive(e) {
        const order = e.currentTarget.dataset.order;

        wx.showModal({
            title: '确认收货',
            content: '确定已收到商品吗？',
            success: async (res) => {
                if (res.confirm) {
                    try {
                        await post(`/orders/${order.id}/confirm`);
                        wx.showToast({ title: '已确认收货', icon: 'success' });
                        this.loadOrders();
                    } catch (err) {
                        wx.showToast({ title: '操作失败', icon: 'none' });
                    }
                }
            }
        });
    },

    // 去评价（与详情页一致：已发货/已完成均可提交，以服务端校验为准）
    onGoReview(e) {
        const order = e.currentTarget.dataset.order;
        if (!order?.id) return;
        const pid = order.product_id || (order.product && order.product.id) || '';
        wx.navigateTo({
            url: `/pages/order/review?order_id=${order.id}&product_id=${pid}`
        });
    },

    // 查看物流
    onViewLogistics(e) {
        const order = e.currentTarget.dataset.order;
        if (order.tracking_no) {
            wx.navigateTo({
                url: `/pages/logistics/tracking?order_id=${order.id}`
            });
        } else {
            wx.showToast({ title: '暂无物流信息', icon: 'none' });
        }
    },

    // ★ 申请退款（从列表页直接操作）
    onApplyRefund(e) {
        const order = e.currentTarget.dataset.order;
        wx.navigateTo({
            url: `/pages/order/refund-apply?order_id=${order.id}`
        });
    },

    // ★ 查看退款详情
    onViewRefund(e) {
        const order = e.currentTarget.dataset.order;
        if (order.refundId) {
            wx.navigateTo({
                url: `/pages/order/refund-detail?id=${order.refundId}`
            });
        }
    },

    async onViewActivity(e) {
        const order = e.currentTarget.dataset.order || {};
        const activity = order.activityInfo || buildOrderActivityInfo(order);
        if (!activity) return;
        if (activity.type === 'group') {
            if (!activity.targetNo) {
                const isPaid = order.status && order.status !== 'pending' && order.status !== 'pending_payment' && order.status !== 'cancelled';
                if (isPaid) {
                    const orderId = order.id || order._id || order.order_no;
                    wx.showLoading({ title: '正在获取拼团...' });
                    try {
                        const res = await post(`/orders/${encodeURIComponent(orderId)}/retry-group-join`);
                        wx.hideLoading();
                        const groupNo = res && res.data && res.data.group_no;
                        if (groupNo) {
                            wx.navigateTo({ url: `/pages/group/detail?group_no=${groupNo}` });
                            return;
                        }
                    } catch (_) {
                        wx.hideLoading();
                    }
                    wx.navigateTo({ url: `/pages/order/detail?id=${orderId}` });
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
    },

    // 再次购买
    onBuyAgain(e) {
        const order = e.currentTarget.dataset.order;
        if (order.product_id) {
            wx.navigateTo({ url: `/pages/product/detail?id=${order.product_id}` });
        } else if (order.product && order.product.id) {
            wx.navigateTo({ url: `/pages/product/detail?id=${order.product.id}` });
        } else {
            wx.switchTab({ url: '/pages/index/index' });
        }
    }
});
