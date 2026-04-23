const { get, post } = require('../../utils/request');
const app = getApp();
const { promptPortalPassword } = require('../../utils/portalPassword');

const CLOSED_STATUSES = ['expired', 'revoked', 'rejected'];

Page({
    data: {
        currentTab: 'all',
        invites: [],
        filteredInvites: [],
        loading: true
    },

    onLoad() {
        this.loadInvites();
    },

    onShow() {
        if (this._loadedOnce) {
            this.loadInvites();
        }
        this._loadedOnce = true;
    },

    async loadInvites() {
        this.setData({ loading: true });
        try {
            const res = await get('/distribution/directed-invites', {}, { showError: false });
            const list = Array.isArray(res.list)
                ? res.list
                : (Array.isArray(res.data && res.data.list) ? res.data.list : []);
            this.setData({
                invites: list,
                loading: false
            }, () => this.applyTabFilter());
        } catch (err) {
            this.setData({
                invites: [],
                filteredInvites: [],
                loading: false
            });
            wx.showToast({ title: err.message || '加载失败', icon: 'none' });
        }
    },

    applyTabFilter() {
        const tab = this.data.currentTab;
        const invites = Array.isArray(this.data.invites) ? this.data.invites : [];
        const filteredInvites = invites.filter((item) => {
            if (tab === 'all') return true;
            if (tab === 'closed') return CLOSED_STATUSES.includes(item.status);
            return item.status === tab;
        });
        this.setData({ filteredInvites });
    },

    onTabChange(e) {
        const currentTab = e.currentTarget.dataset.tab;
        this.setData({ currentTab }, () => this.applyTabFilter());
    },

    async onCreateInvite() {
        wx.showModal({
            title: '发起邀约',
            editable: true,
            placeholderText: '请输入划拨货款，最低3000元',
            success: async (res) => {
                if (!res.confirm) return;
                const transferAmount = Number(res.content || 0);
                if (!transferAmount || transferAmount < 3000) {
                    wx.showToast({ title: '划拨货款不得低于3000元', icon: 'none' });
                    return;
                }
                try {
                    const portalPassword = await promptPortalPassword({
                        title: '定向邀约验证',
                        placeholderText: '请输入6位数字业务密码'
                    });
                    if (!portalPassword) return;
                    wx.showLoading({ title: '提交中...' });
                    const result = await post('/distribution/directed-invites', { transfer_amount: transferAmount, portal_password: portalPassword }, { showError: false });
                    wx.hideLoading();
                    const invite = result.data || result;
                    wx.showToast({ title: '邀约已创建', icon: 'success' });
                    this.loadInvites();
                    if (invite && invite.ticket_id) {
                        wx.navigateTo({ url: `/pages/distribution/directed-invite?ticket=${encodeURIComponent(invite.ticket_id)}` });
                    }
                } catch (err) {
                    wx.hideLoading();
                    wx.showToast({ title: err.message || '创建失败', icon: 'none' });
                }
            }
        });
    },

    onPrepareShare() {},

    onOpenInvite(e) {
        const ticket = e.currentTarget.dataset.ticket;
        if (!ticket) return;
        wx.navigateTo({ url: `/pages/distribution/directed-invite?ticket=${encodeURIComponent(ticket)}` });
    },

    onRevokeInvite(e) {
        const inviteId = e.currentTarget.dataset.id;
        if (!inviteId) return;
        wx.showModal({
            title: '撤销邀约',
            content: '仅可撤销邀约中记录。撤销后该邀约失效。',
            success: async (res) => {
                if (!res.confirm) return;
                try {
                    await post(`/distribution/directed-invites/${encodeURIComponent(inviteId)}/revoke`, {}, { showError: false });
                    wx.showToast({ title: '已撤销', icon: 'success' });
                    this.loadInvites();
                } catch (err) {
                    wx.showToast({ title: err.message || '撤销失败', icon: 'none' });
                }
            }
        });
    },

    onShareAppMessage(e) {
        const ticket = e && e.target && e.target.dataset ? String(e.target.dataset.ticket || '') : '';
        const invite = (this.data.invites || []).find((item) => String(item.ticket_id || '') === ticket) || null;
        if (!invite || !invite.can_share || !ticket) {
            return {
                title: '推广合伙人邀约',
                path: '/pages/distribution/directed-invites',
                imageUrl: ''
            };
        }
        const userInfo = app.globalData.userInfo || {};
        const nickname = userInfo.nick_name || userInfo.nickname || '团队伙伴';
        return {
            title: `${nickname}邀请你成为推广合伙人`,
            path: `/pages/distribution/directed-invite?ticket=${encodeURIComponent(ticket)}`,
            imageUrl: ''
        };
    }
});
