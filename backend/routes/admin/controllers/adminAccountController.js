/**
 * 管理员账号管理控制器
 * 
 * 提供管理员账号的增删改查功能
 */
const { Admin, sequelize } = require('../../../models');
const { Op } = require('sequelize');
const { ADMIN_ROLE_PRESETS, PERMISSION_CATALOG } = require('../../../config/adminPermissionCatalog');

/**
 * 获取管理员列表
 */
const getAdmins = async (req, res) => {
    try {
        const { page = 1, limit = 20, keyword, role } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const where = {};
        if (keyword) {
            where[Op.or] = [
                { username: { [Op.like]: `%${keyword}%` } },
                { name: { [Op.like]: `%${keyword}%` } }
            ];
        }
        if (role) where.role = role;

        const { count, rows } = await Admin.findAndCountAll({
            where,
            attributes: ['id', 'username', 'name', 'role', 'permissions', 'phone', 'email', 'status', 'last_login_at', 'last_login_ip', 'created_at'],
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        res.json({
            code: 0,
            data: {
                list: rows,
                pagination: { total: count, page: parseInt(page), limit: parseInt(limit) }
            }
        });
    } catch (error) {
        console.error('获取管理员列表失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * 创建管理员账号
 */
const createAdmin = async (req, res) => {
    try {
        const { username, password, name, role, phone, email, permissions } = req.body;
        const currentAdmin = req.admin;

        // 只有超级管理员可以创建管理员
        if (currentAdmin.role !== 'super_admin') {
            return res.status(403).json({ code: -1, message: '权限不足：仅超级管理员可创建账号' });
        }

        if (!username || !password) {
            return res.status(400).json({ code: -1, message: '用户名和密码是必填项' });
        }

        if (password.length < 6) {
            return res.status(400).json({ code: -1, message: '密码长度至少6位' });
        }

        // 检查用户名是否已存在
        const exists = await Admin.findOne({ where: { username } });
        if (exists) {
            return res.status(400).json({ code: -1, message: '用户名已存在' });
        }

        // 创建管理员
        const admin = Admin.build({
            username,
            name: name || username,
            role: role || 'operator',
            phone,
            email,
            permissions: permissions || [],
            status: 1
        });

        admin.setPassword(password);
        await admin.save();

        res.json({
            code: 0,
            message: '管理员创建成功',
            data: { id: admin.id, username: admin.username, role: admin.role }
        });
    } catch (error) {
        console.error('创建管理员失败:', error);
        res.status(500).json({ code: -1, message: '创建失败' });
    }
};

/**
 * 更新管理员信息
 */
const updateAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, role, phone, email, permissions, status } = req.body;
        const currentAdmin = req.admin;

        // 只有超级管理员可以修改其他管理员
        if (currentAdmin.role !== 'super_admin' && parseInt(currentAdmin.id) !== parseInt(id)) {
            return res.status(403).json({ code: -1, message: '权限不足' });
        }

        const admin = await Admin.findByPk(id);
        if (!admin) {
            return res.status(404).json({ code: -1, message: '管理员不存在' });
        }

        // 不能修改超级管理员的角色（除非自己就是超级管理员）
        if (admin.role === 'super_admin' && currentAdmin.id !== admin.id && role && role !== 'super_admin') {
            return res.status(403).json({ code: -1, message: '不能修改超级管理员的角色' });
        }

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (role !== undefined && currentAdmin.role === 'super_admin') updateData.role = role;
        if (phone !== undefined) updateData.phone = phone;
        if (email !== undefined) updateData.email = email;
        if (permissions !== undefined) updateData.permissions = permissions;
        if (status !== undefined) updateData.status = status;

        await admin.update(updateData);

        res.json({ code: 0, message: '更新成功' });
    } catch (error) {
        console.error('更新管理员失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

/**
 * 重置管理员密码（仅超级管理员）
 */
const resetAdminPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const new_password = req.body.new_password || req.body.password;
        const currentAdmin = req.admin;

        // 只有超级管理员可以重置密码
        if (currentAdmin.role !== 'super_admin') {
            return res.status(403).json({ code: -1, message: '权限不足：仅超级管理员可重置密码' });
        }

        if (!new_password || new_password.length < 6) {
            return res.status(400).json({ code: -1, message: '新密码长度至少6位' });
        }

        const admin = await Admin.findByPk(id);
        if (!admin) {
            return res.status(404).json({ code: -1, message: '管理员不存在' });
        }

        admin.setPassword(new_password);
        await admin.save();

        res.json({ code: 0, message: '密码重置成功' });
    } catch (error) {
        console.error('重置密码失败:', error);
        res.status(500).json({ code: -1, message: '重置失败' });
    }
};

/**
 * 删除管理员（仅超级管理员）
 */
const deleteAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const currentAdmin = req.admin;

        // 只有超级管理员可以删除
        if (currentAdmin.role !== 'super_admin') {
            return res.status(403).json({ code: -1, message: '权限不足：仅超级管理员可删除账号' });
        }

        // 不能删除自己
        if (parseInt(currentAdmin.id) === parseInt(id)) {
            return res.status(400).json({ code: -1, message: '不能删除自己的账号' });
        }

        const admin = await Admin.findByPk(id);
        if (!admin) {
            return res.status(404).json({ code: -1, message: '管理员不存在' });
        }

        // 不能删除超级管理员
        if (admin.role === 'super_admin') {
            return res.status(400).json({ code: -1, message: '不能删除超级管理员账号' });
        }

        await admin.destroy();

        res.json({ code: 0, message: '删除成功' });
    } catch (error) {
        console.error('删除管理员失败:', error);
        res.status(500).json({ code: -1, message: '删除失败' });
    }
};

/**
 * 获取角色权限配置
 */
const getRolePermissions = async (req, res) => {
    try {
        const rolePermissions = {
            super_admin: {
                name: '超级管理员',
                description: '拥有系统所有权限',
                permissions: ['*']
            }
        };
        for (const [key, cfg] of Object.entries(ADMIN_ROLE_PRESETS)) {
            rolePermissions[key] = {
                name: cfg.name,
                description: cfg.description,
                permissions: cfg.permissions
            };
        }

        res.json({
            code: 0,
            data: {
                roles: rolePermissions,
                permissions: PERMISSION_CATALOG
            }
        });
    } catch (error) {
        console.error('获取权限配置失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

module.exports = {
    getAdmins,
    createAdmin,
    updateAdmin,
    resetAdminPassword,
    deleteAdmin,
    getRolePermissions
};
