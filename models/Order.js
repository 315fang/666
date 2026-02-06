const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Order = sequelize.define('Order', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    order_no: {
        type: DataTypes.STRING(50),
        unique: true,
        allowNull: false,
        comment: '订单号'
    },
    buyer_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '购买者ID'
    },
    distributor_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '分销商ID'
    },
    distributor_role: {
        type: DataTypes.TINYINT,
        allowNull: true,
        comment: '下单时分销商角色（锁定）'
    },
    product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '商品ID'
    },
    quantity: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        comment: '数量'
    },
    total_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '订单总金额'
    },
    actual_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '实际支付价格'
    },
    fulfillment_type: {
        type: DataTypes.STRING(20),
        comment: '履约类型: Company/Partner'
    },
    fulfillment_partner_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '实际发货的Partner ID'
    },
    status: {
        type: DataTypes.STRING(20),
        defaultValue: 'pending',
        comment: '订单状态: pending/paid/shipped/completed/refunded'
    },
    paid_at: {
        type: DataTypes.DATE,
        comment: '支付时间'
    },
    shipped_at: {
        type: DataTypes.DATE,
        comment: '发货时间'
    },
    completed_at: {
        type: DataTypes.DATE,
        comment: '完成时间'
    }
}, {
    tableName: 'orders',
    timestamps: true
});

module.exports = Order;
