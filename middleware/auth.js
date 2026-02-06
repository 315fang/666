const jwt = require('jsonwebtoken');
const { User } = require('../models');

/**
 * 获取JWT密钥
 */
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET 环境变量未配置');
    }
    return secret;
}

/**
 * 生成用户Token
 * @param {Object} user - 用户对象
 * @returns {string} JWT Token
 */
function generateUserToken(user) {
    const secret = getJwtSecret();
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    return jwt.sign(
        {
            id: user.id,
            openid: user.openid,
            role_level: user.role_level
        },
        secret,
        { expiresIn }
    );
}

/**
 * 身份验证中间件
 * 从请求头 Authorization: Bearer <token> 验证JWT
 */
async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: '未登录，请先登录'
            });
        }

        const token = authHeader.substring(7);
        const secret = getJwtSecret();

        let decoded;
        try {
            decoded = jwt.verify(token, secret);
        } catch (err) {
            return res.status(401).json({
                success: false,
                message: '令牌无效或已过期'
            });
        }

        // 查询用户信息
        const user = await User.findByPk(decoded.id);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: '用户不存在'
            });
        }

        // 将用户信息附加到请求对象
        req.user = user;
        req.openid = user.openid;

        next();
    } catch (error) {
        console.error('身份验证错误:', error.message);
        res.status(500).json({
            success: false,
            message: '身份验证失败'
        });
    }
}

/**
 * 可选身份验证中间件
 * 如果有 Authorization 头则解析用户，没有则继续
 */
async function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const secret = getJwtSecret();

            try {
                const decoded = jwt.verify(token, secret);
                const user = await User.findByPk(decoded.id);
                if (user) {
                    req.user = user;
                    req.openid = user.openid;
                }
            } catch (err) {
                // Token无效时静默继续
            }
        }

        next();
    } catch (error) {
        console.error('可选身份验证错误:', error.message);
        next();
    }
}

module.exports = {
    authenticate,
    optionalAuth,
    generateUserToken
};
