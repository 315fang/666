const { get } = require('../../utils/request');
const { parseImages, calculatePrice, normalizeProductId } = require('../../utils/dataFormatter');
const { ErrorHandler } = require('../../utils/errorHandler');
const { USER_ROLES } = require('../../config/constants');
const LocalUserContent = require('../../utils/localUserContent');
const app = getApp();

const PLEDGE_ICONS = {
    seven_day: '/assets/icons/refresh-cw.svg',
    return_shipping: '/assets/icons/truck.svg',
    brand_guarantee: '/assets/icons/shield.svg',
    authentic: '/assets/icons/shield.svg',
    shipping_promise: '/assets/icons/truck.svg',
    after_sale: '/assets/icons/refresh-cw.svg'
};

function parseApiDisplayPrice(v) {
    if (v === null || v === undefined || v === '') return null;
    const x = typeof v === 'number' ? v : parseFloat(String(v).trim());
    return Number.isFinite(x) && x >= 0 ? x : null;
}

function resolvePayableUnitPrice(product, sku, roleLevel) {
    if (sku && parseApiDisplayPrice(sku.displayPrice) != null) {
        return parseApiDisplayPrice(sku.displayPrice);
    }
    if (parseApiDisplayPrice(product.displayPrice) != null) {
        return parseApiDisplayPrice(product.displayPrice);
    }
    return calculatePrice(product, sku, roleLevel);
}

async function loadProduct(page, id) {
    wx.showLoading({ title: '加载中...' });

    try {
        const res = await get(`/products/${id}`);
        const product = res.data || {};

        product.images = parseImages(product.images);
        product.detail_images = parseImages(product.detail_images);

        let specs = [];
        if (product.skus && product.skus.length > 0) {
            const specMap = {};
            product.skus.forEach((sku) => {
                if (sku.spec_name && sku.spec_value) {
                    if (!specMap[sku.spec_name]) {
                        specMap[sku.spec_name] = new Set();
                    }
                    specMap[sku.spec_name].add(sku.spec_value);
                }
            });

            specs = Object.keys(specMap).map((name) => ({
                name,
                values: Array.from(specMap[name])
            }));
        }
        product.specs = specs;

        const roleLevel = app.globalData.userInfo && app.globalData.userInfo.role_level || USER_ROLES.GUEST;
        const displayPrice = resolvePayableUnitPrice(product, null, roleLevel);

        let discount = 10;
        if (product.market_price && parseFloat(product.market_price) > 0) {
            discount = Math.round((Number(displayPrice) / parseFloat(product.market_price)) * 10);
        }

        const firstSku = product.skus && product.skus.length > 0 ? product.skus[0] : null;
        const selectedSpecs = {};
        if (firstSku && firstSku.spec_name) {
            selectedSpecs[firstSku.spec_name] = firstSku.spec_value;
        }

        const currentPrice = Number(
            resolvePayableUnitPrice(product, firstSku, roleLevel)
        ).toFixed(2);
        const currentStock = firstSku ? (firstSku.stock || 0) : (product.stock || 0);
        const isOutOfStock = currentStock <= 0;

        const pid = normalizeProductId(product.id);
        const rawPledges = Array.isArray(product.service_pledges) ? product.service_pledges : [];
        const servicePledges = rawPledges.map((pledge) => ({
            ...pledge,
            icon: PLEDGE_ICONS[pledge.id] || '/assets/icons/shield.svg'
        }));

        page.setData({
            product: {
                ...product,
                displayPrice: Number(displayPrice).toFixed(2)
            },
            skus: product.skus || [],
            selectedSku: firstSku,
            selectedSpecs,
            selectedSkuText: firstSku ? `${firstSku.spec_name}: ${firstSku.spec_value}` : '默认规格',
            imageCount: product.images.length || 1,
            roleLevel,
            isAgent: roleLevel >= USER_ROLES.LEADER,
            discount,
            currentPrice,
            currentStock,
            isOutOfStock,
            detailImageList: product.detail_images || [],
            hasRichDetail: !!product.detail_html,
            servicePledges,
            pageLoading: false
        });

        LocalUserContent.recordFootprint({
            id: pid,
            name: product.name,
            image: product.images && product.images[0] || '',
            price: Number(displayPrice).toFixed(2)
        });

        page.refreshFavoriteState();
        page.loadReviews();
        if (roleLevel >= USER_ROLES.LEADER) {
            page.loadCommissionPreview();
        }
    } catch (err) {
        ErrorHandler.handle(err, { customMessage: '商品加载失败' });
        console.error('加载商品详情失败:', err);
        page.setData({ pageLoading: false });
    } finally {
        wx.hideLoading();
    }
}

module.exports = {
    loadProduct,
    resolvePayableUnitPrice,
    parseApiDisplayPrice,
    PLEDGE_ICONS
};
