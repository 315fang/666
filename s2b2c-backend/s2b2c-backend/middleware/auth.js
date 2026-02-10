const jwt = require('jsonwebtoken');
const { User } = require('../models');
const constants = require('../config/constants');

/**
 * 身份验证中间件
 * 优先验证 JWT Token（Authorization: Bearer <token>）
 * 兼容旧的 x-openid 方式（仅开发环境，生产环境自动禁用）
 */
async function authenticate(req, res, next) {
    try {
        let userId = null;
        let openid = null;

        // 方式1：JWT Token 验证（推荐）
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            try {
                const decoded = jwt.verify(token, constants.SECURITY.JWT_SECRET);
                userId = decoded.id;
                openid = decoded.openid;
            } catch (err) {
                return res.status(401).json({
                    success: false,
                    message: '登录已过期，请重新登录'
                });
            }
        }

        // 方式2：兼容 x-openid（仅开发环境，生产环境自动禁用）
        if (!userId && constants.DEBUG.ALLOW_OPENID_AUTH) {
            openid = req.headers['x-openid'];
        }

        if (!userId && !openid) {
            return res.status(401).json({
                success: false,
                message: '未登录，请先登录'
            });
        }

        // 查询用户信息
        let user;
        if (userId) {
            user = await User.findByPk(userId);
        } else {
            user = await User.findOne({ where: { openid } });
        }

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
        console.error('身份验证错误:', error);
        res.status(500).json({
            success: false,
            message: '身份验证失败'
        });
    }
}

/**
 * 可选身份验证中间件
 * 如果有 Token/openid 则解析用户，没有则继续
 */
async function optionalAuth(req, res, next) {
    try {
        let userId = null;
        let openid = null;

        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            try {
                const decoded = jwt.verify(token, constants.SECURITY.JWT_SECRET);
                userId = decoded.id;
                openid = decoded.openid;
            } catch (err) {
                // Token 无效，忽略
            }
        }

        if (!userId && constants.DEBUG.ALLOW_OPENID_AUTH) {
            openid = req.headers['x-openid'];
        }

        if (userId) {
            const user = await User.findByPk(userId);
            if (user) {
                req.user = user;
                req.openid = user.openid;
            }
        } else if (openid) {
            const user = await User.findOne({ where: { openid } });
            if (user) {
                req.user = user;
                req.openid = openid;
            }
        }

        next();
    } catch (error) {
        console.error('可选身份验证错误:', error);
        next();
    }
}

module.exports = {
    authenticate,
    optionalAuth
};
