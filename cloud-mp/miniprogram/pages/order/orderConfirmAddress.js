const { get } = require('../../utils/request');
const { processProduct } = require('../../utils/dataFormatter');
const { ErrorHandler } = require('../../utils/errorHandler');
const { ensureUserLocationPermission, getCurrentLocation } = require('./utils/location');

async function loadAddresses() {
    const res = await get('/addresses', {}, { showError: false });
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

const _productCache = {};
async function resolveMissingSkuForCartItem(item) {
    const initialSkuId = item && item.sku_id != null && item.sku_id !== '' ? item.sku_id : null;
    if (!item || initialSkuId || !item.product_id) {
        return {
            skuId: initialSkuId,
            sku: item && item.sku ? item.sku : null,
            product: item && item.product ? item.product : null,
            requiresSelection: false
        };
    }

    try {
        const pid = String(item.product_id);
        if (!_productCache[pid]) {
            _productCache[pid] = get(`/products/${pid}`, {}, { showError: false });
        }
        const detailRes = await _productCache[pid];
        const product = detailRes && detailRes.data ? detailRes.data : null;
        const skus = product && Array.isArray(product.skus) ? product.skus : [];
        if (skus.length === 1) {
            const onlySku = skus[0];
            return {
                skuId: onlySku.id || onlySku._id || null,
                sku: onlySku,
                product,
                requiresSelection: false
            };
        }
        return {
            skuId: null,
            sku: null,
            product,
            requiresSelection: skus.length > 1
        };
    } catch (_err) {
        return {
            skuId: null,
            sku: null,
            product: item.product || null,
            requiresSelection: false
        };
    }
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
        const list = Array.isArray(res && res.list)
            ? res.list
            : (Array.isArray(res && res.data && res.data.list) ? res.data.list : []);
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
    page.setData({
        addressLoadStatus: 'loading',
        addressLoadError: ''
    });
    try {
        const res = await get('/addresses/default', {}, { showError: false });
        const address = Object.prototype.hasOwnProperty.call(res || {}, 'data')
            ? (res.data || null)
            : (res || null);
        page.setData({
            address,
            addressLoadStatus: 'success',
            addressLoadError: ''
        });
        return {
            ok: true,
            status: 'success',
            data: address,
            errorType: ''
        };
    } catch (err) {
        console.error('加载默认地址失败:', err);
        page.setData({
            address: null,
            addressLoadStatus: 'error',
            addressLoadError: '地址加载失败，请重试'
        });
        ErrorHandler.handle(err, { showToast: false });
        return {
            ok: false,
            status: 'error',
            data: null,
            errorType: err && err.errorType ? err.errorType : 'unknown'
        };
    }
}

async function loadCartItems(page, cartIds) {
    page.setData({
        loading: true,
        cartLoadStatus: 'loading',
        cartLoadError: ''
    });
    try {
        const res = await get('/cart', {}, { showError: false });
        const allItems = res.data?.items || res.data?.list || (Array.isArray(res.data) ? res.data : []) || [];
        const ids = cartIds.split(',').map(Number);
        const { roleLevel } = page.data;

        const selectedItems = await Promise.all(
            allItems
                .filter((item) => ids.includes(item.id))
                .map(async (item) => {
                    const resolved = await resolveMissingSkuForCartItem(item);
                    const product = resolved.product || item.product || null;
                    const sku = resolved.sku || item.sku || null;
                    const processed = processProduct(product, roleLevel);
                    const specText = sku
                        ? `${sku.spec_name || '规格'}: ${sku.spec_value || sku.spec || sku.specs || ''}`.replace(/: $/, '')
                        : (item.snapshot_spec || '');
                    const isExplosive = !!(product?.is_explosive);
                    return {
                        cart_id: item.id,
                        product_id: item.product_id,
                        category_id: product?.category_id || null,
                        sku_id: resolved.skuId,
                        quantity: item.quantity,
                        supports_pickup: product?.supports_pickup ? 1 : 0,
                        allow_points: isExplosive ? 0 : (product?.allow_points == null ? 1 : (product.allow_points ? 1 : 0)),
                        is_explosive: isExplosive ? 1 : 0,
                        price: parseFloat(item.effective_price || processed.displayPrice || item.price || 0),
                        name: processed.name || item.snapshot_name || '商品',
                        image: sku?.image || item.snapshot_image || processed.firstImage,
                        spec: specText,
                        spec_required_missing: !!resolved.requiresSelection
                    };
                })
        );

        let totalAmountFen = 0;
        let totalCount = 0;
        selectedItems.forEach((item) => {
            totalAmountFen += Math.round(item.price * 100) * item.quantity;
            totalCount += item.quantity;
        });

        const totalAmount = (totalAmountFen / 100).toFixed(2);
        page.setData({
            orderItems: selectedItems,
            invalidSpecItems: selectedItems.filter((item) => item.spec_required_missing),
            totalAmount,
            finalAmount: totalAmount,
            totalCount
        });
        if (selectedItems.some((item) => item.spec_required_missing)) {
            wx.showToast({ title: '部分商品缺少规格，请返回购物袋重选', icon: 'none' });
        }
        refreshPickupAllowed(page);
        if (typeof page._updatePointsConfig === 'function') {
            page._updatePointsConfig(selectedItems);
        }
        page.setData({
            cartLoadStatus: 'success',
            cartLoadError: ''
        });
        return {
            ok: true,
            status: 'success',
            data: selectedItems,
            errorType: ''
        };
    } catch (err) {
        console.error('加载购物袋失败:', err);
        page.setData({
            loading: false,
            orderItems: [],
            invalidSpecItems: [],
            totalAmount: '0.00',
            finalAmount: '0.00',
            totalCount: 0,
            cartLoadStatus: 'error',
            cartLoadError: '订单加载失败，请重试'
        });
        return {
            ok: false,
            status: 'error',
            data: null,
            errorType: err && err.errorType ? err.errorType : 'unknown'
        };
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
