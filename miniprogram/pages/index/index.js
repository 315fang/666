// pages/index/index.js - 首页合并版
// 设计：666-main 风格（会员卡 + 积分 + 气泡 + 特色卡片 + 活动预告）
// 逻辑：当前版本 3 级缓存 + 导航栏滚动 + 分享彩蛋
const { get, post } = require('../../utils/request');
const { parseImages } = require('../../utils/dataFormatter');
const { DEFAULTS, ROLE_NAMES } = require('../../config/constants');
const app = getApp();

Page({
    data: {
        // 首页配置（来自 666-main）
        homeConfigs: {},

        // 特色卡片（来自 666-main，降级兜底数据）
        featureCards: [
            {
                id: 1,
                name: '镜像见面会',
                description: '全国各地线下见面会，零距离交流',
                icon_url: '/assets/icons/map-pin.svg',
                bg_gradient: 'linear-gradient(145deg, #0F2027, #203A43, #2C5364)',
                tag: '线下活动',
                link_type: 'page',
                link_value: '',
                sort_order: 4
            },
            {
                id: 2,
                name: '创始人对谈',
                description: '每周六腾讯会议，1对1答疑解惑',
                icon_url: '/assets/icons/mic.svg',
                bg_gradient: 'linear-gradient(145deg, #1a1a2e, #16213e)',
                tag: '每周六',
                link_type: 'page',
                link_value: '',
                sort_order: 3
            },
            {
                id: 3,
                name: '知识星球',
                description: '分级制社群，持续进阶成长',
                icon_url: '/assets/icons/star.svg',
                bg_gradient: 'linear-gradient(145deg, #2d1b69, #11998e)',
                tag: '社群',
                link_type: 'copy',
                link_value: '',
                sort_order: 2
            },
            {
                id: 4,
                name: '销售实战营',
                description: '实战训练，快速提升销售力',
                icon_url: '/assets/icons/target.svg',
                bg_gradient: 'linear-gradient(145deg, #c31432, #240b36)',
                tag: '训练营',
                link_type: 'page',
                link_value: '',
                sort_order: 1
            }
        ],

        // 用户信息（来自 666-main，含成长值 & 积分）
        userInfo: null,
        isLoggedIn: false,
        truncatedName: '',
        growthValue: 0,
        nextLevelThreshold: 500,
        growthPercent: 0,
        pointBalance: 0,
        todaySigned: false,

        // 活动预告（来自 666-main）
        latestActivity: {},

        // 气泡通告（来自 666-main）
        bubbles: [],
        bubbleIndex: 0,
        currentBubble: '',
        bubbleVisible: false,

        // 导航栏滚动状态（来自当前版本）
        navScrolled: false,
        statusBarHeight: 20,

        // 底部彩蛋（来自当前版本）
        showSurprise: false,

        loading: true
    },

    onLoad(options) {
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20
        });

        // 邀请链接处理（合并两版本逻辑）
        const inviterId = options.inviter_id || options.scene;
        if (inviterId) {
            this.handleShareEntry(inviterId);
        } else if (app.globalData.pendingInviterId) {
            this.handleShareEntry(app.globalData.pendingInviterId);
            app.globalData.pendingInviterId = null;
        }

        // 绑定 app.js 预拉取回调（来自当前版本 3 级缓存）
        if (app.globalData.homeDataPromise) {
            app.homeDataCallback = (data) => {
                this._applyHomeConfig(data);
            };
            app.globalData.homeDataPromise.then(data => {
                if (data) this._applyHomeConfig(data);
            });
        }

        this.loadData();
        this.loadBubbles();
    },

    onShow() {
        this.loadUserInfo();
        wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
    },

    onReady() {
        this.brandAnimation = this.selectComponent('#brandAnimation');
        const hasShownWelcome = wx.getStorageSync('hasShownWelcome');
        if (!hasShownWelcome && app.globalData.isNewUser) {
            app.globalData.isNewUser = false;
            wx.setStorageSync('hasShownWelcome', true);
            setTimeout(() => {
                if (this.brandAnimation) this.brandAnimation.show('welcome');
            }, 800);
        }
        if (app.globalData.levelUpInfo) {
            const info = app.globalData.levelUpInfo;
            app.globalData.levelUpInfo = null;
            setTimeout(() => {
                if (this.brandAnimation) this.brandAnimation.show('levelUp', { levelName: info.levelName });
            }, 1000);
        }
    },

    onUnload() {
        if (this._bubbleTimer) clearInterval(this._bubbleTimer);
    },

    onPageScroll(e) {
        // 导航栏滚动切换（来自当前版本）
        const scrolled = e.scrollTop > 50;
        if (scrolled !== this.data.navScrolled) {
            this.setData({ navScrolled: scrolled });
        }
    },

    onPullDownRefresh() {
        Promise.all([
            this.loadData(true),
            this.loadUserInfo()
        ]).finally(() => {
            wx.stopPullDownRefresh();
        });
    },

    // ============ 数据加载 ============

    async loadData(forceRefresh = false) {
        this.setData({ loading: true });
        try {
            let data = null;

            if (!forceRefresh) {
                // 1. 先读全局预拉取缓存（来自当前版本 3 级缓存）
                data = app.globalData.homePageData;

                // 2. 读持久化 Storage
                if (!data) {
                    const CACHE_KEY = 'home_config_cache';
                    const cached = wx.getStorageSync(CACHE_KEY);
                    if (cached && cached.expireAt > Date.now()) {
                        data = cached.data;
                        app.globalData.homePageData = data;
                    }
                }
            }

            // 3. 实在没有才发网络请求
            if (!data || Object.keys(data).length === 0) {
                const res = await get('/homepage-config').catch(() => ({ data: {} }));
                data = res.data || {};
            }

            this._applyHomeConfig(data);
        } catch (err) {
            console.error('[Index] 获取首页配置失败:', err);
            this.setData({ loading: false });
        }
    },

    // 将后端数据映射到 666-main 数据结构
    _applyHomeConfig(data) {
        if (!data) return;

        const featureCards = (data.featureCards && data.featureCards.length > 0)
            ? data.featureCards
            : this.data.featureCards;

        this.setData({
            featureCards,
            homeConfigs: data.configs || {},
            latestActivity: data.latestActivity || {},
            loading: false
        });
    },

    // 加载用户信息（来自 666-main，含成长值 & 积分）
    async loadUserInfo() {
        const isLoggedIn = app.globalData.isLoggedIn;
        this.setData({ isLoggedIn });

        if (!isLoggedIn) {
            this.setData({
                userInfo: null,
                truncatedName: '',
                growthValue: 0,
                growthPercent: 0,
                pointBalance: 0
            });
            return;
        }

        try {
            // 用户基本信息 + 成长值
            const res = await get('/user/profile');
            if (res.code === 0 && res.data) {
                const info = res.data;
                const roleName = info.role_name || ROLE_NAMES[info.role || 0] || '普通用户';
                let name = info.nickname || '微信用户';
                if (name.length > 3) name = name.substring(0, 3);

                const growth = info.growth_value || 0;
                const threshold = info.next_level_threshold || 500;
                const percent = Math.min(100, Math.round((growth / threshold) * 100));

                this.setData({
                    userInfo: { ...info, role_name: roleName },
                    truncatedName: name,
                    growthValue: growth,
                    nextLevelThreshold: threshold,
                    growthPercent: percent
                });
            }

            // 积分余额
            const ptRes = await get('/points/balance').catch(() => ({ data: { balance: 0 } }));
            if (ptRes.code === 0 && ptRes.data) {
                this.setData({ pointBalance: ptRes.data.balance || 0 });
            }

            // 今日是否已签到
            const signRes = await get('/points/sign-in/status').catch(() => ({ data: { signed: false } }));
            if (signRes.code === 0 && signRes.data) {
                this.setData({ todaySigned: !!signRes.data.signed });
            }

        } catch (err) {
            console.error('加载用户信息失败:', err);
        }
    },

    // 气泡通告（来自 666-main，含 5 分钟缓存）
    async loadBubbles() {
        const cacheKey = 'bubble_cache';
        const cacheExpiry = 'bubble_cache_expiry';
        const now = Date.now();
        const expiry = wx.getStorageSync(cacheExpiry) || 0;
        let bubbles = [];

        if (now < expiry) {
            bubbles = wx.getStorageSync(cacheKey) || [];
        } else {
            try {
                const res = await get('/activity/bubbles?limit=10').catch(() => ({ data: [] }));
                bubbles = (res.data || []).map(item => this.formatBubbleText(item));
                if (bubbles.length === 0) {
                    bubbles = this.getMockBubbles();
                }
                wx.setStorageSync(cacheKey, bubbles);
                wx.setStorageSync(cacheExpiry, now + 5 * 60 * 1000);
            } catch (e) {
                bubbles = this.getMockBubbles();
            }
        }

        if (bubbles.length > 0) {
            this.setData({ bubbles });
            this.startBubbleRotation();
        }
    },

    getMockBubbles() {
        const names = ['用户**23', '用户**67', '用户**89', '用户**45', '用户**12'];
        const products = ['活性炭绿豆饼', '冻顶乌龙礼盒', '正山小种红茶', '特级大红袍', '碧螺春精选'];
        const actions = ['刚刚购买了', '参与了拼团·', '正在抢购'];
        return names.map((n, i) => `${n} ${actions[i % actions.length]} ${products[i % products.length]}`);
    },

    startBubbleRotation() {
        if (this._bubbleTimer) clearInterval(this._bubbleTimer);
        const bubbles = this.data.bubbles;
        let idx = 0;

        const show = () => {
            this.setData({ currentBubble: bubbles[idx], bubbleVisible: true });
            setTimeout(() => this.setData({ bubbleVisible: false }), 3200);
            idx = (idx + 1) % bubbles.length;
        };

        setTimeout(show, 1500);
        this._bubbleTimer = setInterval(show, 5000);
    },

    formatBubbleText(item) {
        const typeMap = { group_buy: '参与了拼团·', order: '刚刚购买了', slash: '发起了砍价·' };
        const action = typeMap[item.type] || '刚刚购买了';
        return `${item.nickname || '用户****'} ${action} ${item.product_name || '精选商品'}`;
    },

    // ============ 事件处理 ============

    onMemberCardTap() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/distribution/center' });
    },

    onPointsTap() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/points/index' });
    },

    async onSignInTap() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        if (this.data.todaySigned) {
            wx.showToast({ title: '今日已签到', icon: 'none' });
            return;
        }
        try {
            const res = await post('/points/sign-in');
            if (res.code === 0) {
                const earned = res.data.points_earned || res.data.points || 0;
                wx.showToast({ title: `签到成功！+${earned}积分`, icon: 'success' });
                this.setData({
                    todaySigned: true,
                    pointBalance: res.data.balance_points || (this.data.pointBalance + earned)
                });
            } else {
                wx.showToast({ title: res.message || '签到失败', icon: 'none' });
            }
        } catch (e) {
            wx.showToast({ title: '签到失败，请重试', icon: 'none' });
        }
    },

    onExchangeTap() {
        wx.navigateTo({ url: '/pages/points/index' });
    },

    onActivityTap() {
        wx.switchTab({ url: '/pages/activity/activity' });
    },

    onFeatureCardTap(e) {
        const item = e.currentTarget.dataset.item;
        if (!item) return;
        switch (item.link_type) {
            case 'page':
                if (item.link_value) wx.navigateTo({ url: item.link_value });
                else wx.showToast({ title: '详情页即将上线', icon: 'none' });
                break;
            case 'copy':
                if (item.link_value) {
                    wx.setClipboardData({
                        data: item.link_value,
                        success: () => wx.showToast({ title: '链接已复制', icon: 'none', duration: 2500 })
                    });
                }
                break;
            default:
                wx.showToast({ title: '即将上线', icon: 'none' });
        }
    },

    onGuideTap() {
        wx.showToast({ title: '小程序使用指南 - 即将上线', icon: 'none' });
    },

    onCoCreationTap() {
        wx.showToast({ title: '共创信息 - 即将上线', icon: 'none' });
    },

    onSearchTap() {
        wx.navigateTo({ url: '/pages/search/search' });
    },

    // 底部彩蛋（来自当前版本）
    onSurpriseTap() {
        this.setData({ showSurprise: !this.data.showSurprise });
        wx.vibrateShort();
    },

    // 分享处理（来自当前版本）
    handleShareEntry(inviterId) {
        wx.navigateTo({ url: `/pages/questionnaire/fill?inviter_id=${inviterId}` });
    },

    onShareAppMessage() {
        const userInfo = this.data.userInfo;
        const userId = userInfo ? userInfo.id : '';
        if (!userId) {
            return { title: '加入我们，共创未来', path: '/pages/index/index' };
        }
        return {
            title: '加入我们，共创未来',
            path: `/pages/questionnaire/fill?inviter_id=${userId}`
        };
    }
});
