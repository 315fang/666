// backend/models/LotteryRecord.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LotteryRecord = sequelize.define('LotteryRecord', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID'
    },
    prize_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '奖品ID'
    },
    prize_name: {
        type: DataTypes.STRING(100),
        comment: '奖品名称快照'
    },
    prize_type: {
        type: DataTypes.STRING(20),
        comment: '奖品类型快照'
    },
    cost_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '消耗积分'
    },
    status: {
        type: DataTypes.ENUM('pending', 'claimed', 'expired'),
        defaultValue: 'pending',
        comment: '领取状态: pending待领, claimed已领, expired已过期'
    },
    claimed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '领取时间'
    },
    remark: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '备注（如实物奖品填写收货信息）'
    }
}, {
    tableName: 'lottery_records',
    timestamps: true
});

module.exports = LotteryRecord;
