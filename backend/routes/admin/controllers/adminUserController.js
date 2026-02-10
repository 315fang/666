const { User, Order, CommissionLog, Dealer } = require('../../../models');
const { Op } = require('sequelize');

// 获取用户列表（含邀请码、库存信息）
const getUsers = async (req, res) => {
    try {
        const { role_level, keyword, page = 1, limit = 20 } = req.query;
        const where = {};

        if (role_level !== undefined) where.role_level = parseInt(role_level);
        if (keyword) {
            where[Op.or] = [
                { nickname: { [Op.like]: `%${keyword}%` } },
                { openid: { [Op.like]: `%${keyword}%` } },
                { invite_code: { [Op.like]: `%${keyword}%` } }
            ];
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await User.findAndCountAll({
            where,
            attributes: ['id', 'openid', 'nickname', 'avatar_url', 'role_level', 'balance', 'order_count', 'total_sales', 'stock_count', 'invite_code', 'parent_id', 'agent_id', 'created_at', 'joined_team_at'],
            include: [
                { model: User, as: 'parent', attributes: ['id', 'nickname'], required: false }
            ],
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
        console.error('获取用户列表失败:', error);
        res.status(500).json({ code: -1, message: '获取用户列表失败: ' + error.message });
    }
};

// 获取用户详情
const getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findByPk(id, {
            include: [
                { model: User, as: 'parent', attributes: ['id', 'nickname'] },
                { model: Dealer, as: 'dealer' }
            ]
        });

        if (!user) {
            return res.status(404).json({ code: -1, message: '用户不存在' });
        }

        // 统计信息
        const orderCount = await Order.count({ where: { buyer_id: id } });
        const teamCount = await User.count({ where: { parent_id: id } });
        const totalCommission = await CommissionLog.sum('amount', { where: { user_id: id } }) || 0;

        res.json({
            code: 0,
            data: {
                ...user.toJSON(),
                stats: { orderCount, teamCount, totalCommission }
            }
        });
    } catch (error) {
        console.error('获取用户详情失败:', error);
        res.status(500).json({ code: -1, message: '获取用户详情失败' });
    }
};

// 更新用户角色
const updateUserRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { role_level } = req.body;

        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ code: -1, message: '用户不存在' });
        }

        user.role_level = role_level;
        await user.save();

        res.json({ code: 0, message: '角色更新成功' });
    } catch (error) {
        console.error('更新用户角色失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

// 获取用户团队
const getUserTeam = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await User.findAndCountAll({
            where: { parent_id: id },
            attributes: ['id', 'openid', 'nickname', 'avatar_url', 'role_level', 'balance', 'order_count', 'total_sales', 'created_at', 'joined_team_at'],
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
        console.error('获取用户团队失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * 管理代理商云库存（充值/扣减）
 * POST body: { stock_change: 100 } 正数充值，负数扣减
 */
const updateUserStock = async (req, res) => {
    try {
        const { id } = req.params;
        const { stock_change, reason } = req.body;

        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ code: -1, message: '用户不存在' });
        }

        if (user.role_level < 3) {
            return res.status(400).json({ code: -1, message: '只有代理商（等级>=3）才能管理云库存' });
        }

        const change = parseInt(stock_change);
        if (isNaN(change) || change === 0) {
            return res.status(400).json({ code: -1, message: '库存变化量不能为0' });
        }

        const newStock = (user.stock_count || 0) + change;
        if (newStock < 0) {
            return res.status(400).json({ code: -1, message: '库存不足，无法扣减' });
        }

        await user.update({ stock_count: newStock });

        res.json({
            code: 0,
            data: {
                user_id: user.id,
                nickname: user.nickname,
                old_stock: user.stock_count - change,
                new_stock: newStock,
                change
            },
            message: `库存${change > 0 ? '充值' : '扣减'}成功`
        });
    } catch (error) {
        console.error('更新库存失败:', error);
        res.status(500).json({ code: -1, message: '更新库存失败' });
    }
};

const updateUserInviteCode = async (req, res) => {
    try {
        const { id } = req.params;
        const { invite_code } = req.body;

        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ code: -1, message: '用户不存在' });
        }

        if (invite_code) {
            // 手动设定邀请码，检查唯一性
            if (!/^\d{6}$/.test(invite_code)) {
                return res.status(400).json({ code: -1, message: '邀请码必须为6位数字' });
            }
            const exists = await User.findOne({ where: { invite_code, id: { [Op.ne]: id } } });
            if (exists) {
                return res.status(400).json({ code: -1, message: '该邀请码已被占用' });
            }
            await user.update({ invite_code });
        } else {
            // 自动生成
            let code;
            let found = true;
            let attempts = 0;
            while (found && attempts < 100) {
                code = String(Math.floor(100000 + Math.random() * 900000));
                const dup = await User.findOne({ where: { invite_code: code, id: { [Op.ne]: id } } });
                found = !!dup;
                attempts++;
            }
            await user.update({ invite_code: code });
        }

        await user.reload();
        res.json({
            code: 0,
            data: { user_id: user.id, invite_code: user.invite_code },
            message: '邀请码更新成功'
        });
    } catch (error) {
        console.error('更新邀请码失败:', error);
        res.status(500).json({ code: -1, message: '更新邀请码失败' });
    }
};

// ==================== ★ 以下为新增高级管理功能 ★ ====================

const { sequelize } = require('../../../models');
const { sendNotification } = require('../../../models/notificationUtil');

/**
 * ★ 调整用户余额（客诉补偿/错误修正）
 * PUT /admin/api/users/:id/balance
 * body: { amount: 100, type: 'add'|'subtract', reason: '说明' }
 */
const adjustUserBalance = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { amount, type, reason } = req.body;
        const adminId = req.admin?.id || 0;
        const adminName = req.admin?.username || 'unknown';

        if (!amount || !type || !reason) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '金额、类型和原因都是必填项' });
        }

        const adjustAmount = parseFloat(amount);
        if (isNaN(adjustAmount) || adjustAmount <= 0) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '金额必须为正数' });
        }

        const user = await User.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!user) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '用户不存在' });
        }

        const oldBalance = parseFloat(user.balance) || 0;
        let newBalance;

        if (type === 'add') {
            newBalance = oldBalance + adjustAmount;
        } else if (type === 'subtract') {
            if (oldBalance < adjustAmount) {
                await t.rollback();
                return res.status(400).json({ code: -1, message: `余额不足，当前 ¥${oldBalance.toFixed(2)}` });
            }
            newBalance = oldBalance - adjustAmount;
        } else {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '类型必须为 add 或 subtract' });
        }

        await user.update({ balance: newBalance }, { transaction: t });

        // 记录佣金日志（管理员操作类型）
        await CommissionLog.create({
            order_id: null,
            user_id: id,
            amount: type === 'add' ? adjustAmount : -adjustAmount,
            type: 'admin_adjustment',
            status: 'settled',
            available_at: new Date(),
            remark: `[管理员${adminName}] ${reason}`
        }, { transaction: t });

        await t.commit();

        // 通知用户
        await sendNotification(
            id,
            '余额变动通知',
            `您的账户余额${type === 'add' ? '增加' : '减少'} ¥${adjustAmount.toFixed(2)}，当前余额 ¥${newBalance.toFixed(2)}`,
            'wallet',
            null
        );

        res.json({
            code: 0,
            data: { oldBalance, newBalance, change: type === 'add' ? adjustAmount : -adjustAmount },
            message: `余额${type === 'add' ? '充值' : '扣减'}成功`
        });
    } catch (error) {
        await t.rollback();
        console.error('调整余额失败:', error);
        res.status(500).json({ code: -1, message: '调整失败' });
    }
};

/**
 * ★ 修改用户上下级关系
 * PUT /admin/api/users/:id/parent
 * body: { new_parent_id: 123, reason: '说明' }
 */
const changeUserParent = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { new_parent_id, reason } = req.body;
        const adminName = req.admin?.username || 'unknown';

        const user = await User.findByPk(id, { transaction: t });
        if (!user) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '用户不存在' });
        }

        const oldParentId = user.parent_id;

        // 解绑：new_parent_id 为 null 或 0
        if (!new_parent_id || new_parent_id === 0) {
            await user.update({
                parent_id: null,
                parent_openid: null,
                // agent_id 保留不变，避免影响订单归属
            }, { transaction: t });

            await t.commit();
            return res.json({
                code: 0,
                message: `已解除上级绑定关系 (原上级ID: ${oldParentId || '无'})`,
                data: { user_id: id, old_parent_id: oldParentId, new_parent_id: null }
            });
        }

        // 重新绑定
        const newParent = await User.findByPk(new_parent_id, { transaction: t });
        if (!newParent) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '新上级用户不存在' });
        }

        // 防止绑定自己
        if (parseInt(new_parent_id) === parseInt(id)) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '不能绑定自己为上级' });
        }

        // 防止循环绑定（向上检查新上级的上级链）
        let checkId = newParent.parent_id;
        let depth = 0;
        while (checkId && depth < 50) {
            if (parseInt(checkId) === parseInt(id)) {
                await t.rollback();
                return res.status(400).json({ code: -1, message: '不能绑定：会形成循环关系' });
            }
            const ancestor = await User.findByPk(checkId, { attributes: ['id', 'parent_id'], transaction: t });
            if (!ancestor) break;
            checkId = ancestor.parent_id;
            depth++;
        }

        // 更新绑定
        await user.update({
            parent_id: newParent.id,
            parent_openid: newParent.openid,
            agent_id: newParent.role_level >= 3 ? newParent.id : newParent.agent_id
        }, { transaction: t });

        // 旧上级推人数 -1
        if (oldParentId) {
            await User.decrement('referee_count', { by: 1, where: { id: oldParentId }, transaction: t });
        }
        // 新上级推人数 +1
        await User.increment('referee_count', { by: 1, where: { id: newParent.id }, transaction: t });

        await t.commit();

        res.json({
            code: 0,
            message: `上级关系已修改 [管理员${adminName}]`,
            data: {
                user_id: id,
                old_parent_id: oldParentId,
                new_parent_id: newParent.id,
                new_parent_nickname: newParent.nickname
            }
        });
    } catch (error) {
        await t.rollback();
        console.error('修改上级失败:', error);
        res.status(500).json({ code: -1, message: '修改失败' });
    }
};

/**
 * ★ 禁用/启用用户
 * PUT /admin/api/users/:id/status
 * body: { status: 0|1, reason: '说明' }
 */
const updateUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, reason } = req.body;
        const adminName = req.admin?.username || 'unknown';

        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ code: -1, message: '用户不存在' });
        }

        // 添加 status 字段检查（如果用户模型有的话）
        const newStatus = parseInt(status);
        if (![0, 1].includes(newStatus)) {
            return res.status(400).json({ code: -1, message: '状态值必须为 0（禁用）或 1（启用）' });
        }

        await user.update({ status: newStatus });

        // 通知用户
        if (newStatus === 0) {
            await sendNotification(
                id,
                '账号通知',
                `您的账号已被限制使用，如有疑问请联系客服。原因：${reason || '未说明'}`,
                'system',
                null
            );
        }

        res.json({
            code: 0,
            message: newStatus === 1 ? '用户已启用' : '用户已禁用',
            data: { user_id: id, status: newStatus, operator: adminName }
        });
    } catch (error) {
        console.error('更新用户状态失败:', error);
        res.status(500).json({ code: -1, message: '操作失败' });
    }
};

/**
 * ★ 更新用户备注/标签
 * PUT /admin/api/users/:id/remark
 * body: { remark: '重要客户', tags: ['VIP', '高活跃'] }
 */
const updateUserRemark = async (req, res) => {
    try {
        const { id } = req.params;
        const { remark, tags } = req.body;

        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ code: -1, message: '用户不存在' });
        }

        const updateData = {};
        if (remark !== undefined) updateData.remark = remark;
        if (tags !== undefined) updateData.tags = JSON.stringify(tags);

        await user.update(updateData);

        res.json({ code: 0, message: '备注更新成功' });
    } catch (error) {
        console.error('更新备注失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

/**
 * ★ 批量更新用户角色
 * POST /admin/api/users/batch-role
 * body: { user_ids: [1,2,3], role_level: 2 }
 */
const batchUpdateRole = async (req, res) => {
    try {
        const { user_ids, role_level } = req.body;

        if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
            return res.status(400).json({ code: -1, message: '请选择要操作的用户' });
        }

        if (role_level === undefined || ![0, 1, 2, 3].includes(parseInt(role_level))) {
            return res.status(400).json({ code: -1, message: '无效的角色等级' });
        }

        const [updated] = await User.update(
            { role_level: parseInt(role_level) },
            { where: { id: { [Op.in]: user_ids } } }
        );

        res.json({
            code: 0,
            message: `成功更新 ${updated} 个用户的角色`,
            data: { updated_count: updated }
        });
    } catch (error) {
        console.error('批量更新角色失败:', error);
        res.status(500).json({ code: -1, message: '批量更新失败' });
    }
};

/**
 * ★ 获取用户变更历史（从佣金日志读取 admin_adjustment 类型）
 * GET /admin/api/users/:id/history
 */
const getUserHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // 获取余额变动历史
        const { count, rows } = await CommissionLog.findAndCountAll({
            where: {
                user_id: id,
                type: { [Op.in]: ['admin_adjustment', 'agent_fulfillment', 'gap', 'refund_deduction'] }
            },
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
        console.error('获取用户历史失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

module.exports = {
    getUsers,
    getUserById,
    updateUserRole,
    getUserTeam,
    updateUserStock,
    updateUserInviteCode,
    // ★ 新增高级管理功能
    adjustUserBalance,
    changeUserParent,
    updateUserStatus,
    updateUserRemark,
    batchUpdateRole,
    getUserHistory
};