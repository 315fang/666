const app = getApp();
const { get } = require('../../utils/request');
const { requireLogin } = require('../../utils/auth');
const { fetchUserProfile } = require('../../utils/userProfile');

function formatMoney(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

Page({
    data: {
        statusBarHeight: 20,
        navBarHeight: 44,
        userInfo: null,
        memberCode: '',
        showGoodsWallet: false,
        goodsBalanceDisplay: '0.00',
        purseBalanceDisplay: '0.00',
        participateDistribution: false,
        directCount: 0,
        indirectCount: 0,
        totalCount: 0,
        monthlyNewMembers: 0,
        totalEarnings: '0.00',
        availableAmount: '0.00',
        frozenAmount: '0.00'
    },

    onLoad(options) {
        try {
            if (options && options.invite) {
                wx.setStorageSync('pending_invite_code', String(options.invite).trim().toUpperCase());
            }
        } catch (e) { }
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navBarHeight: app.globalData.navBarHeight || 44
        });
    },

    onShow() {
        if (!requireLogin()) return;
        wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
        this.refreshPage();
    },

    async refreshPage() {
        const u = app.globalData.userInfo || {};
        const pd = u.participate_distribution === 1 || u.participate_distribution === true;
        this.setData({
            userInfo: u,
            participateDistribution: pd
        });
        await Promise.all([this.loadBalances(), this.loadOverview()]);
    },

    async loadBalances() {
        let goodsAmount = '0.00';
        let purseAmount = '0.00';
        let showGoods = false;

        try {
            const [agentRes, walletRes, profileResult] = await Promise.all([
                get('/agent/wallet').catch(() => null),
                get('/wallet/info').catch(() => null),
                fetchUserProfile()
            ]);
            if (agentRes && agentRes.code === 0 && agentRes.data) {
                const bal = parseFloat(
                    agentRes.data.goods_fund_balance != null
                        ? agentRes.data.goods_fund_balance
                        : (agentRes.data.agent_wallet_balance != null ? agentRes.data.agent_wallet_balance : agentRes.data.balance)
                ) || 0;
                goodsAmount = formatMoney(bal);
                showGoods = bal > 0;
            }
            const info = walletRes?.code === 0
                ? walletRes.data
                : (profileResult?.info || app.globalData.userInfo || {});
            purseAmount = formatMoney(
                info.commission_balance != null
                    ? info.commission_balance
                    : info.balance
            );
        } catch (_) {
            try {
                const info = app.globalData.userInfo || {};
                purseAmount = formatMoney(info.balance);
            } catch (__) {
                purseAmount = '0.00';
            }
        }

        this.setData({
            showGoodsWallet: showGoods,
            goodsBalanceDisplay: goodsAmount,
            purseBalanceDisplay: purseAmount
        });
    },

    async loadOverview() {
        try {
            const res = await get('/distribution/overview');
            if (res && res.code === 0 && res.data) {
                const d = res.data;
                const code = d.userInfo?.invite_code || app.globalData.userInfo?.invite_code || '';
                this.setData({
                    memberCode: code,
                    directCount: Number(d.team?.directCount || 0),
                    indirectCount: Number(d.team?.indirectCount || 0),
                    totalCount: Number(d.team?.totalCount || 0),
                    monthlyNewMembers: Number(d.team?.monthlyNewMembers || 0),
                    totalEarnings: formatMoney(d.stats?.totalEarnings),
                    availableAmount: formatMoney(d.stats?.availableAmount),
                    frozenAmount: formatMoney(d.stats?.frozenAmount)
                });
            }
        } catch (e) {
            console.error('加载团队中心概览失败:', e);
        }
    },

    onAgentWalletTap() {
        if (!requireLogin()) return;
        wx.navigateTo({ url: '/pages/wallet/agent-wallet' });
    },

    onPurseWalletTap() {
        if (!requireLogin()) return;
        wx.navigateTo({ url: '/pages/wallet/index' });
    },

    goInvitePoster() {
        if (!requireLogin()) return;
        wx.navigateTo({ url: '/pages/distribution/invite-poster' });
    },

    goTeam(e) {
        const tab = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.tab : '';
        const suffix = tab ? `?tab=${tab}` : '';
        wx.navigateTo({ url: `/pages/distribution/team${suffix}` });
    },

    goCommissionLogs() {
        wx.navigateTo({ url: '/pages/distribution/commission-logs' });
    },

    goFundPool() {
        wx.navigateTo({ url: '/pages/distribution/fund-pool' });
    },

    goDistributionCenter() {
        wx.navigateTo({ url: '/pages/distribution/center' });
    },

    onShareAppMessage() {
        const userInfo = this.data.userInfo;
        const code = this.data.memberCode;
        const brandName = app.globalData.brandName || '品牌臻选';
        return {
            title: `${userInfo?.nick_name || userInfo?.nickname || '好友'} 邀请你加入${brandName}，领取专属优惠`,
            path: `/pages/index/index${code ? '?invite=' + code : ''}`,
            imageUrl: ''
        };
    },

    onShareTimeline() {
        const code = this.data.memberCode;
        const brandName = app.globalData.brandName || '品牌臻选';
        return {
            title: `${brandName} · 团队邀新入口`,
            query: code ? `invite=${code}` : '',
            imageUrl: ''
        };
    },

    onBack() {
        wx.navigateBack();
    }
});
