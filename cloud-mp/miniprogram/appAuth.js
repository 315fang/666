/**
 * appAuth.js — 云开发版认证模块
 *
 * 核心变更：
 * - login() → 改为调用云函数 `login`，云函数内部通过 WXContext 自动获取 openid
 * - 不再需要 wx.login() 获取 code，不再需要 JWT token
 * - globalData 中移除 token 字段
 */
const { cloneDefaults, mergeDeep } = require('./utils/miniProgramConfig');
const { syncLocalFavoritesToCloud } = require('./utils/favoriteSync');

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
            } catch (e) { /* 保持原样 */ }
            let code = '';
            const match = value.match(/^i=([23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8})$/i);
            if (match) code = match[1];
            else if (/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/i.test(value)) code = value;
            if (code) wx.setStorageSync('pending_invite_code', code.toUpperCase());
        } catch (e) { /* ignore */ }
    },

    /**
     * 从本地缓存恢复登录状态（云开发版：无需 token）
     */
    async autoLogin() {
        try {
            const userInfo = wx.getStorageSync('userInfo');
            const openid = wx.getStorageSync('openid');

            if (userInfo && openid) {
                this.globalData.userInfo = userInfo;
                this.globalData.openid = openid;
                this.globalData.isLoggedIn = true;
                console.log('[Auth] 从缓存恢复登录状态');
            } else {
                console.log('[Auth] 无登录缓存，等待用户主动触发登录');
            }
        } catch (err) {
            console.error('[Auth] 恢复缓存登录状态失败:', err);
        }
    },

    /**
     * 触发登录入口（供页面调用）
     */
    async triggerLogin() {
        const { ensurePrivacyAuthorization } = require('./utils/privacy');
        try {
            await ensurePrivacyAuthorization();
        } catch (err) {
            return { success: false, reason: 'privacy_denied' };
        }
        try {
            return await this.wxLogin();
        } catch (err) {
            return { success: false, reason: 'login_failed', err };
        }
    },

    /**
     * ★ 核心登录 — 调用云函数 login
     *
     * 原流程：wx.login() → 获取 code → POST /login → 后端换 openid + 写 DB → 返回 JWT
     * 云开发：wx.cloud.callFunction('login') → 云函数中自动有 openid → 写云数据库 → 返回用户信息
     */
    async wxLogin() {
        try {
            // 读取邀请码（如果有）
            let inviteCode = '';
            try {
                const pending = wx.getStorageSync('pending_invite_code');
                if (pending) inviteCode = String(pending).trim().toUpperCase();
            } catch (e) { /* ignore */ }

            // ★ 调用云函数 login（云函数内部通过 getWXContext() 获取 openid，无需 code）
            const res = await wx.cloud.callFunction({
                name: 'login',
                data: {
                    invite_code: inviteCode || undefined
                }
            });

            const result = res.result;
            if (!result || !result.success) {
                throw new Error((result && result.message) || '登录失败');
            }

            // 清除已消费的会员码
            try { wx.removeStorageSync('pending_invite_code'); } catch (e) { /* ignore */ }

            // 保存登录信息（注意：云开发版无 token）
            // 云函数 login 返回 { success, data: { openid, ... } }，data 即 userInfo
            const userData = result.data || result.userInfo;
            const userOpenid = (result.data && result.data.openid) || result.openid;

            this.globalData.userInfo = userData;
            this.globalData.openid = userOpenid;
            this.globalData.isLoggedIn = true;

            wx.setStorageSync('userInfo', userData);
            wx.setStorageSync('openid', userOpenid);

            // 新用户优惠券提示
            if (result.is_new_user) {
                this.globalData.isNewUser = true;
                this._applyRegisterCouponPrompt(result);
            }

            // 等级提升提示
            if (result.level_up) {
                this.globalData.levelUpInfo = {
                    levelName: result.level_name || ''
                };
            }

            console.log('[Auth] 云函数登录成功:', userData);
            syncLocalFavoritesToCloud();
            return { ...result, userInfo: userData, openid: userOpenid };
        } catch (err) {
            console.error('[Auth] 云函数登录失败:', err);
            throw err;
        }
    },

    logout() {
        this.globalData.userInfo = null;
        this.globalData.openid = null;
        this.globalData.isLoggedIn = false;
        wx.removeStorageSync('userInfo');
        wx.removeStorageSync('openid');
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
