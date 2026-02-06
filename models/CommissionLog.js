const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CommissionLog = sequelize.define('CommissionLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '订单ID'
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '获得佣金的用户ID'
    },
    amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '佣金金额'
    },
    type: {
        type: DataTypes.STRING(20),
        comment: '佣金类型: Direct/Indirect/Stock_Diff'
    },
    status: {
        type: DataTypes.STRING(20),
        defaultValue: 'pending',
        comment: '佣金状态: pending/available/cancelled'
    },
    available_at: {
        type: DataTypes.DATE,
        comment: 'T+7可用时间'
    }
}, {
    tableName: 'commission_logs',
    timestamps: true
});

module.exports = CommissionLog;
