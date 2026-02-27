// pages/index/index.js
const { get, post } = require('../../utils/request');
const { parseImages } = require('../../utils/dataFormatter');
const { DEFAULTS, ROLE_NAMES } = require('../../config/constants');
const app = getApp();

Page({
    data: {
        banners: [],
        loading: true,
        userInfo: null,
        isLoggedIn: false,
        truncatedName: '游客',
        stats: {
            commission: '0.00',
            teamCount: 0
        },
        statusBarHeight: 20
    },

    onShow() {
        this.loadUserInfo();
    },

    onLoad(options) {
        const sysInfo = wx.getSystemInfoSync();
        this.setData({
            statusBarHeight: sysInfo.statusBarHeight
        });

        // 新版邀请：通过 inviter_id 跳转问卷页
        // 优先取 options 中的 inviter_id，其次取 app.js 的 pendingInviterId
        const inviterId = options.inviter_id || app.globalData.pendingInviterId;
        if (inviterId) {
            // 消费标记，防止重复跳转
            app.globalData.pendingInviterId = null;
            console.log('通过邀请问卷进入，邀请人ID:', inviterId);
            wx.navigateTo({
                url: `/pages/questionnaire/fill?inviter_id=${inviterId}`
            });
        }

        this.loadData();
    },

    onReady() {
        this.brandAnimation = this.selectComponent('#brandAnimation');

        // ★ 首次登录 welcome 动画
        const hasShownWelcome = wx.getStorageSync('hasShownWelcome');
        if (!hasShownWelcome && app.globalData.isNewUser) {
            app.globalData.isNewUser = false;
            wx.setStorageSync('hasShownWelcome', true);
            setTimeout(() => {
                if (this.brandAnimation) {
                    this.brandAnimation.show('welcome');
                }
            }, 800); // 等页面渲染完再播放
        }

        // ★ 等级提升 levelUp 动画
        if (app.globalData.levelUpInfo) {
            const info = app.globalData.levelUpInfo;
            app.globalData.levelUpInfo = null;
            setTimeout(() => {
                if (this.brandAnimation) {
                    this.brandAnimation.show('levelUp', { levelName: info.levelName });
                }
            }, 1000);
        }
    },



    async loadData() {
        this.setData({ loading: true });
        try {
            // Load Banners
            const bannerRes = await get('/content/banners', { position: 'home' }).catch(() => ({ data: [] }));
            const banners = bannerRes.data || [];

            this.setData({
                banners,
                loading: false
            });
        } catch (err) {
            console.error('加载失败:', err);
            this.setData({ loading: false });
        }
    },

    async loadUserInfo() {
        const isLoggedIn = app.globalData.isLoggedIn;
        this.setData({ isLoggedIn });

        if (!isLoggedIn) {
            this.setData({
                userInfo: null,
                truncatedName: '游客',
                stats: { commission: '0.00', teamCount: 0 }
            });
            return;
        }

        try {
            // 1. Get User Profile
            const res = await get('/user/profile');
            if (res.code === 0 && res.data) {
                const info = res.data;
                const roleLevel = info.role || 0;
                const roleName = info.role_name || ROLE_NAMES[roleLevel] || '普通用户';

                // Truncate nickname to first 3 chars
                let name = info.nickname || '微信用户';
                if (name.length > 3) {
                    name = name.substring(0, 3);
                }

                this.setData({
                    userInfo: { ...info, role_name: roleName },
                    truncatedName: name
                });
            }

            // 2. Get Distribution Stats (Commission & Team)
            const distRes = await get('/distribution/overview');
            if (distRes.code === 0 && distRes.data) {
                const d = distRes.data;
                // Using frozenAmount for "Commission" as per similar logic in user page (Pending Settlement)
                const commission = d.stats ? (d.stats.frozenAmount || '0.00') : '0.00';
                const teamCount = d.team ? d.team.totalCount : 0;

                this.setData({
                    'stats.commission': commission,
                    'stats.teamCount': teamCount
                });
            }
        } catch (err) {
            console.error('加载用户信息失败:', err);
        }
    },

    // Handlers
    onBannerTap(e) {
        const banner = e.currentTarget.dataset.item;
        if (banner && banner.link_value) {
            // Basic banner navigation
            wx.navigateTo({ url: '/pages/product/detail?id=' + banner.link_value });
        }
    },

    onJoinUsTap() {
        wx.showToast({ title: '加入我们 - 即将上线', icon: 'none' });
    },

    onAboutUsTap() {
        wx.showToast({ title: '了解我们 - 即将上线', icon: 'none' });
    },

    onMirrorMeetupTap() {
        wx.showToast({ title: '镜像见面会 - 即将上线', icon: 'none' });
    },

    onSalesBootcampTap() {
        wx.showToast({ title: '销售实战营 - 即将上线', icon: 'none' });
    },

    onFounderTalkTap() {
        wx.showToast({ title: '创始人对谈 - 即将上线', icon: 'none' });
    },

    onKnowledgePlanetTap() {
        wx.showToast({ title: '知识星球 - 即将上线', icon: 'none' });
    },

    // New Handlers for Guide and Co-creation
    onGuideTap() {
        wx.showToast({ title: '小程序使用指南 - 即将上线', icon: 'none' });
    },

    onCoCreationTap() {
        wx.showToast({ title: '共创信息 - 即将上线', icon: 'none' });
    },

    onShareAppMessage() {
        const userInfo = this.data.userInfo;
        const userId = userInfo ? userInfo.id : '';
        // 未登录时不带 inviter_id，避免空参数导致问卷提交失败
        if (!userId) {
            return {
                title: '加入我们，共创未来',
                path: '/pages/index/index',
                imageUrl: ''
            };
        }
        return {
            title: '加入我们，共创未来',
            path: `/pages/questionnaire/fill?inviter_id=${userId}`,
            imageUrl: ''
        };
    }
});
