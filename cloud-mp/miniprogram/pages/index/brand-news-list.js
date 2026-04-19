const { get } = require('../../utils/request');
const { resolveCloudImageUrl } = require('../../utils/cloudAssetRuntime');
const {
    getBrandNewsCategoryDef,
    normalizeBrandNewsCategoryKey
} = require('../../utils/brandNewsCenter');

async function resolveNewsListImages(list = []) {
    return Promise.all((Array.isArray(list) ? list : []).map(async (item) => ({
        ...item,
        cover_image: await resolveCloudImageUrl({
            file_id: item.file_id || item.cover_file_id || '',
            image: item.cover_image || item.image || item.image_url || ''
        }, '')
    })));
}

Page({
    data: {
        loading: true,
        loadError: false,
        categoryKey: 'latest_activity',
        categoryTitle: '最新活动',
        articles: []
    },

    onLoad(options) {
        const categoryKey = normalizeBrandNewsCategoryKey(options.category_key);
        const category = getBrandNewsCategoryDef(categoryKey);
        this.setData({
            categoryKey: category.key,
            categoryTitle: category.title
        });
        wx.setNavigationBarTitle({ title: category.title });
        this.loadArticles();
    },

    async loadArticles() {
        this.setData({ loading: true, loadError: false });
        try {
            const res = await get('/page-content/brand-news', {
                category_key: this.data.categoryKey
            }, {
                showError: false
            });
            const list = res && res.data && Array.isArray(res.data.list)
                ? res.data.list
                : [];
            const articles = await resolveNewsListImages(list);
            this.setData({
                loading: false,
                loadError: false,
                articles
            });
        } catch (err) {
            console.error('[BrandNewsList] load failed:', err);
            this.setData({
                loading: false,
                loadError: true,
                articles: []
            });
        }
    },

    onRetry() {
        this.loadArticles();
    },

    onArticleTap(e) {
        const id = e.currentTarget.dataset.id;
        if (!id) return;
        wx.navigateTo({
            url: `/pages/activity/brand-news-detail?id=${encodeURIComponent(id)}`
        });
    },

    onArticleImageError(e) {
        const index = Number(e.currentTarget.dataset.index);
        if (!Number.isInteger(index)) return;
        const articles = Array.isArray(this.data.articles) ? this.data.articles.slice() : [];
        if (!articles[index]) return;
        articles[index] = {
            ...articles[index],
            cover_image: ''
        };
        this.setData({ articles });
    }
});
