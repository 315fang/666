const { post } = require('../../utils/request');
const { getConfigSection } = require('../../utils/miniProgramConfig');

function onConfirmReceive(page) {
    const { order } = page.data;

    wx.showModal({
        title: '确认收货',
        content: '确认已收到商品？确认后订单将完成。',
        success: async (res) => {
            if (res.confirm) {
                try {
                    const confirmRes = await post(`/orders/${order.id}/confirm`);
                    if (confirmRes.code === 0) {
                        wx.showToast({ title: '已确认收货', icon: 'success' });
                        page.loadOrder(order.id);
                    } else {
                        wx.showToast({ title: confirmRes.message || '确认收货失败', icon: 'none' });
                    }
                } catch (err) {
                    wx.showToast({ title: '操作失败', icon: 'none' });
                }
            }
        }
    });
}

function onCancelOrder(page) {
    const { order } = page.data;

    wx.showModal({
        title: '取消订单',
        content: '确定要取消该订单吗？',
        success: async (res) => {
            if (res.confirm) {
                try {
                    await post(`/orders/${order.id}/cancel`);
                    wx.showToast({ title: '订单已取消', icon: 'success' });
                    page.loadOrder(order.id);
                } catch (err) {
                    wx.showToast({ title: '取消失败', icon: 'none' });
                }
            }
        }
    });
}

function onApplyRefund(page) {
    const { order } = page.data;
    wx.navigateTo({
        url: `/pages/order/refund-apply?order_id=${order.id}`
    });
}

function onViewRefund(page) {
    const { activeRefund, latestRefund } = page.data;
    const refund = activeRefund || latestRefund;
    if (refund) {
        wx.navigateTo({
            url: `/pages/order/refund-detail?id=${refund.id}`
        });
    }
}

function onViewLogistics(page) {
    const { order } = page.data;
    const logisticsConfig = getConfigSection('logistics_config');
    if (!page.data.canViewLogistics) {
        wx.showToast({ title: logisticsConfig.manual_status_desc || '暂不支持物流查询', icon: 'none' });
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
}

function onGoReview(page) {
    const { order } = page.data;
    wx.navigateTo({
        url: `/pages/order/review?order_id=${order.id}&product_id=${order.product_id || (order.product && order.product.id) || ''}`
    });
}

function onCopyTrackingNo(page) {
    const { order } = page.data;
    if (order.tracking_no) {
        wx.setClipboardData({
            data: order.tracking_no,
            success: () => {
                const commonCopy = getConfigSection('common_copy');
                if (page.brandAnimation) {
                    page.brandAnimation.showCopySuccess(commonCopy.copy_success_text || '单号已复制');
                } else {
                    wx.showToast({ title: commonCopy.copy_success_text || '单号已复制', icon: 'success' });
                }
            }
        });
    }
}

function onPickupCredentialTap(page) {
    const id = page.data.order && page.data.order.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/order/pickup-credential?id=${id}` });
}

module.exports = {
    onConfirmReceive,
    onCancelOrder,
    onApplyRefund,
    onViewRefund,
    onViewLogistics,
    onGoReview,
    onCopyTrackingNo,
    onPickupCredentialTap
};
