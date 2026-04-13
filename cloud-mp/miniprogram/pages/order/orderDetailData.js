const { get, post } = require('../../utils/request');
const { parseImages } = require('../../utils/dataFormatter');
const { logisticsCompanyLabel } = require('./utils/logisticsCompany');

function toMoney(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(2) : '0.00';
}

function buildOrderActivityInfo(order = {}) {
    const firstItem = Array.isArray(order.items) ? (order.items[0] || {}) : {};
    const type = order.type || order.order_type || firstItem.activity_type || '';
    const groupNo = order.group_no || firstItem.group_no || '';
    const slashNo = order.slash_no || firstItem.slash_no || '';

    if (type === 'group' || groupNo || order.group_activity_id || firstItem.group_activity_id) {
        const isPaid = order.status && order.status !== 'pending' && order.status !== 'cancelled';
        let title, desc, actionText, disabled;
        if (groupNo && order.status === 'cancelled') {
            title = '订单已取消';
            desc = '该订单已取消，但当前拼团状态可能仍在继续，可进入拼团页查看当前团状态。';
            actionText = '查看当前团状态';
            disabled = false;
        } else if (groupNo) {
            title = '可查看拼团进度';
            desc = '支付后已生成拼团进度，可继续邀请或查看成团状态。';
            actionText = '查看拼团进度';
            disabled = false;
        } else if (isPaid) {
            title = '拼团进度生成中';
            desc = '支付已完成，拼团进度正在生成，请稍后刷新查看。';
            actionText = '刷新查看';
            disabled = false;
        } else {
            title = '拼团进度待生成';
            desc = '完成支付后会生成拼团进度，可从订单或我的拼团继续查看。';
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
            title: slashNo ? '可查看砍价详情' : '去我的砍价继续查看',
            desc: slashNo ? '该订单已关联你的砍价记录，可返回查看砍价进度和购买状态。' : '订单还没带回砍价编号时，也可以先去“我的砍价”继续查看当前进度。',
            actionText: slashNo ? '查看砍价详情' : '去我的砍价',
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
        const order = orderRes.data;

        const refundsRes = await get('/refunds', { page: 1, limit: 100, order_id: order.id }).catch(() => ({
            data: { list: [] }
        }));

        if (order && order.product) {
            order.product.images = parseImages(order.product.images);
        }
        if (order) {
            order.logistics_company = order.logistics_company || order.shipping_company || '';
            order.logistics_company_label = logisticsCompanyLabel(order.logistics_company);
            const originalAmount = Number(order.original_amount != null ? order.original_amount : order.total_amount);
            const couponDiscount = Number(order.coupon_discount || 0);
            const pointsDiscount = Number(order.points_discount || 0);
            const payAmount = Number(order.pay_amount != null ? order.pay_amount : (order.actual_price != null ? order.actual_price : order.total_amount));
            order.display_original_amount = toMoney(originalAmount);
            order.display_coupon_discount = toMoney(couponDiscount);
            order.display_points_discount = toMoney(pointsDiscount);
            order.display_pay_amount = toMoney(payAmount);
            order.has_discount_breakdown = couponDiscount > 0 || pointsDiscount > 0 || Math.abs(originalAmount - payAmount) > 0.0001;
            order.activityInfo = buildOrderActivityInfo(order);
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
