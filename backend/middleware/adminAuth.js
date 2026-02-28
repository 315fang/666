const jwt = require('jsonwebtoken');
const { Admin } = require('../models');
const constants = require('../config/constants');
const tokenBlacklist = require('../utils/tokenBlacklist');
const logger = require('../utils/logger');

// 管理员认证中间件
const adminAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ code: -1, message: '未提供认证令牌' });
        }

        const token = authHeader.substring(7);

        let decoded;
        try {
            decoded = jwt.verify(token, constants.SECURITY.ADMIN_JWT_SECRET);
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ code: 401, message: 'Token 已过期，请重新登录' });
            }
            return res.status(401).json({ code: 401, message: '令牌无效，请重新登录' });
        }

        // ★ 黑名单检查：注销后 Token 即刻失效
        if (decoded.jti && tokenBlacklist.isBlocked(decoded.jti)) {
            return res.status(401).json({ code: 401, message: 'Token 已失效，请重新登录' });
        }

        const admin = await Admin.findByPk(decoded.id);

        if (!admin || admin.status !== 1) {
            return res.status(401).json({ code: -1, message: '管理员账号不存在或已禁用' });
        }

        req.admin = admin;
        req.user = { id: admin.id, role: admin.role }; // 兼容日志中的 userId
        req._tokenDecoded = decoded; // 保存 decoded 供注销使用
        next();
    } catch (error) {
        logger.error('ADMIN_AUTH', '管理员认证错误', { message: error.message });
        res.status(500).json({ code: -1, message: '认证服务异常，请稍后重试' });
    }
};

// 权限检查中间件
const checkPermission = (...requiredPermissions) => {
    return (req, res, next) => {
        const admin = req.admin;

        // 超级管理员拥有所有权限
        if (admin.role === 'super_admin') {
            return next();
        }

        // 检查角色级别权限
        const rolePermissions = {
            'admin': ['products', 'orders', 'users', 'distribution', 'content', 'materials'],
            'operator': ['products', 'orders', 'content', 'materials'],
            'finance': ['orders', 'withdrawals', 'settlements'],
            'customer_service': ['orders', 'refunds', 'users']
        };

        const adminPermissions = [
            ...(rolePermissions[admin.role] || []),
            ...(admin.permissions || [])
        ];

        const hasPermission = requiredPermissions.some(perm =>
            adminPermissions.includes(perm)
        );

        if (!hasPermission) {
            return res.status(403).json({ code: -1, message: '无操作权限' });
        }

        next();
    };
};

// 生成管理员 Token
const generateAdminToken = (admin) => {
    // jti = JWT ID，用于黑名单机制
    const jti = `${admin.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return jwt.sign(
        {
            jti,
            id: admin.id,
            username: admin.username,
            role: admin.role
        },
        constants.SECURITY.ADMIN_JWT_SECRET,
        { expiresIn: constants.SECURITY.ADMIN_JWT_EXPIRES_IN }
    );
};

module.exports = {
    adminAuth,
    checkPermission,
    generateAdminToken
};
