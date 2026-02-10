const { Admin } = require('../../../models');
const { generateAdminToken } = require('../../../middleware/adminAuth');

// 管理员登录
const login = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ code: -1, message: '请输入用户名和密码' });
        }

        const admin = await Admin.findOne({ where: { username } });

        if (!admin) {
            return res.status(401).json({ code: -1, message: '用户名或密码错误' });
        }

        if (admin.status !== 1) {
            return res.status(401).json({ code: -1, message: '账号已被禁用' });
        }

        if (!admin.validatePassword(password)) {
            return res.status(401).json({ code: -1, message: '用户名或密码错误' });
        }

        // 更新登录信息
        admin.last_login_at = new Date();
        admin.last_login_ip = req.ip || req.connection.remoteAddress;
        await admin.save();

        const token = generateAdminToken(admin);

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
        console.error('管理员登录失败:', error);
        res.status(500).json({ code: -1, message: '登录失败' });
    }
};

// 获取当前管理员信息
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
                last_login_at: admin.last_login_at
            }
        });
    } catch (error) {
        console.error('获取管理员信息失败:', error);
        res.status(500).json({ code: -1, message: '获取信息失败' });
    }
};

// 修改密码
const changePassword = async (req, res) => {
    try {
        const admin = req.admin;
        const { old_password, new_password } = req.body;

        if (!old_password || !new_password) {
            return res.status(400).json({ code: -1, message: '请输入旧密码和新密码' });
        }

        if (new_password.length < 6) {
            return res.status(400).json({ code: -1, message: '新密码至少6位' });
        }

        // 验证旧密码
        const currentAdmin = await Admin.findByPk(admin.id);
        if (!currentAdmin.validatePassword(old_password)) {
            return res.status(400).json({ code: -1, message: '旧密码错误' });
        }

        // 设置新密码
        currentAdmin.setPassword(new_password);
        await currentAdmin.save();

        res.json({ code: 0, message: '密码修改成功' });
    } catch (error) {
        console.error('修改密码失败:', error);
        res.status(500).json({ code: -1, message: '修改密码失败' });
    }
};

module.exports = {
    login,
    getProfile,
    changePassword
};
