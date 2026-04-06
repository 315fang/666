/**
 * UserService
 * 从 userController.js 提取的所有 DB 操作
 *
 * 约定：
 * - 不接触 req/res
 * - 返回数据或抛出 BusinessError
 * - Controller 层只做参数提取 → 调用 Service → res.json() / next(err)
 */

const { User, Notification, PortalAccount, AppConfig } = require('../models');
const { sendNotification } = require('../models/notificationUtil');
const MemberTierService = require('./MemberTierService');
const { resolveUserAvatarForApi } = require('../utils/userAvatar');
const { BusinessError } = require('../utils/errors');
const { logError } = require('../utils/logger');
const { isValidMemberNo, normalizeMemberNo } = require('../utils/memberNo');

// ============================================================
// 用户资料相关
// ============================================================

/**
 * 获取用户完整 profile（小程序个人中心用）
 */
async function getUserProfile(user) {
    // 获取上级信息
    let parent = null;
    if (user.parent_id) {
        const parentUser = await User.findByPk(user.parent_id, {
            attributes: ['id', 'nickname', 'avatar_url']
        });
        if (parentUser) {
            parent = { id: parentUser.id, nickname: parentUser.nickname };
        }
    }

    const directCount = await User.count({ where: { parent_id: user.id } });

    const roleName = await MemberTierService.getRoleName(user.role_level);
    const growthProgress = await MemberTierService.getGrowthProgress(user.growth_value || 0);
    const avatar_url = await resolveUserAvatarForApi(user.avatar_url);

    return {
        id: user.id,
        openid: user.openid,
        nickname: user.nickname,
        avatar_url,
        role_level: user.role_level,
        role_name: roleName,
        balance: parseFloat(user.balance).toFixed(2),
        referee_count: user.referee_count || directCount,
        order_count: user.order_count,
        total_sales: parseFloat(user.total_sales).toFixed(2),
        growth_value: parseFloat(user.growth_value || 0),
        discount_rate: parseFloat(user.discount_rate || 1),
        growth_progress: growthProgress,
        invite_code: user.member_no || user.invite_code,
        member_no: user.member_no || null,
        member_code: user.member_no || null,
        stock_count: user.stock_count || 0,
        parent: parent,
        created_at: user.created_at,
        joined_team_at: user.joined_team_at,
        participate_distribution: user.participate_distribution === 1 ? 1 : 0
    };
}

/**
 * 更新用户昵称/头像
 */
async function updateProfile(user, { nickname, avatar_url }) {
    const updateData = {};
    if (nickname && nickname.trim()) {
        updateData.nickname = nickname.trim().substring(0, 20);
    }
    if (avatar_url) {
        updateData.avatar_url = avatar_url;
    }

    if (Object.keys(updateData).length === 0) {
        throw new BusinessError('没有要更新的信息', 400);
    }

    await user.update(updateData);

    return {
        nickname: user.nickname,
        avatar_url: user.avatar_url
    };
}

/**
 * 绑定手机号（微信小程序 getPhoneNumber）
 */
async function bindPhone(user, code) {
    if (!code) {
        throw new BusinessError('缺少code参数', 400);
    }

    const { getPhoneNumber } = require('../utils/wechat');
    const phoneInfo = await getPhoneNumber(code);

    if (phoneInfo && phoneInfo.purePhoneNumber) {
        user.phone = phoneInfo.purePhoneNumber;
        await user.save();
        return { phone: user.phone };
    }

    throw new BusinessError('解析手机号失败', 400);
}

/**
 * 获取用户角色信息
 */
async function getUserRole(user) {
    const avatar_url = await resolveUserAvatarForApi(user.avatar_url);
    return {
        id: user.id,
        nickname: user.nickname,
        avatar_url,
        role: user.role_level,
        stock: user.stock_count,
        balance: parseFloat(user.balance).toFixed(2),
        referee_count: user.referee_count,
        order_count: user.order_count,
        total_sales: parseFloat(user.total_sales).toFixed(2)
    };
}

/**
 * 获取会员等级与成长值配置
 */
async function getMemberTierMeta() {
    const [memberLevels, growthTiers, pointLevels] = await Promise.all([
        MemberTierService.getMemberLevels(),
        MemberTierService.getGrowthTiers(),
        MemberTierService.getPointLevels()
    ]);
    return {
        member_levels: memberLevels,
        growth_tiers: growthTiers,
        point_levels: pointLevels
    };
}

// ============================================================
// 绑定上级
// ============================================================

/**
 * 绑定上级（含循环检测、通知）
 */
async function bindParent(user, parentIdStr) {
    if (!parentIdStr) {
        throw new BusinessError('无效的会员码', 400);
    }

    if (user.parent_id) {
        throw new BusinessError('已绑定上级，不可更改', 400);
    }

    // 支持通过会员码、历史邀请码、用户ID、openid 查找
    let parent = null;
    const normalizedMemberNo = normalizeMemberNo(parentIdStr);
    if (isValidMemberNo(normalizedMemberNo)) {
        parent = await User.findOne({ where: { member_no: normalizedMemberNo } });
    }
    if (!parent && /^\d{6}$/.test(String(parentIdStr))) {
        parent = await User.findOne({ where: { invite_code: String(parentIdStr) } });
    }
    if (!parent) {
        const parsedId = parseInt(parentIdStr);
        if (!isNaN(parsedId) && parsedId > 0) {
            parent = await User.findByPk(parsedId);
        }
    }
    if (!parent) {
        parent = await User.findOne({ where: { openid: String(parentIdStr) } });
    }

    if (!parent) {
        throw new BusinessError('上级用户不存在', 404);
    }

    if (parent.id === user.id) {
        throw new BusinessError('不能绑定自己为上级', 400);
    }

    // 递归检查循环绑定
    let checkId = parent.parent_id;
    let depth = 0;
    const maxDepth = 50;
    while (checkId && depth < maxDepth) {
        if (checkId === user.id) {
            throw new BusinessError('不可绑定，会形成循环关系', 400);
        }
        const ancestor = await User.findByPk(checkId, { attributes: ['id', 'parent_id'] });
        if (!ancestor) break;
        checkId = ancestor.parent_id;
        depth++;
    }

    // 检查 parent 是否是 user 的直接下级
    const isChild = await User.findOne({ where: { id: parent.id, parent_id: user.id } });
    if (isChild) {
        throw new BusinessError('不可绑定自己的下级', 400);
    }

    // 更新绑定关系
    user.parent_id = parent.id;
    user.parent_openid = parent.openid;
    user.agent_id = parent.role_level >= 3 ? parent.id : parent.agent_id;
    user.joined_team_at = new Date();
    await user.save();

    // 更新上级推人人数
    await parent.increment('referee_count');

    // 通知上级有新成员加入
    await sendNotification(
        parent.id,
        '新成员加入',
        `${user.nickname || '新用户'} 已通过您的会员码加入了您的团队！`,
        'commission',
        String(user.id)
    );

    // 通知当前用户绑定成功
    await sendNotification(
        user.id,
        '绑定上级成功',
        `您已成功加入 ${parent.nickname || '上级'} 的团队。`,
        'system',
        String(parent.id)
    );
}

// ============================================================
// 通知相关
// ============================================================

/**
 * 获取用户通知列表
 */
async function getNotifications(userId, page = 1, limit = 20) {
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Notification.findAndCountAll({
        where: { user_id: userId },
        order: [['created_at', 'DESC']],
        offset,
        limit: parseInt(limit)
    });

    const unreadCount = await Notification.count({
        where: { user_id: userId, is_read: false }
    });

    return {
        list: rows,
        unread_count: unreadCount,
        pagination: { total: count, page: parseInt(page), limit: parseInt(limit) }
    };
}

/**
 * 标记通知已读
 */
async function markNotificationRead(userId, notificationId) {
    const [affected] = await Notification.update(
        { is_read: true },
        { where: { id: notificationId, user_id: userId } }
    );
    if (affected === 0) {
        throw new BusinessError('通知不存在或无权操作', 404);
    }
}

// ============================================================
// 用户偏好设置与AI盲盒测算
// ============================================================

/**
 * 获取用户偏好
 */
async function getPreferences(userId) {
    const user = await User.findByPk(userId, {
        attributes: ['preferences']
    });
    return user?.preferences || {};
}

/** 默认备用题库 */
function getDefaultQuestions() {
    return [
        {
            id: "q1",
            title: "您平时的穿衣/生活风格是？",
            subtitle: "AI将根据风格为您挑选合适的单品",
            options: [
                { label: "极简冷淡风", value: "minimalist" },
                { label: "街头潮牌", value: "street" },
                { label: "职场通勤", value: "office" },
                { label: "甜美可爱", value: "sweet" }
            ]
        },
        {
            id: "q2",
            title: "您对哪些品类的盲盒更感兴趣？",
            subtitle: "多选题，AI会跨品类为您搭配",
            options: [
                { label: "美妆与护肤", value: "beauty" },
                { label: "精致零食", value: "snack" },
                { label: "居家生活好物", value: "home" },
                { label: "减脂与健康", value: "health" }
            ]
        },
        {
            id: "q3",
            title: "您目前的单月闲置消费预算是？",
            subtitle: "为了给您控制合理的盲盒体积",
            options: [
                { label: "199元以内 (轻奢尝鲜)", value: "199" },
                { label: "199-399元 (进阶品质)", value: "399" },
                { label: "399元以上 (极致尊享)", value: "599" }
            ]
        }
    ];
}

/**
 * 获取AI定制测算问题库
 */
async function getPreferencesQuestions() {
    const config = await AppConfig.findOne({ where: { config_key: 'AI_QUESTIONNAIRE_CONFIG' } });

    let questions = [];
    if (config && config.config_value) {
        try {
            questions = JSON.parse(config.config_value);
        } catch (e) {
            logError('UserService', '解析问卷配置失败', { error: e.message });
        }
    }

    if (questions.length === 0) {
        questions = getDefaultQuestions();
    }

    return questions;
}

/**
 * 保存用户偏好设置
 */
async function savePreferences(userId, preferences) {
    await User.update(
        { preferences: preferences || {} },
        { where: { id: userId } }
    );
}

// ============================================================
// 门户密码
// ============================================================

const PORTAL_INIT_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function generatePortalInitPassword(len = 8) {
    let s = '';
    for (let i = 0; i < len; i++) {
        s += PORTAL_INIT_CHARS[Math.floor(Math.random() * PORTAL_INIT_CHARS.length)];
    }
    return s;
}

/**
 * 申请门户初始密码
 * @param {number} userId - 用户 ID（Service 内部自行查询完整 user 实例）
 */
async function applyPortalInitialPassword(userId) {
    const user = await User.findByPk(userId, { attributes: ['id', 'member_no', 'role_level', 'status'] });
    if (!user) {
        throw new BusinessError('用户不存在', 400);
    }

    if (!user.member_no || user.status !== 1) {
        throw new BusinessError('账号缺少会员编号，请联系客服', 400);
    }

    const commercePolicy = await MemberTierService.getCommercePolicy();
    const minRoleLevel = Number(commercePolicy?.portal_login?.min_role_level ?? 3);
    if (Number(user.role_level || 0) < minRoleLevel) {
        const roleName = await MemberTierService.getRoleName(minRoleLevel);
        throw new BusinessError(`需${roleName}及以上等级才可申领门户密码`, 403);
    }

    let account = await PortalAccount.findOne({ where: { user_id: user.id } });
    if (account && !account.must_change_password) {
        throw new BusinessError('已设置门户密码，请使用网页端登录；如需重置请联系客服', 400);
    }

    const now = new Date();
    if (account?.last_portal_init_issue_at) {
        const last = new Date(account.last_portal_init_issue_at);
        if (now.getTime() - last.getTime() < 24 * 60 * 60 * 1000) {
            throw new BusinessError('24小时内仅可申领一次初始密码，请稍后再试', 429);
        }
    }

    const plain = generatePortalInitPassword(8);
    if (!account) {
        account = PortalAccount.build({
            user_id: user.id,
            login_id: user.member_no,
            must_change_password: 1,
            status: 1
        });
    }
    account.setPassword(plain);
    account.must_change_password = 1;
    account.last_portal_init_issue_at = now;
    await account.save();

    return {
        member_no: user.member_no,
        password_issued: true
    };
}

module.exports = {
    getUserProfile,
    updateProfile,
    bindPhone,
    getUserRole,
    getMemberTierMeta,
    bindParent,
    getNotifications,
    markNotificationRead,
    getPreferences,
    getPreferencesQuestions,
    savePreferences,
    applyPortalInitialPassword
};
