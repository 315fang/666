const { post } = require('../../utils/request');
const { ErrorHandler } = require('../../utils/errorHandler');
const { ensurePrivacyAuthorization } = require('../../utils/privacy');

async function submitOrder(page, app, brandAnimation) {
    const {
        address,
        orderItems,
        remark,
        submitting,
        selectedCoupon,
        deliveryType,
        pickupStation
    } = page.data;

    if (submitting) return;

    if (deliveryType === 'express' && !address) {
        wx.showToast({ title: '请选择收货地址', icon: 'none' });
        return;
    }
    if (deliveryType === 'pickup' && (!pickupStation || !pickupStation.id)) {
        wx.showToast({ title: '请选择自提门店', icon: 'none' });
        return;
    }
    if (orderItems.length === 0) {
        wx.showToast({ title: '没有可提交的商品', icon: 'none' });
        return;
    }
    if (orderItems.some((item) => item.spec_required_missing || (!item.sku_id && item.spec_required))) {
        wx.showToast({ title: '部分商品缺少规格，请返回重新选择', icon: 'none' });
        return;
    }

    try {
        await ensurePrivacyAuthorization();
        if (!app.globalData.isLoggedIn) {
            await app.wxLogin(false);
        }
    } catch (_err) {
        return;
    }

    page.setData({ submitting: true });

    try {
        const addressId = address && (address._id || address.id);
        const orderData = {
            address_id: deliveryType === 'pickup' ? addressId || undefined : addressId,
            delivery_type: deliveryType,
            pickup_station_id: deliveryType === 'pickup' ? pickupStation.id : undefined,
            memo: remark,
            remark,
            items: orderItems.map((item) => ({
                product_id: item.product_id,
                sku_id: item.sku_id || null,
                quantity: item.quantity,
                cart_id: item.cart_id || null
            }))
        };
        console.log('[order submit] payload items:', JSON.stringify(orderData.items));

        if (page.data.slashNo) orderData.slash_no = page.data.slashNo;
        if (page.data.groupNo) orderData.group_no = page.data.groupNo;
        if (page.data.groupActivityId) orderData.group_activity_id = page.data.groupActivityId;
        if (page.data.orderType) orderData.type = page.data.orderType;
        if (selectedCoupon) orderData.user_coupon_id = selectedCoupon.id != null ? selectedCoupon.id : selectedCoupon._id;
        if (page.data.usePoints && page.data.pointsToUse > 0) {
            orderData.points_to_use = page.data.pointsToUse;
        }

        // 货款支付
        const useGoodsFund = page.data.useGoodsFund && page.data.isAgent;
        if (useGoodsFund) {
            orderData.use_goods_fund = true;
        }

        if (page.data.useWallet && page.data.isAgent && !useGoodsFund) {
            wx.setStorageSync('useWalletPay', true);
        } else {
            wx.removeStorageSync('useWalletPay');
            wx.removeStorageSync('walletPayOrderIds');
        }

        const res = await post('/orders', orderData);

        if (page.data.from === 'direct') {
            wx.removeStorageSync('directBuyInfo');
        }

        const createdOrders = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
        const firstOrder = createdOrders[0] || {};
        const orderId = firstOrder.id || firstOrder.order_id || firstOrder._id;
        const isSplitOrders = createdOrders.length > 1;
        const goodsFundPaid = createdOrders.some((o) => o.goods_fund_paid);

        if (page.data.useWallet && page.data.isAgent && !useGoodsFund) {
            wx.setStorageSync('walletPayOrderIds', createdOrders.map((item) => item.id || item.order_id).filter(Boolean));
        }
        if (isSplitOrders) {
            wx.setStorageSync('latestCreatedOrderIds', createdOrders.map((item) => item.id || item.order_id).filter(Boolean));
            wx.setStorageSync('latestCreatedOrderHint', `已创建 ${createdOrders.length} 个待支付订单，请在订单列表中逐个完成支付`);
        }

        if (brandAnimation) {
            brandAnimation.show('success');
        }

        setTimeout(() => {
            page.setData({ submitting: false });
            if (goodsFundPaid) {
                // 货款支付已在服务端完成，直接跳到订单详情
                if (orderId) {
                    wx.redirectTo({ url: `/pages/order/detail?id=${orderId}&paid=1` });
                } else {
                    wx.redirectTo({ url: '/pages/order/list?status=paid' });
                }
            } else if (isSplitOrders) {
                wx.redirectTo({ url: '/pages/order/list?status=pending' });
            } else if (orderId) {
                wx.redirectTo({ url: `/pages/order/detail?id=${orderId}` });
            } else {
                wx.redirectTo({ url: '/pages/order/list?status=pending' });
            }
        }, 1500);
    } catch (err) {
        page.setData({ submitting: false });
        ErrorHandler.handle(err, { customMessage: '下单失败，请稍后重试' });
        console.error('提交订单失败:', err);
    }
}

module.exports = {
    submitOrder
};
