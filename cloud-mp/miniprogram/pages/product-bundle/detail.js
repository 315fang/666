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

function cloneSelectedQtyMap(source = {}) {
    const result = {};
    Object.keys(source || {}).forEach((key) => {
        const qty = Math.max(0, Math.floor(Number(source[key] || 0)));
        if (qty > 0) result[key] = qty;
    });
    return result;
}

function selectionQtyKey(groupKey, optionKey) {
    return `${groupKey}::${optionKey}`;
}

function isRepeatableOption(option = {}) {
    return option.repeatable === true || option.repeatable === 1 || option.repeatable === '1';
}

function getOptionMaxQty(option = {}) {
    return isRepeatableOption(option)
        ? Math.max(1, Math.floor(Number(option.max_qty_per_order || option.max_qty || option.default_qty || 1)))
        : 1;
}

function getOptionDefaultQty(option = {}) {
    return Math.min(
        getOptionMaxQty(option),
        Math.max(1, Math.floor(Number(option.default_qty || 1)))
    );
}

function sanitizeFlexBundleSubtitle(text) {
    const value = String(text || '').trim();
    if (!value) return '';
    return /点击|下一步|上方|搭配进度|切换|步骤|第[一二三四五六七八九十0-9]+步/.test(value) ? '' : value;
}

function getGroupSelectedTotal(groupKey, selectedKeys = [], selectedQtyMap = {}) {
    return (Array.isArray(selectedKeys) ? selectedKeys : []).reduce((sum, optionKey) => {
        return sum + Math.max(1, Number(selectedQtyMap[selectionQtyKey(groupKey, optionKey)] || 1));
    }, 0);
}

function buildInitialSelection(groups = []) {
    const selectedMap = {};
    const selectedQtyMap = {};
    groups.forEach((group) => {
        const options = Array.isArray(group.options) ? group.options : [];
        const minSelect = Math.max(0, Number(group.min_select || 0));
        let remaining = minSelect;
        selectedMap[group.group_key] = [];
        for (const option of options) {
            if (remaining <= 0) break;
            const maxQty = getOptionMaxQty(option);
            const qty = Math.min(maxQty, remaining);
            if (qty <= 0) continue;
            selectedMap[group.group_key].push(option.option_key);
            selectedQtyMap[selectionQtyKey(group.group_key, option.option_key)] = qty;
            remaining -= qty;
        }
    });
    return { selectedMap, selectedQtyMap };
}

function appendImageCandidates(target, value) {
    if (!value) return;
    if (Array.isArray(value)) {
        value.forEach((item) => appendImageCandidates(target, item));
        return;
    }
    if (typeof value === 'string') {
        const text = value.trim();
        if (!text) return;
        if (text.startsWith('[')) {
            try {
                appendImageCandidates(target, JSON.parse(text));
                return;
            } catch (_) {}
        }
        target.push(text);
        return;
    }
    if (typeof value !== 'object') return;
    [
        value.display_image,
        value.displayImage,
        value.image_url,
        value.imageUrl,
        value.url,
        value.temp_url,
        value.image,
        value.cover_image,
        value.coverImage,
        value.cover,
        value.cover_url,
        value.coverUrl,
        value.file_id,
        value.fileId,
        value.image_ref,
        value.imageRef,
        value.thumb,
        value.thumbnail,
        value.images,
        value.preview_images,
        value.previewImages,
        value.image_candidates,
        value.imageCandidates
    ].forEach((item) => appendImageCandidates(target, item));
}

function uniqImageCandidates(values = []) {
    const seen = new Set();
    const result = [];
    appendImageCandidates(result, values);
    return result.filter((item) => {
        if (!item || seen.has(item)) return false;
        seen.add(item);
        return true;
    });
}

function buildGroupRuleText(group = {}) {
    const minSelect = Math.max(0, Number(group.min_select || 0));
    const maxSelect = Math.max(minSelect || 1, Number(group.max_select || minSelect || 1));
    if (minSelect === maxSelect) return minSelect > 0 ? `必选 ${minSelect} 件` : '可选';
    if (minSelect <= 0) return `可选 0-${maxSelect} 件`;
    return `至少 ${minSelect} 件，最多 ${maxSelect} 件`;
}

function buildGroupStatusText(selectedCount, minSelect, maxSelect) {
    if (selectedCount < minSelect) return `还差 ${minSelect - selectedCount} 件`;
    if (selectedCount >= maxSelect) return '已选满';
    if (maxSelect > minSelect) return `已选 ${selectedCount}/${maxSelect}`;
    return '已完成';
}

Page({
    data: {
        id: '',
        loading: true,
        loadError: false,
        bundle: null,
        completedGroupCount: 0,
        totalGroupCount: 0,
        requiredSelectedCount: 0,
        requiredTotalCount: 0,
        bottomProgressText: '',
        bottomActionText: '去付款',
        selectedMap: {},
        selectedQtyMap: {},
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
                options: await Promise.all((Array.isArray(group.options) ? group.options : []).map(async (option) => {
                    const sourceProduct = option.product || {};
                    const resolvedImage = await resolveRenderableImageUrl(sourceProduct, '');
                    const imageCandidates = uniqImageCandidates([resolvedImage, sourceProduct, option.sku]);
                    return {
                        ...option,
                        product: {
                            ...sourceProduct,
                            image: resolvedImage || imageCandidates[0] || '',
                            images: imageCandidates.length ? imageCandidates : sourceProduct.images,
                            image_candidates: imageCandidates
                        }
                    };
                }))
            })));
            const bundle = {
                ...rawBundle,
                subtitle: rawBundle.scene_type === 'flex_bundle'
                    ? sanitizeFlexBundleSubtitle(rawBundle.subtitle)
                    : rawBundle.subtitle,
                hero_subtitle: rawBundle.scene_type === 'flex_bundle'
                    ? sanitizeFlexBundleSubtitle(rawBundle.hero_subtitle)
                    : rawBundle.hero_subtitle,
                cover_preview_url: await resolveRenderableImageUrl(coverSource, ''),
                groups
            };
            wx.setNavigationBarTitle({
                title: bundle.scene_type === 'flex_bundle' ? '随心搭配' : '组合套装'
            });
            const { selectedMap, selectedQtyMap } = buildInitialSelection(groups);
            this.setData({
                bundle,
                selectedMap,
                selectedQtyMap,
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
        const selectedQtyMap = cloneSelectedQtyMap(this.data.selectedQtyMap || {});
        const orderItems = [];
        const sourceGroups = Array.isArray(bundle.groups) ? bundle.groups : [];
        let originalAmount = 0;
        let totalQuantity = 0;
        let selectedCount = 0;
        let completedGroupCount = 0;
        let requiredSelectedCount = 0;
        let requiredTotalCount = 0;
        let selectionValid = true;
        const nextBundle = {
            ...bundle,
            groups: sourceGroups.map((group) => ({
                ...group,
                options: (group.options || []).map((option) => ({
                    ...option,
                    selected: false,
                    disabled_by_limit: false
                }))
            }))
        };

        (nextBundle.groups || []).forEach((group) => {
            const selectedKeys = Array.isArray(selectedMap[group.group_key]) ? selectedMap[group.group_key] : [];
            const selectedOptions = (group.options || []).filter((option) => {
                const selected = selectedKeys.includes(option.option_key);
                option.selected = selected;
                const qtyKey = selectionQtyKey(group.group_key, option.option_key);
                const selectedQty = selected
                    ? Math.min(getOptionMaxQty(option), Math.max(1, Number(selectedQtyMap[qtyKey] || getOptionDefaultQty(option))))
                    : 0;
                option.selected_quantity = selectedQty;
                option.max_select_quantity = getOptionMaxQty(option);
                option.show_qty_stepper = selected && isRepeatableOption(option);
                option.quantity_text = `×${selected ? selectedQty : getOptionDefaultQty(option)}`;
                option.select_text = selected ? '已选' : '选这个';
                return selected;
            });
            const minSelect = Math.max(0, Number(group.min_select || 0));
            const maxSelect = Math.max(minSelect || 1, Number(group.max_select || minSelect || 1));
            const selectedTotal = selectedOptions.reduce((sum, option) => sum + Math.max(1, Number(option.selected_quantity || 1)), 0);
            const groupComplete = selectedTotal >= minSelect && selectedTotal <= maxSelect;
            const maxReached = selectedTotal >= maxSelect;
            group.selected_count = selectedTotal;
            group.min_select_count = minSelect;
            group.max_select_count = maxSelect;
            group.complete = groupComplete;
            group.max_reached = maxReached;
            group.rule_text = buildGroupRuleText(group);
            group.status_text = buildGroupStatusText(selectedTotal, minSelect, maxSelect);
            group.progress_text = `${selectedTotal}/${maxSelect}`;
            group.options = (group.options || []).map((option) => ({
                ...option,
                disabled_by_limit: !option.selected && maxReached,
                increase_disabled: option.selected && (Number(option.selected_quantity || 0) >= Number(option.max_select_quantity || 1) || maxReached),
                select_text: option.selected ? '已选' : (maxReached ? '已满' : '选这个')
            }));
            requiredTotalCount += minSelect;
            requiredSelectedCount += Math.min(selectedTotal, minSelect);
            if (groupComplete) completedGroupCount += 1;
            if (selectedTotal < minSelect || selectedTotal > maxSelect) {
                selectionValid = false;
            }
            selectedOptions.forEach((option) => {
                const qty = Math.max(1, Number(option.selected_quantity || 1));
                const unitPrice = roundMoney(option.product && option.product.retail_price);
                const imageCandidates = uniqImageCandidates([option.sku, option.product, option.image, option.image_url]);
                const image = imageCandidates[0] || '';
                selectedCount += 1;
                totalQuantity += qty;
                originalAmount += roundMoney(unitPrice * qty);
                orderItems.push({
                    product_id: option.product_id,
                    sku_id: option.sku_id || '',
                    quantity: qty,
                    price: unitPrice,
                    name: option.product && option.product.name || '商品',
                    image,
                    product_image: image,
                    image_url: image,
                    images: imageCandidates,
                    image_candidates: imageCandidates,
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
        const missingGroup = nextBundle.groups.find((group) => !group.complete);
        const missingText = missingGroup
            ? `还差「${missingGroup.group_title}」${Math.max(1, missingGroup.min_select_count - missingGroup.selected_count)}件`
            : '已完成搭配';
        const bottomActionText = completeSelection && priceValid ? '去付款' : missingText;
        this.setData({
            bundle: nextBundle,
            completedGroupCount,
            totalGroupCount: nextBundle.groups.length,
            requiredSelectedCount,
            requiredTotalCount,
            orderItems,
            selectedCount,
            totalQuantity,
            originalAmount,
            originalAmountText: formatMoney(originalAmount),
            bundleDiscount,
            bundleDiscountText: formatMoney(bundleDiscount),
            selectionValid: completeSelection && priceValid,
            selectionMessage: completeSelection && !priceValid ? '价格暂不可用' : missingText,
            bottomProgressText: `已选 ${selectedCount} 项 / ${totalQuantity} 件`,
            bottomActionText: completeSelection && !priceValid ? '价格待确认' : bottomActionText
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
        const selectedQtyMap = cloneSelectedQtyMap(this.data.selectedQtyMap || {});
        const current = Array.isArray(selectedMap[groupKey]) ? selectedMap[groupKey].slice() : [];
        const exists = current.includes(optionKey);
        const maxSelect = Math.max(1, Number(group.max_select || 1));
        const qtyKey = selectionQtyKey(groupKey, optionKey);
        const currentSelectedTotal = getGroupSelectedTotal(groupKey, current, selectedQtyMap);
        const option = (group.options || []).find((item) => item.option_key === optionKey);
        const remaining = Math.max(0, maxSelect - currentSelectedTotal);
        if (maxSelect === 1) {
            selectedMap[groupKey] = exists ? [] : [optionKey];
            Object.keys(selectedQtyMap).forEach((key) => {
                if (key.indexOf(`${groupKey}::`) === 0) delete selectedQtyMap[key];
            });
            if (!exists) selectedQtyMap[qtyKey] = 1;
        } else if (exists) {
            selectedMap[groupKey] = current.filter((item) => item !== optionKey);
            delete selectedQtyMap[qtyKey];
        } else {
            if (remaining <= 0) {
                wx.showToast({ title: `该分组最多选择 ${maxSelect} 项`, icon: 'none' });
                return;
            }
            selectedQtyMap[qtyKey] = Math.min(getOptionDefaultQty(option), getOptionMaxQty(option), remaining);
            selectedMap[groupKey] = current.concat(optionKey);
        }
        this.setData({ selectedMap, selectedQtyMap });
        this.recalcSelection();
    },

    onIncreaseOptionQty(e) {
        const groupKey = e.currentTarget.dataset.groupKey;
        const optionKey = e.currentTarget.dataset.optionKey;
        const bundle = this.data.bundle;
        if (!bundle || !groupKey || !optionKey) return;
        const group = (bundle.groups || []).find((item) => item.group_key === groupKey);
        const option = group && (group.options || []).find((item) => item.option_key === optionKey);
        if (!group || !option || !option.selected || !isRepeatableOption(option)) return;
        const selectedMap = cloneSelectedMap(this.data.selectedMap || {});
        const selectedQtyMap = cloneSelectedQtyMap(this.data.selectedQtyMap || {});
        const current = Array.isArray(selectedMap[groupKey]) ? selectedMap[groupKey] : [];
        const maxSelect = Math.max(1, Number(group.max_select || 1));
        const qtyKey = selectionQtyKey(groupKey, optionKey);
        const currentQty = Math.max(1, Number(selectedQtyMap[qtyKey] || option.selected_quantity || 1));
        if (currentQty >= getOptionMaxQty(option)) {
            wx.showToast({ title: '已达该商品上限', icon: 'none' });
            return;
        }
        if (getGroupSelectedTotal(groupKey, current, selectedQtyMap) >= maxSelect) {
            wx.showToast({ title: `该分组最多选择 ${maxSelect} 件`, icon: 'none' });
            return;
        }
        selectedQtyMap[qtyKey] = currentQty + 1;
        this.setData({ selectedQtyMap });
        this.recalcSelection();
    },

    onDecreaseOptionQty(e) {
        const groupKey = e.currentTarget.dataset.groupKey;
        const optionKey = e.currentTarget.dataset.optionKey;
        const bundle = this.data.bundle;
        if (!bundle || !groupKey || !optionKey) return;
        const group = (bundle.groups || []).find((item) => item.group_key === groupKey);
        const option = group && (group.options || []).find((item) => item.option_key === optionKey);
        if (!group || !option || !option.selected || !isRepeatableOption(option)) return;
        const selectedMap = cloneSelectedMap(this.data.selectedMap || {});
        const selectedQtyMap = cloneSelectedQtyMap(this.data.selectedQtyMap || {});
        const qtyKey = selectionQtyKey(groupKey, optionKey);
        const currentQty = Math.max(1, Number(selectedQtyMap[qtyKey] || option.selected_quantity || 1));
        if (currentQty <= 1) {
            selectedMap[groupKey] = (selectedMap[groupKey] || []).filter((item) => item !== optionKey);
            delete selectedQtyMap[qtyKey];
        } else {
            selectedQtyMap[qtyKey] = currentQty - 1;
        }
        this.setData({ selectedMap, selectedQtyMap });
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
            bundle_scene_type: bundle.scene_type || '',
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
