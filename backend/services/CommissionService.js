/**
 * 佣金计算服务 (增强版)
 * 支持固定金额和百分比两种模式
 * 统一管理所有佣金相关的计算逻辑
 * 口径与调用链见仓库 docs/业务规则.md
 */

const { CommissionLog, User, Order, Product, SKU, AppConfig } = require('../models');
const { sequelize } = require('../models');
const { Op } = require('sequelize');
const { error: logError, warn: logWarn } = require('../utils/logger');
const cacheService = require('./CacheService');
const MemberTierService = require('./MemberTierService');
const commissionPolicy = require('../config/commissionPolicy');

// 佣金配置缓存 Key（使用 CacheService 替代静态变量，支持多进程一致性）
const COMMISSION_CONFIG_CACHE_KEY = 'commission:config';

// 用户角色常量
const USER_ROLES = {
    GUEST: 0,        // 普通用户
    MEMBER: 1,       // 会员
    LEADER: 2,       // 团长
    AGENT: 3,        // 代理商（通用，agent_level 区分 1/2/3 级）
    AGENT1: 3,       // 一级代理（alias，等于 AGENT）
    AGENT2: 3,       // 二级代理（role_level 相同，通过 agent_level 区分）
    AGENT3: 3        // 三级代理（role_level 相同，通过 agent_level 区分）
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

// 默认佣金配置 — 与商业计划书4.0对齐
// C1=80元/单(20%), C2=120元/单(30%), B1/B2=160元/单(40%)
const DEFAULT_CONFIG = {
    // 固定金额模式 (单位: 元) — 主模式，基于399元标品
    FIXED_AMOUNTS: {
        MEMBER_DIRECT: 80,      // C1 初级代理直推
        LEADER_DIRECT: 120,     // C2 高级代理直推
        AGENT_DIRECT: 160,      // B1 推广合伙人直推
        PARTNER_DIRECT: 160,    // B2 运营合伙人直推
        LEADER_TEAM: 40,        // C2 团队佣金
        AGENT_TEAM: 60          // B1 团队佣金
    },

    // 百分比模式（备用，商品级佣金优先于此）
    PERCENTAGE_RATES: {
        DIRECT: {
            [USER_ROLES.MEMBER]: 0.20,   // C1 直推 20%
            [USER_ROLES.LEADER]: 0.30,   // C2 直推 30%
            [USER_ROLES.AGENT]: 0.40     // B1 直推 40%
        },
        INDIRECT: {
            [USER_ROLES.LEADER]: 0.05,   // C2 间接 5%
            [USER_ROLES.AGENT]: 0.08     // B1 间接 8%
        },
        SELF: {
            [USER_ROLES.MEMBER]: 0.05,   // C1 自购返利 5%
            [USER_ROLES.LEADER]: 0.08,   // C2 自购返利 8%
            [USER_ROLES.AGENT]: 0.10     // B1 自购返利 10%
        }
    }
};

class CommissionService {
    static async _ensurePlatformTopAgentUser(transaction = null) {
        const OPENID = '__platform_top_agent__';
        let user = await User.findOne({ where: { openid: OPENID }, transaction });
        if (user) return user;
        user = await User.create({
            openid: OPENID,
            nickname: '平台顶级代理',
            role_level: 3,
            agent_level: 1,
            status: 1,
            parent_id: null,
            agent_id: null
        }, { transaction });
        return user;
    }
    /**
     * 获取最新佣金配置 (带 CacheService 缓存，支持多进程）
     */
    static async _getConfig() {
        // 先从 CacheService 读（TTL 60s，多进程共享）
        const cached = await cacheService.getCache(COMMISSION_CONFIG_CACHE_KEY);
        if (cached) return cached;

        try {
            const configs = await AppConfig.findAll({
                where: { category: 'COMMISSION_RATES', status: 1 }
            });

            if (configs.length > 0) {
                const dbConfig = { ...DEFAULT_CONFIG };

                configs.forEach(c => {
                    try {
                        const val = JSON.parse(c.config_value);
                        if (c.config_key === 'FIXED_AMOUNTS') {
                            dbConfig.FIXED_AMOUNTS = { ...dbConfig.FIXED_AMOUNTS, ...val };
                        } else if (c.config_key === 'PERCENTAGE_RATES') {
                            dbConfig.PERCENTAGE_RATES = { ...dbConfig.PERCENTAGE_RATES, ...val };
                        }
                    } catch (e) {
                        logError('COMMISSION', '解析佣金配置失败', { error: e.message });
                    }
                });

                await cacheService.setCache(COMMISSION_CONFIG_CACHE_KEY, dbConfig, 60);
                return dbConfig;
            }
        } catch (e) {
            logError('COMMISSION', '加载佣金配置失败', { error: e.message });
        }

        return DEFAULT_CONFIG;
    }

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
     * @param {Object} options.product - 商品对象（可选，用于读取商品级配置）
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
            customRates = null,
            product = null
        } = options;

        // 确定使用的佣金配置
        let config = customRates;
        if (!config) {
            config = await this._getConfig();
        }

        // 优先使用商品级配置
        let productCommission = null;
        if (product) {
            const allowFixed = commissionPolicy.allowProductFixedCommission();
            productCommission = {
                amount1: allowFixed && product.commission_amount_1 ? parseFloat(product.commission_amount_1) : null,
                amount2: allowFixed && product.commission_amount_2 ? parseFloat(product.commission_amount_2) : null,
                amount3: allowFixed && product.commission_amount_3 ? parseFloat(product.commission_amount_3) : null,
                rate1: product.commission_rate_1 ? parseFloat(product.commission_rate_1) : null,
                rate2: product.commission_rate_2 ? parseFloat(product.commission_rate_2) : null,
                rate3: product.commission_rate_3 ? parseFloat(product.commission_rate_3) : null
            };
        }

        // 计算基础价格信息
        const totalAmount = parseFloat(order.total_amount);
        const actualPrice = parseFloat(order.actual_price || order.total_amount);
        const wholesalePrice = parseFloat(order.locked_agent_cost || 0);

        // 利润池 = 实际售价 - 批发价
        const profitPool = actualPrice - wholesalePrice;

        let commissions = [];
        let agentProfit = 0;

        // ----------------------------------------------------------------
        // 核心计算逻辑：商品配置 > 全局配置
        // ----------------------------------------------------------------

        // 1. 直推佣金 (Level 1)
        if (parent) {
            let amount = 0;
            let type = COMMISSION_TYPES.DIRECT;

            // A. 商品固定金额
            if (productCommission && productCommission.amount1 !== null) {
                amount = productCommission.amount1;
            }
            // B. 商品百分比
            else if (productCommission && productCommission.rate1 !== null) {
                amount = this._round(actualPrice * productCommission.rate1);
            }
            // C. 全局配置
            else {
                // 根据上级角色读取全局配置
                // 这里简化处理，直接读取 DEFAULT_CONFIG 中的角色比例
                // 实际应根据 config.PERCENTAGE_RATES.DIRECT[parent.role_level]
                const roleRate = config.PERCENTAGE_RATES.DIRECT[parent.role_level] || 0;
                amount = this._round(actualPrice * roleRate);
            }

            if (amount > 0 && amount <= profitPool) {
                commissions.push({
                    user_id: parent.id,
                    amount,
                    type,
                    level: 1,
                    description: '直推佣金'
                });
            }
        }

        // 2. 间接佣金 (Level 2)
        if (grandparent) {
            let amount = 0;
            let type = COMMISSION_TYPES.INDIRECT;
            const remainingProfit = profitPool - (commissions[0]?.amount || 0);

            // A. 商品固定金额
            if (productCommission && productCommission.amount2 !== null) {
                amount = productCommission.amount2;
            }
            // B. 商品百分比
            else if (productCommission && productCommission.rate2 !== null) {
                amount = this._round(actualPrice * productCommission.rate2);
            }
            // C. 全局配置
            else {
                const roleRate = config.PERCENTAGE_RATES.INDIRECT[grandparent.role_level] || 0;
                amount = this._round(actualPrice * roleRate);
            }

            if (amount > 0 && amount <= remainingProfit) {
                commissions.push({
                    user_id: grandparent.id,
                    amount,
                    type,
                    level: 2,
                    description: '间接佣金'
                });
            }
        }

        // 3. 三级佣金 (Level 3) - 三级代理体系的第三层上级
        const options_greatgrandparent = options.greatgrandparent || null;
        if (options_greatgrandparent) {
            let amount = 0;
            const usedProfit = commissions.reduce((s, c) => s + c.amount, 0);
            const remainingProfit = profitPool - usedProfit;

            if (productCommission && productCommission.amount3 !== null) {
                amount = productCommission.amount3;
            } else if (productCommission && productCommission.rate3 !== null) {
                amount = this._round(actualPrice * productCommission.rate3);
            } else {
                // 默认三级比例 = 二级间接比例的一半
                const baseRate = config.PERCENTAGE_RATES.INDIRECT[options_greatgrandparent.role_level] || 0;
                amount = this._round(actualPrice * baseRate * 0.5);
            }

            if (amount > 0 && amount <= remainingProfit) {
                commissions.push({
                    user_id: options_greatgrandparent.id,
                    amount,
                    type: COMMISSION_TYPES.INDIRECT,
                    level: 3,
                    description: '三级间接佣金'
                });
            }
        }

        // 3. 计算总佣金和代理商利润
        const totalCommission = commissions.reduce((sum, c) => sum + c.amount, 0);
        agentProfit = Math.max(0, profitPool - totalCommission);

        return {
            commissions,
            totalCommission: this._round(totalCommission),
            agentProfit: this._round(agentProfit),
            profitPool: this._round(profitPool),
            calculationMode: productCommission ? 'product_specific' : 'global_config',
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

            // 预览用内存对象（非 orders 表行），仅用于 calculateOrderCommissions
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
    /** 后台 agent_system_commission（与 admin 代理体系「佣金配置」一致） */
    static async _loadAgentSystemCommissionConfig() {
        const defaults = {
            use_price_gap_middle_commission: undefined,
            direct_pct_by_role: { 1: 20, 2: 30, 3: 40, 4: 40 },
            indirect_pct_by_role: { 2: 5, 3: 8 },
            tertiary_pct_factor: 50,
            agent_layer_between_pct: 3
        };
        try {
            const row = await AppConfig.findOne({ where: { config_key: 'agent_system_commission', status: 1 } });
            if (row && row.config_value) {
                const parsed = JSON.parse(row.config_value);
                return {
                    ...defaults,
                    ...parsed,
                    direct_pct_by_role: { ...defaults.direct_pct_by_role, ...(parsed.direct_pct_by_role || {}) },
                    indirect_pct_by_role: { ...defaults.indirect_pct_by_role, ...(parsed.indirect_pct_by_role || {}) }
                };
            }
        } catch (e) {
            logError('COMMISSION', '读取agent_system_commission配置失败', { error: e.message });
        }
        return defaults;
    }

    static _commissionPctFromMap(map, roleLevel) {
        if (map == null) return 0;
        const k = String(roleLevel);
        const raw = map[k] !== undefined ? map[k] : map[roleLevel];
        const n = Number(raw);
        if (!Number.isFinite(n)) return 0;
        return Math.max(0, Math.min(100, n)) / 100;
    }

    /**
     * 中间佣金：订单实付 × 配置比例，依次给 parent / grandparent / great-grandparent，总额不超过可分佣池
     * （不含多级代理链逐跳；若需旧版三级代理层间逻辑请打开 use_price_gap_middle_commission）
     */
    static async _allocateMiddleByPercentOfPaid({
        order, buyer, agentId, buyerPaid, distributablePool, t, notifySource, commCfg
    }) {
        const { sendNotification } = require('../models/notificationUtil');
        const toNum = (v, d = 0) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : d;
        };
        let middleCommissionTotal = 0;
        const allocByPool = (rawAmount) => {
            const amount = Math.max(0, toNum(rawAmount, 0));
            const remain = Math.max(0, distributablePool - middleCommissionTotal);
            return Math.round(Math.min(amount, remain) * 100) / 100;
        };
        let reachedAgentInChain = Number(buyer.role_level || 0) >= 3;

        const pay = async (u, rawAmt, remark) => {
            if (!u || rawAmt <= 0) return;
            if (agentId && agentId === u.id) return;
            const amt = allocByPool(rawAmt);
            if (amt <= 0) return;
            await CommissionLog.create({
                order_id: order.id,
                user_id: u.id,
                amount: amt,
                type: 'gap',
                status: 'frozen',
                available_at: null,
                refund_deadline: null,
                remark
            }, { transaction: t });
            middleCommissionTotal += amt;
            await sendNotification(
                u.id,
                '收益到账提醒',
                `您的下级产生了一笔${notifySource}订单，您获得团队分佣 ¥${amt.toFixed(2)}（需售后期结束+审批后结算）。`,
                'commission',
                order.id
            ).catch(() => {});
        };

        const parent = buyer.parent_id ? await User.findByPk(buyer.parent_id, { transaction: t }) : null;
        if (parent) {
            reachedAgentInChain = reachedAgentInChain || Number(parent.role_level) >= 3;
            const r = this._commissionPctFromMap(commCfg.direct_pct_by_role, parent.role_level);
            await pay(parent, buyerPaid * r, `直推分佣·实付${(r * 100).toFixed(2)}% (${notifySource})`);
        }

        const gp = parent?.parent_id ? await User.findByPk(parent.parent_id, { transaction: t }) : null;
        if (gp) {
            reachedAgentInChain = reachedAgentInChain || Number(gp.role_level) >= 3;
            const r = this._commissionPctFromMap(commCfg.indirect_pct_by_role, gp.role_level);
            await pay(gp, buyerPaid * r, `二级分佣·实付${(r * 100).toFixed(2)}% (${notifySource})`);
        }

        const ggp = gp?.parent_id ? await User.findByPk(gp.parent_id, { transaction: t }) : null;
        if (ggp) {
            reachedAgentInChain = reachedAgentInChain || Number(ggp.role_level) >= 3;
            const base = this._commissionPctFromMap(commCfg.indirect_pct_by_role, ggp.role_level);
            const factor = Math.max(0, Math.min(100, Number(commCfg.tertiary_pct_factor ?? 50))) / 100;
            const r = base * factor;
            await pay(ggp, buyerPaid * r, `三级分佣·实付${(r * 100).toFixed(2)}% (${notifySource})`);
        }

        return { middleCommissionTotal, reachedAgentInChain };
    }

    /**
     * ★★★ 核心统一方法：代理商发货时的级差佣金 + 发货利润计算
     *
     * 替代原先散落在 agentController.agentShip 和 OrderCoreService.shipOrder 的
     * 200+ 行重复逻辑，统一由此方法处理。
     *
     * @param {Object} options
     * @param {Object} options.order          - 订单实例（含 id, agent_id, quantity, actual_price, locked_agent_cost）
     * @param {Object} options.buyer          - 买家实例（含 id, role_level, parent_id）
     * @param {Object} options.product        - 商品实例（含各级价格字段）
     * @param {number} options.agentId        - 发货代理商 ID
     * @param {Object} options.transaction    - Sequelize 事务
     * @param {string} options.notifySource   - 通知来源描述（用于 remark，'代理商发货'/'平台代发'）
     * @returns {{ middleCommissionTotal: number }}
     */
    static async calculateGapAndFulfillmentCommissions({ order, buyer, product, agentId, transaction: t, notifySource = '代理商发货' }) {
        const { sendNotification } = require('../models/notificationUtil');
        const toNum = (v, d = 0) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : d;
        };

        const priceMap = {
            0: toNum(product.retail_price, 0),
            1: toNum(product.price_member || product.retail_price, 0),
            2: toNum(product.price_leader || product.price_member || product.retail_price, 0),
            3: toNum(product.price_agent || product.price_leader || product.price_member || product.retail_price, 0)
        };

        // 可分佣利润池：按实付金额口径，且保护代理商不亏损
        const buyerPaid = toNum(order.actual_price, 0);
        const qty = Math.max(1, toNum(order.quantity, 1));
        const agentCostPrice = order.locked_agent_cost
            ? toNum(order.locked_agent_cost, 0)
            : toNum(product.cost_price || product.price_agent || product.price_leader || product.price_member || product.retail_price, 0);
        const agentCost = agentCostPrice * qty;
        const distributablePool = Math.max(0, buyerPaid - agentCost);

        const commCfg = await this._loadAgentSystemCommissionConfig();
        // 利润池 = 买家实付 - 发货成本（价差建池），各层按百分比从池中分配，剩余归发货方
        // 安全默认：未明确配置时沿用价差模式（!== false），避免上线后静默改变分佣规则
        // 新部署若要切换到百分比模式，需在后台「代理体系→佣金配置」保存一次（会写入 false）
        const usePriceGap = commCfg.use_price_gap_middle_commission !== false;

        let currentLevel = buyer.role_level;
        let lastCost = priceMap[currentLevel] || priceMap[0];
        let pRef = buyer.parent_id;
        let middleCommissionTotal = 0;
        const allocByPool = (rawAmount) => {
            const amount = Math.max(0, toNum(rawAmount, 0));
            const remain = Math.max(0, distributablePool - middleCommissionTotal);
            return Math.round(Math.min(amount, remain) * 100) / 100;
        };
        let reachedAgentInChain = Number(buyer.role_level || 0) >= 3;

        if (!usePriceGap) {
            const pctResult = await this._allocateMiddleByPercentOfPaid({
                order,
                buyer,
                agentId,
                buyerPaid,
                distributablePool,
                t,
                notifySource,
                commCfg
            });
            middleCommissionTotal = pctResult.middleCommissionTotal;
            reachedAgentInChain = pctResult.reachedAgentInChain;
        } else {
        const visitedIds = new Set([buyer.id]); // 防止自购自佣 + 循环引用
        let agentLayerCount = 0; // 已经遍历的代理层数（三级代理体系最多3层）

        const tierRate = Math.max(0, Math.min(100, Number(commCfg.agent_layer_between_pct ?? 3))) / 100;

        while (pRef) {
            // 循环引用或超深保护
            if (visitedIds.has(pRef) || visitedIds.size > 50) {
                logError('COMMISSION', '严重警告: 代理关系循环或深度过深', { buyerId: buyer.id, badNode: pRef });
                sendNotification(
                    0,
                    '严重系统告警：代理关系循环',
                    `系统在计算佣金(订单 ${order.id})时检测到代理关系闭环或深度过深！请立即排查用户 ${buyer.id} 与 ${pRef} 的上下级关系。`,
                    'system_alert',
                    order.id
                ).catch(e => logError('COMMISSION', '发送告警通知失败', { error: e.message }));
                break;
            }
            visitedIds.add(pRef);

            const p = await User.findByPk(pRef, { transaction: t });
            if (!p) break;

            if (p.role_level > currentLevel) {
                // 跨等级（会员→团长→代理）级差
                const parentCost = priceMap[p.role_level];
                const gapProfitRaw = (lastCost - parentCost) * qty;
                const gapProfit = allocByPool(gapProfitRaw);

                if (gapProfit > 0) {
                    const isOrderAgent = (agentId && agentId === p.id);
                    if (!isOrderAgent) {
                        await CommissionLog.create({
                            order_id: order.id,
                            user_id: p.id,
                            amount: gapProfit,
                            type: 'gap',
                            status: 'frozen',
                            available_at: null,
                            refund_deadline: null,
                            remark: `团队级差利润 Lv${currentLevel}→Lv${p.role_level} (${notifySource})`
                        }, { transaction: t });

                        middleCommissionTotal += gapProfit;

                        await sendNotification(
                            p.id,
                            '收益到账提醒',
                            `您的下级产生了一笔${notifySource}订单，您获得级差收益 ¥${gapProfit.toFixed(2)}（需售后期结束+审批后结算）。`,
                            'commission',
                            order.id
                        );
                    }
                }

                lastCost = parentCost;
                currentLevel = p.role_level;
                if (p.role_level >= 3) reachedAgentInChain = true;
            } else if (p.role_level === 3 && p.agent_level && p.agent_level > 1) {
                // 同为代理商（role_level=3），但 agent_level 更高（一级代理在上层）
                // 三级代理体系：三级→二级→一级，各层通过 commission_rate_3/rate_2/rate_1 拿比例
                agentLayerCount++;
                if (agentLayerCount <= 3) {
                    const isOrderAgent = (agentId && agentId === p.id);
                    if (!isOrderAgent) {
                        // 从商品或全局配置取三级代理佣金率
                        const buyerPaidAmount = buyerPaid;
                        let agentTierCommission = 0;

                        // agent_layer_between_pct（0–100，默认 3 即 3%）
                        agentTierCommission = allocByPool(Math.round(buyerPaidAmount * tierRate * 100) / 100);

                        if (agentTierCommission > 0) {
                            await CommissionLog.create({
                                order_id: order.id,
                                user_id: p.id,
                                amount: agentTierCommission,
                                type: 'gap',
                                status: 'frozen',
                                available_at: null,
                                refund_deadline: null,
                                remark: `三级代理层间佣金 (${p.agent_level}级代理, ${notifySource})`
                            }, { transaction: t });

                            middleCommissionTotal += agentTierCommission;

                            await sendNotification(
                                p.id,
                                '三级代理收益到账',
                                `您的下级代理产生了一笔${notifySource}订单，您获得代理层间佣金 ¥${agentTierCommission.toFixed(2)}（需售后期结束+审批后结算）。`,
                                'commission',
                                order.id
                            );
                        }
                    }
                }
            }

            pRef = p.parent_id;
            // 到达最高等级代理（一级代理，agent_level=1 或未设置）则停止
            if (currentLevel >= 3 && (!p.agent_level || p.agent_level <= 1)) break;
        }
        }

        // ---- 1.5 平台顶级代理补位（无上级代理时吃跳级利润）----
        // 场景：用户上级链没有任何代理商，默认最上级是平台，平台获得剩余级差利润
        if (!reachedAgentInChain) {
            try {
                const commercePolicy = await MemberTierService.getCommercePolicy();
                const platformCfg = commercePolicy?.platform_top_agent || {};
                const platformEnabled = platformCfg.enabled !== false;
                let platformUserId = Number(platformCfg.user_id || process.env.PLATFORM_TOP_AGENT_USER_ID || 0);
                const platformCost = parseFloat(order.locked_agent_cost || product.cost_price || priceMap[3] || 0);
                const platformGapProfit = allocByPool(Math.max(0, (lastCost - platformCost) * qty));

                if (platformEnabled && platformGapProfit > 0) {
                    if (platformUserId <= 0) {
                        const platformUser = await this._ensurePlatformTopAgentUser(t);
                        platformUserId = platformUser?.id || 0;
                    }
                    const platformUser = platformUserId > 0 ? await User.findByPk(platformUserId, { transaction: t }) : null;
                    if (platformUser && platformUser.status === 1) {
                        if (platformUserId !== agentId) {
                            await CommissionLog.create({
                                order_id: order.id,
                                user_id: platformUserId,
                                amount: platformGapProfit,
                                type: 'gap',
                                status: 'frozen',
                                available_at: null,
                                refund_deadline: null,
                                remark: `平台顶级代理跳级利润补位 (${notifySource})`
                            }, { transaction: t });
                            middleCommissionTotal += platformGapProfit;
                        }
                    }
                }
            } catch (e) {
                logError('COMMISSION', '平台顶级代理补位失败', { error: e.message });
            }
        }

        // 记录中间佣金总额到订单（调用方负责保存）
        order.middle_commission_total = middleCommissionTotal;

        // ---- 2. 代理商发货利润 ----
        const agentProfit = buyerPaid - agentCost - middleCommissionTotal;

        if (agentProfit > 0) {
            await CommissionLog.create({
                order_id: order.id,
                user_id: agentId,
                amount: agentProfit,
                type: 'agent_fulfillment',
                status: 'frozen',
                available_at: null,
                refund_deadline: null,
                remark: `代理商发货利润 (进货价${agentCostPrice}×${order.quantity}=${agentCost.toFixed(2)}, 中间佣金${middleCommissionTotal.toFixed(2)})`
            }, { transaction: t });

            await sendNotification(
                agentId,
                '发货收益提醒',
                `您的团队产生了一笔${notifySource}订单，发货利润 ¥${agentProfit.toFixed(2)}（需售后期结束+审批后结算）。`,
                'commission',
                order.id
            );
        } else if (agentProfit < 0) {
            logError('COMMISSION', `利润异常: 订单 ${order.order_no || order.id} 代理商(ID:${agentId})发货利润为 ¥${agentProfit.toFixed(2)}`);
            await sendNotification(
                0,
                '⚠️ 发货利润异常告警',
                `订单ID:${order.id} 代理商发货利润为 ¥${agentProfit.toFixed(2)}（<0），实付=${buyerPaid}，成本=${agentCost}，中间佣金=${middleCommissionTotal}。`,
                'system_alert',
                order.id
            );
        }
        // agentProfit === 0 不产生佣金也不告警

        return { middleCommissionTotal };
    }
}

module.exports = CommissionService;
