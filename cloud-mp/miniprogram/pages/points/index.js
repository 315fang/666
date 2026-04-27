// pages/points/index.js
const { get } = require('../../utils/request');
const { safeBack } = require('../../utils/navigator');
const { fetchPointSummary, checkinPoints } = require('../../utils/points');
const { getFeatureFlags, getLightPromptModals, getConfigSection } = require('../../utils/miniProgramConfig');
const { shouldShowDaily, markDailyShown } = require('../../utils/lightPrompt');

function getPointDeductionRule() {
    const rule = getConfigSection('point_rule_config') || {};
    const deduction = rule.deduction || rule.redeem || {};
    const yuanPerPoint = Number(
        deduction.yuan_per_point
        ?? deduction.value_per_point
        ?? rule.yuan_per_point
        ?? rule.point_value
        ?? 0.1
    );
    const maxRatio = Number(
        deduction.max_order_ratio
        ?? deduction.max_deduction_ratio
        ?? rule.max_order_ratio
        ?? rule.max_deduction_ratio
        ?? 0.7
    );
    return {
        yuanPerPoint: Number.isFinite(yuanPerPoint) && yuanPerPoint > 0 ? yuanPerPoint : 0.1,
        maxRatio: Number.isFinite(maxRatio) && maxRatio > 0 ? Math.max(0.7, Math.min(1, maxRatio)) : 0.7
    };
}

function buildEffectiveBenefits(account = {}, featureFlags = {}) {
    const { yuanPerPoint, maxRatio } = getPointDeductionRule();
    const benefits = [
        `下单时可使用积分抵扣，当前 1 积分可抵 ${yuanPerPoint} 元，最多可抵订单金额的 ${Math.round(maxRatio * 100)}%`,
        '部分活动商品支持积分兑换或积分加现金购买'
    ];
    if (featureFlags.enable_lottery_entry === true) {
        benefits.splice(1, 0, '可用于积分抽奖');
    }
    if (account.next_level) {
        benefits.push(`成长值用于会员等级展示，距 ${account.next_level.name} 还差 ${account.next_level.growth_needed || 0} 成长值`);
    } else {
        benefits.push('已达到当前成长体系最高展示档位');
    }
    return benefits;
}

function getPointsTip(featureFlags = {}) {
    const mod = getLightPromptModals().points_checkin || {};
    const pointsUsageText = featureFlags.enable_lottery_entry === true
        ? '下单积分抵扣、积分抽奖，以及部分活动商品的积分兑换'
        : '下单积分抵扣，以及部分活动商品的积分兑换';
    return {
        title: mod.title || '签到与积分',
        body: `当前已生效的积分能力包括：每日签到得积分、${pointsUsageText}。成长值用于会员等级展示，未明确开放的额外特权暂不生效。`
    };
}

function extractList(res, extraKey) {
    if (!res) return [];
    const data = res.data;
    const list = Array.isArray(res.list)
        ? res.list
        : (data && Array.isArray(data.list)
            ? data.list
            : (extraKey && data && Array.isArray(data[extraKey]) ? data[extraKey] : data));
    return Array.isArray(list) ? list : [];
}

function pickText(...values) {
    for (const value of values) {
        if (value === null || value === undefined) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return '';
}

function toPointAmount(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function pad2(value) {
    return String(value).padStart(2, '0');
}

function formatLogTime(value) {
    const raw = pickText(value);
    if (!raw) return '';
    const date = new Date(raw);
    if (!Number.isFinite(date.getTime())) return raw;
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

const POINT_LOG_TYPE_LABELS = {
    earn: '积分获得',
    income: '积分获得',
    add: '积分增加',
    reward: '积分奖励',
    spend: '积分使用',
    deduct: '积分抵扣',
    consume: '积分使用',
    use: '积分使用',
    refund: '积分退回',
    return: '积分退回',
    expired: '积分过期',
    expire: '积分过期',
    adjust: '积分调整',
    adjustment: '积分调整'
};

const POINT_LOG_SOURCE_LABELS = {
    sign_in: '每日签到',
    checkin: '每日签到',
    order_pay: '订单积分',
    invite_success: '邀请奖励',
    lottery_draw: '积分抽奖',
    lottery_prize: '抽奖奖励',
    admin_adjustment: '后台调整'
};

const POINT_DECREASE_TYPES = new Set(['spend', 'deduct', 'consume', 'use', 'expired', 'expire']);

function resolvePointLogLabel(log = {}) {
    const type = pickText(log.type || log.change_type).toLowerCase();
    const source = pickText(log.source || log.scene || log.ref_type).toLowerCase();
    return POINT_LOG_SOURCE_LABELS[source] || POINT_LOG_TYPE_LABELS[type] || '积分变动';
}

function normalizePointLog(log = {}) {
    const rawType = pickText(log.type || log.change_type).toLowerCase();
    const rawAmount = log.amount != null ? log.amount : log.points;
    let amount = toPointAmount(rawAmount, 0);
    if (POINT_DECREASE_TYPES.has(rawType) && amount > 0) {
        amount = -amount;
    }
    return {
        ...log,
        amount,
        display_title: pickText(log.remark, log.description, resolvePointLogLabel(log)),
        display_time: formatLogTime(log.created_at || log.createdAt || log.time),
        balance_after: log.balance_after != null ? log.balance_after : (log.balanceAfter != null ? log.balanceAfter : '')
    };
}

function normalizeTask(task = {}) {
    const points = task.points != null ? task.points : task.points_reward;
    const completed = task.completed != null ? task.completed : task.done;
    return {
        ...task,
        name: task.name || task.title || '积分任务',
        description: task.description || task.desc || '',
        points_reward: points,
        show_reward: Number(points || 0) > 0,
        completed: !!completed,
        progress: task.current || (completed ? 1 : 0),
        max_progress: task.total || 1
    };
}

Page({
    data: {
        account: null,
        logs: [],
        tasks: [],
        effectiveBenefits: [],
        loading: true,
        checkinLoading: false,
        activeTab: 'tasks',  // tasks | logs | redeem
        statusBarHeight: 20,
        navTopPadding: 20,
        navBarHeight: 44,
        featureFlags: {
            enable_lottery_entry: true
        },
        showLotteryEntry: false,
        lightTipShow: false,
        lightTipTitle: '',
        lightTipContent: ''
    },

    onLoad() {
        const app = getApp();
        const featureFlags = getFeatureFlags();
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navTopPadding: app.globalData.navTopPadding || (app.globalData.statusBarHeight || 20),
            navBarHeight: app.globalData.navBarHeight || 44,
            featureFlags,
            showLotteryEntry: featureFlags.enable_lottery_entry === true
        });
        this.loadAll();
    },

    async onShow() {
        const featureFlags = getFeatureFlags();
        this.setData({
            featureFlags,
            showLotteryEntry: featureFlags.enable_lottery_entry === true
        });
        await this.loadAccount();
        this._tryPointsCheckinPrompt();
    },

    _tryPointsCheckinPrompt() {
        const mod = getLightPromptModals().points_checkin;
        if (!mod || !mod.enabled) return;
        if (!shouldShowDaily('light_tip_points_checkin')) return;
        markDailyShown('light_tip_points_checkin');
        const tip = getPointsTip(this.data.featureFlags);
        this.setData({
            lightTipShow: true,
            lightTipTitle: tip.title,
            lightTipContent: tip.body
        });
    },

    onPointsTipTap() {
        const mod = getLightPromptModals().points_checkin;
        if (!mod || !mod.enabled) {
            wx.showToast({ title: '暂无可展示说明', icon: 'none' });
            return;
        }
        const tip = getPointsTip(this.data.featureFlags);
        this.setData({
            lightTipShow: true,
            lightTipTitle: tip.title,
            lightTipContent: tip.body
        });
    },

    onLightTipClose() {
        this.setData({ lightTipShow: false });
    },

    async loadAll() {
        await Promise.all([
            this.loadAccount(),
            this.loadTasks(),
            this.loadLogs()
        ]);
        this.setData({ loading: false });
    },

    async loadAccount() {
        try {
            const { account } = await fetchPointSummary();
            this.setData({
                account,
                effectiveBenefits: buildEffectiveBenefits(account, this.data.featureFlags)
            });
        } catch (e) {
            console.error('加载积分账户失败', e);
        }
    },

    async loadTasks() {
        try {
            const res = await get('/points/tasks');
            if (res.code === 0) {
                this.setData({
                    tasks: extractList(res, 'tasks').map(normalizeTask)
                });
            }
        } catch (e) {
            console.error('加载任务失败', e);
        }
    },

    async loadLogs() {
        try {
            const res = await get('/points/logs', { page: 1, limit: 30 });
            if (res.code === 0) {
                this.setData({
                    logs: extractList(res).map(normalizePointLog)
                });
            }
        } catch (e) {
            console.error('加载流水失败', e);
        }
    },

    // 每日签到
    async onCheckin() {
        if (this.data.checkinLoading) return;
        this.setData({ checkinLoading: true });
        try {
            wx.showLoading({ title: '签到中...' });
            const res = await checkinPoints();
            wx.hideLoading();
            if (res.code === 0) {
                const data = res.data || res;
                const earned = data.points_earned != null ? data.points_earned : (data.points || 0);
                const streak = data.streak != null ? data.streak : (data.consecutive_days || 1);
                wx.showToast({
                    title: `+${earned}分 ${streak}天连签`,
                    icon: 'none',
                    duration: 2500
                });
                await this.loadAccount();
                await Promise.all([this.loadTasks(), this.loadLogs()]);
            } else {
                wx.showToast({ title: res.message || '今日已签到', icon: 'none' });
            }
        } catch (e) {
            wx.hideLoading();
            wx.showToast({ title: '签到失败', icon: 'none' });
        } finally {
            this.setData({ checkinLoading: false });
        }
    },

    switchTab(e) {
        this.setData({ activeTab: e.currentTarget.dataset.tab });
        if (e.currentTarget.dataset.tab === 'logs' && this.data.logs.length === 0) {
            this.loadLogs();
        }
    },

    onBackTap() {
        safeBack();
    },

    onOpenLottery() {
        if (!this.data.showLotteryEntry) {
            wx.showToast({ title: '抽奖入口暂未开放', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/lottery/lottery' });
    },

    /** 活动 Tab：限时活动卡片、积分专享等 */
    onOpenActivityMall() {
        wx.switchTab({ url: '/pages/activity/activity' });
    }
});
