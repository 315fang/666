/**
 * 订单服务
 * 统一管理订单相关的业务逻辑
 */

const { Order, OrderItem, User, Product, SKU, CommissionLog } = require('../models');
const { sequelize } = require('../models');
const { Op } = require('sequelize');
const CommissionService = require('./CommissionService');
const OrderNumberService = require('./OrderNumberService');

class OrderService {
    /**
     * 创建订单
     * @param {Object} options - 订单配置
     * @returns {Promise<Object>} 创建的订单
     */
    static async createOrder(options) {
        const {
            userId,
            items, // [{ product_id, sku_id, quantity }]
            addressId,
            remark = '',
            distributorId = null
        } = options;

        const transaction = await sequelize.transaction();

        try {
            // 1. 获取用户信息
            const user = await User.findByPk(userId, {
                lock: transaction.LOCK.UPDATE,
                transaction
            });

            if (!user) {
                throw new Error('用户不存在');
            }

            // 2. 生成订单号
            const orderNo = OrderNumberService.generateOrderNumber();

            // 3. 计算订单金额和验证库存
            let totalAmount = 0;
            const orderItems = [];

            for (const item of items) {
                const product = await Product.findByPk(item.product_id, {
                    lock: transaction.LOCK.UPDATE,
                    transaction
                });

                if (!product || product.status !== 1) {
                    throw new Error(`商品不存在或已下架: ${item.product_id}`);
                }

                let sku = null;
                let price = 0;
                let stock = product.stock;

                if (item.sku_id) {
                    sku = await SKU.findByPk(item.sku_id, {
                        lock: transaction.LOCK.UPDATE,
                        transaction
                    });

                    if (!sku || sku.status !== 1) {
                        throw new Error(`SKU不存在或已下架: ${item.sku_id}`);
                    }

                    stock = sku.stock;
                    price = this._getSkuPrice(sku, user.role_level);
                } else {
                    price = this._getProductPrice(product, user.role_level);
                }

                // 验证库存
                if (stock < item.quantity) {
                    throw new Error(`库存不足: ${product.name}`);
                }

                const itemTotal = price * item.quantity;
                totalAmount += itemTotal;

                orderItems.push({
                    product_id: item.product_id,
                    sku_id: item.sku_id,
                    product_name: product.name,
                    sku_attrs: sku ? sku.attrs : null,
                    quantity: item.quantity,
                    price,
                    total: itemTotal,
                    wholesale_price: parseFloat(product.wholesale_price || 0)
                });

                // 扣减库存
                if (sku) {
                    await sku.decrement('stock', {
                        by: item.quantity,
                        transaction
                    });
                } else {
                    await product.decrement('stock', {
                        by: item.quantity,
                        transaction
                    });
                }
            }

            // 4. 创建订单
            const order = await Order.create({
                order_no: orderNo,
                buyer_id: userId,
                distributor_id: distributorId || user.parent_id,
                distributor_role: user.role_level,
                total_amount: totalAmount,
                actual_price: totalAmount,
                status: 'pending',
                address_id: addressId,
                remark,
                locked_agent_cost: orderItems.reduce((sum, item) =>
                    sum + (item.wholesale_price * item.quantity), 0
                )
            }, { transaction });

            // 5. 创建订单项
            for (const item of orderItems) {
                await OrderItem.create({
                    order_id: order.id,
                    ...item
                }, { transaction });
            }

            await transaction.commit();

            return {
                success: true,
                data: order
            };

        } catch (error) {
            await transaction.rollback();
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 支付订单
     * @param {Number} orderId - 订单ID
     * @param {String} paymentMethod - 支付方式
     * @returns {Promise<Object>} 支付结果
     */
    static async payOrder(orderId, paymentMethod = 'wechat') {
        const transaction = await sequelize.transaction();

        try {
            const order = await Order.findByPk(orderId, {
                lock: transaction.LOCK.UPDATE,
                transaction
            });

            if (!order) {
                throw new Error('订单不存在');
            }

            if (order.status !== 'pending') {
                throw new Error('订单状态不正确');
            }

            // 更新订单状态
            await order.update({
                status: 'paid',
                payment_method: paymentMethod,
                paid_at: new Date()
            }, { transaction });

            // 升级用户角色（普通用户 -> 会员）
            const user = await User.findByPk(order.buyer_id, {
                lock: transaction.LOCK.UPDATE,
                transaction
            });

            if (user && user.role_level === 0) {
                await user.update({
                    role_level: 1
                }, { transaction });
            }

            // 更新销售额
            await user.increment('total_sales', {
                by: parseFloat(order.total_amount),
                transaction
            });

            await transaction.commit();

            return {
                success: true,
                data: order
            };

        } catch (error) {
            await transaction.rollback();
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 发货并生成佣金
     * @param {Number} orderId - 订单ID
     * @param {Object} shippingInfo - 物流信息
     * @returns {Promise<Object>} 发货结果
     */
    static async shipOrder(orderId, shippingInfo) {
        const transaction = await sequelize.transaction();

        try {
            const order = await Order.findByPk(orderId, {
                include: [
                    { model: User, as: 'buyer' },
                    { model: OrderItem, as: 'items' }
                ],
                lock: transaction.LOCK.UPDATE,
                transaction
            });

            if (!order) {
                throw new Error('订单不存在');
            }

            if (order.status !== 'paid') {
                throw new Error('订单状态不正确');
            }

            // 更新订单状态
            await order.update({
                status: 'shipped',
                tracking_no: shippingInfo.tracking_no,
                shipping_company: shippingInfo.shipping_company,
                shipped_at: new Date()
            }, { transaction });

            // 获取分销关系
            const buyer = order.buyer;
            let parent = null;
            let grandparent = null;

            if (buyer.parent_id) {
                parent = await User.findByPk(buyer.parent_id, {
                    attributes: ['id', 'role_level', 'parent_id'],
                    transaction
                });

                if (parent && parent.parent_id) {
                    grandparent = await User.findByPk(parent.parent_id, {
                        attributes: ['id', 'role_level'],
                        transaction
                    });
                }
            }

            // 计算佣金
            const commissionResult = await CommissionService.calculateOrderCommissions({
                order,
                buyer,
                parent,
                grandparent,
                mode: 'auto' // 可以从订单或商品配置中读取
            });

            // 设置退款截止日期（15天后）
            const refundDeadline = new Date();
            refundDeadline.setDate(refundDeadline.getDate() + 15);

            // 创建佣金记录
            const commissionRecords = await CommissionService.createCommissionRecords({
                orderId: order.id,
                orderNo: order.order_no,
                commissions: commissionResult.commissions,
                refundDeadline,
                transaction
            });

            // 更新订单佣金总额
            await order.update({
                middle_commission_total: commissionResult.totalCommission,
                settlement_at: refundDeadline
            }, { transaction });

            await transaction.commit();

            return {
                success: true,
                data: {
                    order,
                    commissions: commissionRecords,
                    commissionBreakdown: commissionResult.breakdown
                }
            };

        } catch (error) {
            await transaction.rollback();
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 确认收货
     * @param {Number} orderId - 订单ID
     * @returns {Promise<Object>} 确认结果
     */
    static async confirmOrder(orderId) {
        const transaction = await sequelize.transaction();

        try {
            const order = await Order.findByPk(orderId, {
                lock: transaction.LOCK.UPDATE,
                transaction
            });

            if (!order) {
                throw new Error('订单不存在');
            }

            if (order.status !== 'shipped') {
                throw new Error('订单状态不正确');
            }

            // 更新订单状态
            await order.update({
                status: 'completed',
                confirmed_at: new Date()
            }, { transaction });

            // 更新买家订单数
            await User.increment('order_count', {
                where: { id: order.buyer_id },
                transaction
            });

            await transaction.commit();

            return {
                success: true,
                data: order
            };

        } catch (error) {
            await transaction.rollback();
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 获取订单详情（包含佣金预览）
     * @param {Number} orderId - 订单ID
     * @param {Number} userId - 用户ID
     * @returns {Promise<Object>} 订单详情
     */
    static async getOrderDetail(orderId, userId) {
        try {
            const order = await Order.findByPk(orderId, {
                include: [
                    { model: OrderItem, as: 'items' },
                    { model: User, as: 'buyer', attributes: ['id', 'nickname', 'role_level'] }
                ]
            });

            if (!order) {
                throw new Error('订单不存在');
            }

            // 获取佣金记录（如果是参与分佣的用户）
            const commissions = await CommissionLog.findAll({
                where: {
                    order_id: orderId,
                    user_id: userId
                }
            });

            return {
                success: true,
                data: {
                    order,
                    commissions,
                    myCommission: commissions.reduce((sum, c) => sum + parseFloat(c.amount), 0)
                }
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 获取SKU价格
     * @private
     */
    static _getSkuPrice(sku, roleLevel) {
        switch (roleLevel) {
            case 3: return parseFloat(sku.price_agent || sku.price_leader || sku.price_member || sku.price);
            case 2: return parseFloat(sku.price_leader || sku.price_member || sku.price);
            case 1: return parseFloat(sku.price_member || sku.price);
            default: return parseFloat(sku.price);
        }
    }

    /**
     * 获取商品价格
     * @private
     */
    static _getProductPrice(product, roleLevel) {
        switch (roleLevel) {
            case 3: return parseFloat(product.price_agent || product.price_leader || product.price_member || product.retail_price);
            case 2: return parseFloat(product.price_leader || product.price_member || product.retail_price);
            case 1: return parseFloat(product.price_member || product.retail_price);
            default: return parseFloat(product.retail_price);
        }
    }
}

module.exports = OrderService;
