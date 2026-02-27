const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { code2Session } = require('../utils/wechat');
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
 * 用户登录/注册
 */
async function login(req, res, next) {
    try {
        const { code, nickName, avatarUrl } = req.body;

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

        let isNewUser = false;

        if (user) {
            // 用户已存在，更新最后登录时间
            await user.update({ last_login: new Date() });

            logAuth('用户登录', { userId: user.id, openid: user.openid });
        } else {
            isNewUser = true;

            // 用户不存在，创建新用户（不再自动绑定团队，团队绑定通过问卷提交完成）
            user = await User.create({
                openid,
                nickname: nickName || '微信用户',
                avatar_url: avatarUrl || '',
                role_level: 0,
                parent_id: null,
                parent_openid: null,
                agent_id: null,
                last_login: new Date()
            });

            // 重新加载以包含parent关系
            user = await User.findByPk(user.id, {
                include: [{ model: User, as: 'parent' }]
            });

            logAuth('新用户注册', {
                userId: user.id,
                openid: user.openid
            });
        }

        // 签发 JWT Token
        const token = generateUserToken(user);

        res.json({
            success: true,
            token,
            openid,
            is_new_user: isNewUser,  // ★ 前端用于触发 welcome 品牌动画
            userInfo: {
                id: user.id,
                openid: user.openid,
                nickname: user.nickname,
                avatar_url: user.avatar_url,
                role: user.role_level,
                role_level: user.role_level,
                stock: user.stock_count,
                balance: user.balance
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
