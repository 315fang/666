const { get } = require('../../utils/request');
const { warmRenderableImageUrls, resolveRenderableImageUrl } = require('../../utils/cloudAssetRuntime');

function roundMoney(value) {
    const amount = Number(value || 0);
    return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function formatMoney(value) {
    return roundMoney(value).toFixed(2);
}

function cloneSelectedMap(source = {}) {
    const result = {};
    Object.keys(source || {}).forEach((key) => {
        result[key] = Array.isArray(source[key]) ? source[key].slice() : [];
    });
    return result;
}

Page({
    data: {
        id: '',
        loading: true,
        loadError: false,
        bundle: null,
        selectedMap: {},
        selectedCount: 0,
        totalQuantity: 0,
        originalAmount: 0,
        originalAmountText: '0.00',
        bundleDiscount: 0,
        bundleDiscountText: '0.00',
        selectionValid: false,
        selectionMessage: '请选择完整组合',
        orderItems: []
    },

    onLoad(options) {
        const id = options && options.id ? String(options.id) : '';
        if (!id) {
            this.setData({ loading: false, loadError: true });
            return;
        }
        this.setData({ id });
        this.loadBundle();
    },

    async loadBundle() {
        this.setData({ loading: true, loadError: false });
        try {
            const res = await get(`/product-bundles/${this.data.id}`, {}, { showError: false });
            const rawBundle = res && res.data ? res.data : null;
            if (!rawBundle || !rawBundle.id) {
                throw new Error('组合不存在');
            }
            const groupsSource = Array.isArray(rawBundle.groups) ? rawBundle.groups : [];
            const optionProducts = groupsSource.flatMap((group) => (
                Array.isArray(group.options) ? group.options.map((option) => option.product || {}) : []
            ));
            const coverSource = {
                file_id: rawBundle.cover_file_id || '',
                image: rawBundle.cover_image || ''
            };
            await warmRenderableImageUrls([coverSource, ...optionProducts]);
            const groups = await Promise.all((Array.isArray(rawBundle.groups) ? rawBundle.groups : []).map(async (group) => ({
                ...group,
                options: await Promise.all((Array.isArray(group.options) ? group.options : []).map(async (option) => ({
                    ...option,
                    product: {
                        ...(option.product || {}),
                        image: await resolveRenderableImageUrl(option.product || {}, '')
                    }
                })))
            })));
            const bundle = {
                ...rawBundle,
                cover_preview_url: await resolveRenderableImageUrl(coverSource, ''),
                groups
            };
            const selectedMap = {};
            groups.forEach((group) => {
                const options = Array.isArray(group.options) ? group.options : [];
                const minSelect = Math.max(0, Number(group.min_select || 0));
                selectedMap[group.group_key] = options.slice(0, minSelect).map((option) => option.option_key);
            });
            this.setData({
                bundle,
                selectedMap,
                loading: false,
                loadError: false
            });
            this.recalcSelection();
        } catch (error) {
            console.error('[bundle-detail] load failed:', error);
            this.setData({ loading: false, loadError: true, bundle: null });
        }
    },

    recalcSelection() {
        const bundle = this.data.bundle;
        if (!bundle) return;
        const selectedMap = cloneSelectedMap(this.data.selectedMap || {});
        const orderItems = [];
        let originalAmount = 0;
        let totalQuantity = 0;
        let selectedCount = 0;
        let selectionValid = true;
        const nextBundle = {
            ...bundle,
            groups: (bundle.groups || []).map((group) => ({
                ...group,
                options: (group.options || []).map((option) => ({
                    ...option,
                    selected: false
                }))
            }))
        };

        (nextBundle.groups || []).forEach((group) => {
            const selectedKeys = Array.isArray(selectedMap[group.group_key]) ? selectedMap[group.group_key] : [];
            const selectedOptions = (group.options || []).filter((option) => {
                const selected = selectedKeys.includes(option.option_key);
                option.selected = selected;
                return selected;
            });
            const minSelect = Math.max(0, Number(group.min_select || 0));
            const maxSelect = Math.max(minSelect || 1, Number(group.max_select || minSelect || 1));
            if (selectedOptions.length < minSelect || selectedOptions.length > maxSelect) {
                selectionValid = false;
            }
            selectedOptions.forEach((option) => {
                const qty = Math.max(1, Number(option.default_qty || 1));
                const unitPrice = roundMoney(option.product && option.product.retail_price);
                selectedCount += 1;
                totalQuantity += qty;
                originalAmount += roundMoney(unitPrice * qty);
                orderItems.push({
                    product_id: option.product_id,
                    sku_id: option.sku_id || '',
                    quantity: qty,
                    price: unitPrice,
                    name: option.product && option.product.name || '商品',
                    image: option.product && option.product.image || '',
                    spec: option.sku && option.sku.spec_value || '',
                    supports_pickup: option.product && option.product.supports_pickup ? 1 : 0,
                    allow_points: 0,
                    bundle_group_key: group.group_key,
                    bundle_group_title: group.group_title,
                    bundle_parent_title: bundle.title
                });
            });
        });

        const bundleDiscount = Math.max(0, roundMoney(originalAmount - roundMoney(bundle.bundle_price)));
        const priceValid = orderItems.length > 0 ? roundMoney(bundle.bundle_price) <= roundMoney(originalAmount) : true;
        const completeSelection = selectionValid && orderItems.length > 0;
        this.setData({
            bundle: nextBundle,
            orderItems,
            selectedCount,
            totalQuantity,
            originalAmount,
            originalAmountText: formatMoney(originalAmount),
            bundleDiscount,
            bundleDiscountText: formatMoney(bundleDiscount),
            selectionValid: completeSelection && priceValid,
            selectionMessage: completeSelection && !priceValid ? '组合价配置异常' : '请选择完整组合'
        });
    },

    onToggleOption(e) {
        const groupKey = e.currentTarget.dataset.groupKey;
        const optionKey = e.currentTarget.dataset.optionKey;
        const bundle = this.data.bundle;
        if (!bundle || !groupKey || !optionKey) return;
        const group = (bundle.groups || []).find((item) => item.group_key === groupKey);
        if (!group) return;
        const selectedMap = cloneSelectedMap(this.data.selectedMap || {});
        const current = Array.isArray(selectedMap[groupKey]) ? selectedMap[groupKey].slice() : [];
        const exists = current.includes(optionKey);
        const maxSelect = Math.max(1, Number(group.max_select || 1));
        if (maxSelect === 1) {
            selectedMap[groupKey] = exists ? [] : [optionKey];
        } else if (exists) {
            selectedMap[groupKey] = current.filter((item) => item !== optionKey);
        } else {
            if (current.length >= maxSelect) {
                wx.showToast({ title: `该分组最多选择 ${maxSelect} 项`, icon: 'none' });
                return;
            }
            selectedMap[groupKey] = current.concat(optionKey);
        }
        this.setData({ selectedMap });
        this.recalcSelection();
    },

    onRetry() {
        this.loadBundle();
    },

    onBuyNow() {
        if (!this.data.selectionValid || !this.data.bundle) {
            wx.showToast({ title: '请先完成组合选择', icon: 'none' });
            return;
        }
        const bundle = this.data.bundle;
        wx.setStorageSync('directBuyInfo', {
            bundle_mode: 1,
            bundle_id: bundle.id,
            bundle_title: bundle.title,
            bundle_subtitle: bundle.subtitle || '',
            bundle_cover_image: bundle.cover_image || '',
            bundle_price: roundMoney(bundle.bundle_price),
            bundle_original_amount: roundMoney(this.data.originalAmount),
            items: this.data.orderItems
        });
        wx.navigateTo({
            url: '/pages/order/confirm?from=direct'
        });
    }
});
