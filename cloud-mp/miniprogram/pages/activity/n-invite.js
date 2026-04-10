const app = getApp();
const { get, post } = require('../../utils/request');
const { requireLogin } = require('../../utils/auth');
const { fetchUserProfile } = require('../../utils/userProfile');

function isNLeader(info) {
    return Number(info?.role_level || 0) === 7 && Number(info?.n_level || 0) >= 2;
}

Page({
    data: {
        leaderId: null,
        inviteCard: null,
        selfInfo: null,
        isLoggedIn: false,
        isOwner: false,
        canInviteN1: false,
        loading: true,
        applyLoading: false,
        applied: false,
        invalidMessage: ''
    },

    onLoad(options) {
        const leaderId = Number(options?.leader_id || 0) || null;
        this.setData({ leaderId });
        wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
    },

    onShow() {
        this.refreshPage();
    },

    async refreshPage() {
        this.setData({ loading: true, invalidMessage: '' });
        let selfInfo = app.globalData.userInfo || null;
        const isLoggedIn = !!app.globalData.isLoggedIn;

        if (isLoggedIn) {
            const profile = await fetchUserProfile();
            selfInfo = profile?.info || selfInfo;
        }

        let leaderId = this.data.leaderId;
        const canInviteN1 = isNLeader(selfInfo);
        if (!leaderId && canInviteN1) {
            leaderId = Number(selfInfo.id || 0) || null;
        }

        const isOwner = !!(leaderId && Number(selfInfo?.id || 0) === Number(leaderId));
        this.setData({
            leaderId,
            selfInfo,
            isLoggedIn,
            canInviteN1,
            isOwner
        });

        if (!leaderId) {
            this.setData({
                inviteCard: null,
                loading: false,
                invalidMessage: '未识别到有效邀请人'
            });
            return;
        }

        try {
            const res = await get('/n/invite-card', { leader_id: leaderId }, { showError: false });
            this.setData({
                inviteCard: res.data || null,
                loading: false,
                invalidMessage: res.data ? '' : '邀请信息不存在'
            });
        } catch (e) {
            this.setData({
                inviteCard: null,
                loading: false,
                invalidMessage: e?.message || '邀请信息不存在或已失效'
            });
        }
    },

    async onAcceptInvite() {
        const leaderId = Number(this.data.leaderId || 0);
        if (!leaderId) {
            wx.showToast({ title: '邀请信息无效', icon: 'none' });
            return;
        }
        if (this.data.isOwner) {
            wx.showToast({ title: '不能邀请自己加入', icon: 'none' });
            return;
        }
        if (!requireLogin(null, { redirectBack: true, content: '接受 N1 邀请需要先登录' })) return;
        if (this.data.applyLoading) return;

        this.setData({ applyLoading: true });
        try {
            const res = await post('/upgrade/apply', {
                path_type: 'n_join',
                leader_id: leaderId
            }, { showLoading: true, preventDuplicate: true });
            this.setData({ applied: true });
            wx.showModal({
                title: '申请已提交',
                content: res?.message || '后台已收到你的 N1 加入申请，请等待审核。',
                showCancel: false
            });
        } catch (e) {
            // request.js 已处理 toast
        } finally {
            this.setData({ applyLoading: false });
        }
    },

    onShareAppMessage() {
        const leaderId = Number(this.data.leaderId || this.data.selfInfo?.id || 0) || '';
        const inviteCard = this.data.inviteCard || {};
        const brandName = app.globalData.brandName || '品牌甄选';
        return {
            title: inviteCard.invite_title || `${inviteCard.nick_name || inviteCard.nickname || '好友'} 邀请你加入 N1`,
            path: `/pages/activity/n-invite?leader_id=${encodeURIComponent(String(leaderId))}`,
            imageUrl: '',
            desc: inviteCard.invite_subtitle || `${brandName} N 路径定向邀约`
        };
    },

    onShareTimeline() {
        const leaderId = Number(this.data.leaderId || this.data.selfInfo?.id || 0) || '';
        const inviteCard = this.data.inviteCard || {};
        return {
            title: inviteCard.invite_title || 'N1 定向邀约',
            query: `leader_id=${encodeURIComponent(String(leaderId))}`,
            imageUrl: ''
        };
    }
});
