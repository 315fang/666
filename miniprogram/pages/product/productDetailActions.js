const { post } = require('../../utils/request');
const { normalizeProductId } = require('../../utils/dataFormatter');

function onSpecSelect(page, event, resolvePayableUnitPrice) {
    const { key, val } = event.currentTarget.dataset;
    const selectedSpecs = page.data.selectedSpecs || {};
    selectedSpecs[key] = val;

    const { skus, product } = page.data;
    let selectedSku = null;

    if (skus && skus.length > 0) {
        selectedSku = skus.find((sku) => {
            const specName = sku.spec_name || '';
            const specValue = sku.spec_value || '';
            return selectedSpecs[specName] === specValue;
        });
    }

    const currentPrice = Number(
        resolvePayableUnitPrice(product, selectedSku, page.data.roleLevel)
    ).toFixed(2);
    const currentStock = selectedSku ? (selectedSku.stock || 0) : (product.stock || 0);
    const isOutOfStock = currentStock <= 0;
    const nextQuantity = isOutOfStock ? 1 : Math.min(page.data.quantity, currentStock || 1);

    page.setData({
        selectedSpecs,
        selectedSku,
        selectedSkuText: selectedSku ? `${selectedSku.spec_name}: ${selectedSku.spec_value}` : '请选择规格',
        currentPrice,
        currentStock,
        isOutOfStock,
        quantity: nextQuantity
    });
}

function getMaxStock(page) {
    const stock = Number(page.data.currentStock || 0);
    return Number.isFinite(stock) && stock > 0 ? stock : 0;
}

function onMinus(page) {
    if (page.data.quantity > 1) {
        page.setData({ quantity: page.data.quantity - 1 });
    }
}

function onPlus(page) {
    const maxStock = getMaxStock(page);
    if (page.data.quantity < maxStock) {
        page.setData({ quantity: page.data.quantity + 1 });
    }
}

function onQtyInput(page, event) {
    let val = parseInt(event.detail.value);
    if (isNaN(val) || val < 1) val = 1;
    const maxStock = getMaxStock(page);
    if (maxStock > 0 && val > maxStock) val = maxStock;
    page.setData({ quantity: val });
}

function onBuyNow(page, resolvePayableUnitPrice) {
    if (page._buyingNow) return;
    if (page.data.isOutOfStock) {
        wx.showToast({ title: '该商品暂时缺货', icon: 'none' });
        return;
    }
    page._buyingNow = true;
    const { product, selectedSku, quantity } = page.data;

    const buyInfo = {
        product_id: normalizeProductId(product.id),
        category_id: product.category_id || null,
        sku_id: selectedSku && selectedSku.id || null,
        quantity,
        price: resolvePayableUnitPrice(product, selectedSku, page.data.roleLevel),
        name: product.name,
        image: product.images && product.images[0] || '',
        spec: selectedSku ? `${selectedSku.spec_name}: ${selectedSku.spec_value}` : '',
        supports_pickup: product.supports_pickup ? 1 : 0
    };
    wx.setStorageSync('directBuyInfo', buyInfo);

    wx.navigateTo({
        url: '/pages/order/confirm?from=direct',
        complete: () => { page._buyingNow = false; }
    });
}

async function addToCart(page) {
    if (page._addingToCart) return;
    const { product, selectedSku, quantity } = page.data;
    page._addingToCart = true;
    let loadingShown = false;

    try {
        wx.showLoading({ title: '加入购物袋...', mask: true });
        loadingShown = true;

        await post(
            '/cart',
            {
                product_id: normalizeProductId(product.id),
                sku_id: selectedSku && selectedSku.id || null,
                quantity
            },
            { showError: false }
        );

        wx.hideLoading();
        loadingShown = false;

        page.triggerFlyAnim();
        wx.showToast({ title: '已加入购物袋', icon: 'success' });
    } catch (err) {
        const msg = err && err.message ? String(err.message) : '加入失败';
        wx.showToast({ title: msg, icon: 'none' });
        console.error('加入购物袋失败:', err);
    } finally {
        if (loadingShown) wx.hideLoading();
        page._addingToCart = false;
    }
}

module.exports = {
    onSpecSelect,
    getMaxStock,
    onMinus,
    onPlus,
    onQtyInput,
    onBuyNow,
    addToCart
};
