const { get, put, del } = require('../../utils/request');
const { getFirstImage, formatMoney } = require('../../utils/dataFormatter');

const CATEGORY_CART_TTL = 8 * 1000;

function parseCartItems(res) {
    const items = res.data?.items || res.data || [];
    return (Array.isArray(items) ? items : []).map((item) => {
        const qty = Number(item.qty || item.quantity || 1);
        return {
            ...item,
            qty,
            quantity: qty
        };
    });
}

async function updateCartData(page, forceRefresh = false) {
    if (!forceRefresh && page._cartSyncPromise) {
        return page._cartSyncPromise;
    }
    if (!forceRefresh && page._lastCartSyncAt && (Date.now() - page._lastCartSyncAt) < CATEGORY_CART_TTL) {
        return;
    }

    page._cartSyncPromise = (async () => {
        try {
            const res = await get('/cart', {}, {
                showError: false,
                maxRetries: 0,
                timeout: 8000,
                preventDuplicate: true
            });
            if (res.code === 0) {
                const items = parseCartItems(res);
                const count = items.reduce((sum, item) => sum + Number(item.qty || item.quantity || 0), 0);
                let total = res.data?.summary?.total_amount || 0;
                if (!total && items.length > 0) {
                    total = items.reduce((sum, item) => {
                        const qty = Number(item.qty || item.quantity || 0);
                        return sum + (parseFloat(item.effective_price || item.sku?.retail_price || 0) * qty);
                    }, 0);
                }

                page.setData({
                    cartCount: count,
                    cartTotal: parseFloat(total).toFixed(2),
                    _cartItemIds: items.map((item) => item.id).join(',')
                });
                page._lastCartSyncAt = Date.now();
            }
        } catch (err) {
            console.error('更新购物袋失败:', err);
        }
    })().finally(() => {
        page._cartSyncPromise = null;
    });

    return page._cartSyncPromise;
}

function calcCartPopupTotal(page) {
    const total = page.data.cartPopupItems.reduce((sum, item) => {
        if (!item.selected) return sum;
        return sum + item.price * item.quantity;
    }, 0);
    page.setData({ cartPopupTotal: formatMoney(total) });
}

function syncPopupSelection(page) {
    const items = page.data.cartPopupItems;
    const selectedIds = items.filter((item) => item.selected).map((item) => item.id);
    const allSelected = items.length > 0 && items.every((item) => item.selected);
    page.setData({ cartPopupSelectedIds: selectedIds, cartPopupAllSelected: allSelected });
    calcCartPopupTotal(page);
}

async function openCartPopup(page) {
    wx.showLoading({ title: '加载购物袋...' });
    try {
        const res = await get('/cart', {}, {
            showError: false,
            maxRetries: 0,
            timeout: 8000,
            preventDuplicate: true
        });
        const items = parseCartItems(res);
        const popupItems = (Array.isArray(items) ? items : []).map((item) => ({
            id: item.id,
            qty: Number(item.qty || item.quantity || 1),
            quantity: Number(item.qty || item.quantity || 1),
            selected: item.selected !== false,
            name: item.product?.name || '商品',
            image: item.sku?.image || getFirstImage(item.product?.images),
            spec: item.sku?.spec_value || '',
            price: parseFloat(item.effective_price || item.sku?.retail_price || item.product?.retail_price || item.product?.price || 0)
        }));
        const selectedIds = popupItems.filter((item) => item.selected).map((item) => item.id);
        const allSelected = popupItems.length > 0 && popupItems.every((item) => item.selected);
        page.setData({
            showCartPopup: true,
            cartPopupItems: popupItems,
            cartPopupSelectedIds: selectedIds,
            cartPopupAllSelected: allSelected
        }, () => page._syncOverlayTabBar());
        calcCartPopupTotal(page);
    } catch (_err) {
        wx.showToast({ title: '加载购物袋失败', icon: 'none' });
    } finally {
        wx.hideLoading();
    }
}

function closeCartPopup(page) {
    page.setData({ showCartPopup: false }, () => page._syncOverlayTabBar());
}

function toggleCartPopupItem(page, index) {
    const key = `cartPopupItems[${index}].selected`;
    const nextSelected = !page.data.cartPopupItems[index].selected;
    page.setData({ [key]: nextSelected }, () => syncPopupSelection(page));
}

function popupCheckout(page) {
    const selectedIds = page.data.cartPopupSelectedIds || [];
    if (!selectedIds.length) {
        wx.showToast({ title: '请先选择商品', icon: 'none' });
        return;
    }
    closeCartPopup(page);
    wx.navigateTo({
        url: `/pages/order/confirm?from=cart&cart_ids=${selectedIds.join(',')}`
    });
}

function togglePopupSelectAll(page) {
    const next = !page.data.cartPopupAllSelected;
    const items = page.data.cartPopupItems.map((item) => ({ ...item, selected: next }));
    page.setData({ cartPopupItems: items }, () => syncPopupSelection(page));
}

function clearCartPopup(page) {
    wx.showModal({
        title: '清空购物袋',
        content: '确定清空购物袋吗？',
        success: (res) => {
            if (res.confirm) {
                const ids = page.data.cartPopupItems.map((item) => item.id);
                Promise.all(ids.map((id) => del(`/cart/${id}`).catch(() => null)))
                    .then(() => {
                        page.setData({ cartPopupItems: [], cartPopupSelectedIds: [], cartPopupAllSelected: false });
                        calcCartPopupTotal(page);
                        updateCartData(page);
                    });
            }
        }
    });
}

async function changeCartItemQty(page, index, nextQty) {
    const item = page.data.cartPopupItems[index];
    if (!item) return;
    if (nextQty <= 0) {
        try {
            await del(`/cart/${item.id}`);
            const items = [...page.data.cartPopupItems];
            items.splice(index, 1);
            page.setData({ cartPopupItems: items }, () => {
                syncPopupSelection(page);
                updateCartData(page);
            });
        } catch (_err) {
            wx.showToast({ title: '删除失败', icon: 'none' });
        }
        return;
    }

    try {
        await put(`/cart/${item.id}`, { quantity: nextQty });
        page.setData({
            [`cartPopupItems[${index}].qty`]: nextQty,
            [`cartPopupItems[${index}].quantity`]: nextQty
        }, () => {
            calcCartPopupTotal(page);
            updateCartData(page);
        });
    } catch (_err) {
        wx.showToast({ title: '操作失败', icon: 'none' });
    }
}

module.exports = {
    parseCartItems,
    updateCartData,
    openCartPopup,
    closeCartPopup,
    toggleCartPopupItem,
    calcCartPopupTotal,
    popupCheckout,
    syncPopupSelection,
    togglePopupSelectAll,
    clearCartPopup,
    changeCartItemQty
};
