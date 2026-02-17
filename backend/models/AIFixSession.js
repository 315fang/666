const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AIFixSession = sequelize.define('AIFixSession', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    alert_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '关联告警ID',
        references: {
            model: 'ai_alerts',
            key: 'id'
        }
    },
    started_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '开始时间'
    },
    completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '完成时间'
    },
    status: {
        type: DataTypes.ENUM('RUNNING', 'SUCCESS', 'FAILED', 'ROLLED_BACK'),
        defaultValue: 'RUNNING',
        comment: '状态'
    },
    steps_executed: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '执行的步骤记录'
    },
    current_step: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '当前步骤'
    },
    rollback_script: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '回滚脚本'
    },
    error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '错误信息'
    },
    executed_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '执行人ID'
    }
}, {
    tableName: 'ai_fix_sessions',
    timestamps: true,
    underscored: true
});

module.exports = AIFixSession;
