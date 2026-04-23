// pages/order/refund-apply.js - 申请退货/退款
const { get, post } = require('../../utils/request');
const { parseImages } = require('../../utils/dataFormatter');
const { resolveCloudImageList, resolveCloudImageUrl } = require('./utils/cloudAsset');
const { normalizeOrderConsumer } = require('./orderConsumerFields');

function roundMoney(value) {
    const num = Number(value || 0);
    return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0;
}

function calculateRefundAmountByItem(item, selectedQuantity) {
    const quantity = Math.max(1, Number(item.quantity || item.qty || 1));
    const refundableQuantity = Math.max(0, Number(item.refundable_quantity || 0));
    const refundableCashAmount = roundMoney(item.refundable_cash_amount || 0);
    if (selectedQuantity <= 0 || refundableQuantity <= 0 || refundableCashAmount <= 0) return 0;
    if (selectedQuantity >= refundableQuantity) return refundableCashAmount;
    return roundMoney(Number(item.cash_paid_allocated_amount || 0) * (selectedQuantity / quantity));
}

function buildRefundSelections(order, type) {
    const items = Array.isArray(order && order.items) ? order.items : [];
    const singleLine = items.length === 1 ? items[0] : null;
    const bundleLocked = !!(order && (order.bundle_id || order.bundle_meta));
    return items.map((item) => {
        const refundableQuantity = Math.max(0, Number(item.refundable_quantity || 0));
        const defaultQuantity = bundleLocked ? refundableQuantity : (singleLine ? refundableQuantity : 0);
        return {
            ...item,
            selectedQuantity: defaultQuantity,
            refundAmount: calculateRefundAmountByItem(item, defaultQuantity),
            disabled: refundableQuantity <= 0,
            bundleLocked
        };
    });
}

function calculateRefundAmount(order, refundItems = []) {
    if (!order) return '0.00';
    const total = refundItems.reduce((sum, item) => sum + calculateRefundAmountByItem(item, item.selectedQuantity), 0);
    return roundMoney(total).toFixed(2);
}

function buildRefundItemsPayload(refundItems = []) {
    return refundItems
        .filter((item) => Number(item.selectedQuantity || 0) > 0)
        .map((item) => ({
            refund_item_key: item.refund_item_key,
            product_id: item.product_id,
            sku_id: item.sku_id || '',
            quantity: Number(item.selectedQuantity || 0)
        }));
}

Page({
    data: {
        orderId: null,
        order: null,
        refundItems: [],
        type: 'refund_only', // refund_only / return_refund
        reason: '',
        description: '',
        amount: '',
        reasons: [
            { value: 'quality', label: '商品质量问题' },
            { value: 'wrong_item', label: '商品与描述不符' },
            { value: 'not_needed', label: '不想要了/买多了' },
            { value: 'damaged', label: '商品破损/缺件' },
            { value: 'other', label: '其他原因' }
        ],
        reasonIndex: -1,
        submitting: false,
        bundleOrder: false
    },

    onLoad(options) {
        if (options.order_id) {
            this.setData({ orderId: options.order_id });
            this.loadOrder(options.order_id);
        }
        if (options.type) {
            this.setData({ type: options.type });
        }
    },

    async loadOrder(id) {
        try {
            const res = await get(`/orders/${id}`);
            const order = res.data;
            if (order && order.product) {
                order.product.images = await resolveCloudImageList(
                    order.product.images,
                    parseImages(order.product.images)
                );
                order.product.image = await resolveCloudImageUrl(
                    order.product.image || order.product.image_url || '',
                    order.product.images
                );
            }
            const normalizedOrder = normalizeOrderConsumer(order);
            if (normalizedOrder && Array.isArray(normalizedOrder.items) && normalizedOrder.items.length > 0) {
                normalizedOrder.items = await Promise.all(normalizedOrder.items.map(async (item) => {
                    const product = item.product && typeof item.product === 'object' ? { ...item.product } : null;
                    if (product) {
                        product.images = await resolveCloudImageList(
                            product.images,
                            parseImages(product.images)
                        );
                        product.image = await resolveCloudImageUrl(
                            product.image || '',
                            product.images
                        );
                    }
                    return {
                        ...item,
                        product
                    };
                }));
            }
            const refundItems = buildRefundSelections(normalizedOrder, this.data.type);
            this.setData({
                order: normalizedOrder,
                refundItems,
                bundleOrder: !!(normalizedOrder.bundle_id || normalizedOrder.bundle_meta),
                amount: calculateRefundAmount(normalizedOrder, refundItems)
            });
        } catch (err) {
            wx.showToast({ title: '加载订单失败', icon: 'none' });
        }
    },

    syncRefundAmount(nextState = {}) {
        const order = nextState.order || this.data.order;
        const refundItems = nextState.refundItems || this.data.refundItems;
        return {
            amount: calculateRefundAmount(order, refundItems)
        };
    },

    onTypeChange(e) {
        const type = e.detail.value;
        const nextState = {
            type,
            refundItems: buildRefundSelections(this.data.order, type)
        };
        this.setData({
            ...nextState,
            ...this.syncRefundAmount(nextState)
        });
    },

    onReasonChange(e) {
        const index = parseInt(e.detail.value);
        this.setData({
            reasonIndex: index,
            reason: this.data.reasons[index].value
        });
    },

    onDescInput(e) {
        this.setData({ description: e.detail.value });
    },

    updateRefundItemQuantity(index, nextQuantity) {
        if (this.data.bundleOrder) return;
        const refundItems = (this.data.refundItems || []).slice();
        const current = refundItems[index];
        if (!current) return;
        const maxQty = Math.max(0, Number(current.refundable_quantity || 0));
        let qty = Number(nextQuantity || 0);
        if (qty < 0) qty = 0;
        if (qty > maxQty) qty = maxQty;
        refundItems[index] = {
            ...current,
            selectedQuantity: qty,
            refundAmount: calculateRefundAmountByItem(current, qty)
        };
        this.setData({
            refundItems,
            ...this.syncRefundAmount({ refundItems })
        });
    },

    onRefundQtyInput(e) {
        if (this.data.bundleOrder) return;
        const index = Number(e.currentTarget.dataset.index);
        this.updateRefundItemQuantity(index, parseInt(e.detail.value) || 0);
    },

    onRefundQtyMinus(e) {
        if (this.data.bundleOrder) return;
        const index = Number(e.currentTarget.dataset.index);
        const current = this.data.refundItems[index];
        if (!current) return;
        this.updateRefundItemQuantity(index, Number(current.selectedQuantity || 0) - 1);
    },

    onRefundQtyPlus(e) {
        if (this.data.bundleOrder) return;
        const index = Number(e.currentTarget.dataset.index);
        const current = this.data.refundItems[index];
        if (!current) return;
        this.updateRefundItemQuantity(index, Number(current.selectedQuantity || 0) + 1);
    },

    async onSubmit() {
        const { orderId, type, reason, description, amount, refundItems, submitting } = this.data;

        if (submitting) return;

        if (!reason) {
            wx.showToast({ title: '请选择退款原因', icon: 'none' });
            return;
        }

        const refundAmount = parseFloat(amount);
        if (!refundAmount || refundAmount <= 0) {
            wx.showToast({ title: '请选择要退款的商品', icon: 'none' });
            return;
        }

        const refundItemsPayload = buildRefundItemsPayload(refundItems);

        if (!refundItemsPayload.length) {
            wx.showToast({ title: '请选择要退款的商品', icon: 'none' });
            return;
        }

        this.setData({ submitting: true });

        try {
            const params = {
                order_id: orderId,
                type,
                reason,
                description,
                refund_items: refundItemsPayload
            };
            params.refund_quantity = refundItemsPayload.reduce((sum, item) => sum + item.quantity, 0);

            const res = await post('/refunds', params);

            if (res.code === 0) {
                wx.showToast({ title: '申请已提交', icon: 'success' });
                // ★ 跳转到退款详情页，而非返回旧页面
                const refundId = res.data?.id || res.data?.refund_id;
                setTimeout(() => {
                    if (refundId) {
                        wx.redirectTo({
                            url: `/pages/order/refund-detail?id=${refundId}`
                        });
                    } else {
                        wx.navigateBack();
                    }
                }, 1500);
            } else {
                wx.showToast({ title: res.message || '申请失败', icon: 'none' });
            }
        } catch (err) {
            wx.showToast({ title: err.message || '申请失败', icon: 'none' });
        } finally {
            this.setData({ submitting: false });
        }
    }
});
