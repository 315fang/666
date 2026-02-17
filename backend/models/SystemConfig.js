const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SystemConfig = sequelize.define('SystemConfig', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    config_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '配置键'
    },
    config_value: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '配置值'
    },
    config_group: {
        type: DataTypes.STRING(50),
        defaultValue: 'general',
        comment: '配置分组'
    },
    is_sensitive: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: '是否敏感'
    },
    is_editable: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: '是否可在后台编辑'
    },
    description: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '配置说明'
    },
    validation_rule: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '验证规则'
    },
    version: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        comment: '版本号'
    },
    updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '最后修改人'
    }
}, {
    tableName: 'system_configs',
    timestamps: true,
    underscored: true
});

module.exports = SystemConfig;
