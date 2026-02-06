const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SKU = sequelize.define('SKU', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '关联商品ID'
    },
    sku_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'SKU编码'
    },
    spec_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '规格名称，如"颜色"、"尺寸"'
    },
    spec_value: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '规格值，如"红色"、"XL"'
    },
    retail_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '零售价'
    },
    member_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '会员价'
    },
    wholesale_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '批发价'
    },
    stock: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '库存数量'
    },
    image: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'SKU图片'
    },
    status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '状态: 1-启用, 0-禁用'
    }
}, {
    tableName: 'product_skus',
    timestamps: true
});

module.exports = SKU;
