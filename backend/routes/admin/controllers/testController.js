const { User, Product, Order, CommissionLog, sequelize } = require('../../../models');

/**
 * 测试工具：创建模拟用户
 * POST /admin/api/test/create-user
 */
const createTestUser = async (req, res) => {
    try {
        const { nickname, role_level = 0, parent_id } = req.body;

        if (!nickname) {
            return res.status(400).json({ code: -1, message: '请提供用户昵称' });
        }

        // 生成模拟openid
        const mockOpenid = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const user = await User.create({
            openid: mockOpenid,
            nickname,
            avatar_url: `https://via.placeholder.com/100?text=${encodeURIComponent(nickname)}`,
            role_level: role_level || 0,
            parent_id: parent_id || null,
            last_login: new Date()
        });

        // 如果有上级，更新上级推荐人数
        if (parent_id) {
            await User.increment('referee_count', { where: { id: parent_id } });
        }

        res.json({
            code: 0,
            data: user,
            message: `测试用户 ${nickname} 创建成功`
        });
    } catch (error) {
        console.error('创建测试用户失败:', error);
        res.status(500).json({ code: -1, message: '创建失败' });
    }
};

/**
 * 测试工具：模拟下单
 * POST /admin/api/test/create-order
 */
const createTestOrder = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { user_id, product_id, quantity = 1 } = req.body;

        if (!user_id || !product_id) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '缺少必要参数' });
        }

        const user = await User.findByPk(user_id, { transaction: t });
        if (!user) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '用户不存在' });
        }

        const product = await Product.findByPk(product_id, { transaction: t });
        if (!product) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '商品不存在' });
        }

        // 计算价格
        const roleLevel = user.role_level || 0;
        let price = parseFloat(product.retail_price);
        if (roleLevel === 1) price = parseFloat(product.price_member || product.retail_price);
        else if (roleLevel === 2) price = parseFloat(product.price_leader || product.price_member || product.retail_price);
        else if (roleLevel === 3) price = parseFloat(product.price_agent || product.price_leader || product.price_member || product.retail_price);

        const total_amount = price * quantity;

        // 创建订单
        const order = await Order.create({
            order_no: `TEST${Date.now()}${Math.floor(Math.random() * 1000)}`,
            buyer_id: user.id,
            product_id,
            quantity,
            total_amount,
            actual_price: total_amount,
            status: 'paid', // 直接设为已支付，模拟支付完成
            paid_at: new Date()
        }, { transaction: t });

        // --- 立即执行分润逻辑（复制自 orderController.js） ---
        const priceMap = {
            0: parseFloat(product.retail_price || 299),
            1: parseFloat(product.price_member || 239),
            2: parseFloat(product.price_leader || 209),
            3: parseFloat(product.price_agent || 150)
        };

        let currentLevel = user.role_level;
        let lastCost = priceMap[currentLevel] || priceMap[0];
        let pRef = user.parent_id;

        const commissions = [];
        while (pRef) {
            const p = await User.findByPk(pRef, { transaction: t });
            if (!p) break;

            if (p.role_level > currentLevel) {
                const parentCost = priceMap[p.role_level];
                const profit = (lastCost - parentCost) * order.quantity;

                if (profit > 0) {
                    const log = await CommissionLog.create({
                        order_id: order.id,
                        user_id: p.id,
                        amount: profit,
                        type: 'gap',
                        status: 'settled', // 测试环境直接结算
                        available_at: new Date(),
                        remark: `测试订单级差 (${currentLevel}级 -> ${p.role_level}级)`
                    }, { transaction: t });

                    // 直接加到余额
                    await p.increment('balance', { by: profit, transaction: t });

                    commissions.push({
                        user_id: p.id,
                        user_name: p.nickname,
                        amount: profit,
                        type: 'gap'
                    });
                }

                lastCost = parentCost;
                currentLevel = p.role_level;
            }

            pRef = p.parent_id;
            if (currentLevel === 3) break;
        }

        // 普通用户自动升级为会员
        if (user.role_level === 0) {
            user.role_level = 1;
            await user.save({ transaction: t });
        }

        // 更新用户统计
        await user.increment('order_count', { transaction: t });
        await user.increment('total_sales', { by: parseFloat(order.total_amount), transaction: t });

        await t.commit();

        res.json({
            code: 0,
            data: {
                order,
                commissions,
                buyer_upgraded: user.role_level === 1
            },
            message: '测试订单创建成功，分佣已自动结算'
        });
    } catch (error) {
        await t.rollback();
        console.error('创建测试订单失败:', error);
        res.status(500).json({ code: -1, message: '创建失败: ' + error.message });
    }
};

/**
 * 测试工具：查看用户详情
 * GET /admin/api/test/user/:id
 */
const getTestUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findByPk(id, {
            include: [
                { model: User, as: 'parent', attributes: ['id', 'nickname'] },
                { model: User, as: 'children', attributes: ['id', 'nickname'] }
            ]
        });

        if (!user) {
            return res.status(404).json({ code: -1, message: '用户不存在' });
        }

        // 查询佣金记录
        const commissions = await CommissionLog.findAll({
            where: { user_id: id },
            order: [['created_at', 'DESC']],
            limit: 10
        });

        res.json({
            code: 0,
            data: {
                user,
                commissions,
                summary: {
                    balance: parseFloat(user.balance).toFixed(2),
                    total_commission: commissions.reduce((sum, c) => sum + parseFloat(c.amount), 0).toFixed(2),
                    referee_count: user.referee_count,
                    order_count: user.order_count
                }
            }
        });
    } catch (error) {
        console.error('查询用户失败:', error);
        res.status(500).json({ code: -1, message: '查询失败' });
    }
};

/**
 * 测试工具：获取所有测试用户
 * GET /admin/api/test/users
 */
const getTestUsers = async (req, res) => {
    try {
        const users = await User.findAll({
            where: {
                openid: { [require('sequelize').Op.like]: 'mock_%' }
            },
            include: [
                { model: User, as: 'parent', attributes: ['id', 'nickname'] }
            ],
            order: [['created_at', 'DESC']]
        });

        res.json({
            code: 0,
            data: users
        });
    } catch (error) {
        console.error('查询测试用户失败:', error);
        res.status(500).json({ code: -1, message: '查询失败' });
    }
};

/**
 * 测试工具：清空所有测试数据
 * DELETE /admin/api/test/clear
 */
const clearTestData = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        // 查找所有测试用户
        const testUsers = await User.findAll({
            where: {
                openid: { [require('sequelize').Op.like]: 'mock_%' }
            },
            transaction: t
        });

        const testUserIds = testUsers.map(u => u.id);

        if (testUserIds.length === 0) {
            await t.rollback();
            return res.json({ code: 0, message: '没有测试数据需要清理' });
        }

        // 删除关联的佣金记录
        await CommissionLog.destroy({
            where: { user_id: testUserIds },
            transaction: t
        });

        // 删除关联的订单
        await Order.destroy({
            where: { buyer_id: testUserIds },
            transaction: t
        });

        // 删除测试用户
        await User.destroy({
            where: { id: testUserIds },
            transaction: t
        });

        await t.commit();

        res.json({
            code: 0,
            message: `已清空 ${testUserIds.length} 个测试用户及其关联数据`
        });
    } catch (error) {
        await t.rollback();
        console.error('清空测试数据失败:', error);
        res.status(500).json({ code: -1, message: '清空失败' });
    }
};

module.exports = {
    createTestUser,
    createTestOrder,
    getTestUser,
    getTestUsers,
    clearTestData
};
