const { login } = require('./utils/auth');
const { syncLocalFavoritesToCloud } = require('./utils/favoriteSync');
const { cloneDefaults, mergeDeep } = require('./utils/miniProgramConfig');

module.exports = {
    _captureInviteFromLaunch(options) {
        try {
            const q = options && options.query;
            if (q && q.invite) {
                wx.setStorageSync('pending_invite_code', String(q.invite).trim());
            }
            if (q && q.scene != null && q.scene !== '') {
                this._parseSceneToPendingInvite(q.scene);
            }
        } catch (e) {
            /* ignore */
        }
    },

    _parseSceneToPendingInvite(raw) {
        try {
            let value = raw;
            if (typeof value === 'number') value = String(value);
            value = String(value);
            try {
                value = decodeURIComponent(value);
            } catch (e) {
                /* 保持原样 */
            }
            let code = '';
            const match = value.match(/^i=([23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8})$/i);
            if (match) code = match[1];
            else if (/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/i.test(value)) code = value;
            if (code) wx.setStorageSync('pending_invite_code', code.toUpperCase());
        } catch (e) {
            /* ignore */
        }
    },

    async autoLogin() {
        try {
            const userInfo = wx.getStorageSync('userInfo');
            const openid = wx.getStorageSync('openid');
            const token = wx.getStorageSync('token');

            if (userInfo && openid && token) {
                this.globalData.userInfo = userInfo;
                this.globalData.openid = openid;
                this.globalData.token = token;
                this.globalData.isLoggedIn = true;
                console.log('[Auth] 从缓存恢复登录状态');
            } else {
                console.log('[Auth] 无登录缓存，等待用户主动触发登录');
            }
        } catch (err) {
            console.error('[Auth] 恢复缓存登录状态失败:', err);
        }
    },

    async triggerLogin() {
        const { ensurePrivacyAuthorization } = require('./utils/privacy');
        try {
            await ensurePrivacyAuthorization();
        } catch (err) {
            return { success: false, reason: 'privacy_denied' };
        }
        try {
            return await this.wxLogin(false);
        } catch (err) {
            return { success: false, reason: 'login_failed', err };
        }
    },

    async wxLogin(withProfile = false) {
        try {
            const { code } = await this.promisify(wx.login)();
            console.log('获取到 code:', code);

            let profileData = {};
            if (withProfile) {
                console.log('跳过 getUserProfile，头像昵称请在个人中心手动补充');
            }

            const loginPayload = {
                code,
                ...profileData
            };
            try {
                const pending = wx.getStorageSync('pending_invite_code');
                if (pending) {
                    const memberCode = String(pending).trim().toUpperCase();
                    loginPayload.invite_code = memberCode;
                    loginPayload.member_no = memberCode;
                    loginPayload.member_code = memberCode;
                }
            } catch (e) { /* ignore */ }

            const result = await login(loginPayload);

            if (!result.success) {
                throw new Error(result.message || '登录失败');
            }

            try {
                wx.removeStorageSync('pending_invite_code');
            } catch (e) { /* ignore */ }

            this.globalData.userInfo = result.userInfo;
            this.globalData.openid = result.openid;
            this.globalData.token = result.token;
            this.globalData.isLoggedIn = true;

            wx.setStorageSync('userInfo', result.userInfo);
            wx.setStorageSync('openid', result.openid);
            wx.setStorageSync('token', result.token);

            if (result.is_new_user) {
                this.globalData.isNewUser = true;
                this._applyRegisterCouponPrompt(result);
            }

            if (result.level_up) {
                this.globalData.levelUpInfo = {
                    levelName: result.level_name || ''
                };
            }

            console.log('登录成功:', result.userInfo);
            syncLocalFavoritesToCloud();
            return result;
        } catch (err) {
            console.error('微信登录失败:', err);
            throw err;
        }
    },

    logout() {
        this.globalData.userInfo = null;
        this.globalData.openid = null;
        this.globalData.token = null;
        this.globalData.isLoggedIn = false;
        wx.removeStorageSync('userInfo');
        wx.removeStorageSync('openid');
        wx.removeStorageSync('token');
    },

    _applyRegisterCouponPrompt(result) {
        try {
            const { formatPromptBody } = require('./utils/lightPrompt');
            const merged = mergeDeep(cloneDefaults(), this.globalData.miniProgramConfig || {});
            const registerCoupon = merged.light_prompt_modals && merged.light_prompt_modals.register_coupon;
            if (!registerCoupon || !registerCoupon.enabled) return;

            const issued = Number(result.register_coupons_issued || 0);
            if (issued <= 0 && !registerCoupon.show_without_coupon) return;

            const template = issued > 0 && registerCoupon.body_when_issued
                ? registerCoupon.body_when_issued
                : registerCoupon.body;

            this.globalData.pendingRegisterCouponPrompt = {
                title: registerCoupon.title || '新人礼券',
                content: formatPromptBody(template, { count: issued })
            };
        } catch (e) {
            console.warn('[light prompt] register coupon', e);
        }
    }
};
