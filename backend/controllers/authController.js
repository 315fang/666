const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { code2Session } = require('../utils/wechat');
const constants = require('../config/constants');
const { logAuth, error: logError } = require('../utils/logger');
const PointService = require('../services/PointService');  // ★ 积分服务
const MemberTierService = require('../services/MemberTierService');
const CouponAutomationService = require('../services/CouponAutomationService');
const { generateMemberNo, isValidMemberNo, normalizeMemberNo } = require('../utils/memberNo');
const { sendNotification } = require('../models/notificationUtil');
const { getUserMaintenanceConfig } = require('../utils/runtimeBusinessConfig');
const { resolveUserAvatarForApi } = require('../utils/userAvatar');

// 生成用户 JWT Token
// ★ 安全修复: JWT payload 中不包含 openid，仅使用内部 user.id
function generateUserToken(user) {
    return jwt.sign(
        { id: user.id },
        constants.SECURITY.JWT_SECRET,
        { expiresIn: constants.SECURITY.JWT_EXPIRES_IN }
    );
}

/**
 * 根据会员码绑定上级（与 bindParent 一致）：仅当当前用户尚无 parent_id 时执行。
 * 新用户首登、老用户携带待绑定会员码登录时共用。
 */
async function tryBindInviterForNewUser(user, inviteRaw) {
    if (!user || !inviteRaw || user.parent_id) return user;
    const code = normalizeMemberNo(inviteRaw);
    let parent = null;
    if (isValidMemberNo(code)) {
        parent = await User.findOne({ where: { member_no: code } });
    }
    if (!parent) {
        parent = await User.findOne({ where: { invite_code: String(inviteRaw).trim() } });
    }
    if (!parent || parent.id === user.id) return user;

    let checkId = parent.id;
    let depth = 0;
    while (checkId && depth < 50) {
        if (checkId === user.id) return user;
        const anc = await User.findByPk(checkId, { attributes: ['id', 'parent_id'] });
        if (!anc) break;
        checkId = anc.parent_id;
        depth++;
    }

    const isChild = await User.findOne({ where: { id: parent.id, parent_id: user.id } });
    if (isChild) return user;

    user.parent_id = parent.id;
    user.parent_openid = parent.openid;
    user.agent_id = parent.role_level >= 3 ? parent.id : parent.agent_id;
    user.joined_team_at = new Date();
    await user.save();
    await parent.increment('referee_count');

    sendNotification(
        parent.id,
        '新成员加入',
        `${user.nickname || '新用户'} 已通过您的会员码加入了团队！`,
        'commission',
        String(user.id)
    ).catch(() => {});

    return User.findByPk(user.id, {
        include: [{ model: User, as: 'parent' }]
    });
}

/**
 * 用户登录/注册
 */
async function login(req, res, next) {
    try {
        const { code, nickName, avatarUrl, invite_code, distributor_id, member_no, member_code } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: '缺少code参数'
            });
        }

        const { defaultAvatarUrl } = await getUserMaintenanceConfig();

        // 使用code换取openid
        const { openid, session_key } = await code2Session(code);

        // 查询用户是否存在
        let user = await User.findOne({
            where: { openid },
            include: [
                { model: User, as: 'parent' }
            ]
        });

        let isNewUser = false;
        /** 新用户注册自动发券张数（供小程序提示） */
        let registerCouponsIssued = 0;

        if (user) {
            if (user.status !== 1) {
                return res.status(403).json({
                    code: -1,
                    success: false,
                    message: '账号已被禁用'
                });
            }
            const av = (avatarUrl && String(avatarUrl).trim()) || defaultAvatarUrl;
            const patch = { last_login: new Date() };
            if (!(user.avatar_url && String(user.avatar_url).trim())) {
                patch.avatar_url = av;
            }
            await user.update(patch);
            if (patch.avatar_url) user.avatar_url = patch.avatar_url;

            // 尚无上级时，本次登录携带的会员码可补绑
            const inviteForExisting = member_no || member_code || invite_code || distributor_id;
            if (inviteForExisting && !user.parent_id) {
                const updated = await tryBindInviterForNewUser(user, inviteForExisting);
                if (updated) user = updated;
            }

            logAuth('用户登录', { userId: user.id, openid: user.openid });
        } else {
            isNewUser = true;

            user = await User.create({
                openid,
                nickname: nickName || '微信用户',
                avatar_url: (avatarUrl && String(avatarUrl).trim()) || defaultAvatarUrl,
                role_level: 0,
                parent_id: null,
                parent_openid: null,
                agent_id: null,
                last_login: new Date()
            });

            // 生成对外随机会员编号，避免通过顺编推断业务量
            const memberNo = await generateMemberNo(User);
            await user.update({ member_no: memberNo });

            // 重新加载以包含parent关系
            user = await User.findByPk(user.id, {
                include: [{ model: User, as: 'parent' }]
            });

            logAuth('新用户注册', {
                userId: user.id,
                openid: user.openid
            });

            // ★ 新用户自动初始化积分账户（Lv1，享全场包邮特权）
            PointService.initForNewUser(user.id).catch(e => {
                logError('AUTH_CTRL', '积分账户初始化失败（不影响注册）', { error: e.message });
            });

            // ★ 新用户：会员码 / 历史邀请码 字段
            const inviteFromClient = member_no || member_code || invite_code || distributor_id;
            if (inviteFromClient) {
                const updated = await tryBindInviterForNewUser(user, inviteFromClient);
                if (updated) user = updated;
            }

            try {
                const issueRes = await CouponAutomationService.trigger('register', {
                    userId: user.id,
                    roleLevel: user.role_level
                });
                registerCouponsIssued = issueRes?.issued || 0;
            } catch (e) {
                logError('AUTH_CTRL', '自动发券触发失败（不影响注册）', { error: e.message });
            }
        }

        if (!isValidMemberNo(user.member_no)) {
            await user.update({ member_no: await generateMemberNo(User) });
            user = await User.findByPk(user.id, {
                include: [{ model: User, as: 'parent' }]
            });
        }

        // 签发 JWT Token
        const token = generateUserToken(user);

        const roleName = await MemberTierService.getRoleName(user.role_level);
        const avatarForClient = await resolveUserAvatarForApi(user.avatar_url);

        res.json({
            code: 0,  // ★ 统一返回格式，前端检查 code === 0
            success: true,
            token,
            // ★ 安全修复: 不再返回 openid 到前端
            // 前端如需调用微信 API，请使用 wx.getStorageSync() 自行获取
            is_new_user: isNewUser,  // ★ 前端用于触发 welcome 品牌动画
            register_coupons_issued: registerCouponsIssued,
            userInfo: {
                id: user.id,
                // ★ 安全修复: userInfo 中移除 openid
                nickname: user.nickname,
                avatar_url: avatarForClient,
                role: user.role_level,
                role_level: user.role_level,
                role_name: roleName,
                growth_value: parseFloat(user.growth_value || 0),
                discount_rate: parseFloat(user.discount_rate || 1),
                stock: user.stock_count,
                balance: user.balance,
                participate_distribution: user.participate_distribution === 1 ? 1 : 0,
                invite_code: user.member_no || '',
                member_no: user.member_no || '',
                member_code: user.member_no || ''
            }
        });
    } catch (error) {
        logError('AUTH', '登录失败', {
            error: error.message,
            stack: error.stack
        });
        next(error);
    }
}

module.exports = {
    login
};
