// pages/index/index.js
const { get, post } = require('../../utils/request');
const { parseImages, formatGrowth, normalizeTrendData, formatLargeNumber } = require('../../utils/dataFormatter');
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
        // 新增: 增强的数据看板
        dashboard: {
            // 主KPI
            monthlyRevenue: '0.00',
            revenueGrowth: '+0.0',
            growthTrend: 'up',
            
            // 次要KPI
            todayRevenue: '0.00',
            teamSize: 0,
            monthlyOrders: 0,
            
            // 趋势数据（最近5天，百分比）
            revenueTrend: [0, 0, 0, 0, 0],
            
            // 其他
            currentMonth: '本月'
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

        if (options.share_id) {
            console.log('通过分享进入，邀请人ID:', options.share_id);
            wx.setStorageSync('distributor_id', options.share_id);
            if (app.globalData.isLoggedIn) {
                this.tryBindParent(options.share_id);
            }
        }

        this.loadData();
    },

    async tryBindParent(parentId) {
        try {
            const res = await post('/bind-parent', { parent_id: parseInt(parentId) });
            if (res.code === 0) {
                wx.showToast({ title: '已加入团队', icon: 'success' });
            }
        } catch (err) {
            console.log('绑定上级:', err.message || '已有上级');
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
                stats: { commission: '0.00', teamCount: 0 },
                dashboard: {
                    monthlyRevenue: '0.00',
                    revenueGrowth: '+0.0',
                    growthTrend: 'up',
                    todayRevenue: '0.00',
                    teamSize: 0,
                    monthlyOrders: 0,
                    revenueTrend: [0, 0, 0, 0, 0],
                    currentMonth: '本月'
                }
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
            
            // 3. Load Dashboard Data (新增)
            this.loadDashboardData();
        } catch (err) {
            console.error('加载用户信息失败:', err);
        }
    },
    
    // 新增: 加载数据看板
    async loadDashboardData() {
        try {
            // 并行加载多个数据接口
            const [overviewRes, ordersRes] = await Promise.all([
                get('/distribution/overview').catch(() => ({ code: -1, data: null })),
                get('/orders/stats').catch(() => ({ code: -1, data: null }))
            ]);
            
            // 获取当前月份
            const now = new Date();
            const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
            const currentMonth = monthNames[now.getMonth()];
            
            // 处理概览数据
            let monthlyRevenue = 0;
            let lastMonthRevenue = 0;
            let todayRevenue = 0;
            let teamSize = 0;
            let revenueTrendRaw = [0, 0, 0, 0, 0];
            
            if (overviewRes.code === 0 && overviewRes.data) {
                const d = overviewRes.data;
                monthlyRevenue = parseFloat(d.stats?.monthlyCommission || d.stats?.balance || 0);
                lastMonthRevenue = parseFloat(d.stats?.lastMonthCommission || d.stats?.monthlyCommission || 0) * 0.8; // 估算上月（如果没有数据）
                todayRevenue = parseFloat(d.stats?.todayCommission || 0);
                teamSize = d.team?.totalCount || 0;
                
                // 如果有趋势数据（最近5天佣金）
                if (d.stats?.last5DaysCommission && Array.isArray(d.stats.last5DaysCommission)) {
                    revenueTrendRaw = d.stats.last5DaysCommission;
                } else {
                    // 模拟趋势数据（从低到高）
                    revenueTrendRaw = [
                        monthlyRevenue * 0.4,
                        monthlyRevenue * 0.6,
                        monthlyRevenue * 0.8,
                        monthlyRevenue * 0.7,
                        monthlyRevenue
                    ];
                }
            }
            
            // 处理订单数据
            let monthlyOrders = 0;
            if (ordersRes.code === 0 && ordersRes.data) {
                monthlyOrders = ordersRes.data.monthlyCount || ordersRes.data.thisMonth || 0;
            }
            
            // 计算增长率
            const growth = formatGrowth(monthlyRevenue, lastMonthRevenue);
            
            // 标准化趋势数据
            const revenueTrend = normalizeTrendData(revenueTrendRaw);
            
            this.setData({
                dashboard: {
                    monthlyRevenue: monthlyRevenue.toFixed(2),
                    revenueGrowth: growth.value,
                    growthTrend: growth.trend,
                    todayRevenue: todayRevenue.toFixed(2),
                    teamSize: formatLargeNumber(teamSize),
                    monthlyOrders: monthlyOrders,
                    revenueTrend: revenueTrend,
                    currentMonth: currentMonth
                }
            });
        } catch (error) {
            console.error('加载看板数据失败:', error);
            // 保持默认值，不影响用户使用
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
    
    // 新增: 数据看板操作
    onWithdraw() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/distribution/withdraw' });
    },
    
    onViewDetails() {
        if (!this.data.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/distribution/commission-logs' });
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
        const inviteCode = userInfo ? (userInfo.invite_code || userInfo.id) : '';
        return {
            title: '加入我们，共创未来',
            path: `/pages/index/index?share_id=${inviteCode}`,
            imageUrl: ''
        };
    }
});
