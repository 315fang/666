const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { code2Session } = require('../utils/wechat');
const { checkRoleUpgrade } = require('../utils/commission');
const constants = require('../config/constants');
const { logAuth, error: logError } = require('../utils/logger');

// 生成用户 JWT Token
function generateUserToken(user) {
    return jwt.sign(
        { id: user.id, openid: user.openid },
        constants.SECURITY.JWT_SECRET,
        { expiresIn: constants.SECURITY.JWT_EXPIRES_IN }
    );
}

/**
 * 生成唯一的6位数字邀请码
 */
async function generateUniqueInviteCode() {
    let code;
    let exists = true;
    let attempts = 0;
    
    while (exists && attempts < 100) {
        // 生成100000-999999之间的随机6位数
        code = String(Math.floor(100000 + Math.random() * 900000));
        const found = await User.findOne({ where: { invite_code: code } });
        exists = !!found;
        attempts++;
    }
    
    if (exists) {
        // 极端情况下用时间戳后6位
        code = String(Date.now()).slice(-6);
    }
    
    return code;
}

/**
 * 通过邀请码/ID/openid 查找上级用户
 */
async function findParentUser(distributorId) {
    if (!distributorId) return null;
    
    // 1. 先尝试用6位邀请码查找
    if (/^\d{6}$/.test(String(distributorId))) {
        const byCode = await User.findOne({ where: { invite_code: String(distributorId) } });
        if (byCode) return byCode;
    }
    
    // 2. 尝试用 user.id 查找（数字）
    const parsedId = parseInt(distributorId);
    if (!isNaN(parsedId) && parsedId > 0) {
        const byId = await User.findByPk(parsedId);
        if (byId) return byId;
    }
    
    // 3. 尝试用 openid 查找
    const byOpenid = await User.findOne({ where: { openid: String(distributorId) } });
    if (byOpenid) return byOpenid;
    
    return null;
}

/**
 * 用户登录/注册
 */
async function login(req, res, next) {
    try {
        const { code, distributor_id, nickName, avatarUrl } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: '缺少code参数'
            });
        }

        // 使用code换取openid
        const { openid, session_key } = await code2Session(code);

        // 查询用户是否存在
        let user = await User.findOne({
            where: { openid },
            include: [
                { model: User, as: 'parent' }
            ]
        });

        if (user) {
            // 用户已存在，更新最后登录时间
            await user.update({ last_login: new Date() });

            // 老用户如果没有邀请码，补生成一个
            if (!user.invite_code) {
                const inviteCode = await generateUniqueInviteCode();
                await user.update({ invite_code: inviteCode });
            }

            logAuth('用户登录', { userId: user.id, openid: user.openid });
        } else {
            // 用户不存在，创建新用户
            const inviteCode = await generateUniqueInviteCode();
            
            let parentUser = null;
            if (distributor_id) {
                parentUser = await findParentUser(distributor_id);

                // 防止自己绑定自己
                if (parentUser && parentUser.openid === openid) {
                    parentUser = null;
                }

                // 更新上级的推荐人数
                if (parentUser) {
                    await parentUser.increment('referee_count');

                    // 检查上级是否应该升级
                    await parentUser.reload();
                    const newRole = checkRoleUpgrade(parentUser);
                    if (newRole) {
                        await parentUser.update({ role_level: newRole });
                    }
                }
            }

            user = await User.create({
                openid,
                nickname: nickName || '微信用户',
                avatar_url: avatarUrl || '',
                role_level: 0, // 默认游客
                parent_id: parentUser ? parentUser.id : null,
                parent_openid: distributor_id || null,
                agent_id: parentUser ? (parentUser.role_level >= 3 ? parentUser.id : parentUser.agent_id) : null,
                invite_code: inviteCode,
                last_login: new Date()
            });

            // 重新加载以包含parent关系
            user = await User.findByPk(user.id, {
                include: [{ model: User, as: 'parent' }]
            });

            logAuth('新用户注册', {
                userId: user.id,
                openid: user.openid,
                parentId: parentUser ? parentUser.id : null,
                hasParent: !!parentUser
            });
        }

        // 签发 JWT Token
        const token = generateUserToken(user);

        res.json({
            success: true,
            token, // 新增：返回 token 给小程序
            openid,
            userInfo: {
                id: user.id,
                openid: user.openid,
                nickname: user.nickname,
                avatar_url: user.avatar_url,
                role: user.role_level,
                role_level: user.role_level,
                stock: user.stock_count,
                balance: user.balance,
                invite_code: user.invite_code
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
