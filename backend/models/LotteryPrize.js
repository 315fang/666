// backend/models/LotteryPrize.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LotteryPrize = sequelize.define('LotteryPrize', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '奖品名称'
    },
    image_url: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '奖品图片'
    },
    cost_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
        comment: '每次抽奖消耗积分'
    },
    probability: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 10.00,
        comment: '中奖概率 0-100（整个奖品池概率之和应为100）'
    },
    stock: {
        type: DataTypes.INTEGER,
        defaultValue: -1,
        comment: '库存，-1表示无限'
    },
    type: {
        type: DataTypes.ENUM('physical', 'points', 'coupon', 'miss'),
        defaultValue: 'miss',
        comment: '奖品类型: physical实物, points积分, coupon优惠券, miss未中奖'
    },
    prize_value: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
        comment: '奖品价值（积分数量或优惠券金额）'
    },
    sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '排列顺序（转盘格子位置）'
    },
    is_active: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '是否启用'
    }
}, {
    tableName: 'lottery_prizes',
    timestamps: true
});

module.exports = LotteryPrize;
