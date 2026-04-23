const { get } = require('../../utils/request');
const {
    processProduct,
    buildSkuValueText,
    findProductDefaultSku
} = require('../../utils/dataFormatter');
const { normalizeSpecDisplayText, normalizeOrderItems } = require('./orderSpecText');
const { resolveCloudImageUrl } = require('./utils/cloudAsset');
const { ErrorHandler } = require('../../utils/errorHandler');

const WEEK_DAY_LABELS = {
    1: '周一',
    2: '周二',
    3: '周三',
    4: '周四',
    5: '周五',
    6: '周六',
    0: '周日',
    7: '周日'
};

function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeBusinessDays(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => {
            if (typeof item === 'number' || /^\d+$/.test(String(item || ''))) {
                return WEEK_DAY_LABELS[Number(item)] || '';
            }
            return compactText(item);
        })
        .filter(Boolean);
}

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
        const defaultSku = product ? findProductDefaultSku(product, skus) : null;
        if (skus.length === 1) {
            const onlySku = skus[0];
            return {
                skuId: onlySku.id || onlySku._id || null,
                sku: onlySku,
                product,
                requiresSelection: false
            };
        }
        if (defaultSku) {
            return {
                skuId: defaultSku.id || defaultSku._id || null,
                sku: defaultSku,
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

function normalizePickupStationOption(station = {}) {
    const selectable = station.selectable !== false && station.pickup_stock_available !== false;
    const businessDays = normalizeBusinessDays(station.business_days);
    const businessHoursText = station.business_time_start && station.business_time_end
        ? `${station.business_time_start} - ${station.business_time_end}`
        : compactText(station.business_hours || station.opening_hours || station.open_time);
    const fullAddress = compactText([
        station.province,
        station.city,
        station.district,
        station.address
    ].filter(Boolean).join(' '));
    const stationId = station.id || station._id || '';
    return {
        ...station,
        id: stationId,
        selectable,
        pickup_unavailable: !selectable,
        pickup_stock_text: selectable ? '有货' : '无货',
        pickup_stock_class: selectable ? 'stock-ok' : 'stock-empty',
        full_address: fullAddress,
        contact_phone_text: compactText(station.contact_phone || station.pickup_contact || station.phone || station.mobile) || '暂无电话',
        business_days_text: businessDays.join(' / '),
        business_hours_text: businessHoursText || '请咨询门店'
    };
}

async function loadPickupStations(page) {
    try {
        const params = [];
        const pickupItems = (page.data.orderItems || []).map((item) => ({
            product_id: item.product_id,
            sku_id: item.sku_id,
            quantity: item.quantity || item.qty || 1,
            name: item.name
        }));
        if (pickupItems.length) {
            params.push(`items=${encodeURIComponent(JSON.stringify(pickupItems))}`);
        }
        const qs = params.length ? `?${params.join('&')}` : '';
        const res = await get(`/stations/pickup-options${qs}`, {}, { showError: false });
        const list = Array.isArray(res && res.list)
            ? res.list
            : (Array.isArray(res && res.data && res.data.list) ? res.data.list : []);
        const normalizedList = list.map((station) => normalizePickupStationOption(station));
        let pickupStation = page.data.pickupStation;
        if (pickupStation) {
            const selectedId = String(pickupStation.id || pickupStation._id || '');
            const latestSelected = normalizedList.find((station) => String(station.id || station._id || '') === selectedId);
            pickupStation = latestSelected && latestSelected.selectable ? latestSelected : null;
        }
        page.setData({ pickupStations: normalizedList, pickupStation });
    } catch (_err) {
        page.setData({ pickupStations: [], pickupStation: null });
    }
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
                        ? buildSkuValueText(sku, '')
                        : (item.snapshot_spec || product?.default_spec_text || processed.specSummary || '');
                    const isExplosive = !!(product?.is_explosive);
                    const isHotProduct = String(product?.product_tag || '').trim().toLowerCase() === 'hot';
                    const image = await resolveCloudImageUrl(
                        sku?.image || item.snapshot_image || processed.firstImage,
                        '/assets/images/placeholder.svg'
                    );
                    return {
                        cart_id: item.id,
                        product_id: item.product_id,
                        category_id: product?.category_id || null,
                        sku_id: resolved.skuId,
                        quantity: item.quantity,
                        supports_pickup: product?.supports_pickup ? 1 : 0,
                        allow_coupon: (isExplosive || isHotProduct) ? 0 : (product?.enable_coupon == null ? 1 : (product.enable_coupon ? 1 : 0)),
                        allow_points: (isExplosive || isHotProduct) ? 0 : (product?.allow_points == null ? 1 : (product.allow_points ? 1 : 0)),
                        is_explosive: isExplosive ? 1 : 0,
                        product_tag: product?.product_tag || 'normal',
                        price: parseFloat(item.effective_price || processed.displayPrice || item.price || 0),
                        name: processed.name || item.snapshot_name || '商品',
                        image,
                        spec: normalizeSpecDisplayText(specText),
                        spec_required_missing: !!resolved.requiresSelection
                    };
                })
        );
        const normalizedSelectedItems = normalizeOrderItems(selectedItems);

        let totalAmountFen = 0;
        let totalCount = 0;
        normalizedSelectedItems.forEach((item) => {
            totalAmountFen += Math.round(item.price * 100) * item.quantity;
            totalCount += item.quantity;
        });

        const totalAmount = (totalAmountFen / 100).toFixed(2);
        page.setData({
            orderItems: normalizedSelectedItems,
            invalidSpecItems: normalizedSelectedItems.filter((item) => item.spec_required_missing),
            totalAmount,
            finalAmount: totalAmount,
            totalCount
        });
        if (normalizedSelectedItems.some((item) => item.spec_required_missing)) {
            wx.showToast({ title: '部分商品缺少规格，请返回购物袋重选', icon: 'none' });
        }
        refreshPickupAllowed(page);
        if (typeof page._updatePointsConfig === 'function') {
            page._updatePointsConfig(normalizedSelectedItems);
        }
        page.setData({
            cartLoadStatus: 'success',
            cartLoadError: ''
        });
        return {
            ok: true,
            status: 'success',
            data: normalizedSelectedItems,
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
    loadDefaultAddress,
    loadCartItems
};
