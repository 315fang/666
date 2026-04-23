const { post } = require('../../utils/request');
const { requireLogin } = require('../../utils/auth');
const { fetchUserProfile } = require('../../utils/userProfile');
const { getUserInfoSnapshot, syncPortalPasswordFlags } = require('../../utils/portalPassword');

Page({
    data: {
        loading: false,
        saving: false,
        result: null,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        showCurrentPassword: false,
        showNewPassword: false,
        showConfirmPassword: false,
        roleLevel: 0,
        portalPasswordEnabled: false,
        changeRequired: false,
        lockedUntil: ''
    },

    onLoad() {
        if (!requireLogin()) {
            setTimeout(() => wx.navigateBack(), 100);
            return;
        }
        this.syncStateFromUser();
    },

    onShow() {
        this.syncStateFromUser();
    },

    syncStateFromUser() {
        const userInfo = getUserInfoSnapshot() || {};
        const portalPasswordEnabled = !!userInfo.portal_password_enabled;
        const changeRequired = !!userInfo.portal_password_change_required;
        const patch = {
            roleLevel: Number(userInfo.role_level || 0),
            portalPasswordEnabled,
            changeRequired,
            lockedUntil: userInfo.portal_password_locked_until || ''
        };
        if (!portalPasswordEnabled || !changeRequired) {
            patch.result = null;
        }
        this.setData(patch);
    },

    async refreshProfile() {
        const profile = await fetchUserProfile();
        if (profile && profile.info) {
            syncPortalPasswordFlags({
                portal_password_enabled: !!profile.info.portal_password_enabled,
                portal_password_change_required: !!profile.info.portal_password_change_required,
                portal_password_locked_until: profile.info.portal_password_locked_until || ''
            });
        }
        this.syncStateFromUser();
    },

    onInput(e) {
        const field = e.currentTarget.dataset.field;
        if (!field) return;
        this.setData({ [field]: e.detail.value });
    },

    async onApply() {
        if (!requireLogin()) return;
        if (this.data.portalPasswordEnabled) {
            wx.showToast({ title: '业务密码已设置', icon: 'none' });
            return;
        }
        this.setData({ loading: true, result: null });
        try {
            const res = await post('/user/portal/apply-initial-password', {}, { showLoading: true });
            const data = res.data || {};
            this.setData({ result: data });
            syncPortalPasswordFlags({
                portal_password_enabled: true,
                portal_password_change_required: true,
                portal_password_locked_until: ''
            });
            this.syncStateFromUser();
            wx.showToast({ title: '请立即复制并完成修改', icon: 'none' });
        } catch (_err) {
            // toast by request
        } finally {
            this.setData({ loading: false });
        }
    },

    async onChangePassword() {
        if (!requireLogin()) return;
        const currentPassword = String(this.data.currentPassword || '').trim();
        const newPassword = String(this.data.newPassword || '').trim();
        const confirmPassword = String(this.data.confirmPassword || '').trim();
        if (!currentPassword) {
            wx.showToast({ title: '请输入当前密码', icon: 'none' });
            return;
        }
        if (!newPassword) {
            wx.showToast({ title: '请输入新密码', icon: 'none' });
            return;
        }
        if (!/^\d{6}$/.test(newPassword)) {
            wx.showToast({ title: '新密码需为6位数字', icon: 'none' });
            return;
        }
        if (newPassword !== confirmPassword) {
            wx.showToast({ title: '两次输入的新密码不一致', icon: 'none' });
            return;
        }
        this.setData({ saving: true });
        try {
            await post('/user/portal/change-password', {
                current_password: currentPassword,
                new_password: newPassword
            }, { showLoading: true });
            syncPortalPasswordFlags({
                portal_password_enabled: true,
                portal_password_change_required: false,
                portal_password_locked_until: ''
            });
            await this.refreshProfile();
            this.setData({
                currentPassword: '',
                newPassword: '',
                confirmPassword: '',
                result: null,
                showCurrentPassword: false,
                showNewPassword: false,
                showConfirmPassword: false
            });
            wx.showToast({ title: '业务密码已更新', icon: 'success' });
        } catch (_err) {
            await this.refreshProfile();
        } finally {
            this.setData({ saving: false });
        }
    },

    onCopyPassword() {
        const r = this.data.result;
        if (!r) return;
        wx.setClipboardData({
            data: String(r.initial_password || ''),
            success: () => wx.showToast({ title: '初始密码已复制', icon: 'success' })
        });
    },

    onTogglePasswordVisible(e) {
        const field = e.currentTarget.dataset.field;
        if (!field) return;
        this.setData({ [field]: !this.data[field] });
    }
});
