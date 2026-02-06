const jwt = require('jsonwebtoken');
const { Admin } = require('../models');

/**
 * 获取管理员JWT密钥
 */
function getAdminJwtSecret() {
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) {
        throw new Error('ADMIN_JWT_SECRET 环境变量未配置');
    }
    return secret;
}

// 管理员认证中间件
const adminAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ code: -1, message: '未提供认证令牌' });
        }

        const token = authHeader.substring(7);
        const secret = getAdminJwtSecret();

        let decoded;
        try {
            decoded = jwt.verify(token, secret);
        } catch (err) {
            return res.status(401).json({ code: -1, message: '令牌无效或已过期' });
        }

        const admin = await Admin.findByPk(decoded.id);

        if (!admin || admin.status !== 1) {
            return res.status(401).json({ code: -1, message: '管理员账号不存在或已禁用' });
        }

        req.admin = admin;
        next();
    } catch (error) {
        console.error('管理员认证错误:', error.message);
        res.status(500).json({ code: -1, message: '认证失败' });
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

// 生成管理员Token
const generateAdminToken = (admin) => {
    const secret = getAdminJwtSecret();
    return jwt.sign(
        {
            id: admin.id,
            username: admin.username,
            role: admin.role
        },
        secret,
        { expiresIn: '8h' }
    );
};

module.exports = {
    adminAuth,
    checkPermission,
    generateAdminToken
};
