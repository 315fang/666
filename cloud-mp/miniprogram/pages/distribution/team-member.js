const { get, post } = require('../../utils/request');
const app = getApp();
const { promptPortalPassword } = require('../../utils/portalPassword');

function formatDate(dateText) {
    if (!dateText) return '';
    return String(dateText).split('T')[0];
}

function buildDetailItems(member) {
    const items = [
        { label: '团队层级', value: member.level_label || '未知' },
        { label: '成员身份', value: member.role_name || 'VIP用户' },
        { label: '当前关系', value: member.current_relation_text || member.relation_text || '团队成员' },
        { label: '邀请人', value: member.inviter_text || '暂未记录' },
        { label: '加入来源', value: member.relation_source_text || (member.relation_source === 'directed_b1' ? '定向邀约' : '普通邀请') },
        { label: '成员ID', value: member.invite_code || '暂无ID' },
        { label: '手机号', value: member.phone || '未绑定' },
        { label: '订单数', value: `${Number(member.order_count || 0)} 单` },
        { label: '累计业绩', value: `¥${member.total_sales || '0.00'}` },
        { label: '加入时间', value: formatDate(member.joined_at) || '未知' },
        { label: '线路状态', value: member.line_locked ? '已锁定' : '未锁定' }
    ];
    if (member.can_apply_goods_fund_transfer) {
        items.push({
            label: '待审核划拨',
            value: `${Number(member.goods_fund_transfer_pending_count || 0)} 笔`
        });
        if (member.goods_fund_transfer_latest_status_text) {
            items.push({
                label: '最近划拨',
                value: `${member.goods_fund_transfer_latest_status_text}${member.goods_fund_transfer_latest_amount ? ` / ¥${member.goods_fund_transfer_latest_amount}` : ''}`
            });
        }
    }
    return items;
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

    async onCreateGoodsFundTransfer() {
        const member = this.data.member;
        if (!member || !member.can_apply_goods_fund_transfer) {
            wx.showToast({ title: '仅支持给直属下级发起货款划拨', icon: 'none' });
            return;
        }
        wx.showModal({
            title: '申请货款划拨',
            editable: true,
            placeholderText: '请输入划拨金额',
            success: async (res) => {
                if (!res.confirm) return;
                const amount = Number(res.content || 0);
                if (!amount || amount <= 0) {
                    wx.showToast({ title: '划拨金额必须大于0元', icon: 'none' });
                    return;
                }
                try {
                    const portalPassword = await promptPortalPassword({
                        title: '货款划拨验证',
                        placeholderText: '请输入6位数字业务密码'
                    });
                    if (!portalPassword) return;
                    wx.showLoading({ title: '提交中...' });
                    await post(`/distribution/team/${encodeURIComponent(member.id || member._id)}/goods-fund-transfer-applications`, {
                        amount,
                        portal_password: portalPassword
                    }, { showError: false });
                    wx.hideLoading();
                    wx.showToast({ title: '已提交审核', icon: 'success' });
                    this.loadMemberDetail();
                } catch (error) {
                    wx.hideLoading();
                    wx.showToast({ title: error.message || '提交失败', icon: 'none' });
                }
            }
        });
    },

    onBack() {
        wx.navigateBack();
    }
});
