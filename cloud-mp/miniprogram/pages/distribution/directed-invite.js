const { get, post } = require('../../utils/request');
const { hasLoginSession, ensureLogin } = require('../../utils/auth');
const app = getApp();

Page({
    data: {
        ticket: '',
        loading: true,
        loadError: false,
        loadErrorText: '',
        invite: null,
        accepting: false
    },

    async onLoad(options) {
        const ticket = String(options.ticket || '').trim();
        this.setData({ ticket });
        if (!ticket) {
            this.setData({ loading: false, loadError: true, loadErrorText: '缺少邀约信息' });
            return;
        }
        try {
            wx.removeStorageSync('pending_invite_code');
        } catch (_) {}
        if (!hasLoginSession()) {
            try {
                await ensureLogin({ ignorePendingInviteCode: true, message: '请先登录后查看邀约' });
            } catch (err) {
                this.setData({
                    loading: false,
                    loadError: true,
                    loadErrorText: err.message || '请先登录后查看邀约'
                });
                return;
            }
        }
        this.loadInvite();
    },

    onShow() {
        if (this.data.ticket && this._loadedOnce) {
            this.loadInvite();
        }
        this._loadedOnce = true;
    },

    async loadInvite() {
        this.setData({ loading: true, loadError: false, loadErrorText: '' });
        try {
            const res = await get('/distribution/directed-invites/ticket', {
                ticket: this.data.ticket
            }, {
                showError: false
            });
            const invite = res.data || res;
            this.setData({
                loading: false,
                invite
            });
        } catch (err) {
            this.setData({
                loading: false,
                loadError: true,
                loadErrorText: err.message || '请确认邀约是否有效'
            });
        }
    },

    async onAcceptInvite() {
        if (!this.data.invite || !this.data.invite.can_accept || this.data.accepting) return;
        this.setData({ accepting: true });
        try {
            if (!hasLoginSession()) {
                await ensureLogin({ ignorePendingInviteCode: true, message: '请先登录后接受邀约' });
            }
            await post('/distribution/directed-invites/accept', {
                ticket: this.data.ticket
            }, {
                showError: false
            });
            wx.showToast({ title: '已接受，等待审核', icon: 'success' });
            this.loadInvite();
        } catch (err) {
            wx.showToast({ title: err.message || '请先登录后接受邀约', icon: 'none' });
        } finally {
            this.setData({ accepting: false });
        }
    },

    onShareAppMessage() {
        const invite = this.data.invite || {};
        if (!invite.can_share || !this.data.ticket) {
            return {
                title: '推广合伙人邀约',
                path: '/pages/distribution/directed-invites',
                imageUrl: ''
            };
        }
        const inviter = invite.inviter || {};
        return {
            title: `${inviter.nickname || '团队伙伴'}邀请你成为推广合伙人`,
            path: `/pages/distribution/directed-invite?ticket=${encodeURIComponent(this.data.ticket)}`,
            imageUrl: ''
        };
    }
});
