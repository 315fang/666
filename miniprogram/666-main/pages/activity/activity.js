// pages/activity/activity.js
const { get } = require('../../utils/request');
const app = getApp();

Page({
    data: {
        recentActivities: [],
        bubbles: [],
        bubbleIndex: 0,
        currentBubble: null,
        bubbleVisible: false,
    },

    onLoad() {
        this.loadBubbles();
    },

    onShow() {
        this.loadRecentActivities();
    },

    async loadRecentActivities() {
        try {
            const res = await get('/activity/bubbles?limit=8').catch(() => ({ data: [] }));
            const list = (res.data || []).map(item => ({
                text: this.formatBubbleText(item),
                time: this.formatTime(item.created_at)
            }));
            this.setData({ recentActivities: list });
        } catch (e) {
            console.error('加载实时动态失败:', e);
        }
    },

    async loadBubbles() {
        try {
            const res = await get('/activity/bubbles?limit=10').catch(() => ({ data: [] }));
            const bubbles = (res.data || []).map(item => this.formatBubbleText(item));
            if (bubbles.length > 0) {
                this.setData({ bubbles });
                this.startBubbleRotation();
            }
        } catch (e) {
            console.error('加载气泡数据失败:', e);
        }
    },

    startBubbleRotation() {
        if (this._bubbleTimer) clearInterval(this._bubbleTimer);
        const bubbles = this.data.bubbles;
        if (!bubbles || bubbles.length === 0) return;

        let idx = 0;
        const show = () => {
            this.setData({ currentBubble: bubbles[idx], bubbleVisible: true });
            setTimeout(() => {
                this.setData({ bubbleVisible: false });
            }, 3000);
            idx = (idx + 1) % bubbles.length;
        };
        show();
        this._bubbleTimer = setInterval(show, 4500);
    },

    onUnload() {
        if (this._bubbleTimer) clearInterval(this._bubbleTimer);
    },

    formatBubbleText(item) {
        const typeMap = { group_buy: '参与了拼团', order: '购买了', slash: '发起了砍价' };
        const action = typeMap[item.type] || '购买了';
        return `${item.nickname || '用户****'} 刚刚${action} ${item.product_name || '精选商品'}`;
    },

    formatTime(ts) {
        if (!ts) return '刚刚';
        const now = Date.now();
        const t = new Date(ts).getTime();
        const diff = Math.floor((now - t) / 1000);
        if (diff < 60) return '刚刚';
        if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
        return `${Math.floor(diff / 86400)}天前`;
    },

    onGroupBuyTap() {
        wx.navigateTo({ url: '/pages/group/list' });
    },

    onSlashTap() {
        wx.navigateTo({ url: '/pages/slash/list' });
    },

    onLotteryTap() {
        wx.navigateTo({ url: '/pages/lottery/lottery' });
    },

    onShareAppMessage() {
        return {
            title: '来参与限时活动，享受超值优惠！',
            path: '/pages/activity/activity'
        };
    }
});
