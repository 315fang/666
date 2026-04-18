// pages/lottery/lottery.js
const app = getApp();
const { get, post } = require('../../utils/request');
const { getConfigSection } = require('../../utils/miniProgramConfig');
const { fetchPointBalance } = require('../../utils/points');

const PRIZE_STYLE_MAP = {
    physical: { display_emoji: '🎁', theme_color: '#F59E0B', accent_color: '#FDE68A', badge_text: '实物奖' },
    points: { display_emoji: '⭐', theme_color: '#2563EB', accent_color: '#93C5FD', badge_text: '积分奖' },
    coupon: { display_emoji: '🎫', theme_color: '#10B981', accent_color: '#6EE7B7', badge_text: '优惠券' },
    miss: { display_emoji: '🍀', theme_color: '#6B7280', accent_color: '#D1D5DB', badge_text: '好运签' }
};

function getDefaultPrizeStyle(type = 'miss') {
    return { ...(PRIZE_STYLE_MAP[type] || PRIZE_STYLE_MAP.miss) };
}

function formatPrizeValue(prize = {}) {
    const value = Number(prize.prize_value || 0);
    if (prize.type === 'points' && value > 0) return `${value} 积分`;
    if (prize.type === 'coupon' && value > 0) return `${value} 元券`;
    if (prize.type === 'physical') return '实物礼品';
    return '试试下一次好运';
}

function resolvePrizeImage(prize = {}) {
    const raw = String(prize.image_url || prize.url || prize.image || prize.cover_image || '').trim();
    if (!raw || /^cloud:\/\//i.test(raw)) return '';
    return raw;
}

function normalizePrize(prize = {}) {
    const style = getDefaultPrizeStyle(prize.type);
    return {
        ...prize,
        image_url: resolvePrizeImage(prize),
        display_emoji: prize.display_emoji || style.display_emoji,
        theme_color: prize.theme_color || style.theme_color,
        accent_color: prize.accent_color || style.accent_color,
        badge_text: prize.badge_text || style.badge_text,
        display_value: formatPrizeValue(prize)
    };
}

function buildMachineCapsules(prizes = []) {
    const source = prizes.length ? prizes : [
        normalizePrize({ id: 'placeholder-1', type: 'miss', name: '好运签' }),
        normalizePrize({ id: 'placeholder-2', type: 'points', name: '积分奖' }),
        normalizePrize({ id: 'placeholder-3', type: 'coupon', name: '优惠券' })
    ];

    return Array.from({ length: Math.max(6, source.length) }).map((_, index) => {
        const prize = source[index % source.length];
        return {
            ...prize,
            cloudOffset: (index % 3) * 6
        };
    });
}

Page({
    data: {
        statusBarHeight: 20,
        navTopPadding: 20,
        navBarHeight: 44,
        heroTitle: '用积分试一次手气',
        heroSubtitle: '把账户里的积分换成一次轻量抽奖，命中结果后会同步进入中奖记录。',
        panelTitle: '积分抽奖机',
        panelSubtitle: '点击开始后会先出球，再揭晓这次抽到的奖项。',
        resultWinTitle: '抽中了',
        resultMissTitle: '这次未命中',
        emptyRecordText: '暂无记录，快来抽奖吧',
        defaultRecordCount: 3,
        defaultPrizeCount: 4,
        mode: 'spin',
        prizes: [],
        prizesExpanded: false,
        machineCapsules: [],
        records: [],
        recordsExpanded: false,
        pointBalance: 0,
        costPoints: 50,
        spinning: false,
        opening: false,
        showResult: false,
        lastPrize: null,
        prizeEmoji: Object.keys(PRIZE_STYLE_MAP).reduce((map, key) => {
            map[key] = PRIZE_STYLE_MAP[key].display_emoji;
            return map;
        }, {})
    },

    onLoad() {
        const lotteryConfig = getConfigSection('lottery_config');
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navTopPadding: app.globalData.navTopPadding || (app.globalData.statusBarHeight || 20),
            navBarHeight: app.globalData.navBarHeight || 44,
            heroTitle: lotteryConfig.hero_title || '用积分试一次手气',
            heroSubtitle: lotteryConfig.hero_subtitle || '把账户里的积分换成一次轻量抽奖，命中结果后会同步进入中奖记录。',
            panelTitle: lotteryConfig.panel_title || '积分抽奖机',
            panelSubtitle: lotteryConfig.panel_subtitle || '点击开始后会先出球，再揭晓这次抽到的奖项。',
            resultWinTitle: lotteryConfig.result_win_title || '抽中了',
            resultMissTitle: lotteryConfig.result_miss_title || '这次未命中',
            emptyRecordText: lotteryConfig.empty_record_text || '暂无记录，快来抽奖吧'
        });
        this.loadData();
    },

    onShow() {
        if (this._lotteryReloading) return;
        this._lotteryReloading = true;
        this.loadData().finally(() => {
            this._lotteryReloading = false;
        });
    },

    onUnload() {
        this.clearAnimationTimers();
    },

    clearAnimationTimers() {
        if (this._machineTimer) clearTimeout(this._machineTimer);
        if (this._revealTimer) clearTimeout(this._revealTimer);
        this._machineTimer = null;
        this._revealTimer = null;
    },

    async loadData() {
        await Promise.allSettled([
            this.loadPrizes(),
            this.loadRecords(),
            this.loadPointBalance()
        ]);
    },

    async loadPrizes() {
        try {
            const res = await get('/lottery/prizes');
            if (res.code === 0) {
                const prizeList = res.list || res.data?.list || res.data || [];
                const prizes = (Array.isArray(prizeList) ? prizeList : []).map(normalizePrize);
                this.setData({
                    prizes,
                    machineCapsules: buildMachineCapsules(prizes),
                    costPoints: prizes[0]?.cost_points || 50
                });
            }
        } catch (e) {
            console.error('加载奖品失败:', e);
        }
    },

    async loadRecords() {
        try {
            const res = await get('/lottery/records', { page: 1, limit: 10 });
            if (res.code === 0) {
                const records = (res.data?.list || []).map((item) => ({
                    ...item,
                    display_emoji: getDefaultPrizeStyle(item.prize_type).display_emoji
                }));
                this.setData({ records });
            }
        } catch (e) {
            console.error('加载记录失败:', e);
        }
    },

    toggleRecords() {
        this.setData({
            recordsExpanded: !this.data.recordsExpanded
        });
    },

    togglePrizes() {
        this.setData({
            prizesExpanded: !this.data.prizesExpanded
        });
    },

    async loadPointBalance() {
        try {
            const pointBalance = await fetchPointBalance();
            this.setData({ pointBalance });
        } catch (e) {
            console.error('加载积分失败:', e);
        }
    },

    async onDraw() {
        if (this.data.spinning || this.data.opening) return;
        if (!app.globalData.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        if (this.data.pointBalance < this.data.costPoints) {
            wx.showModal({
                title: '积分不足',
                content: `本次抽奖需要 ${this.data.costPoints} 积分，当前余额不足`,
                showCancel: false
            });
            return;
        }

        this.setData({
            spinning: true,
            opening: false,
            showResult: false,
            lastPrize: null
        });

        try {
            const res = await post('/lottery/draw');
            if (res.code !== 0) {
                wx.showToast({ title: res.message || '抽奖失败', icon: 'none' });
                this.setData({ spinning: false, opening: false });
                return;
            }

            const prize = normalizePrize(res.data?.prize || {});
            this.setData({
                lastPrize: prize,
                pointBalance: Math.max(0, this.data.pointBalance - this.data.costPoints)
            });
            this.playMachineReveal();

            this.loadRecords();
            this.loadPointBalance();
        } catch (e) {
            wx.showToast({ title: e?.message || '网络错误，请重试', icon: 'none' });
            this.setData({ spinning: false, opening: false });
        }
    },

    playMachineReveal() {
        this.clearAnimationTimers();
        this._machineTimer = setTimeout(() => {
            this.setData({ opening: true });
        }, 900);
        this._revealTimer = setTimeout(() => {
            this.setData({
                spinning: false,
                opening: false,
                showResult: true
            });
        }, 1900);
    },

    closeResult() {
        this.setData({ showResult: false });
    },

    onBack() {
        const { safeBack } = require('../../utils/navigator');
        safeBack('/pages/activity/activity');
    }
});
