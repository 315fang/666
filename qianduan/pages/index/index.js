// pages/index/index.js - 镜像商城首页 V2
const { get, post } = require('../../utils/request');
const { parseImages, processProduct } = require('../../utils/dataFormatter');
const { ErrorHandler } = require('../../utils/errorHandler');
const { DEFAULTS, ROLE_NAMES } = require('../../config/constants');
const app = getApp();

Page({
    data: {
        // 首页配置
        homeConfigs: {},
        // 用户信息
        userInfo: null,
        isLoggedIn: false,
        truncatedName: '',
        // 成长值
        growthValue: 0,
        nextLevelThreshold: 500,
        growthPercent: 0,
        // 积分
        pointBalance: 0,
        todaySigned: false,
        // 问兰镜像：模块化海报与活动
        posterList: [],
        memberBanners: [
            { id: 1, image: 'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=1000', label: '单笔实付金额', price: '600' },
            { id: 2, image: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=1000', label: '尊享会员礼遇', price: '1200' }
        ],
        schemePosters: [
            { id: 1, en: 'PROFESSIONAL SKIN CARE', cn: '选择您的\n专属美肤方案', btn: '舒缓强韧套组', image: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=400' }
        ],
        // 多组星品海报数据
        starSections: [
            {
                id: 'star1',
                titleEn: 'TOP STAR PRODUCTS',
                titleCn: 'TOP 星品挚选',
                activeSpecIndex: 0,
                specs: [
                    {
                        name: '贵妇膏38g',
                        slogan: '即刻匀净透亮¹',
                        desc: '1瓶改善 8大肌肤问题²',
                        awards: '瑞丽年度\n素颜护肤\n大奖',
                        sales: '2760万+',
                        price: '680',
                        image: 'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=800'
                    },
                    {
                        name: '贵妇膏5g',
                        slogan: '小巧便携 随时修护',
                        desc: '旅行随行装 随时随地美肌',
                        awards: '人气单品',
                        sales: '500万+',
                        price: '128',
                        image: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=800'
                    }
                ]
            },
            {
                id: 'star2',
                titleEn: 'SUN PROTECTION',
                titleCn: '清润防晒系列',
                activeSpecIndex: 1,
                specs: [
                    { name: '美白淡斑', slogan: '持证美白', desc: '淡斑祛黄 亮白肌肤', price: '298', image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800' },
                    {
                        name: '清润防晒',
                        slogan: '强防晒 不粘腻 更养肤',
                        desc: '1瓶蕴含 65% 养肤精萃¹',
                        awards: 'SPF50+\nPA+++',
                        sales: '口碑爆款',
                        price: '358',
                        image: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=800'
                    },
                    { name: '防晒喷雾', slogan: '随时随地', desc: '补涂方便 不花妆', price: '158', image: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800' }
                ]
            }
        ],
        // 状态
        navScrolled: false,
        loading: true,
        showSurprise: false,
        statusBarHeight: 20
    },

    onShow() {
        this.loadUserInfo();
    },

    onLoad(options) {
        this.setData({ statusBarHeight: app.globalData.statusBarHeight || 20 });

        // 邀请链接处理
        const inviterId = options.inviter_id || app.globalData.pendingInviterId;
        if (inviterId) {
            app.globalData.pendingInviterId = null;
            wx.navigateTo({ url: `/pages/questionnaire/fill?inviter_id=${inviterId}` });
        }

        this.loadData();
        this.startAutoSpecRotation();
    },

    onUnload() {
        this.stopAutoSpecRotation();
    },

    onPageScroll(e) {
        const scrolled = e.scrollTop > 50;
        if (scrolled !== this.data.navScrolled) {
            this.setData({ navScrolled: scrolled });
        }
    },

    // ============ 数据加载 ============

    async loadData() {
        this.setData({ loading: true });
        try {
            // ★ 三层缓存策略：globalData（预拉取）→ Storage（持久化）→ 网络请求
            let data = {};
            const prefetched = app.globalData.homePageData;
            if (prefetched) {
                data = prefetched;
                console.log('[Index] 命中预拉取缓存，跳过网络请求');
            } else {
                // 尝试读持久化缓存
                try {
                    const stored = wx.getStorageSync('home_config_cache');
                    if (stored && stored.expireAt > Date.now()) {
                        data = stored.data;
                        console.log('[Index] 命中持久化缓存');
                    }
                } catch (e) { /* pass */ }
            }
            // 缓存都没中，发起网络请求
            if (!data || Object.keys(data).length === 0) {
                const res = await get('/homepage-config').catch(() => ({ data: {} }));
                data = res.data || {};
            }

            // 问兰镜像：适配新品牌视觉的数据
            // 如果后端没有配置，则使用高质量的 Mock 数据填充，确保页面美观
            const posterList = (data.posters && data.posters.length > 0)
                ? data.posters
                : this.getMockPosters();

            const memberPosters = (data.memberPosters && data.memberPosters.length > 0)
                ? data.memberPosters
                : this.getMockMemberPosters();

            const newArrivals = (data.newArrivals && data.newArrivals.length > 0)
                ? data.newArrivals
                : this.getMockNewArrivals();

            const aboutList = (data.aboutList && data.aboutList.length > 0)
                ? data.aboutList
                : this.getDefaultAbout();

            this.setData({
                posterList,
                memberPosters,
                newArrivals,
                aboutList,
                homeConfigs: data.configs || {},
                loading: false
            });
        } catch (err) {
            ErrorHandler.handle(err, { showToast: false });
            // 彻底兜底：即使接口报错也显示 Mock 数据，防止白屏或布局崩塌
            this.setData({
                loading: false,
                posterList: this.getMockPosters(),
                memberPosters: this.getMockMemberPosters(),
                newArrivals: this.getMockNewArrivals(),
                aboutList: this.getDefaultAbout()
            });
        }
    },

    getMockPosters() {
        return [
            'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=1000', // 高端护肤海报
            'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=1000'
        ];
    },

    getMockNewArrivals() {
        return [
            { id: 101, name: '素颜三部曲·精华', price: '680.00', image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400', member_only: true },
            { id: 102, name: '奢宠逆龄面霜', price: '1280.00', image: 'https://images.unsplash.com/photo-1611082231575-f017e8d53821?w=400', member_only: false },
            { id: 103, name: '柔润修护洁面乳', price: '258.00', image: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=400', member_only: false },
            { id: 104, name: '密集补水面膜', price: '199.00', image: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400', member_only: true }
        ];
    },

    getMockMemberPosters() {
        return [
            'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=800', // 会员礼遇图
            'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=800'
        ];
    },

    getDefaultAbout() {
        return [
            { id: 1, title: '品牌故事', sub: 'BRAND STORY', body: '源于对美的极致追求，镜像商城诞生于对品质生活的向往。' },
            { id: 2, title: '关于我们', sub: 'ABOUT US', body: '专注甄选全球顶尖原料，每一款产品都经过严苛品控。' },
            { id: 3, title: '目标使命', sub: 'OUR MISSION', body: '让每一位女性都能遇见属于自己的美，绽放独特光彩。' }
        ];
    },

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

            const ptRes = await get('/points/balance').catch(() => ({ data: { balance: 0 } }));
            if (ptRes.code === 0 && ptRes.data) {
                this.setData({ pointBalance: ptRes.data.balance || 0 });
            }

            const signRes = await get('/points/sign-in/status').catch(() => ({ data: { signed: false } }));
            if (signRes.code === 0 && signRes.data) {
                this.setData({ todaySigned: !!signRes.data.signed });
            }
        } catch (err) {
            ErrorHandler.handle(err, { showToast: false });
            console.error('加载用户信息失败:', err);
        }
    },

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
                if (bubbles.length === 0) bubbles = this.getMockBubbles();
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

    onSearchTap() {
        wx.navigateTo({ url: '/pages/search/search' });
    },

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

    onSpecTabTap(e) {
        const { sectionIndex, specIndex } = e.currentTarget.dataset;
        const key = `starSections[${sectionIndex}].activeSpecIndex`;
        if (this.data.starSections[sectionIndex].activeSpecIndex === specIndex) return;
        this.setData({ [key]: specIndex });

        // 用户手动点击后，重启定时器，避免立即自动切换
        this.startAutoSpecRotation();
    },

    onStarProductBuy(e) {
        const { sectionIndex } = e.currentTarget.dataset;
        const section = this.data.starSections[sectionIndex];
        const spec = section.specs[section.activeSpecIndex];
        wx.navigateTo({
            url: `/pages/product/detail?id=${spec.id || 1}`
        });
    },

    onSurpriseTap() {
        this.setData({ showSurprise: !this.data.showSurprise });
        if (this.data.showSurprise) {
            wx.vibrateShort(); // 轻微震动增加惊喜感
        }
    },

    // 开启规格自动切换 (每10秒)
    startAutoSpecRotation() {
        this.stopAutoSpecRotation();
        this._specTimer = setInterval(() => {
            const { starSections } = this.data;
            const updatedSections = starSections.map(section => {
                const nextIndex = (section.activeSpecIndex + 1) % section.specs.length;
                return { ...section, activeSpecIndex: nextIndex };
            });
            this.setData({ starSections: updatedSections });
        }, 10000);
    },

    stopAutoSpecRotation() {
        if (this._specTimer) {
            clearInterval(this._specTimer);
            this._specTimer = null;
        }
    },

    onAboutTap() {
        // 预留：跳转品牌详情页
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
    },

    // 阻止事件冒泡
    catchtap() { }
});
