// backend/models/Coupon.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Coupon = sequelize.define('Coupon', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '优惠券名称'
    },
    type: {
        type: DataTypes.ENUM('fixed', 'percent'),
        allowNull: false,
        defaultValue: 'fixed',
        comment: '类型: fixed满减券, percent折扣券'
    },
    value: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: 'fixed=减免金额(元), percent=折扣(0.8=8折)'
    },
    min_purchase: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
        comment: '最低使用金额，0=无门槛'
    },
    scope: {
        type: DataTypes.ENUM('all', 'product', 'category'),
        defaultValue: 'all',
        comment: '使用范围: all全场, product指定商品, category指定分类'
    },
    scope_ids: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '限定商品/分类ID数组 [1,2,3]，scope=all时为null'
    },
    valid_days: {
        type: DataTypes.INTEGER,
        defaultValue: 30,
        comment: '有效天数（从发放时起算）'
    },
    stock: {
        type: DataTypes.INTEGER,
        defaultValue: -1,
        comment: '发放库存，-1=无限'
    },
    target_level: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '定向发放：目标会员等级（null=不限）'
    },
    target_region: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '定向发放：目标地区（省/市，null=不限）'
    },
    is_active: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '是否启用'
    },
    description: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '使用说明'
    }
}, {
    tableName: 'coupons',
    timestamps: true
});

module.exports = Coupon;
