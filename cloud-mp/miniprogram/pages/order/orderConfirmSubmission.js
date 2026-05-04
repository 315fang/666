const { get, post } = require('../../utils/request');
const { ErrorHandler } = require('../../utils/errorHandler');
const { ensureLogin } = require('../../utils/auth');
const { ensurePrivacyAuthorization } = require('../../utils/privacy');
const { normalizeLimitedSpotPayload } = require('../../utils/limitedSpot');
const { promptPortalPassword } = require('../../utils/portalPassword');
const { markCartChanged } = require('../../utils/cartState');
const { resolvePickupStationId } = require('./utils/pickupStation');

function resolveSubmitOrderMessage(error) {
    if (error && error.message
        && error.message !== 'Internal server error'
        && error.message !== '操作失败'
        && error.message !== '云函数调用失败') {
        return error.message;
    }
    return '下单失败，请稍后重试';
}

function syncPaidOrderPostProcess(orderId) {
    if (!orderId) return Promise.resolve(null);
    return post(`/orders/${orderId}/sync-wechat-pay`, {}, {
        showError: false,
        maxRetries: 0,
        timeout: 12000
    }).catch((err) => {
        console.warn('[OrderConfirm] 货款支付后处理同步失败:', err && (err.message || err.errMsg) || err);
        return null;
    });
}

async function submitOrder(page, app, brandAnimation) {
    const {
        address,
        orderItems,
        remark,
        submitting,
        selectedCoupon,
        deliveryType,
        pickupStation,
        exchangeMode,
        exchangeCouponId,
        limitedSpotOrder,
        limitedSpotSource,
        limitedSpotPayload,
        bundleOrder,
        bundleMeta
    } = page.data;

    if (submitting) return;

    if (deliveryType === 'express' && !address) {
        wx.showToast({ title: '请选择收货地址', icon: 'none' });
        return;
    }
    const pickupStationId = deliveryType === 'pickup' ? resolvePickupStationId(pickupStation) : '';
    if (deliveryType === 'pickup' && !pickupStationId) {
        wx.showToast({ title: '请选择自提门店', icon: 'none' });
        return;
    }
    if (deliveryType === 'pickup' && pickupStation && pickupStation.selectable === false) {
        wx.showToast({ title: '所选门店当前无货，请重新选择', icon: 'none' });
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

    const normalizedLimitedSpotPayload = limitedSpotOrder
        ? normalizeLimitedSpotPayload(limitedSpotPayload)
        : null;
    if (limitedSpotOrder && !normalizedLimitedSpotPayload) {
        wx.showToast({ title: '限时商品信息已失效，请返回活动页重新下单', icon: 'none' });
        return;
    }

    try {
        await ensurePrivacyAuthorization();
        await ensureLogin();
    } catch (_err) {
        return;
    }

    page.setData({ submitting: true });

    try {
        const addressId = address && (address._id || address.id);
        const orderData = {
            address_id: deliveryType === 'pickup' ? addressId || undefined : addressId,
            delivery_type: deliveryType,
            pickup_station_id: deliveryType === 'pickup' ? pickupStationId : undefined,
            memo: remark,
            remark,
            items: orderItems.map((item) => ({
                product_id: item.product_id,
                sku_id: item.sku_id || null,
                quantity: item.quantity,
                cart_id: item.cart_id || null
            }))
        };
        if (bundleOrder && bundleMeta && bundleMeta.id) {
            orderData.bundle_context = {
                bundle_id: bundleMeta.id,
                selected_items: orderItems.map((item) => ({
                    group_key: item.bundle_group_key || '',
                    product_id: item.product_id,
                    sku_id: item.sku_id || '',
                    quantity: item.quantity
                }))
            };
        }
        console.log('[order submit] payload items:', JSON.stringify(orderData.items));

        if (page.data.slashNo) orderData.slash_no = page.data.slashNo;
        if (page.data.groupNo) orderData.group_no = page.data.groupNo;
        if (page.data.groupActivityId) orderData.group_activity_id = page.data.groupActivityId;
        if (page.data.orderType) orderData.type = page.data.orderType;
        if (!exchangeMode && page.data.allowCoupon !== false && selectedCoupon) {
            orderData.user_coupon_id = selectedCoupon._id != null ? selectedCoupon._id : selectedCoupon.id;
        }
        if (!exchangeMode && page.data.allowPoints !== false && page.data.usePoints && page.data.pointsToUse > 0) {
            orderData.points_to_use = page.data.pointsToUse;
        }

        // 代理商选择货款支付：直接在创单时扣款，无需跳支付页
        const useGoodsFund = !!(!exchangeMode && !bundleOrder && page.data.useWallet && page.data.isAgent);
        if (useGoodsFund) {
            const portalPassword = await promptPortalPassword({
                title: '货款支付验证',
                placeholderText: '请输入6位数字业务密码'
            });
            if (!portalPassword) {
                page.setData({ submitting: false });
                return;
            }
            orderData.use_goods_fund = true;
            orderData.portal_password = portalPassword;
        }
        // 清除旧的 localStorage，货款支付不再依赖它做预支付跳转
        wx.removeStorageSync('useWalletPay');
        wx.removeStorageSync('walletPayOrderIds');

        if (exchangeMode) {
            orderData.exchange_coupon_id = exchangeCouponId;
        }
        if (limitedSpotOrder && normalizedLimitedSpotPayload) {
            const activitySource = limitedSpotSource || normalizedLimitedSpotPayload.source || 'limited_sale';
            if (activitySource === 'limited_spot') {
                orderData.limited_spot = {
                    card_id: normalizedLimitedSpotPayload.card_id,
                    offer_id: normalizedLimitedSpotPayload.offer_id,
                    mode: normalizedLimitedSpotPayload.mode,
                    redeem_points: normalizedLimitedSpotPayload.redeem_points
                };
            } else {
                orderData.limited_sale = {
                    slot_id: normalizedLimitedSpotPayload.slot_id,
                    item_id: normalizedLimitedSpotPayload.item_id,
                    mode: normalizedLimitedSpotPayload.mode,
                    redeem_points: normalizedLimitedSpotPayload.redeem_points
                };
            }
        }
        const res = await post(exchangeMode ? '/orders/exchange' : '/orders', orderData, { showError: false });

        if (page.data.from === 'direct') {
            wx.removeStorageSync('directBuyInfo');
        } else {
            markCartChanged('order_submit_cart');
        }

        const createdOrders = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
        const orderId = createdOrders[0] && (createdOrders[0].id || createdOrders[0].order_id);
        if (exchangeMode && orderId) {
            await post(`/orders/${orderId}/prepay`, {}, { showError: false });
            wx.removeStorageSync('activeExchangeCoupon');
        }
        const goodsFundPaid = !!(createdOrders[0] && createdOrders[0].goods_fund_paid);
        const paidOrderSync = goodsFundPaid && orderId
            ? syncPaidOrderPostProcess(orderId)
            : Promise.resolve(null);
        const isSplitOrders = createdOrders.length > 1;

        if (goodsFundPaid) {
            wx.showToast({ title: '货款支付成功', icon: 'success' });
        }
        if (isSplitOrders) {
            wx.setStorageSync('latestCreatedOrderIds', createdOrders.map((item) => item.id || item.order_id).filter(Boolean));
            wx.setStorageSync('latestCreatedOrderHint', `已创建 ${createdOrders.length} 个待支付订单，请在订单列表中逐个完成支付`);
        }

        const isGroupOrder = !!(page.data.groupActivityId || page.data.groupNo);
        const createdGroupNo = createdOrders[0] && createdOrders[0].group_no;

        if (brandAnimation) {
            brandAnimation.show('success');
        }

        setTimeout(async () => {
            page.setData({ submitting: false });

            if (goodsFundPaid && orderId) {
                await paidOrderSync;
            }

            // 货款支付的拼团订单：尝试获取 group_no 再跳转
            if (goodsFundPaid && isGroupOrder) {
                let groupNo = createdGroupNo;
                if (!groupNo && orderId) {
                    try {
                        const orderRes = await get(`/orders/${orderId}`, {}, { showError: false, maxRetries: 1, timeout: 5000 });
                        groupNo = orderRes && orderRes.data && orderRes.data.group_no;
                    } catch (_) {}
                }
                if (groupNo) {
                    wx.redirectTo({ url: `/pages/group/detail?group_no=${groupNo}` });
                    return;
                }
            }

            // 非货款支付的拼团订单：跳到订单详情，轮询会自动跳转拼团页
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
