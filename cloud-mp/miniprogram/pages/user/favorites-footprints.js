var request = require('../../utils/request');
var auth = require('../../utils/auth');
var cloudAssetRuntime = require('../../utils/cloudAssetRuntime');
var dataFormatter = require('../../utils/dataFormatter');
var localUserContent = require('../../utils/localUserContent');
var vibrateManager = require('../../utils/vibrateManager');

var get = request.get;
var post = request.post;
var del = request.del;
var hasLoginSession = auth.hasLoginSession;
var resolveCloudImageUrl = cloudAssetRuntime.resolveCloudImageUrl;
var normalizeAssetUrl = dataFormatter.normalizeAssetUrl;
var isTemporarySignedAssetUrl = dataFormatter.isTemporarySignedAssetUrl;
var listFavorites = localUserContent.listFavorites;
var replaceFavorites = localUserContent.replaceFavorites;
var removeFavorite = localUserContent.removeFavorite;
var clearFavorites = localUserContent.clearFavorites;
var listFootprints = localUserContent.listFootprints;
var replaceFootprints = localUserContent.replaceFootprints;
var removeFootprint = localUserContent.removeFootprint;
var clearFootprints = localUserContent.clearFootprints;

function formatFavoriteTime(ts) {
    if (!ts) return '';
    if (typeof ts === 'object') {
        if (typeof ts._seconds === 'number') ts = ts._seconds * 1000;
        else if (typeof ts.seconds === 'number') ts = ts.seconds * 1000;
        else if (ts.$date !== undefined) ts = ts.$date;
    }
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function formatFootprintTime(ts) {
    if (!ts) return '';
    if (typeof ts === 'object') {
        if (typeof ts._seconds === 'number') ts = ts._seconds * 1000;
        else if (typeof ts.seconds === 'number') ts = ts.seconds * 1000;
        else if (ts.$date !== undefined) ts = ts.$date;
    }
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const sameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
    if (sameDay) {
        return `今天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function isCloudFileId(value) {
    return /^cloud:\/\//i.test(pickString(value));
}

function pickImageRef(item = {}) {
    const candidates = [
        item.image_ref,
        item.file_id,
        item.cover_image,
        item.coverImage,
        item.product_image,
        item.image_url,
        item.image
    ].map((value) => pickString(value)).filter(Boolean);
    const cloudRef = candidates.find((value) => isCloudFileId(value));
    if (cloudRef) return cloudRef;
    const stableUrl = candidates.find((value) => value && !isTemporarySignedAssetUrl(value));
    return stableUrl || pickString(item.image);
}

async function resolveItemImage(item = {}) {
    const imageRef = pickImageRef(item);
    if (!imageRef) return '';
    if (isCloudFileId(imageRef)) {
        return await resolveCloudImageUrl(imageRef, '');
    }
    return normalizeAssetUrl(imageRef);
}

async function fetchProductImagePayload(id) {
    if (!id) return null;
    try {
        const res = await get(`/products/${id}`, {}, { showError: false });
        const product = res && res.data ? res.data : res;
        if (!product || !product.id) return null;
        return {
            name: product.name || '',
            price: product.displayPrice || product.retail_price || product.price || '',
            image_ref: pickImageRef(product),
            image: pickString(product.image_url || product.image || product.cover_image)
        };
    } catch (_) {
        return null;
    }
}

async function hydrateLocalItems(rawList = [], replaceFn, timeFormatter) {
    let mutated = false;
    const nextStorage = [];
    const nextDisplay = [];

    for (const item of (Array.isArray(rawList) ? rawList : [])) {
        const nextItem = { ...item };
        let displayImage = await resolveItemImage(nextItem);
        const needsRepair = !displayImage || !pickImageRef(nextItem) || isTemporarySignedAssetUrl(nextItem.image || '');

        if (needsRepair && nextItem.id) {
            const productPayload = await fetchProductImagePayload(nextItem.id);
            if (productPayload) {
                if (productPayload.name && !nextItem.name) nextItem.name = productPayload.name;
                if (productPayload.price && !nextItem.price) nextItem.price = String(productPayload.price);
                if (productPayload.image_ref && productPayload.image_ref !== nextItem.image_ref) {
                    nextItem.image_ref = productPayload.image_ref;
                    nextItem.image = productPayload.image_ref;
                    mutated = true;
                } else if (productPayload.image && productPayload.image !== nextItem.image) {
                    nextItem.image = productPayload.image;
                    mutated = true;
                }
                displayImage = await resolveItemImage(nextItem) || normalizeAssetUrl(productPayload.image);
            }
        }

        nextStorage.push(nextItem);
        nextDisplay.push({
            ...nextItem,
            image: displayImage || '',
            timeText: timeFormatter(nextItem.saved_at || nextItem.viewed_at)
        });
    }

    if (mutated && typeof replaceFn === 'function') {
        replaceFn(nextStorage);
    }

    return nextDisplay;
}

Page({
    data: {
        activeTab: 'favorites',
        favoriteItems: [],
        footprintItems: [],
        contextActions: [
            { name: '查看详情', icon: '👁️' },
            { name: '删除', icon: '🗑️', color: '#ef4444' }
        ]
    },

    onLoad(options) {
        const tab = options.tab === 'footprints' ? 'footprints' : 'favorites';
        this.setData({ activeTab: tab });
    },

    onShow() {
        this.refreshFavorites();
        this.refreshFootprints();
    },

    switchTab(e) {
        const tab = e.currentTarget.dataset.tab;
        if (!tab || tab === this.data.activeTab) return;
        vibrateManager.getVibrateManager().short();
        this.setData({ activeTab: tab });
    },

    onSwipeFavoriteAction(e) {
        const { action } = e.detail;
        const id = e.currentTarget.dataset.id;
        if (action === 'delete' && id) {
            vibrateManager.getVibrateManager().short();
            this._removeFavoriteById(id);
        }
    },

    onSwipeFootprintAction(e) {
        const { action } = e.detail;
        const id = e.currentTarget.dataset.id;
        if (action === 'delete' && id) {
            vibrateManager.getVibrateManager().short();
            removeFootprint(id);
            this.refreshFootprints();
        }
    },

    onItemLongPress(e) {
        const id = e.currentTarget.dataset.id;
        this._longPressId = id;
        this._longPressType = e.currentTarget.dataset.type || 'item';
        this.selectComponent('#contextMenu').show(e);
    },

    onContextMenuSelect(e) {
        const { index } = e.detail;
        const id = this._longPressId;
        if (!id) return;

        if (index === 0) {
            // 查看详情
            wx.navigateTo({ url: `/pages/product/detail?id=${id}` });
        } else if (index === 1) {
            // 删除
            vibrateManager.getVibrateManager().short();
            if (this.data.activeTab === 'favorites') {
                this._removeFavoriteById(id);
            } else {
                removeFootprint(id);
                this.refreshFootprints();
            }
        }
    },

    async _removeFavoriteById(id) {
        if (hasLoginSession()) {
            try { await del(`/user/favorites/${id}`, {}, { showError: false }); } catch (_) {}
        } else {
            removeFavorite(id);
        }
        this.refreshFavorites();
    },

    async refreshFavorites() {
        if (hasLoginSession()) {
            try {
                const res = await get('/user/favorites', {}, { showError: false });
                const list = Array.isArray(res && res.list)
                    ? res.list
                    : (Array.isArray(res && res.data)
                        ? res.data
                        : (Array.isArray(res && res.data && res.data.list) ? res.data.list : []));
                const favoriteItems = await Promise.all(list.map(async (x) => ({
                    ...x,
                    id: x.id || x.product_id || '',
                    name: x.name || x.product_name || '商品',
                    image: await resolveItemImage(x),
                    price: x.price || '',
                    timeText: formatFavoriteTime(x.saved_at || x.created_at)
                })));
                this.setData({ favoriteItems });
            } catch (_) {
                this.setData({ favoriteItems: [] });
            }
            return;
        }
        const raw = listFavorites();
        const favoriteItems = await hydrateLocalItems(raw, replaceFavorites, formatFavoriteTime);
        this.setData({ favoriteItems });
    },

    async refreshFootprints() {
        const raw = listFootprints();
        const footprintItems = await hydrateLocalItems(raw, replaceFootprints, formatFootprintTime);
        this.setData({ footprintItems });
    },

    onOpenFavoriteDetail(e) {
        const id = e.currentTarget.dataset.id;
        if (!id) return;
        wx.navigateTo({ url: `/pages/product/detail?id=${id}` });
    },

    onOpenFootprintDetail(e) {
        const id = e.currentTarget.dataset.id;
        if (!id) return;
        wx.navigateTo({ url: `/pages/product/detail?id=${id}` });
    },

    async onRemoveFavorite(e) {
        const id = e.currentTarget.dataset.id;
        if (!id) return;
        if (hasLoginSession()) {
            try {
                await del(`/user/favorites/${id}`, {}, { showError: false });
            } catch (_) { /* ignore */ }
        } else {
            removeFavorite(id);
        }
        this.refreshFavorites();
    },

    onRemoveFootprint(e) {
        const id = e.currentTarget.dataset.id;
        if (!id) return;
        removeFootprint(id);
        this.refreshFootprints();
    },

    onClearFavoritesTap() {
        const { favoriteItems } = this.data;
        if (!favoriteItems.length) return;
        wx.showModal({
            title: '清空收藏',
            content: '确定删除全部收藏？',
            success: async (res) => {
                if (!res.confirm) return;
                if (hasLoginSession()) {
                    try {
                        await post('/user/favorites/clear-all', {}, { showError: false });
                    } catch (_) { /* ignore */ }
                } else {
                    clearFavorites();
                }
                this.refreshFavorites();
                wx.showToast({ title: '已清空', icon: 'none' });
            }
        });
    },

    onClearFootprintsTap() {
        const { footprintItems } = this.data;
        if (!footprintItems.length) return;
        wx.showModal({
            title: '清空近期浏览',
            content: '确定删除全部浏览记录？',
            success: (res) => {
                if (res.confirm) {
                    clearFootprints();
                    this.refreshFootprints();
                    wx.showToast({ title: '已清空', icon: 'none' });
                }
            }
        });
    }
});
