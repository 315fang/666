const { post } = require('../../utils/request');
const { ErrorHandler } = require('../../utils/errorHandler');
const { ensurePrivacyAuthorization } = require('../../utils/privacy');

function resolveSubmitOrderMessage(error) {
    const code = error && (error.code || error.statusCode);
    if (code >= 400 && code < 500 && error && error.message) {
        return error.message;
    }
    return '下单失败，请稍后重试';
}

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
        if (selectedCoupon) {
            orderData.user_coupon_id = selectedCoupon._id != null ? selectedCoupon._id : selectedCoupon.id;
        }
        if (page.data.usePoints && page.data.pointsToUse > 0) {
            orderData.points_to_use = page.data.pointsToUse;
        }

        // 代理商选择货款支付：直接在创单时扣款，无需跳支付页
        const useGoodsFund = !!(page.data.useWallet && page.data.isAgent);
        if (useGoodsFund) {
            orderData.use_goods_fund = true;
        }
        // 清除旧的 localStorage，货款支付不再依赖它做预支付跳转
        wx.removeStorageSync('useWalletPay');
        wx.removeStorageSync('walletPayOrderIds');

        const res = await post('/orders', orderData, { showError: false });

        if (page.data.from === 'direct') {
            wx.removeStorageSync('directBuyInfo');
        }

        const createdOrders = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
        const orderId = createdOrders[0] && (createdOrders[0].id || createdOrders[0].order_id);
        const goodsFundPaid = !!(createdOrders[0] && createdOrders[0].goods_fund_paid);
        const isSplitOrders = createdOrders.length > 1;

        if (goodsFundPaid) {
            wx.showToast({ title: '货款支付成功', icon: 'success' });
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
            if (isSplitOrders) {
                wx.redirectTo({ url: '/pages/order/list?status=pending' });
            } else if (orderId) {
                wx.redirectTo({ url: `/pages/order/detail?id=${orderId}` });
            } else {
                wx.redirectTo({ url: '/pages/order/list?status=pending' });
            }
        }, 1500);
    } catch (err) {
        page.setData({ submitting: false });
        ErrorHandler.handle(err, {
            customMessage: resolveSubmitOrderMessage(err)
        });
        console.error('提交订单失败:', err);
    }
}

module.exports = {
    submitOrder
};
