const { Admin } = require('../../../models');
const { generateAdminToken } = require('../../../middleware/adminAuth');
const tokenBlacklist = require('../../../utils/tokenBlacklist');
const { validatePassword } = require('../../../utils/passwordPolicy');
const logger = require('../../../utils/logger');

// ============================================================
// 管理员登录
// ============================================================
const login = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ code: -1, message: '请输入用户名和密码' });
        }

        const admin = await Admin.findOne({ where: { username } });

        if (!admin) {
            // ★ 不区分"用户不存在"和"密码错误"，防止枚举攻击
            return res.status(401).json({ code: -1, message: '用户名或密码错误' });
        }

        if (admin.status !== 1) {
            return res.status(401).json({ code: -1, message: '账号已被禁用，请联系超级管理员' });
        }

        if (!admin.validatePassword(password)) {
            logger.logAuth('admin_login_failed', { username, ip: req.ip });
            return res.status(401).json({ code: -1, message: '用户名或密码错误' });
        }

        // 更新登录信息
        admin.last_login_at = new Date();
        admin.last_login_ip = req.ip || req.headers['x-forwarded-for'];
        await admin.save();

        const token = generateAdminToken(admin);

        logger.logAuth('admin_login_success', { adminId: admin.id, username, ip: req.ip });

        res.json({
            code: 0,
            data: {
                token,
                admin: {
                    id: admin.id,
                    username: admin.username,
                    name: admin.name,
                    role: admin.role,
                    permissions: admin.permissions
                }
            }
        });
    } catch (error) {
        logger.error('ADMIN_AUTH', '管理员登录失败', { message: error.message });
        res.status(500).json({ code: -1, message: '登录失败，请稍后重试' });
    }
};

// ============================================================
// 管理员注销（将当前 Token 加入黑名单）
// ============================================================
const logout = async (req, res) => {
    try {
        const decoded = req._tokenDecoded;
        if (decoded?.jti) {
            tokenBlacklist.add(decoded.jti, decoded.exp);
        }
        logger.logAuth('admin_logout', { adminId: req.admin?.id });
        res.json({ code: 0, message: '已安全退出' });
    } catch (error) {
        logger.error('ADMIN_AUTH', '注销失败', { message: error.message });
        res.status(500).json({ code: -1, message: '注销失败' });
    }
};

// ============================================================
// 获取当前管理员信息
// ============================================================
const getProfile = async (req, res) => {
    try {
        const admin = req.admin;
        res.json({
            code: 0,
            data: {
                id: admin.id,
                username: admin.username,
                name: admin.name,
                role: admin.role,
                permissions: admin.permissions,
                phone: admin.phone,
                email: admin.email,
                last_login_at: admin.last_login_at,
                last_login_ip: admin.last_login_ip
            }
        });
    } catch (error) {
        logger.error('ADMIN_AUTH', '获取管理员信息失败', { message: error.message });
        res.status(500).json({ code: -1, message: '获取信息失败' });
    }
};

// ============================================================
// 修改密码（强密码策略）
// ============================================================
const changePassword = async (req, res) => {
    try {
        const admin = req.admin;
        const { old_password, new_password } = req.body;

        if (!old_password || !new_password) {
            return res.status(400).json({ code: -1, message: '请输入旧密码和新密码' });
        }

        // ★ 检查新密码强度
        const policyResult = validatePassword(new_password);
        if (!policyResult.valid) {
            return res.status(400).json({
                code: -1,
                message: '新密码不符合安全策略',
                errors: policyResult.errors,
                strength: policyResult.strength
            });
        }

        if (new_password === old_password) {
            return res.status(400).json({ code: -1, message: '新密码不能与旧密码相同' });
        }

        // 验证旧密码
        const currentAdmin = await Admin.findByPk(admin.id);
        if (!currentAdmin.validatePassword(old_password)) {
            return res.status(400).json({ code: -1, message: '旧密码错误' });
        }

        // 设置新密码
        currentAdmin.setPassword(new_password);
        await currentAdmin.save();

        // ★ 修改密码后，将当前 Token 加入黑名单，强制重新登录
        const decoded = req._tokenDecoded;
        if (decoded?.jti) {
            tokenBlacklist.add(decoded.jti, decoded.exp);
        }

        logger.logAuth('admin_password_changed', { adminId: admin.id });
        res.json({ code: 0, message: '密码修改成功，请使用新密码重新登录' });
    } catch (error) {
        logger.error('ADMIN_AUTH', '修改密码失败', { message: error.message });
        res.status(500).json({ code: -1, message: '修改密码失败' });
    }
};

module.exports = {
    login,
    logout,
    getProfile,
    changePassword
};
