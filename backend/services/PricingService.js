/**
 * 价格计算服务
 * 统一管理所有价格相关的计算逻辑
 */

// 用户角色常量
const USER_ROLES = {
    GUEST: 0,      // 普通用户
    MEMBER: 1,     // 会员
    LEADER: 2,     // 团长
    AGENT: 3       // 代理商
};

// 佣金比例配置（可从数据库或配置文件读取）
const COMMISSION_RATES = {
    // 直推佣金比例
    DIRECT: {
        [USER_ROLES.MEMBER]: 0.05,   // 会员直推 5%
        [USER_ROLES.LEADER]: 0.08,   // 团长直推 8%
        [USER_ROLES.AGENT]: 0.12     // 代理商直推 12%
    },
    // 间接佣金比例
    INDIRECT: {
        [USER_ROLES.LEADER]: 0.03,   // 团长间接 3%
        [USER_ROLES.AGENT]: 0.05     // 代理商间接 5%
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
    static calculateDisplayPrice(product, sku = null, roleLevel = USER_ROLES.GUEST) {
        // 如果有 SKU，优先使用 SKU 价格
        if (sku) {
            return this._getSkuPrice(sku, roleLevel);
        }

        // 否则使用商品基础价格
        return this._getProductPrice(product, roleLevel);
    }

    /**
     * 获取SKU价格
     * @private
     */
    static _getSkuPrice(sku, roleLevel) {
        switch (roleLevel) {
            case USER_ROLES.AGENT:
                return parseFloat(sku.price_agent || sku.price_leader || sku.price_member || sku.price);
            case USER_ROLES.LEADER:
                return parseFloat(sku.price_leader || sku.price_member || sku.price);
            case USER_ROLES.MEMBER:
                return parseFloat(sku.price_member || sku.price);
            default:
                return parseFloat(sku.price); // retail_price
        }
    }

    /**
     * 获取商品价格
     * @private
     */
    static _getProductPrice(product, roleLevel) {
        switch (roleLevel) {
            case USER_ROLES.AGENT:
                return parseFloat(
                    product.price_agent ||
                    product.price_leader ||
                    product.price_member ||
                    product.retail_price
                );
            case USER_ROLES.LEADER:
                return parseFloat(
                    product.price_leader ||
                    product.price_member ||
                    product.retail_price
                );
            case USER_ROLES.MEMBER:
                return parseFloat(product.price_member || product.retail_price);
            default:
                return parseFloat(product.retail_price);
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
