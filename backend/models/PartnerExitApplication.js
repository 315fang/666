const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PartnerExitApplication = sequelize.define('PartnerExitApplication', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    role_level_before: { type: DataTypes.TINYINT, allowNull: false, comment: '退出前角色等级' },
    reason: { type: DataTypes.STRING(500), allowNull: true },
    refund_wallet: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0, comment: '货款退款金额' },
    refund_balance: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0, comment: '佣金余额退款金额' },
    refund_total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0, comment: '退款总计' },
    status: {
        type: DataTypes.ENUM('pending', 'approved', 'finance_pending', 'completed', 'rejected'),
        defaultValue: 'pending',
        comment: 'pending=待审核, approved=已审核, finance_pending=财务待打款, completed=已完成, rejected=已驳回'
    },
    admin_id: { type: DataTypes.INTEGER, allowNull: true },
    admin_remark: { type: DataTypes.STRING(500), allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    finance_completed_at: { type: DataTypes.DATE, allowNull: true },
    registered_at: { type: DataTypes.DATE, allowNull: true, comment: '用户注册合伙人时间（用于计算退款周期）' }
}, {
    tableName: 'partner_exit_applications',
    timestamps: true
});

module.exports = PartnerExitApplication;
