const { get } = require('../../utils/request');
const { safeBack } = require('../../utils/navigator');
const { warmRenderableImageUrls, resolveRenderableImageUrl } = require('../../utils/cloudAssetRuntime');

Page({
    data: {
        loading: true,
        loadError: false,
        bundles: []
    },

    onLoad() {
        this.loadBundles();
    },

    onPullDownRefresh() {
        this.loadBundles().finally(() => {
            wx.stopPullDownRefresh();
        });
    },

    async loadBundles() {
        this.setData({ loading: true, loadError: false });
        try {
            const res = await get('/product-bundles', {
                scene_type: 'flex_bundle',
                page: 1,
                limit: 50
            }, {
                showError: false
            });
            const rawList = Array.isArray(res?.data?.list)
                ? res.data.list
                : (Array.isArray(res?.list) ? res.list : []);
            await warmRenderableImageUrls(rawList);
            const bundles = await Promise.all(rawList.map(async (item) => ({
                ...item,
                cover_preview_url: await resolveRenderableImageUrl({
                    file_id: item.cover_file_id || '',
                    image: item.cover_image || ''
                }, '')
            })));
            this.setData({
                bundles,
                loading: false,
                loadError: false
            });
        } catch (error) {
            console.error('[flex-bundles] load failed:', error);
            this.setData({
                loading: false,
                loadError: true,
                bundles: []
            });
        }
    },

    onBack() {
        safeBack('/pages/activity/activity');
    },

    onRetry() {
        this.loadBundles();
    },

    onOpenBundle(e) {
        const id = e.currentTarget.dataset.id;
        if (!id) return;
        wx.navigateTo({
            url: `/pages/product-bundle/detail?id=${encodeURIComponent(String(id))}`
        });
    }
});
