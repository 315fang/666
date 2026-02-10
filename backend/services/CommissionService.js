/**
 * 佣金计算服务 (增强版)
 * 支持固定金额和百分比两种模式
 * 统一管理所有佣金相关的计算逻辑
 */

const { CommissionLog, User, Order, Product, SKU } = require('../models');
const { sequelize } = require('../models');
const { Op } = require('sequelize');

// 用户角色常量
const USER_ROLES = {
    GUEST: 0,      // 普通用户
    MEMBER: 1,     // 会员
    LEADER: 2,     // 团长
    AGENT: 3       // 代理商
};

// 佣金类型常量
const COMMISSION_TYPES = {
    SELF: 'self',                          // 自购返利
    DIRECT: 'direct',                      // 直推佣金
    INDIRECT: 'indirect',                  // 间接佣金
    GAP: 'gap',                           // 差价佣金
    AGENT_FULFILLMENT: 'agent_fulfillment', // 代理商发货利润
    STOCK_DIFF: 'Stock_Diff'              // 库存差价
};

// 默认佣金配置 (可从数据库或配置文件读取)
const DEFAULT_CONFIG = {
    // 固定金额模式 (单位: 元)
    FIXED_AMOUNTS: {
        MEMBER_DIRECT: 60,      // 会员直推
        LEADER_DIRECT: 90,      // 团长直推
        AGENT_DIRECT: 120,      // 代理商直推
        LEADER_TEAM: 30,        // 团长团队佣金
        AGENT_TEAM: 50          // 代理商团队佣金
    },

    // 百分比模式
    PERCENTAGE_RATES: {
        DIRECT: {
            [USER_ROLES.MEMBER]: 0.05,   // 会员直推 5%
            [USER_ROLES.LEADER]: 0.08,   // 团长直推 8%
            [USER_ROLES.AGENT]: 0.12     // 代理商直推 12%
        },
        INDIRECT: {
            [USER_ROLES.LEADER]: 0.03,   // 团长间接 3%
            [USER_ROLES.AGENT]: 0.05     // 代理商间接 5%
        },
        SELF: {
            [USER_ROLES.MEMBER]: 0.03,   // 会员自购返利 3%
            [USER_ROLES.LEADER]: 0.05,   // 团长自购返利 5%
            [USER_ROLES.AGENT]: 0.08     // 代理商自购返利 8%
        }
    }
};

class CommissionService {
    /**
     * 计算订单佣金分配
     * @param {Object} options - 配置选项
     * @param {Object} options.order - 订单对象
     * @param {Object} options.buyer - 购买者对象
     * @param {Object} options.parent - 上级对象（可选）
     * @param {Object} options.grandparent - 上上级对象（可选）
     * @param {Object} options.agent - 代理商对象（可选，用于发货）
     * @param {String} options.mode - 计算模式: 'fixed' | 'percentage' | 'auto'
     * @param {Object} options.customRates - 自定义佣金配置（可选）
     * @returns {Promise<Object>} 佣金分配结果
     */
    static async calculateOrderCommissions(options) {
        const {
            order,
            buyer,
            parent = null,
            grandparent = null,
            agent = null,
            mode = 'auto',
            customRates = null
        } = options;

        // 确定使用的佣金配置
        const config = customRates || DEFAULT_CONFIG;

        // 自动模式：根据商品配置决定使用固定金额还是百分比
        let calculationMode = mode;
        if (mode === 'auto') {
            // 可以从商品或分类配置中读取，这里默认使用固定金额
            calculationMode = 'fixed';
        }

        // 计算基础价格信息
        const totalAmount = parseFloat(order.total_amount);
        const actualPrice = parseFloat(order.actual_price || order.total_amount);
        const wholesalePrice = parseFloat(order.locked_agent_cost || 0);

        // 利润池 = 实际售价 - 批发价
        const profitPool = actualPrice - wholesalePrice;

        let commissions = [];
        let agentProfit = 0;

        if (calculationMode === 'fixed') {
            // 固定金额模式
            const result = this._calculateFixedCommissions(
                buyer,
                parent,
                grandparent,
                agent,
                profitPool,
                config.FIXED_AMOUNTS
            );
            commissions = result.commissions;
            agentProfit = result.agentProfit;
        } else if (calculationMode === 'percentage') {
            // 百分比模式
            const result = this._calculatePercentageCommissions(
                buyer,
                parent,
                grandparent,
                agent,
                actualPrice,
                profitPool,
                config.PERCENTAGE_RATES
            );
            commissions = result.commissions;
            agentProfit = result.agentProfit;
        }

        // 计算总佣金
        const totalCommission = commissions.reduce((sum, c) => sum + c.amount, 0);

        // 验证：总佣金不应超过利润池
        if (totalCommission > profitPool) {
            console.warn('警告: 总佣金超过利润池', {
                totalCommission,
                profitPool,
                orderId: order.id
            });
        }

        return {
            commissions,
            totalCommission: this._round(totalCommission),
            agentProfit: this._round(agentProfit),
            profitPool: this._round(profitPool),
            calculationMode,
            breakdown: {
                actualPrice: this._round(actualPrice),
                wholesalePrice: this._round(wholesalePrice),
                profitPool: this._round(profitPool),
                totalCommission: this._round(totalCommission),
                agentProfit: this._round(agentProfit)
            }
        };
    }

    /**
     * 固定金额模式计算
     * @private
     */
    static _calculateFixedCommissions(buyer, parent, grandparent, agent, profitPool, rates) {
        const commissions = [];
        let remainingProfit = profitPool;

        // 1. 购买者佣金（根据角色）
        if (buyer.role_level === USER_ROLES.MEMBER) {
            const amount = Math.min(rates.MEMBER_DIRECT, remainingProfit);
            if (amount > 0) {
                commissions.push({
                    user_id: buyer.id,
                    amount,
                    type: COMMISSION_TYPES.DIRECT,
                    level: 0,
                    description: '会员直推佣金'
                });
                remainingProfit -= amount;
            }
        } else if (buyer.role_level === USER_ROLES.LEADER) {
            const amount = Math.min(rates.LEADER_DIRECT, remainingProfit);
            if (amount > 0) {
                commissions.push({
                    user_id: buyer.id,
                    amount,
                    type: COMMISSION_TYPES.DIRECT,
                    level: 0,
                    description: '团长直推佣金'
                });
                remainingProfit -= amount;
            }
        } else if (buyer.role_level === USER_ROLES.AGENT) {
            const amount = Math.min(rates.AGENT_DIRECT, remainingProfit);
            if (amount > 0) {
                commissions.push({
                    user_id: buyer.id,
                    amount,
                    type: COMMISSION_TYPES.DIRECT,
                    level: 0,
                    description: '代理商直推佣金'
                });
                remainingProfit -= amount;
            }
        }

        // 2. 上级佣金（团队佣金）
        if (parent && remainingProfit > 0) {
            if (parent.role_level === USER_ROLES.LEADER) {
                const amount = Math.min(rates.LEADER_TEAM, remainingProfit);
                if (amount > 0) {
                    commissions.push({
                        user_id: parent.id,
                        amount,
                        type: COMMISSION_TYPES.INDIRECT,
                        level: 1,
                        description: '团长团队佣金'
                    });
                    remainingProfit -= amount;
                }
            } else if (parent.role_level === USER_ROLES.AGENT) {
                const amount = Math.min(rates.AGENT_TEAM, remainingProfit);
                if (amount > 0) {
                    commissions.push({
                        user_id: parent.id,
                        amount,
                        type: COMMISSION_TYPES.INDIRECT,
                        level: 1,
                        description: '代理商团队佣金'
                    });
                    remainingProfit -= amount;
                }
            }
        }

        // 3. 上上级佣金（如果是代理商）
        if (grandparent && grandparent.role_level === USER_ROLES.AGENT && remainingProfit > 0) {
            const amount = Math.min(rates.AGENT_TEAM * 0.5, remainingProfit); // 上上级拿一半
            if (amount > 0) {
                commissions.push({
                    user_id: grandparent.id,
                    amount,
                    type: COMMISSION_TYPES.INDIRECT,
                    level: 2,
                    description: '代理商间接佣金'
                });
                remainingProfit -= amount;
            }
        }

        // 4. 剩余利润归代理商（发货方）
        const agentProfit = remainingProfit;

        return {
            commissions,
            agentProfit
        };
    }

    /**
     * 百分比模式计算
     * @private
     */
    static _calculatePercentageCommissions(buyer, parent, grandparent, agent, actualPrice, profitPool, rates) {
        const commissions = [];
        let totalCommission = 0;

        // 1. 购买者自购返利
        const selfRate = rates.SELF[buyer.role_level] || 0;
        if (selfRate > 0) {
            const amount = this._round(actualPrice * selfRate);
            if (amount > 0 && amount <= profitPool) {
                commissions.push({
                    user_id: buyer.id,
                    amount,
                    type: COMMISSION_TYPES.SELF,
                    level: 0,
                    description: '自购返利'
                });
                totalCommission += amount;
            }
        }

        // 2. 上级直推佣金
        if (parent) {
            const directRate = rates.DIRECT[parent.role_level] || 0;
            if (directRate > 0) {
                const amount = this._round(actualPrice * directRate);
                if (amount > 0 && (totalCommission + amount) <= profitPool) {
                    commissions.push({
                        user_id: parent.id,
                        amount,
                        type: COMMISSION_TYPES.DIRECT,
                        level: 1,
                        description: '直推佣金'
                    });
                    totalCommission += amount;
                }
            }
        }

        // 3. 上上级间接佣金
        if (grandparent) {
            const indirectRate = rates.INDIRECT[grandparent.role_level] || 0;
            if (indirectRate > 0) {
                const amount = this._round(actualPrice * indirectRate);
                if (amount > 0 && (totalCommission + amount) <= profitPool) {
                    commissions.push({
                        user_id: grandparent.id,
                        amount,
                        type: COMMISSION_TYPES.INDIRECT,
                        level: 2,
                        description: '间接佣金'
                    });
                    totalCommission += amount;
                }
            }
        }

        // 4. 剩余利润归代理商
        const agentProfit = profitPool - totalCommission;

        return {
            commissions,
            agentProfit
        };
    }

    /**
     * 创建佣金记录
     * @param {Object} options - 配置选项
     * @returns {Promise<Array>} 创建的佣金记录
     */
    static async createCommissionRecords(options) {
        const {
            orderId,
            orderNo,
            commissions,
            refundDeadline = null,
            transaction = null
        } = options;

        const records = [];

        for (const commission of commissions) {
            const record = await CommissionLog.create({
                user_id: commission.user_id,
                order_id: orderId,
                order_no: orderNo,
                amount: commission.amount,
                type: commission.type,
                status: 'frozen', // 初始状态为冻结
                level: commission.level,
                remark: commission.description,
                refund_deadline: refundDeadline
            }, { transaction });

            records.push(record);
        }

        return records;
    }

    /**
     * 计算佣金预览（用于前端显示）
     * @param {Object} options - 配置选项
     * @returns {Promise<Object>} 佣金预览信息
     */
    static async previewCommission(options) {
        const {
            productId,
            skuId = null,
            quantity = 1,
            userId,
            mode = 'auto'
        } = options;

        try {
            // 获取用户信息和上级关系
            const user = await User.findByPk(userId, {
                attributes: ['id', 'role_level', 'parent_id']
            });

            if (!user) {
                throw new Error('用户不存在');
            }

            // 获取上级和上上级
            let parent = null;
            let grandparent = null;

            if (user.parent_id) {
                parent = await User.findByPk(user.parent_id, {
                    attributes: ['id', 'role_level', 'parent_id']
                });

                if (parent && parent.parent_id) {
                    grandparent = await User.findByPk(parent.parent_id, {
                        attributes: ['id', 'role_level']
                    });
                }
            }

            // 获取商品信息
            const product = await Product.findByPk(productId, {
                attributes: ['id', 'name', 'retail_price', 'price_member', 'price_leader', 'price_agent', 'wholesale_price']
            });

            if (!product) {
                throw new Error('商品不存在');
            }

            // 获取SKU信息（如果指定）
            let sku = null;
            if (skuId) {
                sku = await SKU.findByPk(skuId, {
                    attributes: ['id', 'price', 'price_member', 'price_leader', 'price_agent']
                });
            }

            // 计算实际售价
            const actualPrice = this._getActualPrice(product, sku, user.role_level) * quantity;
            const wholesalePrice = parseFloat(product.wholesale_price || 0) * quantity;

            // 模拟订单对象
            const mockOrder = {
                total_amount: actualPrice,
                actual_price: actualPrice,
                locked_agent_cost: wholesalePrice
            };

            // 计算佣金
            const result = await this.calculateOrderCommissions({
                order: mockOrder,
                buyer: user,
                parent,
                grandparent,
                mode
            });

            return {
                success: true,
                data: {
                    product: {
                        id: product.id,
                        name: product.name
                    },
                    pricing: {
                        actualPrice: this._round(actualPrice),
                        wholesalePrice: this._round(wholesalePrice),
                        profitPool: result.profitPool,
                        quantity
                    },
                    commissions: result.commissions.map(c => ({
                        user_id: c.user_id,
                        amount: this._round(c.amount),
                        type: c.type,
                        level: c.level,
                        description: c.description
                    })),
                    totalCommission: result.totalCommission,
                    agentProfit: result.agentProfit,
                    calculationMode: result.calculationMode,
                    userRole: user.role_level,
                    hasParent: !!parent,
                    hasGrandparent: !!grandparent
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
     * 获取实际售价
     * @private
     */
    static _getActualPrice(product, sku, roleLevel) {
        const source = sku || product;

        switch (roleLevel) {
            case USER_ROLES.AGENT:
                return parseFloat(source.price_agent || source.price_leader || source.price_member || source.retail_price || source.price);
            case USER_ROLES.LEADER:
                return parseFloat(source.price_leader || source.price_member || source.retail_price || source.price);
            case USER_ROLES.MEMBER:
                return parseFloat(source.price_member || source.retail_price || source.price);
            default:
                return parseFloat(source.retail_price || source.price);
        }
    }

    /**
     * 四舍五入到2位小数
     * @private
     */
    static _round(amount) {
        return Math.round(amount * 100) / 100;
    }

    /**
     * 获取用户的佣金统计
     * @param {Number} userId - 用户ID
     * @returns {Promise<Object>} 佣金统计信息
     */
    static async getUserCommissionStats(userId) {
        const stats = await CommissionLog.findAll({
            where: { user_id: userId },
            attributes: [
                'status',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                [sequelize.fn('SUM', sequelize.col('amount')), 'total']
            ],
            group: ['status'],
            raw: true
        });

        const result = {
            frozen: { count: 0, total: 0 },
            pending_approval: { count: 0, total: 0 },
            approved: { count: 0, total: 0 },
            settled: { count: 0, total: 0 },
            cancelled: { count: 0, total: 0 },
            total: { count: 0, total: 0 }
        };

        stats.forEach(stat => {
            const count = parseInt(stat.count) || 0;
            const total = parseFloat(stat.total) || 0;

            if (result[stat.status]) {
                result[stat.status] = { count, total: this._round(total) };
            }

            if (stat.status !== 'cancelled') {
                result.total.count += count;
                result.total.total += total;
            }
        });

        result.total.total = this._round(result.total.total);

        return result;
    }

    /**
     * 获取佣金配置
     * @returns {Object} 当前佣金配置
     */
    static getConfig() {
        return {
            USER_ROLES,
            COMMISSION_TYPES,
            DEFAULT_CONFIG
        };
    }
}

module.exports = CommissionService;
