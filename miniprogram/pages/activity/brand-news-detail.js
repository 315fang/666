const { get } = require('../../utils/request');

Page({
    data: {
        article: null,
        loading: true,
        loadError: false
    },

    async onLoad(query) {
        const id = query.id ? String(query.id) : '';
        if (!id) {
            this.setData({ loading: false, loadError: true });
            return;
        }
        try {
            const res = await get('/page-content/brand-news', { id }, { showError: false });
            const data = res && res.data;
            if (data && data.title) {
                this.setData({ article: data, loading: false, loadError: false });
                wx.setNavigationBarTitle({ title: data.title.slice(0, 18) || '资讯' });
            } else {
                this.setData({ loading: false, loadError: true });
            }
        } catch (_) {
            this.setData({ loading: false, loadError: true });
        }
    }
});
