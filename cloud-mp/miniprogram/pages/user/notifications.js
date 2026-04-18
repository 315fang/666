const { get, put } = require('../../utils/request');

Page({
    data: {
        notifications: [],
        page: 1,
        limit: 20,
        hasMore: true,
        loading: false,
        unreadCount: 0
    },

    onLoad() {
        this.loadNotifications();
    },

    onPrivacyTap() {
        wx.navigateTo({ url: '/pages/privacy/privacy' });
    },

    async loadNotifications(isLoadMore = false) {
        if (this.data.loading || (!isLoadMore && !this.data.hasMore)) return;

        this.setData({ loading: true });

        try {
            const { page, limit, notifications } = this.data;
            const res = await get('/notifications', { page, limit });

            const list = res.data.list.map(item => ({
                ...item,
                created_at_format: this.formatTime(item.created_at)
            }));
            const unreadCount = Number(res.data.unread_count || 0);

            this.setData({
                notifications: isLoadMore ? notifications.concat(list) : list,
                hasMore: list.length === limit,
                page: page + 1,
                loading: false,
                unreadCount
            });

            if (!isLoadMore) {
                this.markVisibleNotificationsRead(list);
            }
        } catch (err) {
            this.setData({ loading: false });
            console.error('加载通知失败:', err);
        }
    },

    async markVisibleNotificationsRead(list = []) {
        const unreadItems = (Array.isArray(list) ? list : []).filter(item => item && !item.is_read);
        if (!unreadItems.length) return;

        try {
            await Promise.all(unreadItems.map(item => put(`/notifications/${item._id || item.id}/read`)));
            const notifications = (this.data.notifications || []).map(item => ({
                ...item,
                is_read: true
            }));
            this.setData({
                notifications,
                unreadCount: Math.max(0, this.data.unreadCount - unreadItems.length)
            });
        } catch (err) {
            console.error('批量标记已读失败:', err);
        }
    },

    async onRead(e) {
        const { id, index } = e.currentTarget.dataset;
        const item = this.data.notifications[index];

        if (item.is_read) return;

        try {
            await put(`/notifications/${id}/read`);
            const key = `notifications[${index}].is_read`;
            this.setData({
                [key]: true,
                unreadCount: Math.max(0, this.data.unreadCount - 1)
            });
        } catch (err) {
            console.error('标记已读失败:', err);
        }
    },

    formatTime(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
        if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';

        return `${date.getMonth() + 1}-${date.getDate()}`;
    },

    onPullDownRefresh() {
        this.setData({
            notifications: [],
            page: 1,
            hasMore: true
        }, () => {
            this.loadNotifications().then(() => {
                wx.stopPullDownRefresh();
            });
        });
    },

    onReachBottom() {
        if (this.data.hasMore) {
            this.loadNotifications(true);
        }
    }
});
