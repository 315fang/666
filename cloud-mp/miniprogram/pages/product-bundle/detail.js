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

function getOptionImage(option = {}) {
    return option.product && option.product.image ? option.product.image : '';
}

Page({
    data: {
        id: '',
        loading: true,
        loadError: false,
        bundle: null,
        activeGroupKey: '',
        activeGroupIndex: 0,
        selectionSlots: [],
        completedGroupCount: 0,
        totalGroupCount: 0,
        requiredSelectedCount: 0,
        requiredTotalCount: 0,
        bottomProgressText: '',
        bottomActionText: '去结算',
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
                activeGroupKey: groups[0] ? groups[0].group_key : '',
                loading: false,
                loadError: false
            });
            this.recalcSelection();
        } catch (error) {
            console.error('[bundle-detail] load failed:', error);
            this.setData({ loading: false, loadError: true, bundle: null });
        }
    },

    recalcSelection(options = {}) {
        const bundle = this.data.bundle;
        if (!bundle) return;
        const selectedMap = cloneSelectedMap(this.data.selectedMap || {});
        const orderItems = [];
        const sourceGroups = Array.isArray(bundle.groups) ? bundle.groups : [];
        let activeGroupKey = this.data.activeGroupKey || (sourceGroups[0] && sourceGroups[0].group_key) || '';
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
                return selected;
            });
            const minSelect = Math.max(0, Number(group.min_select || 0));
            const maxSelect = Math.max(minSelect || 1, Number(group.max_select || minSelect || 1));
            const groupComplete = selectedOptions.length >= minSelect && selectedOptions.length <= maxSelect;
            const maxReached = selectedOptions.length >= maxSelect;
            group.selected_count = selectedOptions.length;
            group.min_select_count = minSelect;
            group.max_select_count = maxSelect;
            group.complete = groupComplete;
            group.max_reached = maxReached;
            group.rule_text = buildGroupRuleText(group);
            group.status_text = buildGroupStatusText(selectedOptions.length, minSelect, maxSelect);
            group.progress_text = `${selectedOptions.length}/${maxSelect}`;
            group.options = (group.options || []).map((option) => ({
                ...option,
                disabled_by_limit: !option.selected && maxReached
            }));
            requiredTotalCount += minSelect;
            requiredSelectedCount += Math.min(selectedOptions.length, minSelect);
            if (groupComplete) completedGroupCount += 1;
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

        const activeGroup = nextBundle.groups.find((group) => group.group_key === activeGroupKey);
        const shouldAutoAdvance = options.autoAdvance
            && activeGroup
            && activeGroup.complete
            && (
                activeGroup.min_select_count === activeGroup.max_select_count
                || activeGroup.selected_count >= activeGroup.max_select_count
            );
        if (shouldAutoAdvance) {
            const activeIndex = nextBundle.groups.findIndex((group) => group.group_key === activeGroup.group_key);
            const nextIncomplete = nextBundle.groups
                .slice(activeIndex + 1)
                .find((group) => !group.complete)
                || nextBundle.groups.find((group) => !group.complete);
            if (nextIncomplete) activeGroupKey = nextIncomplete.group_key;
        }
        if (!nextBundle.groups.some((group) => group.group_key === activeGroupKey)) {
            activeGroupKey = nextBundle.groups[0] ? nextBundle.groups[0].group_key : '';
        }
        let activeGroupIndex = 0;
        nextBundle.groups = nextBundle.groups.map((group, index) => {
            const active = group.group_key === activeGroupKey;
            if (active) activeGroupIndex = index;
            return { ...group, active };
        });

        const selectionSlots = nextBundle.groups.map((group, index) => {
            const selectedOptions = (group.options || []).filter((option) => option.selected);
            const firstOption = selectedOptions[0] || null;
            return {
                group_key: group.group_key,
                group_title: group.group_title,
                index: index + 1,
                active: group.active,
                complete: group.complete,
                selected_count: selectedOptions.length,
                image: firstOption ? getOptionImage(firstOption) : '',
                extra_count: Math.max(0, selectedOptions.length - 1),
                status_text: group.status_text
            };
        });

        const bundleDiscount = Math.max(0, roundMoney(originalAmount - roundMoney(bundle.bundle_price)));
        const priceValid = orderItems.length > 0 ? roundMoney(bundle.bundle_price) <= roundMoney(originalAmount) : true;
        const completeSelection = selectionValid && orderItems.length > 0;
        const missingGroup = nextBundle.groups.find((group) => !group.complete);
        const missingText = missingGroup
            ? `还差「${missingGroup.group_title}」${Math.max(1, missingGroup.min_select_count - missingGroup.selected_count)}件`
            : '已完成搭配';
        const bottomActionText = completeSelection && priceValid ? '去结算' : missingText;
        this.setData({
            bundle: nextBundle,
            activeGroupKey,
            activeGroupIndex,
            selectionSlots,
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
            selectionMessage: completeSelection && !priceValid ? '组合价配置异常' : missingText,
            bottomProgressText: completeSelection && priceValid
                ? `已选 ${selectedCount} 项 / ${totalQuantity} 件`
                : `已完成 ${requiredSelectedCount}/${requiredTotalCount}`,
            bottomActionText: completeSelection && !priceValid ? '组合价异常' : bottomActionText
        });
    },

    onSwitchGroup(e) {
        const groupKey = e.currentTarget.dataset.groupKey;
        if (!groupKey || groupKey === this.data.activeGroupKey) return;
        this.setData({ activeGroupKey: groupKey });
        this.recalcSelection();
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
        this.recalcSelection({ autoAdvance: !exists });
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
