const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Cart = sequelize.define('Cart', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID'
    },
    product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '商品ID'
    },
    sku_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'SKU ID，无规格商品可为null'
    },
    quantity: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        comment: '数量'
    },
    selected: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: '是否选中结算'
    }
}, {
    tableName: 'cart_items',
    timestamps: true,
    indexes: [
        {
            unique: true,
            fields: ['user_id', 'product_id', 'sku_id'],
            name: 'unique_cart_item'
        }
    ]
});

module.exports = Cart;
