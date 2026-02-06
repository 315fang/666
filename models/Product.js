const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Product = sequelize.define('Product', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '商品名称'
    },
    category_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '类目ID'
    },
    description: {
        type: DataTypes.TEXT,
        comment: '商品描述'
    },
    images: {
        type: DataTypes.TEXT,
        comment: '商品图片URLs（JSON数组）',
        get() {
            const rawValue = this.getDataValue('images');
            return rawValue ? JSON.parse(rawValue) : [];
        },
        set(value) {
            this.setDataValue('images', JSON.stringify(value));
        }
    },
    retail_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '零售价 ¥299'
    },
    member_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '会员价 ¥269'
    },
    wholesale_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '批发价 ¥150'
    },
    stock: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '公司库存'
    },
    status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '状态: 1-上架, 0-下架'
    }
}, {
    tableName: 'products',
    timestamps: true
});

module.exports = Product;
