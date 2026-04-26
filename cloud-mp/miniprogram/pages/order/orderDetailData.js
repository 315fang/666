const { get, post } = require('../../utils/request');
const { logisticsCompanyLabel } = require('./utils/logisticsCompany');
const { normalizeOrderConsumer, normalizeRefundConsumer, toMoney } = require('./orderConsumerFields');
const { resolveOrderImageFields } = require('./orderImageResolver');

const PAID_ORDER_POST_PROCESS_STATUSES = new Set([
    'paid',
    'pending_group',
    'pickup_pending',
    'agent_confirmed',
    'shipping_requested',
    'shipped',
    'completed'
]);

function shouldSyncPaidOrderPostProcess(order = {}) {
    const status = String(order.status || '').trim();
    return PAID_ORDER_POST_PROCESS_STATUSES.has(status);
}

function buildOrderActivityInfo(order = {}) {
    const firstItem = Array.isArray(order.items) ? (order.items[0] || {}) : {};
    const type = order.type || order.order_type || firstItem.activity_type || '';
    const groupNo = order.group_no || firstItem.group_no || '';
    const slashNo = order.slash_no || firstItem.slash_no || '';

    if (type === 'group' || groupNo || order.group_activity_id || firstItem.group_activity_id) {
        const isPaid = order.status && order.status !== 'pending' && order.status !== 'pending_payment' && order.status !== 'cancelled';
        let title, desc, actionText, disabled;
        if (groupNo && order.status === 'cancelled') {
            title = '订单已取消';
            desc = '订单已取消，拼团记录仍可查看。';
            actionText = '查看拼团';
            disabled = false;
        } else if (groupNo) {
            title = '可查看拼团进度';
            desc = '支付成功，可查看成团进度。';
            actionText = '查看拼团';
            disabled = false;
        } else if (isPaid) {
            title = '拼团记录生成中';
            desc = '支付成功，拼团记录正在生成，请稍后刷新。';
            actionText = '刷新';
            disabled = false;
        } else {
            title = '支付后可查看拼团';
            desc = '支付成功后会生成拼团记录。';
            actionText = '支付后查看';
            disabled = true;
        }
        return {
            type: 'group',
            label: '拼团订单',
            title, desc, actionText,
            targetNo: groupNo,
            disabled
        };
    }

    if (type === 'slash' || slashNo) {
        return {
            type: 'slash',
            label: '砍价订单',
            title: slashNo ? '可查看砍价详情' : '可前往我的砍价',
            desc: slashNo ? '该订单已关联砍价记录，可查看进度与下单状态。' : '可前往“我的砍价”查看相关记录。',
            actionText: slashNo ? '查看砍价' : '我的砍价',
            targetNo: slashNo,
            disabled: false
        };
    }

    return null;
}

async function loadOrder(page, idOrNo) {
    if (idOrNo === undefined || idOrNo === null || idOrNo === '') {
        page.setData({ loading: false, loadError: true });
        return;
    }
    try {
        const pathKey = encodeURIComponent(String(idOrNo));
        const orderRes = await get(`/orders/${pathKey}`);
        const rawOrder = orderRes.data;
        const order = await resolveOrderImageFields(normalizeOrderConsumer(rawOrder));

        const refundsRes = await get('/refunds', { page: 1, limit: 100, order_id: order.id }).catch(() => ({
            data: { list: [] }
        }));

        if (order) {
            order.logistics_company = order.logistics_company || order.shipping_company || '';
            order.logistics_company_label = logisticsCompanyLabel(order.logistics_company);
            const originalAmount = Number(order.original_amount != null ? order.original_amount : order.total_amount);
            const couponDiscount = Number(order.coupon_discount || 0);
            const pointsDiscount = Number(order.points_discount || 0);
            const bundleDiscount = Number(order.bundle_discount || 0);
            const payAmount = Number(order.pay_amount != null ? order.pay_amount : order.total_amount);
            order.display_original_amount = toMoney(originalAmount);
            order.display_coupon_discount = toMoney(couponDiscount);
            order.display_points_discount = toMoney(pointsDiscount);
            order.display_bundle_discount = toMoney(bundleDiscount);
            order.display_pay_amount = toMoney(payAmount);
            order.has_discount_breakdown = bundleDiscount > 0 || couponDiscount > 0 || pointsDiscount > 0 || Math.abs(originalAmount - payAmount) > 0.0001;
            order.activityInfo = buildOrderActivityInfo(order);
        }

        const allRefunds = ((refundsRes.data && refundsRes.data.list) || []).map(normalizeRefundConsumer);
        const activeRefund = allRefunds.find((refund) => {
            if (String(refund.order_id) !== String(order.id)) return false;
            if (['pending', 'approved', 'processing'].includes(refund.status)) return true;
            return order.status === 'refunding' && refund.status === 'failed';
        });
        const latestRefund = allRefunds.find((refund) => String(refund.order_id) === String(order.id));

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

        if (order && shouldSyncPaidOrderPostProcess(order)) {
            page._maybeSyncWechatPayAfterLoad(order.id);
        }

        if (order && (order.status === 'pending' || order.status === 'pending_payment')) {
            page._maybeSyncWechatPayAfterLoad(order.id);
            // 启动支付倒计时
            const expireAt = order.expire_at || '';
            const timeoutMinutes = order.payment_timeout_minutes || 30;
            if (expireAt && typeof page.startPayCountdown === 'function') {
                page.startPayCountdown(expireAt, timeoutMinutes);
            } else if (!expireAt && typeof page.startPayCountdown === 'function') {
                // 兼容旧数据无 expire_at，用后端下发的超时分钟数推算
                const createdTs = order.created_at ? new Date(order.created_at).getTime() : Date.now();
                const fallbackExpire = new Date(createdTs + Math.max(1, Number(timeoutMinutes) || 30) * 60 * 1000).toISOString();
                page.startPayCountdown(fallbackExpire, timeoutMinutes);
            }
        } else {
            // 非待付款状态清除倒计时
            if (typeof page.startPayCountdown === 'function') {
                page.startPayCountdown(null);
            }
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
            const data = result && result.data;
            if (result && result.code === 0 && data && (data.synced || (data.post_process_retried && data.post_processed))) {
                page.loadOrder(orderId);
            }
        })
        .catch(() => {});
}

module.exports = {
    loadOrder,
    maybeSyncWechatPayAfterLoad
};
