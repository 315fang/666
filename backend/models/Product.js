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
    detail_images: {
        type: DataTypes.TEXT,
        comment: '商品详情图URLs（JSON数组，长图拼接展示）',
        get() {
            const rawValue = this.getDataValue('detail_images');
            return rawValue ? JSON.parse(rawValue) : [];
        },
        set(value) {
            this.setDataValue('detail_images', value ? JSON.stringify(value) : null);
        }
    },
    retail_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '零售价 ¥299'
    },
    member_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '会员价（兼容旧字段）'
    },
    wholesale_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '批发价（兼容旧字段）'
    },
    price_member: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '会员价 ¥239'
    },
    price_leader: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '团长价 ¥209'
    },
    price_agent: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '代理价 ¥150'
    },
    cost_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '成本价/进货价 - 供应商给平台的价格'
    },
    commission_rate_1: {
        type: DataTypes.DECIMAL(4, 2),
        allowNull: true,
        comment: '一级分销比例 (e.g. 0.20), 空则用默认'
    },
    commission_rate_2: {
        type: DataTypes.DECIMAL(4, 2),
        allowNull: true,
        comment: '二级分销比例 (e.g. 0.10), 空则用默认'
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
