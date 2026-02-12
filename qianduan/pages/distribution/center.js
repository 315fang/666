// pages/distribution/center.js - 分佣中心（整合钱包、邀请、团队入口）
const app = getApp();
const { get, post } = require('../../utils/request');
const { ROLE_NAMES } = require('../../config/constants');

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
        // 分享弹窗
        showShareModal: false,
        qrCodeUrl: '',
        // 绑定邀请码
        showBindInvite: false,
        bindInviteCode: '',
        hasParent: false,
        parentInfo: null,
        // 代理商专属
        isAgent: false,
        agentStock: 0,
        agentPending: 0,
        agentMonthProfit: '0.00',
        agentDebt: 0
    },

    onLoad(options) {
    },

    onShow() {
        this.setData({ userInfo: app.globalData.userInfo });
        this.loadStats();
        this.loadWalletInfo();
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

    // ====== 导航跳转 ======
    onCommissionLogsTap() {
        wx.navigateTo({ url: '/pages/distribution/commission-logs' });
    },

    onWithdrawHistoryTap() {
        wx.navigateTo({ url: '/pages/distribution/withdraw-history' });
    },

    onTeamTap() {
        wx.navigateTo({ url: '/pages/distribution/team' });
    },

    onOrderTap() {
        wx.navigateTo({ url: '/pages/order/list?type=distribution' });
    },

    // ====== 分享弹窗 ======
    async onShowShareModal() {
        this.setData({ showShareModal: true });
        if (!this.data.qrCodeUrl) {
            this.loadQRCode();
        }
    },

    hideShareModal() {
        this.setData({ showShareModal: false });
    },

    async loadQRCode() {
        try {
            // 这里假设后端有一个生成分销二维码的接口
            // 如果没有，可以先用一个 placeholder 或者提示
            const res = await get('/share/qrcode', { path: `pages/index/index?share_id=${this.data.inviteCode}` });
            if (res.code === 0 && res.data.url) {
                this.setData({ qrCodeUrl: res.data.url });
            }
        } catch (err) {
            console.error('加载二维码失败', err);
        }
    },

    onSaveQRCode() {
        if (!this.data.qrCodeUrl) return;
        wx.downloadFile({
            url: this.data.qrCodeUrl,
            success: (res) => {
                wx.saveImageToPhotosAlbum({
                    filePath: res.tempFilePath,
                    success: () => wx.showToast({ title: '已保存到相册' }),
                    fail: () => wx.showToast({ title: '保存失败', icon: 'none' })
                });
            }
        });
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
                const userInfo = res.data.userInfo || {};
                const roleLevel = userInfo.role || 0;
                
                // 以全局 userInfo 的 role_name 为主，如果缺失则使用接口返回或常量映射
                const roleName = app.globalData.userInfo?.role_name || userInfo.role_name || ROLE_NAMES[roleLevel] || '普通用户';
                
                this.setData({
                    stats: res.data.stats || this.data.stats,
                    team: res.data.team || this.data.team,
                    userInfo: { 
                        ...this.data.userInfo, 
                        ...userInfo,
                        role: roleLevel,
                        role_name: roleName
                    },
                    inviteCode: userInfo.invite_code || String(userInfo.id) || '',
                    hasParent: hasParent,
                    parentInfo: userInfo.inviter || null
                });
            }
        } catch (err) {
            console.error('加载分销统计失败', err);
        }
    },

    // ====== 钱包信息 ======
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
