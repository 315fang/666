const { get } = require('../../utils/request');
const { processProduct } = require('../../utils/dataFormatter');
const { ErrorHandler } = require('../../utils/errorHandler');
const { ensureUserLocationPermission, getCurrentLocation } = require('./utils/location');

async function loadAddresses() {
    const res = await get('/addresses');
    return res.list || res.data || [];
}

async function getDefaultAddress() {
    try {
        const addresses = await loadAddresses();
        if (!addresses || addresses.length === 0) return null;
        return addresses.find((item) => item.is_default) || addresses[0];
    } catch (_err) {
        return null;
    }
}

function navigateToAddressList(isSelect = true) {
    wx.navigateTo({ url: `/pages/address/list?select=${isSelect}` });
}

function refreshPickupAllowed(page) {
    const items = page.data.orderItems || [];
    const allowed = items.length > 0 && items.every((item) => Number(item.supports_pickup) === 1);
    const patch = { pickupAllowed: allowed };
    if (!allowed && page.data.deliveryType === 'pickup') {
        patch.deliveryType = 'express';
        patch.pickupStation = null;
        patch.pickupStations = [];
    }
    page.setData(patch);
}

async function loadPickupStations(page) {
    try {
        const params = [];
        if (page.data.refLat != null && page.data.refLng != null) {
            params.push(`lat=${encodeURIComponent(page.data.refLat)}`);
            params.push(`lng=${encodeURIComponent(page.data.refLng)}`);
        }
        if (page.data.address && page.data.address.city) {
            params.push(`sort_city=${encodeURIComponent(page.data.address.city)}`);
        }
        const qs = params.length ? `?${params.join('&')}` : '';
        const res = await get(`/stations/pickup-options${qs}`, {}, { showError: false });
        const list = (res && res.data) || [];
        let pickupStation = page.data.pickupStation;
        if (pickupStation && !list.some((station) => station.id === pickupStation.id)) {
            pickupStation = list[0] || null;
        } else if (!pickupStation && list.length) {
            pickupStation = list[0];
        }
        const hasRef = page.data.refLat != null && page.data.refLng != null;
        const pickupDistanceHint = list.length > 0 && !hasRef && list.every((station) => station.distance_km == null);
        page.setData({ pickupStations: list, pickupStation, pickupDistanceHint });
    } catch (_err) {
        page.setData({ pickupStations: [], pickupStation: null, pickupDistanceHint: false });
    }
}

async function locateForPickupSort(page) {
    const granted = await ensureUserLocationPermission();
    if (!granted) {
        wx.showToast({
            title: '未开启位置权限，请使用地图选点',
            icon: 'none'
        });
        return;
    }

    const loc = await getCurrentLocation();
    if (loc && loc.ok) {
        page.setData({
            refLat: loc.latitude,
            refLng: loc.longitude,
            refLocationName: '当前位置'
        });
        loadPickupStations(page);
        return;
    }

    wx.showToast({
        title: '当前位置获取失败，请用地图选点',
        icon: 'none'
    });
}

function chooseRefLocation(page) {
    wx.chooseLocation({
        success: (res) => {
            page.setData({
                refLat: res.latitude,
                refLng: res.longitude,
                refLocationName: res.name || '已选位置'
            });
            loadPickupStations(page);
        },
        fail: () => {
            wx.showToast({ title: '未授权位置或已取消', icon: 'none' });
        }
    });
}

async function loadDefaultAddress(page) {
    try {
        const address = await getDefaultAddress();
        page.setData({ address });
    } catch (err) {
        ErrorHandler.handle(err, { showToast: false });
        console.error('加载默认地址失败:', err);
    }
}

async function loadCartItems(page, cartIds) {
    try {
        const res = await get('/cart');
        const allItems = res.data?.items || res.data || [];
        const ids = cartIds.split(',').map(Number);
        const { roleLevel } = page.data;

        const selectedItems = allItems
            .filter((item) => ids.includes(item.id))
            .map((item) => {
                const processed = processProduct(item.product, roleLevel);
                return {
                    cart_id: item.id,
                    product_id: item.product_id,
                    category_id: item.product?.category_id || null,
                    sku_id: item.sku_id,
                    quantity: item.quantity,
                    supports_pickup: item.product?.supports_pickup ? 1 : 0,
                    price: parseFloat(item.effective_price || processed.displayPrice || 0),
                    name: processed.name || '商品',
                    image: item.sku?.image || processed.firstImage,
                    spec: item.sku ? `${item.sku.spec_name}: ${item.sku.spec_value}` : ''
                };
            });

        let totalAmountFen = 0;
        let totalCount = 0;
        selectedItems.forEach((item) => {
            totalAmountFen += Math.round(item.price * 100) * item.quantity;
            totalCount += item.quantity;
        });

        const totalAmount = (totalAmountFen / 100).toFixed(2);
        page.setData({
            orderItems: selectedItems,
            totalAmount,
            finalAmount: totalAmount,
            totalCount,
            loading: false
        });
        refreshPickupAllowed(page);
        if (typeof page.loadAvailableCoupons === 'function') {
            page.loadAvailableCoupons();
        }
    } catch (err) {
        console.error('加载购物袋失败:', err);
        page.setData({ loading: false });
    }
}

module.exports = {
    navigateToAddressList,
    refreshPickupAllowed,
    loadPickupStations,
    locateForPickupSort,
    chooseRefLocation,
    loadDefaultAddress,
    loadCartItems
};
