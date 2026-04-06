const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UpgradeApplication = sequelize.define('UpgradeApplication', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false, comment: '申请用户ID' },
    current_level: { type: DataTypes.TINYINT, allowNull: false, comment: '当前角色等级' },
    target_level: { type: DataTypes.TINYINT, allowNull: false, comment: '目标角色等级' },
    amount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0, comment: '缴费金额' },
    payment_type: {
        type: DataTypes.ENUM('wechat_pay', 'offline_transfer', 'wallet_recharge'),
        defaultValue: 'wechat_pay',
        comment: '支付方式'
    },
    payment_no: { type: DataTypes.STRING(64), allowNull: true, comment: '支付单号/转账凭证' },
    proof_image: { type: DataTypes.STRING(500), allowNull: true, comment: '线下转账截图URL' },
    status: {
        type: DataTypes.ENUM('pending_payment', 'pending_review', 'approved', 'rejected', 'cancelled'),
        defaultValue: 'pending_payment',
        comment: '状态'
    },
    admin_id: { type: DataTypes.INTEGER, allowNull: true, comment: '审核管理员ID' },
    admin_remark: { type: DataTypes.STRING(500), allowNull: true, comment: '审核备注' },
    reviewed_at: { type: DataTypes.DATE, allowNull: true, comment: '审核时间' },
    // ── N 路径专用字段 ──
    path_type: {
        type: DataTypes.ENUM('standard', 'n_join', 'n_upgrade'),
        defaultValue: 'standard',
        comment: '升级路径：standard=C/B路径，n_join=加入小n，n_upgrade=小n升大N'
    },
    leader_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'N路径：邀约人大N的user_id（n_join时必填）'
    },
    team_upgrade: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'N路径升级方式：false=直充30000，true=团队10个小n'
    }
}, {
    tableName: 'upgrade_applications',
    timestamps: true
});

module.exports = UpgradeApplication;
