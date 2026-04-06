// pages/points/index.js
const { get } = require('../../utils/request');
const { safeBack } = require('../../utils/navigator');
const { fetchPointSummary, checkinPoints } = require('../../utils/points');
const { getLightPromptModals } = require('../../utils/miniProgramConfig');
const { shouldShowDaily, markDailyShown } = require('../../utils/lightPrompt');

Page({
    data: {
        account: null,
        logs: [],
        tasks: [],
        loading: true,
        checkinLoading: false,
        activeTab: 'tasks',  // tasks | logs | redeem
        statusBarHeight: 20,
        navTopPadding: 20,
        navBarHeight: 44,
        lightTipShow: false,
        lightTipTitle: '',
        lightTipContent: ''
    },

    onLoad() {
        const app = getApp();
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navTopPadding: app.globalData.navTopPadding || (app.globalData.statusBarHeight || 20),
            navBarHeight: app.globalData.navBarHeight || 44
        });
        this.loadAll();
    },

    async onShow() {
        await this.loadAccount();
        this._tryPointsCheckinPrompt();
    },

    _tryPointsCheckinPrompt() {
        const mod = getLightPromptModals().points_checkin;
        if (!mod || !mod.enabled) return;
        if (!shouldShowDaily('light_tip_points_checkin')) return;
        markDailyShown('light_tip_points_checkin');
        this.setData({
            lightTipShow: true,
            lightTipTitle: mod.title || '签到与积分',
            lightTipContent: mod.body || ''
        });
    },

    onPointsTipTap() {
        const mod = getLightPromptModals().points_checkin;
        if (!mod || !mod.enabled) {
            wx.showToast({ title: '暂无可展示说明', icon: 'none' });
            return;
        }
        this.setData({
            lightTipShow: true,
            lightTipTitle: mod.title || '签到与积分',
            lightTipContent: mod.body || ''
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
            this.setData({ account });
        } catch (e) {
            console.error('加载积分账户失败', e);
        }
    },

    async loadTasks() {
        try {
            const res = await get('/points/tasks');
            if (res.code === 0) {
                this.setData({
                    tasks: (res.data.tasks || []).map((task) => ({
                        ...task,
                        name: task.title,
                        description: task.desc,
                        points_reward: task.points,
                        completed: !!task.done,
                        progress: task.current || (task.done ? 1 : 0),
                        max_progress: task.total || 1
                    }))
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
                    logs: (res.data.list || []).map((log) => ({
                        ...log,
                        amount: log.points
                    }))
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
                wx.showToast({
                    title: `+${res.data.points_earned}分 ${res.data.streak}天连签`,
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
        wx.navigateTo({ url: '/pages/lottery/lottery' });
    },

    /** 活动 Tab：限时活动卡片、积分专享等 */
    onOpenActivityMall() {
        wx.switchTab({ url: '/pages/activity/activity' });
    }
});
