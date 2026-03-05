// pages/points/index.js
const { get, post } = require('../../utils/request');

Page({
    data: {
        account: null,
        logs: [],
        levelConfig: [],
        tasks: [],
        loading: true,
        checkinLoading: false,
        activeTab: 'tasks',  // tasks | logs | levels
        statusBarHeight: 20
    },

    onLoad() {
        const sys = wx.getSystemInfoSync();
        this.setData({ statusBarHeight: sys.statusBarHeight || 20 });
        this.loadAll();
    },

    onShow() {
        this.loadAccount();
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
            const res = await get('/points/account');
            if (res.code === 0) {
                this.setData({ account: res.data });
            }
        } catch (e) {
            console.error('加载积分账户失败', e);
        }
    },

    async loadTasks() {
        try {
            const res = await get('/points/tasks');
            if (res.code === 0) {
                this.setData({
                    tasks: res.data.tasks,
                    levelConfig: res.data.level_config
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
                this.setData({ logs: res.data.list });
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
            const res = await post('/points/checkin');
            wx.hideLoading();
            if (res.code === 0) {
                wx.showToast({
                    title: `+${res.data.points_earned}分 ${res.data.streak}天连签`,
                    icon: 'none',
                    duration: 2500
                });
                this.loadAll();
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
        wx.navigateBack();
    },

    // 积分流水的描述文字
    formatPointType(type) {
        const map = {
            register: '注册升级体验官',
            purchase: '消费获积分',
            share: '分享商品',
            review: '写评价',
            review_image: '图文评价',
            checkin: '每日签到',
            checkin_streak: '连续签到奖励',
            invite_success: '邀请新用户',
            group_start: '发起拼团',
            group_success: '拼团成功',
            redeem: '积分兑换',
            expire: '积分过期'
        };
        return map[type] || type;
    }
});
