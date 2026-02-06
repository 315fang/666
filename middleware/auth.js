const { User } = require('../models');

/**
 * 身份验证中间件
 * 从请求头中的 x-openid 获取用户信息
 */
async function authenticate(req, res, next) {
    try {
        const openid = req.headers['x-openid'];

        if (!openid) {
            return res.status(401).json({
                success: false,
                message: '未登录，请先登录'
            });
        }

        // 查询用户信息
        const user = await User.findOne({ where: { openid } });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: '用户不存在'
            });
        }

        // 将用户信息附加到请求对象
        req.user = user;
        req.openid = openid;

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
 * 如果有 x-openid 则解析用户，没有则继续
 */
async function optionalAuth(req, res, next) {
    try {
        const openid = req.headers['x-openid'];

        if (openid) {
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
