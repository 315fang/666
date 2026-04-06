const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AgentWalletLog = sequelize.define('AgentWalletLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    account_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    change_type: {
        type: DataTypes.ENUM(
            'recharge',          // 普通充值
            'recharge_pending',  // 充值待确认
            'deduct',            // 扣减（下单/发货）
            'refund',            // 退款返还
            'adjust',            // 管理员人工调整
            'n_allocate_in',     // N路径：大N划拨给小n（小n账户入账）
            'n_allocate_out',    // N路径：大N划拨给小n（大N账户出账）
            'n_separation_bonus' // N路径：小n升大N时原大N获得脱离奖励（写CommissionLog，此处备查）
        ),
        allowNull: false
    },
    amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        comment: '本次变动金额（正数）'
    },
    balance_before: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00
    },
    balance_after: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00
    },
    ref_type: {
        type: DataTypes.STRING(30),
        allowNull: true
    },
    ref_id: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    remark: {
        type: DataTypes.STRING(255),
        allowNull: true
    }
}, {
    tableName: 'agent_wallet_logs',
    timestamps: true
});

module.exports = AgentWalletLog;
