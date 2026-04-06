/**
 * N路径货款申请：小n 向 大N 申请货款分配
 *
 * 流程：小n 提交申请 → 大N 审批 → AgentWalletService.transfer() 执行划拨
 * 大N 也可不经申请直接主动划拨（不创建此记录，直接调用 transfer）
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const NFundRequest = sequelize.define('NFundRequest', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    requester_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '申请人（小n）的 user_id'
    },
    leader_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '目标大N的 user_id'
    },
    amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        comment: '申请金额（元）'
    },
    status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        defaultValue: 'pending',
        comment: '状态：pending=待审核，approved=已通过，rejected=已驳回'
    },
    note: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '申请备注（小n填写）'
    },
    reject_reason: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '驳回原因（大N填写）'
    },
    reviewed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '审核时间'
    }
}, {
    tableName: 'n_fund_requests',
    timestamps: true
});

module.exports = NFundRequest;
