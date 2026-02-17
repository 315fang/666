const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * StockTransaction - 库存变动审计表 (Immutable Ledger)
 *
 * 用途：记录所有代理商云库存变动的不可变审计追踪
 * 特性：
 * - 只增不改（immutable）
 * - 完整的变动历史
 * - 支持对账和审计
 */
const StockTransaction = sequelize.define('StockTransaction', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '代理商用户ID',
        index: true
    },
    product_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '商品ID（补货时记录）'
    },
    order_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联订单ID（出库时记录）'
    },
    type: {
        type: DataTypes.ENUM('restock', 'order_confirm', 'refund', 'adjustment', 'initial'),
        allowNull: false,
        comment: '变动类型: restock=补货, order_confirm=订单确认, refund=退货, adjustment=调整, initial=初始化',
        index: true
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '变动数量（正数=入库，负数=出库）'
    },
    balance_before: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '变动前库存'
    },
    balance_after: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '变动后库存'
    },
    amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '交易金额（补货时记录）'
    },
    operator_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '操作员ID（管理员调整时记录）'
    },
    operator_type: {
        type: DataTypes.ENUM('user', 'admin', 'system'),
        defaultValue: 'user',
        comment: '操作员类型: user=用户自己, admin=管理员, system=系统'
    },
    remark: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '备注说明'
    },
    metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'JSON元数据（如：补货订单号、退款ID等）'
    },
    ip_address: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '操作IP地址'
    }
}, {
    tableName: 'stock_transactions',
    timestamps: true,
    updatedAt: false,  // ★ 不可变表，禁止更新
    indexes: [
        { fields: ['user_id', 'created_at'] },
        { fields: ['type', 'created_at'] },
        { fields: ['order_id'] },
        { fields: ['product_id'] }
    ]
});

/**
 * 静态方法：记录库存变动
 * @param {Object} params - 变动参数
 * @returns {Promise<StockTransaction>}
 */
StockTransaction.recordTransaction = async function({
    user_id,
    product_id = null,
    order_id = null,
    type,
    quantity,
    balance_before,
    balance_after,
    amount = null,
    operator_id = null,
    operator_type = 'user',
    remark = null,
    metadata = null,
    ip_address = null,
    transaction = null
}) {
    return await StockTransaction.create({
        user_id,
        product_id,
        order_id,
        type,
        quantity,
        balance_before,
        balance_after,
        amount,
        operator_id,
        operator_type,
        remark,
        metadata,
        ip_address
    }, { transaction });
};

/**
 * 实例方法：防止修改
 */
StockTransaction.prototype.update = function() {
    throw new Error('StockTransaction is immutable - updates are not allowed');
};

StockTransaction.prototype.destroy = function() {
    throw new Error('StockTransaction is immutable - deletion is not allowed');
};

module.exports = StockTransaction;
