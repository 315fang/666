const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AIAlert = sequelize.define('AIAlert', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    alert_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '告警编码 ERR-YYYYMMDD-NNN'
    },
    level: {
        type: DataTypes.ENUM('CRITICAL', 'WARNING', 'INFO'),
        allowNull: false,
        comment: '告警级别'
    },
    category: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '分类：SYSTEM_ERROR, BUSINESS_ANOMALY, PERFORMANCE'
    },
    title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '告警标题'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '告警描述'
    },
    ai_cause: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'AI分析的可能原因'
    },
    ai_impact: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '影响范围'
    },
    ai_confidence: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: true,
        comment: 'AI置信度'
    },
    ai_suggestion: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'AI建议'
    },
    auto_fixable: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: '是否可自动修复'
    },
    fix_procedure: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '修复步骤（JSON）'
    },
    fix_script: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '修复脚本'
    },
    status: {
        type: DataTypes.ENUM('ACTIVE', 'FIXING', 'RESOLVED', 'IGNORED'),
        defaultValue: 'ACTIVE',
        comment: '状态'
    },
    fixed_by: {
        type: DataTypes.ENUM('AI', 'ADMIN', 'MANUAL'),
        allowNull: true,
        comment: '解决方式'
    },
    fixed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '解决时间'
    },
    resolved_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '解决人ID'
    }
}, {
    tableName: 'ai_alerts',
    timestamps: true,
    underscored: true
});

module.exports = AIAlert;
