// backend/models/StationClaim.js
/**
 * 站点认领申请记录
 * 用户提交申请 → 管理员审核 → 通过后绑定至 ServiceStation.claimant_id
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const StationClaim = sequelize.define('StationClaim', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    station_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '申请认领的站点ID'
    },
    applicant_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '申请人用户ID'
    },
    real_name: { type: DataTypes.STRING(50), allowNull: false, comment: '真实姓名' },
    phone: { type: DataTypes.STRING(20), allowNull: false, comment: '联系电话' },
    id_card: { type: DataTypes.STRING(20), allowNull: true, comment: '身份证号（脱敏存储）' },
    intro: { type: DataTypes.TEXT, allowNull: true, comment: '申请理由/自我介绍' },
    status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        defaultValue: 'pending',
        comment: '审核状态'
    },
    review_note: { type: DataTypes.TEXT, allowNull: true, comment: '审核备注' },
    reviewed_at: { type: DataTypes.DATE, allowNull: true }
}, {
    tableName: 'station_claims',
    timestamps: true
});

module.exports = StationClaim;
