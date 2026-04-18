const { get } = require('../../utils/request');
const app = getApp();

function formatDate(dateText) {
    if (!dateText) return '';
    return String(dateText).split('T')[0];
}

function buildDetailItems(member) {
    return [
        { label: '团队层级', value: member.level_label || '未知' },
        { label: '成员身份', value: member.role_name || 'VIP用户' },
        { label: '邀请码', value: member.invite_code || '暂无' },
        { label: '手机号', value: member.phone || '未绑定' },
        { label: '订单数', value: `${Number(member.order_count || 0)} 单` },
        { label: '累计业绩', value: `¥${member.total_sales || '0.00'}` },
        { label: '加入时间', value: formatDate(member.joined_at) || '未知' },
        { label: '关系说明', value: member.relation_text || '团队成员' }
    ];
}

Page({
    data: {
        statusBarHeight: 20,
        navBarHeight: 44,
        loading: true,
        loadError: '',
        memberId: null,
        member: null,
        detailItems: []
    },

    onLoad(options) {
        this.setData({
            statusBarHeight: app.globalData.statusBarHeight || 20,
            navBarHeight: app.globalData.navBarHeight || 44,
            memberId: (options && options.id) || ''
        });
        this.loadMemberDetail();
    },

    async loadMemberDetail() {
        const { memberId } = this.data;
        if (!memberId) {
            this.setData({ loading: false, loadError: '成员参数错误' });
            wx.showToast({ title: '成员参数错误', icon: 'none' });
            return;
        }
        this.setData({ loading: true, loadError: '' });
        try {
            const res = await get(`/distribution/team/${memberId}`);
            if (res && res.code === 0 && res.data) {
                const member = {
                    ...res.data,
                    joined_at_format: formatDate(res.data.joined_at)
                };
                this.setData({
                    member,
                    detailItems: buildDetailItems(member),
                    loading: false,
                    loadError: ''
                });
                return;
            }
            throw new Error(res.message || '加载失败');
        } catch (err) {
            const message = err.message || '加载失败';
            this.setData({ loading: false, loadError: message, member: null, detailItems: [] });
            wx.showToast({ title: message, icon: 'none' });
        }
    },

    onRetry() {
        this.loadMemberDetail();
    },

    goInvitePoster() {
        wx.navigateTo({ url: '/pages/distribution/invite-poster' });
    },

    onBack() {
        wx.navigateBack();
    }
});
