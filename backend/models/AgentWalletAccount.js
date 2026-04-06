const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AgentWalletAccount = sequelize.define('AgentWalletAccount', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        comment: '代理商用户ID'
    },
    balance: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00,
        comment: '货款余额'
    },
    frozen_balance: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00,
        comment: '冻结货款'
    },
    total_recharge: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00,
        comment: '累计充值'
    },
    total_deduct: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00,
        comment: '累计扣减'
    },
    status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '状态: 1-正常 0-禁用'
    }
}, {
    tableName: 'agent_wallet_accounts',
    timestamps: true
});

module.exports = AgentWalletAccount;
