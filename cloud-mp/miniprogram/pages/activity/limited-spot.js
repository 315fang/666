// pages/activity/limited-spot.js — 限时活动专享商品（积分 / 现金）
const app = getApp();
const { get, post } = require('../../utils/request');
const { requireLogin } = require('../../utils/auth');

Page({
    data: {
        statusBarHeight: 20,
        navBarHeight: 44,
        cardId: '',
        card: null,
        products: [],
        loading: true,
        addressId: null,
        addressSummary: '',
        _submitting: false
    },

    onLoad(query) {
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navBarHeight: app.globalData.navBarHeight || 44,
            cardId: query.id || query.card_id || ''
        });
        if (!this.data.cardId) {
            wx.showToast({ title: '活动参数缺失', icon: 'none' });
            this.setData({ loading: false });
            return;
        }
        this.loadDetail();
    },

    onShow() {
        const pick = wx.getStorageSync('limited_spot_pick_address');
        if (pick && pick.id) {
            this.setData({
                addressId: pick.id,
                addressSummary: pick.summary || ''
            });
            wx.removeStorageSync('limited_spot_pick_address');
        } else if (app.globalData.isLoggedIn) {
            this.loadDefaultAddress();
        }
    },

    onBack() {
        wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/activity/activity' }) });
    },

    async loadDetail() {
        this.setData({ loading: true });
        try {
            const res = await get('/activity/limited-spot/detail', { card_id: this.data.cardId });
            if (res.code !== 0 || !res.data) {
                throw new Error(res.message || '加载失败');
            }
            this.setData({
                card: res.data.card,
                products: res.data.products || [],
                loading: false
            });
        } catch (e) {
            this.setData({ loading: false });
            wx.showToast({ title: e.message || '加载失败', icon: 'none' });
        }
    },

    async loadDefaultAddress() {
        try {
            const res = await get('/addresses');
            const list = res.data || res || [];
            if (!Array.isArray(list) || !list.length) return;
            const def = list.find((a) => a.is_default) || list[0];
            if (def) {
                this.setData({
                    addressId: def._id || def.id,
                    addressSummary: `${def.receiver_name} ${def.phone} ${def.province || ''}${def.city || ''}${def.district || ''}${def.detail || ''}`
                });
            }
        } catch (_) { /* ignore */ }
    },

    onChooseAddress() {
        if (!requireLogin()) return;
        wx.navigateTo({
            url: '/pages/address/list?from=limited_spot&select=true'
        });
    },

    _needAddress() {
        if (this.data.addressId) return true;
        wx.showToast({ title: '请先选择收货地址', icon: 'none' });
        return false;
    },

    async _afterCreateOrder(order) {
        const prepayRes = await post(`/orders/${order.id}/prepay`, {});
        if (prepayRes.code !== 0) {
            throw new Error(prepayRes.message || '预支付失败');
        }
        const payParams = prepayRes.data;
        if (payParams.paid_by_free || payParams.paid_by_wallet) {
            wx.showToast({ title: payParams.message || '支付完成', icon: 'success' });
            wx.redirectTo({ url: `/pages/order/detail?id=${order.id}` });
            return;
        }
        await new Promise((resolve, reject) => {
            wx.requestPayment({
                timeStamp: payParams.timeStamp,
                nonceStr: payParams.nonceStr,
                package: payParams.package,
                signType: payParams.signType || 'RSA',
                paySign: payParams.paySign,
                success: () => {
                    wx.showToast({ title: '支付成功', icon: 'success' });
                    resolve();
                },
                fail: (err) => {
                    if (err.errMsg && err.errMsg.includes('cancel')) {
                        wx.showToast({ title: '已取消支付', icon: 'none' });
                    } else {
                        wx.showToast({ title: '支付未完成', icon: 'none' });
                    }
                    reject(err);
                }
            });
        });
        wx.redirectTo({ url: `/pages/order/detail?id=${order.id}` });
    },

    _findOffer(offerId) {
        return (this.data.products || []).find((p) => String(p.offer_id) === String(offerId));
    },

    async onRedeemPoints(e) {
        const offer = this._findOffer(e.currentTarget.dataset.offerId);
        if (!offer || offer.remaining < 1 || this.data._submitting) return;
        if (!requireLogin()) return;
        if (!this._needAddress()) return;
        wx.showModal({
            title: '确认积分兑换',
            content: `将消耗 ${offer.points_price} 积分兑换「${offer.product.name}」`,
            success: async (r) => {
                if (!r.confirm) return;
                this.setData({ _submitting: true });
                try {
                    await app.wxLogin(false);
                    const orderData = {
                        address_id: this.data.addressId,
                        delivery_type: 'express',
                        limited_spot: {
                            card_id: this.data.cardId,
                            offer_id: offer.offer_id,
                            redeem_points: true
                        },
                        items: [{
                            product_id: offer.product_id,
                            sku_id: offer.sku_id || null,
                            quantity: 1
                        }]
                    };
                    const res = await post('/orders', orderData);
                    if (res.code !== 0) throw new Error(res.message || '下单失败');
                    const created = Array.isArray(res.data) ? res.data[0] : res.data;
                    await this._afterCreateOrder(created);
                } catch (err) {
                    wx.showToast({ title: err.message || '兑换失败', icon: 'none' });
                } finally {
                    this.setData({ _submitting: false });
                }
            }
        });
    },

    async onPayMoney(e) {
        const offer = this._findOffer(e.currentTarget.dataset.offerId);
        if (!offer || offer.remaining < 1 || this.data._submitting) return;
        if (!requireLogin()) return;
        if (!this._needAddress()) return;
        this.setData({ _submitting: true });
        try {
            await app.wxLogin(false);
            const orderData = {
                address_id: this.data.addressId,
                delivery_type: 'express',
                limited_spot: {
                    card_id: this.data.cardId,
                    offer_id: offer.offer_id,
                    redeem_points: false
                },
                items: [{
                    product_id: offer.product_id,
                    sku_id: offer.sku_id || null,
                    quantity: 1
                }]
            };
            const res = await post('/orders', orderData);
            if (res.code !== 0) throw new Error(res.message || '下单失败');
            const created = Array.isArray(res.data) ? res.data[0] : res.data;
            await this._afterCreateOrder(created);
        } catch (err) {
            wx.showToast({ title: err.message || '下单失败', icon: 'none' });
        } finally {
            this.setData({ _submitting: false });
        }
    }
});
