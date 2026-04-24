const app = getApp();
const { get } = require('../../utils/request');
const { cachedGet } = require('../../utils/requestCache');
const { navigateToLimitedSpotProduct, normalizeLimitedSpotMode } = require('../../utils/limitedSpot');
const LIMITED_SALE_OVERVIEW_TTL = 30 * 1000;
const HAS_TIME_ZONE_SUFFIX_RE = /(?:Z|[+-]\d{2}:\d{2})$/i;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseChinaTime(value) {
    if (!value) return NaN;
    const raw = String(value).trim();
    if (!raw) return NaN;
    const normalized = DATE_ONLY_RE.test(raw)
        ? `${raw}T00:00:00+08:00`
        : (HAS_TIME_ZONE_SUFFIX_RE.test(raw) ? raw : `${raw}+08:00`);
    const ts = new Date(normalized).getTime();
    return Number.isFinite(ts) ? ts : NaN;
}

function formatCountdown(ms = 0) {
    const safe = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = safe % 60;
    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function resolveSlotCountdown(slot = {}) {
    const now = Date.now();
    const startTs = parseChinaTime(slot?.start_time);
    const endTs = parseChinaTime(slot?.end_time);
    if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || startTs >= endTs) {
        return {
            label: slot.runtime_status === 'ended' ? '已结束' : '时间异常',
            text: '--:--:--'
        };
    }
    if (slot.runtime_status === 'upcoming' && startTs > now) {
        return {
            label: '距开始',
            text: formatCountdown(startTs - now)
        };
    }
    if (slot.runtime_status === 'running' && endTs > now) {
        return {
            label: '距结束',
            text: formatCountdown(endTs - now)
        };
    }
    return {
        label: slot.runtime_status === 'ended' ? '已结束' : '进行中',
        text: '--:--:--'
    };
}

Page({
    data: {
        statusBarHeight: 20,
        navBarHeight: 44,
        slotId: '',
        slot: null,
        card: null,
        slots: [],
        products: [],
        loading: true,
        countdownLabel: '距结束',
        countdownText: '--:--:--'
    },

    onLoad(query) {
        this._countdownTimer = null;
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navBarHeight: app.globalData.navBarHeight || 44,
            slotId: query.slot_id || ''
        });
        this.loadPage();
    },

    onUnload() {
        this.clearCountdown();
    },

    clearCountdown() {
        if (this._countdownTimer) {
            clearInterval(this._countdownTimer);
            this._countdownTimer = null;
        }
    },

    startCountdown(slot) {
        this.clearCountdown();
        const update = () => {
            const countdown = resolveSlotCountdown(slot);
            this.setData({
                countdownLabel: countdown.label,
                countdownText: countdown.text
            });
        };
        update();
        this._countdownTimer = setInterval(update, 1000);
    },

    onBack() {
        wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/activity/activity' }) });
    },

    async loadPage() {
        this.setData({ loading: true });
        try {
            const overviewRes = await cachedGet(get, '/limited-sales/overview', {}, {
                cacheTTL: LIMITED_SALE_OVERVIEW_TTL,
                showError: false,
                maxRetries: 0
            });
            if (overviewRes.code !== 0 || !overviewRes.data) {
                throw new Error(overviewRes.message || '加载失败');
            }
            const overview = overviewRes.data;
            const slots = Array.isArray(overview.slots) ? overview.slots : [];
            const requestedSlotId = String(this.data.slotId || '').trim();
            const hasRequestedSlot = requestedSlotId
                ? slots.some((item) => String(item.id || '') === requestedSlotId)
                : false;
            const targetSlotId = hasRequestedSlot
                ? requestedSlotId
                : (overview.current_slot_id || overview.recommended_slot_id || '');

            if (!targetSlotId) {
                this.setData({
                    loading: false,
                    slots,
                    card: null,
                    slot: null,
                    products: []
                });
                return;
            }

            await this.loadDetail(targetSlotId, slots);
        } catch (e) {
            this.setData({ loading: false, slot: null, products: [], slots: [] });
            wx.showToast({ title: e.message || '加载失败', icon: 'none' });
        }
    },

    async loadDetail(slotId, slotsFromOverview = null) {
        this.setData({ loading: true });
        try {
            const res = await get('/limited-sales/detail', { slot_id: slotId });
            if (res.code !== 0 || !res.data) {
                throw new Error(res.message || '加载失败');
            }
            const slot = res.data.slot || null;
            const slots = Array.isArray(res.data.slots) && res.data.slots.length
                ? res.data.slots
                : (Array.isArray(slotsFromOverview) ? slotsFromOverview : []);
            if (!slot && slots.length > 0) {
                const fallbackSlotId = String(res.data.current_slot_id || res.data.recommended_slot_id || slots[0].id || '').trim();
                if (fallbackSlotId && fallbackSlotId !== String(slotId || '').trim()) {
                    return this.loadDetail(fallbackSlotId, slots);
                }
            }
            const products = Array.isArray(res.data.items) ? res.data.items : [];
            this.setData({
                slotId: slot ? String(slot.id || '') : '',
                card: slot,
                slot,
                slots,
                products,
                loading: false
            });
            this.startCountdown(slot || {});
        } catch (e) {
            this.clearCountdown();
            this.setData({ loading: false, slot: null, card: null, products: [] });
            wx.showToast({ title: e.message || '加载失败', icon: 'none' });
        }
    },

    onSelectSlot(e) {
        const slotId = String(e.currentTarget.dataset.slotId || '').trim();
        if (!slotId || slotId === String(this.data.slotId || '')) return;
        this.loadDetail(slotId, this.data.slots || []);
    },

    _findOffer(itemId) {
        return (this.data.products || []).find((item) => String(item.item_id || item.offer_id) === String(itemId)) || null;
    },

    openOffer(offer, mode) {
        if (!offer || !offer.product_id) return;
        navigateToLimitedSpotProduct({
            productId: offer.product_id,
            cardId: this.data.slotId,
            offerId: offer.item_id || offer.offer_id,
            mode: normalizeLimitedSpotMode(mode, offer)
        });
    },

    onOpenDetail(e) {
        const offer = this._findOffer(e.currentTarget.dataset.offerId);
        this.openOffer(offer, normalizeLimitedSpotMode('', offer));
    },

    onOpenMoney(e) {
        const offer = this._findOffer(e.currentTarget.dataset.offerId);
        this.openOffer(offer, 'money');
    },

    onOpenPoints(e) {
        const offer = this._findOffer(e.currentTarget.dataset.offerId);
        this.openOffer(offer, 'points');
    },

    onGoodsImageError(e) {
        const index = Number(e.currentTarget.dataset.index || 0);
        const products = Array.isArray(this.data.products) ? this.data.products.slice() : [];
        if (!products[index]) return;
        const product = {
            ...(products[index].product || {}),
            images: ['/assets/images/placeholder.svg']
        };
        products[index] = {
            ...products[index],
            product
        };
        this.setData({ products });
    },

    onShareAppMessage() {
        const slot = this.data.slot || {};
        const slotId = this.data.slotId || '';
        return {
            title: slot.title || '限时商品',
            path: slotId ? `/pages/activity/limited-spot?slot_id=${encodeURIComponent(slotId)}` : '/pages/activity/limited-spot'
        };
    }
});
