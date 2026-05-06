// pages/search/search.js
const { get } = require('../../utils/request');
const { SEARCH_CONFIG } = require('../../config/constants');
const { ErrorHandler, showError } = require('../../utils/errorHandler');
const { processProducts } = require('../../utils/dataFormatter');
const { debounce } = require('./utils/debounce');
const { cachedGet, CACHE_STRATEGIES } = require('../../utils/requestCache');
const { warmRenderableImageUrls, resolveRenderableImageUrl } = require('../../utils/cloudAssetRuntime');

const PRODUCT_PLACEHOLDER = '/assets/images/placeholder.svg';
const PRODUCT_IMAGE_MAX_RETRY = 2;

function collectProductImageSources(product = {}) {
    const sources = [];
    const push = (value) => {
        if (!value) return;
        if (Array.isArray(value)) {
            value.forEach(push);
            return;
        }
        sources.push(value);
    };

    push(product.image_ref || product.imageRef || product.file_id || product.fileId);
    push({
        file_id: product.image_ref || product.imageRef || product.file_id || product.fileId || '',
        image: product.display_image || product.displayImage || product.image || product.firstImage || '',
        image_url: product.image_url || product.imageUrl || '',
        cover_image: product.cover_image || product.coverImage || '',
        preview_images: product.preview_images || product.previewImages || '',
        images: product.images || ''
    });
    push(product.preview_images || product.previewImages);
    push(product.images);
    push(product.firstImage || product.image || product.image_url || product.cover_image);

    return sources;
}

async function mapRenderableProducts(rawProducts = []) {
    const products = processProducts(rawProducts);
    const sources = products.map((item) => ({
        file_id: item.image_ref || item.imageRef || item.file_id || item.fileId || '',
        image: item.display_image || item.displayImage || item.image || item.firstImage || '',
        image_url: item.image_url || item.imageUrl || '',
        cover_image: item.cover_image || item.coverImage || '',
        preview_images: item.preview_images || item.previewImages || '',
        images: item.images || ''
    }));
    await warmRenderableImageUrls(sources).catch(() => null);
    return Promise.all(products.map(async (item, index) => {
        const cardImage = await resolveRenderableImageUrl(sources[index], PRODUCT_PLACEHOLDER).catch(() => PRODUCT_PLACEHOLDER);
        return {
            ...item,
            image_sources: collectProductImageSources(item),
            cardImage: cardImage || PRODUCT_PLACEHOLDER
        };
    }));
}

Page({
    data: {
        keyword: '',
        products: [],
        history: [],
        hotKeywords: [],
        loading: false,
        hasSearched: false
    },

    onLoad() {
        // 使用常量配置加载搜索历史
        const history = wx.getStorageSync(SEARCH_CONFIG.STORAGE_KEY) || [];
        this.setData({ history });
        // 初始化防抖搜索（300ms）
        this._debouncedSearch = debounce((keyword) => {
            if (keyword && keyword.trim()) this.doSearch(keyword.trim());
        }, 300);
    },

    onInput(e) {
        const val = e.detail.value;
        this.setData({ keyword: val });
        this._debouncedSearch(val);
    },

    onClear() {
        this.setData({ keyword: '', hasSearched: false, products: [] });
    },

    onCancel() {
        require('../../utils/navigator').safeBack();
    },

    // 点击历史/热门标签
    onHistoryTap(e) {
        const keyword = e.currentTarget.dataset.keyword;
        this.setData({ keyword });
        this.doSearch(keyword);
    },

    // 键盘确认搜索
    onSearch() {
        const keyword = this.data.keyword.trim();
        if (!keyword) {
            showError('请输入搜索内容');
            return;
        }
        this.doSearch(keyword);
    },

    // 执行搜索
    async doSearch(keyword) {
        // 搜索历史（去重，最多配置的条数）
        let history = this.data.history.filter(h => h !== keyword);
        history.unshift(keyword);
        if (history.length > SEARCH_CONFIG.MAX_HISTORY) {
            history = history.slice(0, SEARCH_CONFIG.MAX_HISTORY);
        }
        this.setData({ history });
        wx.setStorageSync(SEARCH_CONFIG.STORAGE_KEY, history);

        // 发起搜索请求（内存缓存 2 分钟，重复搜关键词零请求）
        this.setData({ loading: true, hasSearched: true });

        try {
            const res = await cachedGet(
                (url, params) => get(url, params),
                '/products/search',
                { keyword, limit: 50 },
                { cacheTTL: CACHE_STRATEGIES.search }
            );
            const rawProducts = res.data?.list || res.data || [];
            const products = await mapRenderableProducts(rawProducts);
            this.setData({ products, loading: false });
        } catch (err) {
            ErrorHandler.handle(err, {
                customMessage: '搜索失败，请稍后重试'
            });
            this.setData({ loading: false, products: [] });
        }
    },

    // 清空历史
    onClearHistory() {
        wx.showModal({
            title: '提示',
            content: '确认清空搜索历史？',
            success: (res) => {
                if (res.confirm) {
                    this.setData({ history: [] });
                    wx.removeStorageSync(SEARCH_CONFIG.STORAGE_KEY);
                }
            }
        });
    },

    // 商品点击
    onProductTap(e) {
        const product = e.currentTarget.dataset.item;
        if (!product || !product.id) return;
        wx.navigateTo({ url: `/pages/product/detail?id=${product.id}` });
    },

    async onProductImageError(e) {
        const index = Number(e.currentTarget.dataset.index || 0);
        const products = Array.isArray(this.data.products) ? this.data.products.slice() : [];
        const product = products[index];
        if (!product || product.cardImage === PRODUCT_PLACEHOLDER) return;

        this._productImageRetryCounts = this._productImageRetryCounts || {};
        const productId = product.id || product._id || index;
        const retryKey = `search:${productId}`;
        const retryCount = Number(this._productImageRetryCounts[retryKey] || 0);

        if (retryCount < PRODUCT_IMAGE_MAX_RETRY) {
            this._productImageRetryCounts[retryKey] = retryCount + 1;
            const sources = collectProductImageSources(product);
            for (let i = 0; i < sources.length; i += 1) {
                const nextImage = await resolveRenderableImageUrl(sources[i], '', { forceRefresh: true }).catch(() => '');
                if (!nextImage || nextImage === PRODUCT_PLACEHOLDER || nextImage === product.cardImage) continue;
                products[index] = {
                    ...product,
                    cardImage: nextImage,
                    image: nextImage,
                    image_missing: false
                };
                this.setData({ products });
                return;
            }
        }

        products[index] = {
            ...product,
            cardImage: PRODUCT_PLACEHOLDER,
            image: PRODUCT_PLACEHOLDER,
            image_missing: true
        };
        this.setData({ products });
    }
});
