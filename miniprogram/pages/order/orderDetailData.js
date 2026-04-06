const { get, post } = require('../../utils/request');
const { parseImages } = require('../../utils/dataFormatter');
const { logisticsCompanyLabel } = require('../../utils/logisticsCompany');

async function loadOrder(page, idOrNo) {
    if (idOrNo === undefined || idOrNo === null || idOrNo === '') {
        page.setData({ loading: false, loadError: true });
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
        if (order) {
            order.logistics_company_label = logisticsCompanyLabel(order.logistics_company);
        }

        const allRefunds = refundsRes.data && refundsRes.data.list || [];
        const activeRefund = allRefunds.find(
            (refund) => refund.order_id === order.id && ['pending', 'approved', 'processing'].includes(refund.status)
        );
        const latestRefund = allRefunds.find((refund) => refund.order_id === order.id);

        page.setData({
            order,
            orderId: order.id,
            loading: false,
            loadError: false,
            activeRefund: activeRefund || null,
            hasActiveRefund: !!activeRefund,
            latestRefund: latestRefund || null,
            reviewed: !!(order && (order.reviewed || (order.remark && order.remark.includes('[已评价]'))))
        });

        page.showOrderBubble(order);

        if (order && order.status === 'pending') {
            page._maybeSyncWechatPayAfterLoad(order.id);
        }
    } catch (err) {
        console.error('加载订单失败:', err);
        page.setData({ loading: false, loadError: true });
    }
}

function maybeSyncWechatPayAfterLoad(page, orderId) {
    page._pendingPaySyncTs = page._pendingPaySyncTs || {};
    const now = Date.now();
    if (now - (page._pendingPaySyncTs[orderId] || 0) < 25000) return;
    page._pendingPaySyncTs[orderId] = now;
    post(`/orders/${orderId}/sync-wechat-pay`, {}, { showError: false, maxRetries: 0, timeout: 12000 })
        .then((result) => {
            if (result && result.code === 0 && result.data && result.data.synced) {
                page.loadOrder(orderId);
            }
        })
        .catch(() => {});
}

module.exports = {
    loadOrder,
    maybeSyncWechatPayAfterLoad
};
