// pages/activity/activity.js
// 活动中心：常驻活动 + 后端驱动节日活动系统
const { get } = require('../../utils/request');
const { cachedGet, requestCache } = require('../../utils/requestCache');
const app = getApp();

Page({
    data: {
        // 快捷入口（常驻活动，固定不变）
        quickEntries: [
            { id: 'group',   name: '拼团专区',  icon: '/assets/icons/users.svg',  color: '#FF4D4F', path: '/pages/group/list' },
            { id: 'slash',   name: '砍一刀',    icon: '/assets/icons/tag.svg',    color: '#722ED1', path: '/pages/slash/list' },
            { id: 'lottery', name: '积分抽奖',  icon: '/assets/icons/gift.svg',   color: '#FAAD14', path: '/pages/lottery/lottery' },
            { id: 'coupon',  name: '领券中心',  icon: '/assets/icons/star.svg',   color: '#13C2C2', path: '/pages/coupon/list' }
        ],
        // 卡片海报（常驻推荐位，可由后端覆盖）
        cardPosters: [
            { id: 1, title: '限时秒杀', subTitle: '每天10点开启',    image: 'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=600', link: '' },
            { id: 2, title: '新品首发', subTitle: '独家新品抢先看',  image: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=600', link: '' },
            { id: 3, title: '积分兑换', subTitle: '好物0元拿',       image: 'https://images.unsplash.com/photo-1601049541289-9b1b7abc7194?w=600', link: '' }
        ],
        recentActivities: [],
        statusBarHeight: 20,

        // ── 节日活动系统 ──────────────────────────────
        // 后端接口 /activity/festival-config 返回的完整配置
        // 当 active === false 时，节日区块隐藏，页面退回默认样式
        festivalActive: false,
        festival: null,
        // CSS 变量字符串，注入到节日卡片根节点
        // 示例："--fest-primary:#FF6B9D;--fest-bg:#FFF0F5;--fest-btn:#E91E8C"
        festThemeStyle: '',
        // 倒计时对象 { days, hours, mins, secs }
        countdown: null
    },

    onLoad() {
        this.setData({ statusBarHeight: app.globalData.statusBarHeight || 20 });
        this.loadFestivalConfig();
        this.loadRecentActivities();
    },

    onShow() {
        this.loadRecentActivities();
    },

    onUnload() {
        this._clearTimers();
    },

    // ── 节日配置加载 ─────────────────────────────────

    async loadFestivalConfig() {
        try {
            // 节日配置缓存 30 分钟，运营改完后最多 30 分钟生效
            const res = await cachedGet(get, '/activity/festival-config', {}, {
                cacheTTL: 30 * 60 * 1000
            });
            const cfg = res.data;

            if (!cfg || !cfg.active) {
                this.setData({ festivalActive: false });
                return;
            }

            // 将 theme 对象转成 inline CSS 变量字符串
            const festThemeStyle = Object.entries(cfg.theme || {})
                .map(([k, v]) => `${k}:${v}`)
                .join(';');

            this.setData({
                festivalActive: true,
                festival: cfg,
                festThemeStyle
            });

            // 启动倒计时
            if (cfg.countdown) this._startCountdown(cfg.countdown);
        } catch (e) {
            // 接口异常：静默降级，不影响常驻活动展示
            this.setData({ festivalActive: false });
        }
    },

    _startCountdown(endTimeStr) {
        this._clearTimers();

        const tick = () => {
            const diff = Math.max(0, new Date(endTimeStr).getTime() - Date.now());

            if (diff === 0) {
                // 活动已结束，主动失效缓存让下次进入重新拉取
                requestCache.deleteByPrefix('/activity/festival-config');
                this.setData({ festivalActive: false, countdown: null });
                return;
            }

            this.setData({
                countdown: {
                    days:  String(Math.floor(diff / 86400000)).padStart(2, '0'),
                    hours: String(Math.floor((diff % 86400000) / 3600000)).padStart(2, '0'),
                    mins:  String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0'),
                    secs:  String(Math.floor((diff % 60000) / 1000)).padStart(2, '0')
                }
            });
        };

        tick();
        this._countdownTimer = setInterval(tick, 1000);
    },

    _clearTimers() {
        if (this._countdownTimer) { clearInterval(this._countdownTimer); this._countdownTimer = null; }
        if (this._bubbleTimer)    { clearInterval(this._bubbleTimer);    this._bubbleTimer = null;    }
    },

    // ── 节日 CTA 跳转 ────────────────────────────────

    onFestivalTap() {
        const { festival } = this.data;
        if (!festival) return;
        // ctaPath 由后端指定，指向已有的任意活动页（group/list、lottery/lottery 等）
        if (festival.ctaPath) {
            wx.navigateTo({ url: festival.ctaPath });
        }
    },

    // ── 常驻活动 ─────────────────────────────────────

    async loadRecentActivities() {
        try {
            const res = await get('/activity/bubbles?limit=8').catch(() => ({ data: [] }));
            const list = (res.data || []).map(item => ({
                text: this._formatBubble(item),
                time: this._formatTime(item.created_at)
            }));
            this.setData({ recentActivities: list });
        } catch (e) {
            console.error('加载实时动态失败:', e);
        }
    },

    _formatBubble(item) {
        const typeMap = { group_buy: '参与了拼团', order: '购买了', slash: '发起了砍价' };
        const action = typeMap[item.type] || '购买了';
        return `${item.nickname || '用户****'} 刚刚${action} ${item.product_name || '精选商品'}`;
    },

    _formatTime(ts) {
        if (!ts) return '刚刚';
        const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
        if (diff < 60)   return '刚刚';
        if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
        return `${Math.floor(diff / 86400)}天前`;
    },

    onEntryTap(e) {
        const { path } = e.currentTarget.dataset.item;
        if (path) wx.navigateTo({ url: path });
    },

    onPosterTap(e) {
        const { link } = e.currentTarget.dataset.item;
        if (link) wx.navigateTo({ url: link });
        else wx.showToast({ title: '活动筹备中', icon: 'none' });
    },

    onShareAppMessage() {
        return {
            title: '来参与限时活动，享受超值优惠！',
            path: '/pages/activity/activity'
        };
    }
});
