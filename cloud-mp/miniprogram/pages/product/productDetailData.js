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

// 构建 SKU 规格文本（多规格用 " / " 连接，单规格用 ": " 连接）
function buildSkuText(sku) {
    if (!sku) return '默认规格';
    const specs = Array.isArray(sku.specs) && sku.specs.length > 0
        ? sku.specs
        : (sku.spec_name && sku.spec_value ? [{ name: sku.spec_name, value: sku.spec_value }] : []);
    if (specs.length === 0) return sku.spec || '默认规格';
    return specs.map((s) => `${s.name}: ${s.value}`).join(' / ');
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
                // 优先使用 specs 数组（多规格），向后兼容 spec_name/spec_value
                const skuSpecs = Array.isArray(sku.specs) && sku.specs.length > 0
                    ? sku.specs
                    : (sku.spec_name && sku.spec_value ? [{ name: sku.spec_name, value: sku.spec_value }] : []);
                skuSpecs.forEach((s) => {
                    if (s.name && s.value) {
                        if (!specMap[s.name]) {
                            specMap[s.name] = new Set();
                        }
                        specMap[s.name].add(s.value);
                    }
                });
            });

            specs = Object.keys(specMap).map((name) => ({
                name,
                values: Array.from(specMap[name])
            }));
        }
        product.specs = specs;

        // 生成规格摘要文本（如 "120ml / 50ml"），用于商品卡片和详情页显眼展示
        const specSummary = specs.map((s) => s.values.join('/')).join(' · ');
        product.specSummary = specSummary;

        const roleLevel = app.globalData.userInfo && app.globalData.userInfo.role_level || USER_ROLES.GUEST;
        const displayPrice = resolvePayableUnitPrice(product, null, roleLevel);

        let discount = 10;
        if (product.market_price && parseFloat(product.market_price) > 0) {
            discount = Math.round((Number(displayPrice) / parseFloat(product.market_price)) * 10);
        }

        const firstSku = product.skus && product.skus.length > 0 ? product.skus[0] : null;
        const selectedSpecs = {};
        if (firstSku) {
            // 优先使用 specs 数组（多规格），向后兼容 spec_name/spec_value
            const firstSkuSpecs = Array.isArray(firstSku.specs) && firstSku.specs.length > 0
                ? firstSku.specs
                : (firstSku.spec_name && firstSku.spec_value ? [{ name: firstSku.spec_name, value: firstSku.spec_value }] : []);
            firstSkuSpecs.forEach((s) => {
                if (s.name && s.value) {
                    selectedSpecs[s.name] = s.value;
                }
            });
            // 向后兼容
            if (Object.keys(selectedSpecs).length === 0 && firstSku.spec_name) {
                selectedSpecs[firstSku.spec_name] = firstSku.spec_value;
            }
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
            selectedSkuText: firstSku ? buildSkuText(firstSku) : '默认规格',
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
        if (typeof page.loadActivityState === 'function') {
            page.loadActivityState(product.id);
        }
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
    buildSkuText,
    PLEDGE_ICONS
};
