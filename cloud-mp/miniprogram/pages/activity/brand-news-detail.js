const { get } = require('../../utils/request');
const { resolveCloudImageUrl } = require('../../utils/cloudAssetRuntime');
const { getBrandNewsFallbackCover } = require('../../utils/brandNewsCover');
const { normalizeBrandNewsContentHtml } = require('../../utils/brandNewsContent');

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
                const article = {
                    ...data,
                    cover_image: await resolveCloudImageUrl({
                        file_id: data.file_id || data.cover_file_id || '',
                        image: data.cover_image || data.image || data.image_url || ''
                    }, getBrandNewsFallbackCover(data)),
                    content_html: await normalizeBrandNewsContentHtml(data.content_html || '')
                };
                this.setData({ article, loading: false, loadError: false });
                wx.setNavigationBarTitle({ title: data.title.slice(0, 18) || '资讯' });
            } else {
                this.setData({ loading: false, loadError: true });
            }
        } catch (_) {
            this.setData({ loading: false, loadError: true });
        }
    }
});
