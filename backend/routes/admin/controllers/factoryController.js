/**
 * 工厂发货控制器 (Factory Fulfillment Controller)
 *
 * 业务模型：工厂直接发货模式
 * - 代理商确认订单后，订单状态变为 agent_confirmed
 * - 工厂查看待发货订单列表
 * - 工厂填写物流信息后，订单状态变为 shipped
 * - 工厂不负责佣金计算，只负责发货和物流
 */

const { Order, User, Product, Address, sequelize } = require('../../../models');
const { Op } = require('sequelize');
const { sendNotification } = require('../../../models/notificationUtil');

/**
 * 获取工厂待发货订单列表
 * GET /admin/api/factory/pending-orders
 *
 * 查询条件：
 * - status: agent_confirmed (代理商已确认，等待工厂发货)
 * - fulfillment_type: Platform (工厂直发)
 */
const getPendingOrders = async (req, res) => {
    try {
        const { page = 1, limit = 20, keyword, agent_id, start_date, end_date } = req.query;

        const where = {
            status: 'agent_confirmed',
            fulfillment_type: 'Platform'
        };

        // 搜索订单号或买家昵称
        let buyerWhere = undefined;
        if (keyword) {
            if (/^ORD/.test(keyword)) {
                where.order_no = { [Op.like]: `%${keyword}%` };
            } else {
                buyerWhere = { nickname: { [Op.like]: `%${keyword}%` } };
            }
        }

        // 按代理商筛选
        if (agent_id) {
            where.agent_id = agent_id;
        }

        // 日期范围筛选
        if (start_date && end_date) {
            where.created_at = { [Op.between]: [new Date(start_date), new Date(end_date)] };
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Order.findAndCountAll({
            where,
            include: [
                {
                    model: User,
                    as: 'buyer',
                    attributes: ['id', 'nickname', 'phone'],
                    where: buyerWhere,
                    required: !!buyerWhere
                },
                {
                    model: User,
                    as: 'agent',
                    attributes: ['id', 'nickname', 'phone']
                },
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'images', 'barcode']
                },
                {
                    model: Address,
                    as: 'address'
                }
            ],
            order: [['created_at', 'ASC']],  // 先进先出
            offset,
            limit: parseInt(limit)
        });

        // 统计信息
        const stats = {
            total_pending: count,
            today_confirmed: await Order.count({
                where: {
                    status: 'agent_confirmed',
                    fulfillment_type: 'Platform',
                    created_at: {
                        [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
                    }
                }
            }),
            overdue_24h: await Order.count({
                where: {
                    status: 'agent_confirmed',
                    fulfillment_type: 'Platform',
                    created_at: {
                        [Op.lte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
                    }
                }
            })
        };

        res.json({
            code: 0,
            data: {
                list: rows,
                pagination: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit)
                },
                stats
            }
        });
    } catch (error) {
        console.error('获取工厂待发货订单失败:', error);
        res.status(500).json({
            code: -1,
            message: '获取待发货订单失败: ' + error.message
        });
    }
};

/**
 * 工厂发货（填写物流信息）
 * POST /admin/api/factory/ship/:id
 *
 * Body:
 * - tracking_no: 物流单号
 * - tracking_company: 物流公司
 *
 * 流程：
 * 1. 验证订单状态必须为 agent_confirmed
 * 2. 更新物流信息
 * 3. 更新订单状态为 shipped
 * 4. 通知买家和代理商
 */
const shipOrder = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { tracking_no, tracking_company } = req.body;

        if (!tracking_no || !tracking_company) {
            await t.rollback();
            return res.status(400).json({
                code: -1,
                message: '请填写完整的物流信息'
            });
        }

        // 锁定订单
        const order = await Order.findOne({
            where: { id },
            transaction: t,
            lock: t.LOCK.UPDATE,
            include: [
                { model: User, as: 'buyer', attributes: ['id', 'nickname'] },
                { model: User, as: 'agent', attributes: ['id', 'nickname'] }
            ]
        });

        if (!order) {
            await t.rollback();
            return res.status(404).json({
                code: -1,
                message: '订单不存在'
            });
        }

        // 验证订单状态
        if (order.status !== 'agent_confirmed') {
            await t.rollback();
            return res.status(400).json({
                code: -1,
                message: `订单状态不正确，当前状态: ${order.status}，需要: agent_confirmed`
            });
        }

        // 验证履约类型
        if (order.fulfillment_type !== 'Platform') {
            await t.rollback();
            return res.status(400).json({
                code: -1,
                message: '该订单不是工厂直发订单'
            });
        }

        // 更新订单
        order.status = 'shipped';
        order.tracking_no = tracking_no;
        order.tracking_company = tracking_company;
        order.shipped_at = new Date();

        // 记录物流信息到备注
        const logisticInfo = `物流: ${tracking_company} ${tracking_no}`;
        order.remark = order.remark ? `${order.remark} | ${logisticInfo}` : logisticInfo;

        await order.save({ transaction: t });

        await t.commit();

        // 通知买家（事务外）
        if (order.buyer) {
            await sendNotification(
                order.buyer.id,
                '订单已发货',
                `您的订单 ${order.order_no} 已发货，物流公司: ${tracking_company}，单号: ${tracking_no}`,
                'order',
                order.id
            );
        }

        // 通知代理商（事务外）
        if (order.agent) {
            await sendNotification(
                order.agent.id,
                '工厂已发货',
                `您确认的订单 ${order.order_no} 已由工厂发货`,
                'order',
                order.id
            );
        }

        res.json({
            code: 0,
            message: '发货成功',
            data: {
                order_no: order.order_no,
                tracking_no,
                tracking_company,
                shipped_at: order.shipped_at
            }
        });
    } catch (error) {
        await t.rollback();
        console.error('工厂发货失败:', error);
        res.status(500).json({
            code: -1,
            message: '发货失败: ' + error.message
        });
    }
};

/**
 * 批量发货
 * POST /admin/api/factory/batch-ship
 *
 * Body:
 * - orders: [{ order_id, tracking_no, tracking_company }, ...]
 */
const batchShipOrders = async (req, res) => {
    try {
        const { orders } = req.body;

        if (!orders || !Array.isArray(orders) || orders.length === 0) {
            return res.status(400).json({
                code: -1,
                message: '请提供订单列表'
            });
        }

        const results = {
            success: [],
            failed: []
        };

        // 逐个处理订单（避免部分失败导致全部回滚）
        for (const orderData of orders) {
            const t = await sequelize.transaction();
            try {
                const { order_id, tracking_no, tracking_company } = orderData;

                if (!tracking_no || !tracking_company) {
                    throw new Error('物流信息不完整');
                }

                const order = await Order.findOne({
                    where: { id: order_id },
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });

                if (!order) {
                    throw new Error('订单不存在');
                }

                if (order.status !== 'agent_confirmed') {
                    throw new Error(`订单状态不正确: ${order.status}`);
                }

                order.status = 'shipped';
                order.tracking_no = tracking_no;
                order.tracking_company = tracking_company;
                order.shipped_at = new Date();

                const logisticInfo = `物流: ${tracking_company} ${tracking_no}`;
                order.remark = order.remark ? `${order.remark} | ${logisticInfo}` : logisticInfo;

                await order.save({ transaction: t });
                await t.commit();

                results.success.push({
                    order_id: order.id,
                    order_no: order.order_no,
                    tracking_no
                });

                // 异步通知（不阻塞）
                setImmediate(async () => {
                    await sendNotification(
                        order.buyer_id,
                        '订单已发货',
                        `您的订单 ${order.order_no} 已发货，物流公司: ${tracking_company}，单号: ${tracking_no}`,
                        'order',
                        order.id
                    );

                    if (order.agent_id) {
                        await sendNotification(
                            order.agent_id,
                            '工厂已发货',
                            `您确认的订单 ${order.order_no} 已由工厂发货`,
                            'order',
                            order.id
                        );
                    }
                });
            } catch (error) {
                await t.rollback();
                results.failed.push({
                    order_id: orderData.order_id,
                    error: error.message
                });
            }
        }

        res.json({
            code: 0,
            message: `批量发货完成，成功: ${results.success.length}，失败: ${results.failed.length}`,
            data: results
        });
    } catch (error) {
        console.error('批量发货失败:', error);
        res.status(500).json({
            code: -1,
            message: '批量发货失败: ' + error.message
        });
    }
};

/**
 * 获取已发货订单列表
 * GET /admin/api/factory/shipped-orders
 */
const getShippedOrders = async (req, res) => {
    try {
        const { page = 1, limit = 20, keyword, start_date, end_date } = req.query;

        const where = {
            status: { [Op.in]: ['shipped', 'completed'] },
            fulfillment_type: 'Platform'
        };

        if (keyword) {
            if (/^ORD/.test(keyword)) {
                where.order_no = { [Op.like]: `%${keyword}%` };
            } else {
                where.tracking_no = { [Op.like]: `%${keyword}%` };
            }
        }

        if (start_date && end_date) {
            where.shipped_at = { [Op.between]: [new Date(start_date), new Date(end_date)] };
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Order.findAndCountAll({
            where,
            include: [
                { model: User, as: 'buyer', attributes: ['id', 'nickname'] },
                { model: Product, as: 'product', attributes: ['id', 'name', 'images'] },
                { model: Address, as: 'address' }
            ],
            order: [['shipped_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        res.json({
            code: 0,
            data: {
                list: rows,
                pagination: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit)
                }
            }
        });
    } catch (error) {
        console.error('获取已发货订单失败:', error);
        res.status(500).json({
            code: -1,
            message: '获取已发货订单失败: ' + error.message
        });
    }
};

/**
 * 获取工厂工作台统计数据
 * GET /admin/api/factory/dashboard
 */
const getFactoryDashboard = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // 待发货订单数
        const pendingCount = await Order.count({
            where: {
                status: 'agent_confirmed',
                fulfillment_type: 'Platform'
            }
        });

        // 今日已发货
        const todayShipped = await Order.count({
            where: {
                status: { [Op.in]: ['shipped', 'completed'] },
                fulfillment_type: 'Platform',
                shipped_at: { [Op.between]: [today, tomorrow] }
            }
        });

        // 超时未发货 (>24小时)
        const overdueCount = await Order.count({
            where: {
                status: 'agent_confirmed',
                fulfillment_type: 'Platform',
                created_at: {
                    [Op.lte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
                }
            }
        });

        // 本周发货统计
        const weekStart = new Date(today);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());

        const weekShipped = await Order.count({
            where: {
                status: { [Op.in]: ['shipped', 'completed'] },
                fulfillment_type: 'Platform',
                shipped_at: { [Op.gte]: weekStart }
            }
        });

        // 平均发货时效（小时）
        const recentOrders = await Order.findAll({
            where: {
                status: { [Op.in]: ['shipped', 'completed'] },
                fulfillment_type: 'Platform',
                shipped_at: { [Op.gte]: weekStart }
            },
            attributes: ['created_at', 'shipped_at'],
            raw: true
        });

        let avgShipTime = 0;
        if (recentOrders.length > 0) {
            const totalHours = recentOrders.reduce((sum, order) => {
                const hours = (new Date(order.shipped_at) - new Date(order.created_at)) / (1000 * 60 * 60);
                return sum + hours;
            }, 0);
            avgShipTime = Math.round(totalHours / recentOrders.length);
        }

        res.json({
            code: 0,
            data: {
                pending_count: pendingCount,
                today_shipped: todayShipped,
                overdue_count: overdueCount,
                week_shipped: weekShipped,
                avg_ship_time_hours: avgShipTime
            }
        });
    } catch (error) {
        console.error('获取工厂工作台数据失败:', error);
        res.status(500).json({
            code: -1,
            message: '获取数据失败: ' + error.message
        });
    }
};

module.exports = {
    getPendingOrders,
    shipOrder,
    batchShipOrders,
    getShippedOrders,
    getFactoryDashboard
};
