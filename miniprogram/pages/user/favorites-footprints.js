const { get, post, del } = require('../../utils/request');
const { listFavorites, removeFavorite, clearFavorites, listFootprints, removeFootprint, clearFootprints } = require('../../utils/localUserContent');

function formatFavoriteTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function formatFootprintTime(ts) {
    if (!ts) return '';
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

Page({
    data: {
        activeTab: 'favorites',
        favoriteItems: [],
        footprintItems: []
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
        this.setData({ activeTab: tab });
    },

    async refreshFavorites() {
        const token = wx.getStorageSync('token');
        if (token) {
            try {
                const res = await get('/user/favorites', {}, { showError: false });
                const list = (res && res.data) || [];
                const favoriteItems = list.map((x) => ({
                    ...x,
                    timeText: formatFavoriteTime(x.saved_at)
                }));
                this.setData({ favoriteItems });
            } catch (_) {
                this.setData({ favoriteItems: [] });
            }
            return;
        }
        const raw = listFavorites();
        const favoriteItems = raw.map((x) => ({
            ...x,
            timeText: formatFavoriteTime(x.saved_at)
        }));
        this.setData({ favoriteItems });
    },

    refreshFootprints() {
        const raw = listFootprints();
        const footprintItems = raw.map((x) => ({
            ...x,
            timeText: formatFootprintTime(x.viewed_at)
        }));
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
        const token = wx.getStorageSync('token');
        if (token) {
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
                const token = wx.getStorageSync('token');
                if (token) {
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
            title: '清空足迹',
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
