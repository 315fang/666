// pages/distribution/business-center.js — 商务中心（货款/钱包 + 邀请海报与我的团队）
const app = getApp();
const { get } = require('../../utils/request');
const { requireLogin } = require('../../utils/auth');
const { getConfigSection } = require('../../utils/miniProgramConfig');
const { fetchUserProfile } = require('../../utils/userProfile');

function businessCenterMinRoleLevel() {
    const mc = getConfigSection('membership_config');
    const n = Number(mc.business_center_min_role_level);
    return Number.isFinite(n) ? n : 1;
}

Page({
    data: {
        statusBarHeight: 20,
        navBarHeight: 44,
        userInfo: null,
        inviteCode: '',
        showGoodsWallet: false,
        goodsBalanceDisplay: '0.00',
        purseBalanceDisplay: '0.00',
        participateDistribution: false
    },

    onLoad(options) {
        try {
            if (options && options.invite) {
                wx.setStorageSync('pending_invite_code', String(options.invite).trim().toUpperCase());
            }
        } catch (e) { /* ignore */ }
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navBarHeight: app.globalData.navBarHeight || 44
        });
    },

    onShow() {
        if (!requireLogin()) return;
        const rl = app.globalData.userInfo?.role_level || 0;
        const minRl = businessCenterMinRoleLevel();
        if (rl < minRl) {
            wx.showToast({ title: '当前等级暂未开放商务中心', icon: 'none' });
            setTimeout(() => wx.navigateBack(), 500);
            return;
        }
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
        await Promise.all([this.loadBalances(), this.loadInviteInfo()]);
    },

    /** 货款余额（代理）+ 钱包金额（用户购物余额） */
    async loadBalances() {
        const roleLevel = app.globalData.userInfo?.role_level || 0;
        const showGoods = roleLevel >= 3;
        let goodsAmount = '0.00';
        let purseAmount = '0.00';

        try {
            const profilePromise = fetchUserProfile();
            if (showGoods) {
                const [agentRes, profileResult] = await Promise.all([
                    get('/agent/wallet').catch(() => null),
                    profilePromise
                ]);
                if (agentRes && agentRes.code === 0 && agentRes.data) {
                    goodsAmount = String(agentRes.data.balance != null ? agentRes.data.balance : '0.00');
                }
                const info = profileResult?.info || app.globalData.userInfo || {};
                purseAmount = parseFloat(info.balance || 0).toFixed(2);
            } else {
                const profileResult = await profilePromise;
                const info = profileResult?.info || app.globalData.userInfo || {};
                purseAmount = parseFloat(info.balance || 0).toFixed(2);
            }
        } catch (_) {
            try {
                const info = app.globalData.userInfo || {};
                purseAmount = parseFloat(info.balance || 0).toFixed(2);
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

    async loadInviteInfo() {
        try {
            const res = await get('/distribution/overview');
            if (res && res.code === 0 && res.data) {
                const d = res.data;
                const code = d.userInfo?.invite_code || app.globalData.userInfo?.invite_code || '';
                this.setData({ inviteCode: code });
            }
        } catch (e) {
            console.error('加载邀请信息失败:', e);
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

    onShareAppMessage() {
        const userInfo = this.data.userInfo;
        const code = this.data.inviteCode;
        const brandName = app.globalData.brandName || '品牌臻选';
        return {
            title: `${userInfo?.nickname || '好友'} 邀请你加入${brandName}，领取专属优惠`,
            path: `/pages/index/index${code ? '?invite=' + code : ''}`,
            imageUrl: ''
        };
    },

    onShareTimeline() {
        const code = this.data.inviteCode;
        const brandName = app.globalData.brandName || '品牌臻选';
        return {
            title: `${brandName} · 品质甄选，我在这里`,
            query: code ? `invite=${code}` : '',
            imageUrl: ''
        };
    },

    goTeam() {
        wx.navigateTo({ url: '/pages/distribution/team' });
    },

    goDistributionCenter() {
        wx.navigateTo({ url: '/pages/distribution/center' });
    },

    onBack() {
        wx.navigateBack();
    }
});
