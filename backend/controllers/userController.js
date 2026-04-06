/**
 * 用户控制器（薄包装层）
 *
 * 职责仅限：参数提取 → 调用 UserService → res.json() / next(err)
 * 所有 DB 操作已迁移至 UserService
 */

const UserService = require('../services/UserService');

/**
 * 获取当前用户完整信息（小程序个人中心用）
 */
async function getUserProfile(req, res, next) {
    try {
        const data = await UserService.getUserProfile(req.user);
        res.json({ code: 0, data });
    } catch (error) {
        next(error);
    }
}

/**
 * 更新用户昵称/头像
 */
async function updateProfile(req, res, next) {
    try {
        const data = await UserService.updateProfile(req.user, req.body);
        res.json({ code: 0, data, message: '更新成功' });
    } catch (error) {
        next(error);
    }
}

/**
 * 绑定手机号 (微信小程序 getPhoneNumber)
 */
async function bindPhone(req, res, next) {
    try {
        const { code } = req.body;
        const data = await UserService.bindPhone(req.user, code);
        res.json({ code: 0, data, message: '绑定手机号成功' });
    } catch (error) {
        next(error);
    }
}

/**
 * 获取用户角色信息
 */
async function getUserRole(req, res, next) {
    try {
        const data = await UserService.getUserRole(req.user);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

/**
 * 获取会员等级与成长值配置（公开给登录用户）
 */
async function getMemberTierMeta(req, res, next) {
    try {
        const data = await UserService.getMemberTierMeta();
        res.json({ code: 0, data });
    } catch (error) {
        next(error);
    }
}

/**
 * 绑定上级
 */
async function bindParent(req, res, next) {
    try {
        const { parent_id } = req.body;
        await UserService.bindParent(req.user, parent_id);
        res.json({ code: 0, message: '绑定上级成功' });
    } catch (error) {
        next(error);
    }
}

// --- 通知相关 ---

/**
 * 获取用户通知
 */
async function getNotifications(req, res, next) {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;
        const data = await UserService.getNotifications(userId, page, limit);
        res.json({ code: 0, data });
    } catch (error) {
        next(error);
    }
}

/**
 * 标记通知已读
 */
async function markNotificationRead(req, res, next) {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        await UserService.markNotificationRead(userId, id);
        res.json({ code: 0, message: '已设为已读' });
    } catch (error) {
        next(error);
    }
}

// --- 用户偏好设置与AI盲盒测算 ---

/**
 * 获取用户偏好
 */
async function getPreferences(req, res, next) {
    try {
        const data = await UserService.getPreferences(req.user.id);
        res.json({ code: 0, data });
    } catch (error) {
        next(error);
    }
}

/**
 * 获取AI定制测算问题库
 */
async function getPreferencesQuestions(req, res, next) {
    try {
        const data = await UserService.getPreferencesQuestions();
        res.json({ code: 0, data });
    } catch (error) {
        next(error);
    }
}

/**
 * 保存用户偏好设置并触发AI大模型预选
 */
async function savePreferences(req, res, next) {
    try {
        const { preferences } = req.body;
        await UserService.savePreferences(req.user.id, preferences);
        res.json({ code: 0, message: '偏好设置已保存，AI分析完成' });
    } catch (error) {
        next(error);
    }
}

// --- 门户密码 ---

/**
 * POST /api/user/portal/apply-initial-password
 * 小程序已登录用户申领网页门户随机初始密码
 */
async function applyPortalInitialPassword(req, res, next) {
    try {
        const data = await UserService.applyPortalInitialPassword(req.user.id);
        res.json({
            code: 0,
            message: '密码已重置，请使用新密码登录门户',
            data
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getUserProfile,
    updateProfile,
    getUserRole,
    getMemberTierMeta,
    bindParent,
    getNotifications,
    markNotificationRead,
    getPreferences,
    getPreferencesQuestions,
    savePreferences,
    bindPhone,
    applyPortalInitialPassword
};
