// backend/models/SlashActivity.js
/**
 * 砍一刀活动模板
 * 商家设置：商品、目标价、底价、人数要求
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SlashActivity = sequelize.define('SlashActivity', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '关联商品ID'
    },
    sku_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'NULL=全规格，非NULL=指定规格'
    },
    original_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '活动原价（展示用）'
    },
    floor_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '砍至底价（最低价，后台可改）'
    },
    initial_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '砍价开始价格（等于 original_price 或略低）'
    },
    max_slash_per_helper: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 5.00,
        comment: '每位好友最多砍多少元（含随机区间上限）'
    },
    min_slash_per_helper: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.10,
        comment: '每位好友最少砍多少元（随机区间下限）'
    },
    max_helpers: {
        type: DataTypes.INTEGER,
        defaultValue: 20,
        comment: '最多可邀请帮砍人数（-1=不限）'
    },
    expire_hours: {
        type: DataTypes.INTEGER,
        defaultValue: 48,
        comment: '砍价有效小时数'
    },
    stock_limit: {
        type: DataTypes.INTEGER,
        defaultValue: 999,
        comment: '活动总件数'
    },
    sold_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '已砍成功件数'
    },
    status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '1=上线 0=下线'
    },
    start_at: { type: DataTypes.DATE, allowNull: true },
    end_at: { type: DataTypes.DATE, allowNull: true }
}, {
    tableName: 'slash_activities',
    timestamps: true
});

module.exports = SlashActivity;
