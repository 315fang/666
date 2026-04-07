const { User, PortalAccount, CommissionLog, Order } = require('../models');
const { Op } = require('sequelize');
const MemberTierService = require('../services/MemberTierService');
const { generatePortalToken } = require('../middleware/portalAuth');
const { normalizeClientIp } = require('../utils/clientIp');

async function login(req, res) {
    try {
        const { member_no, password } = req.body;
        if (!member_no || !password) {
            return res.status(400).json({ code: -1, message: '请输入会员编号和密码' });
        }

        const user = await User.findOne({ where: { member_no, status: 1 } });
        if (!user) {
            return res.status(401).json({ code: -1, message: '账号或密码错误' });
        }
        if (!user.member_no) {
            return res.status(400).json({ code: -1, message: '该账号无会员编号，无法登录门户' });
        }

        const commercePolicy = await MemberTierService.getCommercePolicy();
        const minRoleLevel = Number(commercePolicy?.portal_login?.min_role_level ?? 3);
        if (Number(user.role_level || 0) < minRoleLevel) {
            const roleName = await MemberTierService.getRoleName(minRoleLevel);
            return res.status(403).json({
                code: -1,
                message: `当前仅 ${roleName} 及以上等级可登录门户`
            });
        }

        const account = await PortalAccount.findOne({ where: { user_id: user.id } });
        if (!account) {
            return res.status(401).json({
                code: -1,
                message: '尚未开通网页端登录，请先在小程序「申领门户登录密码」'
            });
        }
        if (!account.validatePassword(password)) {
            return res.status(401).json({ code: -1, message: '账号或密码错误' });
        }

        account.last_login_at = new Date();
        account.last_login_ip = normalizeClientIp(req.headers['x-forwarded-for'] || req.ip);
        await account.save();

        const role_name = await MemberTierService.getRoleName(user.role_level);
        const token = generatePortalToken(user, account);
        return res.json({
            code: 0,
            data: {
                token,
                must_change_password: !!account.must_change_password,
                user: {
                    id: user.id,
                    member_no: user.member_no,
                    nickname: user.nickname,
                    phone: user.phone,
                    role_level: user.role_level,
                    role_name,
                    agent_level: user.agent_level,
                    balance: parseFloat(user.balance || 0),
                    invite_code: user.invite_code,
                    order_count: user.order_count || 0,
                    growth_value: parseFloat(user.growth_value || 0),
                    discount_rate: parseFloat(user.discount_rate || 1)
                }
            }
        });
    } catch (error) {
        console.error('门户登录失败:', error);
        return res.status(500).json({ code: -1, message: '登录失败，请稍后重试' });
    }
}

async function getProfile(req, res) {
    try {
        const user = req.portalUser;
        const account = req.portalAccount;
        const role_name = await MemberTierService.getRoleName(user.role_level);
        const growth_progress = await MemberTierService.getGrowthProgress(user.growth_value || 0);

        const [teamCount, monthlyOrders, monthlyCommission] = await Promise.all([
            User.count({ where: { parent_id: user.id } }),
            Order.count({
                where: {
                    buyer_id: user.id,
                    created_at: { [Op.gte]: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
                }
            }),
            CommissionLog.sum('amount', {
                where: {
                    user_id: user.id,
                    created_at: { [Op.gte]: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
                    status: { [Op.in]: ['frozen', 'pending_approval', 'approved', 'settled'] }
                }
            })
        ]);

        return res.json({
            code: 0,
            data: {
                must_change_password: !!account.must_change_password,
                user: {
                    id: user.id,
                    member_no: user.member_no,
                    nickname: user.nickname,
                    phone: user.phone,
                    role_level: user.role_level,
                    role_name,
                    agent_level: user.agent_level,
                    growth_value: parseFloat(user.growth_value || 0),
                    discount_rate: parseFloat(user.discount_rate || 1),
                    growth_progress,
                    balance: parseFloat(user.balance || 0),
                    invite_code: user.invite_code,
                    order_count: user.order_count || 0,
                    stock_count: user.stock_count || 0,
                    debt_amount: parseFloat(user.debt_amount || 0),
                    team_count: teamCount,
                    monthly_orders: monthlyOrders,
                    monthly_commission: parseFloat(monthlyCommission || 0).toFixed(2)
                }
            }
        });
    } catch (error) {
        console.error('获取门户资料失败:', error);
        return res.status(500).json({ code: -1, message: '获取资料失败' });
    }
}

async function changeInitialPassword(req, res) {
    try {
        const account = req.portalAccount;
        const { old_password, new_password } = req.body;
        if (!old_password || !new_password) {
            return res.status(400).json({ code: -1, message: '请输入旧密码和新密码' });
        }
        if (String(new_password).length < 8) {
            return res.status(400).json({ code: -1, message: '新密码至少8位' });
        }
        if (!account.validatePassword(old_password)) {
            return res.status(400).json({ code: -1, message: '旧密码错误' });
        }
        if (old_password === new_password) {
            return res.status(400).json({ code: -1, message: '新旧密码不能相同' });
        }

        account.setPassword(new_password);
        account.must_change_password = 0;
        await account.save();
        return res.json({ code: 0, message: '密码已修改，请重新登录' });
    } catch (error) {
        console.error('修改门户密码失败:', error);
        return res.status(500).json({ code: -1, message: '修改失败' });
    }
}

module.exports = {
    login,
    getProfile,
    changeInitialPassword
};
