const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Withdrawal = sequelize.define('Withdrawal', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    withdrawal_no: {
        type: DataTypes.STRING(50),
        unique: true,
        allowNull: false,
        comment: '提现单号'
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID'
    },
    amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '提现金额'
    },
    fee: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00,
        comment: '手续费'
    },
    actual_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '实际到账金额'
    },
    method: {
        type: DataTypes.STRING(20),
        defaultValue: 'wechat',
        comment: '提现方式: wechat/bank/alipay'
    },
    account_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '收款账户名'
    },
    account_no: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '收款账号（部分脱敏存储）'
    },
    bank_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '银行名称'
    },
    status: {
        type: DataTypes.STRING(20),
        defaultValue: 'pending',
        comment: '状态: pending/approved/processing/completed/rejected/failed'
    },
    reject_reason: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '拒绝原因'
    },
    processed_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '处理人ID（管理员）'
    },
    processed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '处理时间'
    },
    completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '完成时间'
    },
    remark: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '备注'
    }
}, {
    tableName: 'withdrawals',
    timestamps: true
});

module.exports = Withdrawal;
