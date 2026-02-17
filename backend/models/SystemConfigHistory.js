const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SystemConfigHistory = sequelize.define('SystemConfigHistory', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    config_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '配置键'
    },
    old_value: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '旧值'
    },
    new_value: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '新值'
    },
    changed_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '修改人ID'
    },
    change_reason: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '修改原因'
    }
}, {
    tableName: 'system_config_history',
    timestamps: true,
    underscored: true,
    updatedAt: false  // 历史记录不需要updated_at
});

module.exports = SystemConfigHistory;
