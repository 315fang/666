/**
 * 价格计算服务
 * 统一管理所有价格相关的计算逻辑
 */

const MemberTierService = require('./MemberTierService');

// 用户角色常量
const USER_ROLES = {
    GUEST: 0,      // 普通用户
    MEMBER: 1,     // 会员
    LEADER: 2,     // 团长
    AGENT: 3,      // 代理商
    PARTNER: 4,    // 运营合伙人
    REGIONAL: 5    // 区域合伙人
};

// 佣金比例配置 — 与商业计划书4.0对齐
const COMMISSION_RATES = {
    DIRECT: {
        [USER_ROLES.MEMBER]: 0.20,   // C1 直推 20%
        [USER_ROLES.LEADER]: 0.30,   // C2 直推 30%
        [USER_ROLES.AGENT]: 0.40     // B1 直推 40%
    },
    INDIRECT: {
        [USER_ROLES.LEADER]: 0.05,   // C2 间接 5%
        [USER_ROLES.AGENT]: 0.08     // B1 间接 8%
    }
};

class PricingService {
    /**
     * 根据用户角色计算商品显示价格
     * @param {Object} product - 商品对象
     * @param {Object|null} sku - SKU对象（可选）
     * @param {number} roleLevel - 用户角色等级
     * @returns {number} 显示价格
     */
    static calculateDisplayPrice(product, sku = null, roleLevel = USER_ROLES.GUEST, purchaseLevel = null) {
        const purchaseLevelRule = this._normalizePurchaseLevelRule(purchaseLevel);
        if (purchaseLevelRule) {
            const basePrice = this._getPriceByTier(product, sku, purchaseLevelRule.priceTier);
            return this._applyLevelDiscount(basePrice, purchaseLevelRule.discount);
        }

        if (sku) {
            return this._getSkuPrice(sku, roleLevel);
        }

        return this._getProductPrice(product, roleLevel);
    }

    /**
     * 在档位价基础上应用会员/全场折（与下单一致）；爆品豁免不参与折上折
     * @param {number} basePrice - calculateDisplayPrice 结果
     * @param {number} multiplier - getCommerceDiscountMultiplier
     * @param {boolean} discountExempt - 商品 discount_exempt
     */
    static applyCommerceDiscount(basePrice, multiplier, discountExempt) {
        const base = Number(basePrice);
        const mult = Number(multiplier);
        if (!Number.isFinite(base) || base < 0) return 0;
        if (discountExempt) return Number(base.toFixed(2));
        if (!Number.isFinite(mult) || mult <= 0) return Number(base.toFixed(2));
        return Number((base * mult).toFixed(2));
    }

    /**
     * 用户看到的应付单价（与创建订单普品路径一致，不含砍价/拼团/活动专享价）
     */
    static async calculatePayableUnitPrice(product, sku, roleLevel, purchaseLevel) {
        const base = this.calculateDisplayPrice(product, sku, roleLevel, purchaseLevel);
        const mult = await MemberTierService.getCommerceDiscountMultiplier(roleLevel);
        return this.applyCommerceDiscount(base, mult, !!product?.discount_exempt);
    }

    static _normalizePurchaseLevelRule(purchaseLevel) {
        if (!purchaseLevel) return null;
        const allowedTiers = new Set(['retail', 'member', 'leader', 'agent']);

        if (typeof purchaseLevel === 'string') {
            const tier = purchaseLevel.trim().toLowerCase();
            if (!allowedTiers.has(tier)) return null;
            return { priceTier: tier, discount: 1 };
        }

        if (typeof purchaseLevel !== 'object') return null;
        if (purchaseLevel.enabled === false) return null;

        const tier = String(purchaseLevel.price_tier || purchaseLevel.priceTier || '').trim().toLowerCase();
        if (!allowedTiers.has(tier)) return null;

        const discountRaw = Number(purchaseLevel.discount ?? 1);
        const discount = Number.isFinite(discountRaw)
            ? Math.min(1, Math.max(0.01, Number(discountRaw.toFixed(4))))
            : 1;

        return { priceTier: tier, discount };
    }

    static _applyLevelDiscount(basePrice, discount = 1) {
        const normalizedPrice = Number(basePrice || 0);
        const normalizedDiscount = Number(discount || 1);
        if (!Number.isFinite(normalizedPrice) || !Number.isFinite(normalizedDiscount)) {
            return 0;
        }
        return Number((normalizedPrice * normalizedDiscount).toFixed(2));
    }

    static _pickFirstPrice(...candidates) {
        for (const item of candidates) {
            if (item === null || item === undefined || item === '') continue;
            const value = Number(item);
            if (Number.isFinite(value)) {
                return value;
            }
        }
        return 0;
    }

    static _getPriceByTier(product, sku, tier) {
        if (sku) {
            return this._getSkuPriceByTier(sku, tier);
        }
        return this._getProductPriceByTier(product, tier);
    }

    static _getSkuPriceByTier(sku, tier) {
        switch (tier) {
            case 'agent':
                return this._pickFirstPrice(
                    sku.price_agent,
                    sku.wholesale_price,
                    sku.price_leader,
                    sku.member_price,
                    sku.price_member,
                    sku.retail_price,
                    sku.price
                );
            case 'leader':
                return this._pickFirstPrice(
                    sku.wholesale_price,
                    sku.price_leader,
                    sku.member_price,
                    sku.price_member,
                    sku.retail_price,
                    sku.price
                );
            case 'member':
                return this._pickFirstPrice(
                    sku.member_price,
                    sku.price_member,
                    sku.retail_price,
                    sku.price
                );
            case 'retail':
            default:
                return this._pickFirstPrice(sku.retail_price, sku.price);
        }
    }

    static _getProductPriceByTier(product, tier) {
        switch (tier) {
            case 'agent':
                return this._pickFirstPrice(
                    product.price_agent,
                    product.price_leader,
                    product.price_member,
                    product.member_price,
                    product.retail_price
                );
            case 'leader':
                return this._pickFirstPrice(
                    product.price_leader,
                    product.price_member,
                    product.member_price,
                    product.retail_price
                );
            case 'member':
                return this._pickFirstPrice(product.price_member, product.member_price, product.retail_price);
            case 'retail':
            default:
                return this._pickFirstPrice(product.retail_price);
        }
    }

    /**
     * 获取SKU价格
     * @private
     */
    static _getSkuPrice(sku, roleLevel) {
        if (roleLevel >= USER_ROLES.AGENT) {
            return this._pickFirstPrice(
                sku.price_agent,
                sku.wholesale_price,
                sku.price_leader,
                sku.member_price,
                sku.price_member,
                sku.retail_price,
                sku.price
            );
        }
        switch (roleLevel) {
            case USER_ROLES.LEADER:
                return this._pickFirstPrice(
                    sku.wholesale_price,
                    sku.price_leader,
                    sku.member_price,
                    sku.price_member,
                    sku.retail_price,
                    sku.price
                );
            case USER_ROLES.MEMBER:
                return this._pickFirstPrice(
                    sku.member_price,
                    sku.price_member,
                    sku.retail_price,
                    sku.price
                );
            default:
                return this._pickFirstPrice(sku.retail_price, sku.price);
        }
    }

    /**
     * 获取商品价格
     * @private
     */
    static _getProductPrice(product, roleLevel) {
        if (roleLevel >= USER_ROLES.AGENT) {
            return this._pickFirstPrice(
                product.price_agent,
                product.price_leader,
                product.price_member,
                product.member_price,
                product.retail_price
            );
        }
        switch (roleLevel) {
            case USER_ROLES.LEADER:
                return this._pickFirstPrice(
                    product.price_leader,
                    product.price_member,
                    product.member_price,
                    product.retail_price
                );
            case USER_ROLES.MEMBER:
                return this._pickFirstPrice(
                    product.price_member,
                    product.member_price,
                    product.retail_price
                );
            default:
                return this._pickFirstPrice(product.retail_price);
        }
    }

    /**
     * 计算订单项的佣金分配
     * @param {Object} orderItem - 订单项对象
     * @param {Object} buyer - 购买者对象
     * @param {Object|null} parent - 上级对象（可选）
     * @param {Object|null} grandparent - 上上级对象（可选）
     * @returns {Object} 佣金分配结果
     */
    static calculateCommissions(orderItem, buyer, parent = null, grandparent = null) {
        const commissions = [];
        const totalPrice = parseFloat(orderItem.price) * orderItem.quantity;

        // 购买者自己的佣金（自购返利）
        const selfCommission = this._calculateSelfCommission(buyer, totalPrice);
        if (selfCommission > 0) {
            commissions.push({
                user_id: buyer.id,
                amount: selfCommission,
                type: 'self',
                level: 0,
                description: '自购返利'
            });
        }

        // 上级佣金（直推）
        if (parent) {
            const parentCommission = this._calculateDirectCommission(parent, totalPrice);
            if (parentCommission > 0) {
                commissions.push({
                    user_id: parent.id,
                    amount: parentCommission,
                    type: 'direct',
                    level: 1,
                    description: '直推佣金'
                });
            }
        }

        // 上上级佣金（间接）
        if (grandparent && (grandparent.role_level === USER_ROLES.LEADER || grandparent.role_level === USER_ROLES.AGENT)) {
            const grandparentCommission = this._calculateIndirectCommission(grandparent, totalPrice);
            if (grandparentCommission > 0) {
                commissions.push({
                    user_id: grandparent.id,
                    amount: grandparentCommission,
                    type: 'indirect',
                    level: 2,
                    description: '间接佣金'
                });
            }
        }

        return {
            commissions,
            totalCommission: commissions.reduce((sum, c) => sum + c.amount, 0)
        };
    }

    /**
     * 计算自购返利
     * @private
     */
    static _calculateSelfCommission(user, totalPrice) {
        const rate = COMMISSION_RATES.DIRECT[user.role_level] || 0;
        return this._roundCommission(totalPrice * rate);
    }

    /**
     * 计算直推佣金
     * @private
     */
    static _calculateDirectCommission(parent, totalPrice) {
        const rate = COMMISSION_RATES.DIRECT[parent.role_level] || 0;
        return this._roundCommission(totalPrice * rate);
    }

    /**
     * 计算间接佣金
     * @private
     */
    static _calculateIndirectCommission(grandparent, totalPrice) {
        const rate = COMMISSION_RATES.INDIRECT[grandparent.role_level] || 0;
        return this._roundCommission(totalPrice * rate);
    }

    /**
     * 四舍五入佣金金额到2位小数
     * @private
     */
    static _roundCommission(amount) {
        return Math.round(amount * 100) / 100;
    }

    /**
     * 计算订单总佣金（用于验证）
     * 注意：订单主流程发货分润以 CommissionService.calculateGapAndFulfillmentCommissions 为准；
     * 本方法按行价 × 数量比例估算，未使用订单 actual_price，勿与结算单混用。
     * @param {Array} orderItems - 订单项列表
     * @param {Object} buyer - 购买者对象
     * @param {Object|null} parent - 上级对象
     * @param {Object|null} grandparent - 上上级对象
     * @returns {number} 总佣金金额
     */
    static calculateOrderTotalCommission(orderItems, buyer, parent = null, grandparent = null) {
        let totalCommission = 0;

        for (const item of orderItems) {
            const { totalCommission: itemCommission } = this.calculateCommissions(
                item,
                buyer,
                parent,
                grandparent
            );
            totalCommission += itemCommission;
        }

        return this._roundCommission(totalCommission);
    }

    /**
     * 退款时计算需要追回的佣金
     * @param {Object} orderItem - 订单项对象
     * @param {Array} commissionRecords - 该订单项的佣金记录
     * @returns {Array} 需要追回的佣金列表
     */
    static calculateRefundClawback(orderItem, commissionRecords) {
        return commissionRecords.map(record => ({
            user_id: record.user_id,
            amount: -Math.abs(record.amount), // 负数表示追回
            original_commission_id: record.id,
            type: 'clawback',
            description: `退款追回 - ${record.description}`
        }));
    }

    /**
     * 获取佣金配置（用于管理后台查看）
     * @returns {Object} 佣金配置
     */
    static getCommissionRates() {
        return {
            USER_ROLES,
            COMMISSION_RATES
        };
    }

    /**
     * 验证价格是否合法
     * @param {number} price - 价格
     * @returns {boolean} 是否合法
     */
    static isValidPrice(price) {
        return typeof price === 'number' && price >= 0 && isFinite(price);
    }

    /**
     * 格式化价格显示
     * @param {number} price - 价格
     * @param {number} decimals - 小数位数
     * @returns {string} 格式化后的价格字符串
     */
    static formatPrice(price, decimals = 2) {
        if (!this.isValidPrice(price)) {
            return '0.00';
        }
        return price.toFixed(decimals);
    }
}

module.exports = PricingService;
