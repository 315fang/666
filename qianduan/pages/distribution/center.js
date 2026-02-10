// pages/distribution/center.js - 分佣中心（整合钱包、邀请、团队入口）
const app = getApp();
const { get, post } = require('../../utils/request');

// 状态字典
const COMMISSION_STATUS_MAP = {
    'frozen': { text: '冻结中(T+7)', class: 'status-frozen' },
    'pending_approval': { text: '待审核', class: 'status-pending' },
    'available': { text: '可提现', class: 'status-success' },
    'settled': { text: '已结算', class: 'status-gray' },
    'cancelled': { text: '已取消', class: 'status-fail' }
};

const WITHDRAW_STATUS_MAP = {
    'pending': { text: '审核中', class: 'status-pending' },
    'approved': { text: '待打款', class: 'status-success' },
    'completed': { text: '已到账', class: 'status-gray' },
    'rejected': { text: '已驳回', class: 'status-fail' }
};

Page({
    data: {
        userInfo: null,
        stats: {
            totalEarnings: '0.00',
            availableAmount: '0.00',
            frozenAmount: '0.00'
        },
        team: {
            totalCount: 0,
            directCount: 0,
            indirectCount: 0
        },
        inviteCode: '',
        // 钱包
        balance: '0.00',
        walletInfo: null,
        // 佣金明细
        commissionLogs: [],
        // Tab: overview / logs / withdraw
        activeTab: 'overview',
        // 提现
        showWithdraw: false,
        withdrawAmount: '',
        withdrawals: [],
        // 绑定邀请码
        showBindInvite: false,
        bindInviteCode: '',
        hasParent: false,
        parentInfo: null,
        // 最新通知
        latestNotifications: [],
        unreadCount: 0,
        // 代理商专属
        isAgent: false,
        agentStock: 0,
        agentPending: 0,
        agentMonthProfit: '0.00',
        agentDebt: 0
    },

    onLoad(options) {
        // 支持从个人中心带 tab 参数跳转，直达佣金明细
        if (options.tab) {
            this.setData({ activeTab: options.tab });
        }
    },

    onShow() {
        this.setData({ userInfo: app.globalData.userInfo });
        this.loadStats();
        this.loadWalletInfo();
        this.loadCommissionLogs();
        this.loadLatestNotifications();
        this.loadAgentData();

        // 如果用户没有上级，且没有提示过，显示提示
        const hasShownInviteTip = wx.getStorageSync('hasShownInviteTip');
        if (!this.data.hasParent && !hasShownInviteTip) {
            setTimeout(() => {
                this.showInviteTip();
            }, 800);
        }
    },

    // 显示邀请码提示
    showInviteTip() {
        if (this.data.hasParent) return;

        wx.showModal({
            title: '👋 欢迎加入',
            content: '填写邀请人的邀请码，加入团队一起赚收益吧！\n\n没有邀请码？跳过后也可随时填写。',
            confirmText: '填写邀请码',
            cancelText: '暂时跳过',
            success: (res) => {
                if (res.confirm) {
                    this.onBindInviteTap();
                }
                // 标记已提示过
                wx.setStorageSync('hasShownInviteTip', true);
            }
        });
    },

    // 切换标签
    onTabChange(e) {
        const tab = e.currentTarget.dataset.tab;
        this.setData({ activeTab: tab });
        if (tab === 'withdraw') {
            this.loadWithdrawals();
        }
    },

    // ====== 邀请码绑定上级 ======
    onBindInviteTap() {
        if (this.data.hasParent) {
            wx.showToast({ title: '您已绑定上级', icon: 'none' });
            return;
        }
        this.setData({ showBindInvite: true, bindInviteCode: '' });
    },
    hideBindInvite() {
        this.setData({ showBindInvite: false });
    },
    onBindInviteInput(e) {
        this.setData({ bindInviteCode: e.detail.value });
    },
    async confirmBindInvite() {
        const code = this.data.bindInviteCode.trim();
        if (!code) {
            wx.showToast({ title: '请输入邀请码', icon: 'none' });
            return;
        }
        if (code === this.data.inviteCode) {
            wx.showToast({ title: '不能绑定自己', icon: 'none' });
            return;
        }
        try {
            const res = await post('/bind-parent', { parent_id: code });
            if (res.code === 0) {
                wx.showToast({ title: '绑定成功！', icon: 'success' });
                this.hideBindInvite();
                this.loadStats(); // 刷新数据
            } else {
                wx.showToast({ title: res.message || '绑定失败', icon: 'none' });
            }
        } catch (err) {
            wx.showToast({ title: err.message || '绑定失败', icon: 'none' });
        }
    },

    // ====== 最新通知 ======
    async loadLatestNotifications() {
        try {
            const res = await get('/notifications', { page: 1, limit: 7 });
            if (res.code === 0 && res.data) {
                const list = (res.data.list || []).map(item => ({
                    ...item,
                    time_format: this.formatTime(item.created_at)
                }));
                const unread = list.filter(n => !n.is_read).length;
                this.setData({
                    latestNotifications: list,
                    unreadCount: unread
                });
            }
        } catch (err) {
            console.error('加载通知失败', err);
        }
    },

    formatTime(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
        if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
        return `${date.getMonth() + 1}-${date.getDate()}`;
    },

    onNotificationsTap() {
        wx.navigateTo({ url: '/pages/user/notifications' });
    },

    // ====== 退货入口 ======
    onRefundTap() {
        wx.navigateTo({ url: '/pages/order/refund-list' });
    },

    // 加载分销统计
    async loadStats() {
        try {
            const res = await get('/stats/distribution');
            if (res.code === 0 && res.data) {
                const hasParent = !!(res.data.userInfo && res.data.userInfo.inviter);
                this.setData({
                    stats: res.data.stats || this.data.stats,
                    team: res.data.team || this.data.team,
                    userInfo: res.data.userInfo ? { ...this.data.userInfo, ...res.data.userInfo } : this.data.userInfo,
                    inviteCode: res.data.userInfo ? (res.data.userInfo.invite_code || String(res.data.userInfo.id)) : '',
                    hasParent: hasParent,
                    parentInfo: res.data.userInfo ? res.data.userInfo.inviter : null
                });
            }
        } catch (err) {
            console.error('加载分销统计失败', err);
        }
    },

    // 加载钱包信息
    async loadWalletInfo() {
        try {
            const res = await get('/wallet');
            if (res.code === 0 && res.data) {
                this.setData({
                    balance: (res.data.balance || 0).toFixed(2),
                    walletInfo: res.data
                });
            }
        } catch (err) {
            console.error('加载钱包失败', err);
        }
    },

    // 加载佣金明细
    async loadCommissionLogs() {
        try {
            const res = await get('/wallet/commissions');
            if (res.code === 0 && res.data) {
                const list = (res.data.list || []).map(item => {
                    const statusConfig = COMMISSION_STATUS_MAP[item.status] || { text: item.status, class: '' };
                    return {
                        ...item,
                        statusText: statusConfig.text,
                        statusClass: statusConfig.class,
                        typeName: this.getCommissionTypeName(item.type)
                    };
                });
                for (let i = 0; i < list.length; i++) {
                    // 自动处理日期格式
                    if (list[i].created_at) list[i].created_at = list[i].created_at.substring(0, 19).replace('T', ' ');
                }
                this.setData({
                    commissionLogs: list
                });
            }
        } catch (err) {
            console.error('加载佣金明细失败', err);
        }
    },

    getCommissionTypeName(type) {
        const map = {
            'Direct': '直推佣金',
            'Indirect': '团队佣金',
            'Stock_Diff': '级差利润',
            'agent_fulfillment': '发货利润'
        };
        return map[type] || type;
    },

    // 加载提现记录
    async loadWithdrawals() {
        try {
            const res = await get('/wallet/withdrawals');
            if (res.code === 0 && res.data) {
                const list = (res.data.list || []).map(item => {
                    const statusConfig = WITHDRAW_STATUS_MAP[item.status] || { text: item.status, class: '' };
                    return {
                        ...item,
                        statusText: statusConfig.text,
                        statusClass: statusConfig.class
                    };
                });
                for (let i = 0; i < list.length; i++) {
                    if (list[i].created_at) list[i].created_at = list[i].created_at.substring(0, 19).replace('T', ' ');
                }
                this.setData({
                    withdrawals: list
                });
            }
        } catch (err) {
            console.error('加载提现记录失败', err);
        }
    },

    // 提现弹窗
    onWithdrawTap() {
        this.setData({ showWithdraw: true, withdrawAmount: '' });
    },
    hideWithdraw() {
        this.setData({ showWithdraw: false });
    },
    onWithdrawInput(e) {
        this.setData({ withdrawAmount: e.detail.value });
    },

    async confirmWithdraw() {
        const amount = parseFloat(this.data.withdrawAmount);
        if (!amount || amount <= 0) {
            wx.showToast({ title: '请输入有效金额', icon: 'none' });
            return;
        }

        try {
            const res = await post('/wallet/withdraw', { amount });
            if (res.code === 0) {
                wx.showToast({ title: '申请成功', icon: 'success' });
                this.hideWithdraw();
                this.loadWalletInfo();
                this.loadWithdrawals();
            } else {
                wx.showToast({ title: res.message || '申请失败', icon: 'none' });
            }
        } catch (err) {
            wx.showToast({ title: err.message || '申请失败', icon: 'none' });
        }
    },

    // 跳转
    onTeamTap() {
        wx.navigateTo({ url: '/pages/distribution/team' });
    },
    onOrderTap() {
        wx.navigateTo({ url: '/pages/order/list' });
    },

    // ====== 代理商专属功能 ======
    async loadAgentData() {
        try {
            const res = await get('/agent/workbench');
            if (res.code === 0) {
                this.setData({
                    isAgent: true,
                    agentStock: res.data.stock_count || 0,
                    agentPending: res.data.pending_ship || 0,
                    agentMonthProfit: res.data.month_profit || '0.00',
                    agentDebt: parseFloat(res.data.debt_amount || 0)
                });
            } else {
                this.setData({ isAgent: false });
            }
        } catch (err) {
            // 非代理商会403，静默处理
            this.setData({ isAgent: false });
        }
    },

    goWorkbench() {
        wx.navigateTo({ url: '/pages/distribution/workbench' });
    },

    goRestock() {
        wx.navigateTo({ url: '/pages/distribution/restock' });
    },

    goStockLogs() {
        wx.navigateTo({ url: '/pages/distribution/stock-logs' });
    },

    // 复制邀请码
    onCopyInviteCode() {
        const code = this.data.inviteCode;
        if (!code) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.setClipboardData({
            data: code,
            success: () => {
                wx.showToast({ title: '邀请码已复制', icon: 'success' });
            }
        });
    },

    // 跳转到邀请页面（简化分享流程）
    onInviteTap() {
        wx.navigateTo({ url: '/pages/distribution/invite' });
    },

    // 分享邀请
    onShareAppMessage() {
        const userInfo = this.data.userInfo || {};
        const inviteCode = this.data.inviteCode || userInfo.invite_code || userInfo.id || '';
        return {
            title: `我在用臻选，邀你一起赚`,
            path: `/pages/index/index?share_id=${inviteCode}`,
            imageUrl: ''
        };
    }
});
