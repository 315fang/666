const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * 应用全局配置模型
 * 用于存储小程序的各种可配置参数
 */
const AppConfig = sequelize.define('AppConfig', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    config_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '配置键名'
    },
    config_value: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '配置值(JSON格式)'
    },
    config_type: {
        type: DataTypes.STRING(20),
        defaultValue: 'string',
        comment: '数据类型: string/number/boolean/json/array'
    },
    category: {
        type: DataTypes.STRING(50),
        defaultValue: 'general',
        comment: '配置分类: general/homepage/ui/commission/system'
    },
    description: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '配置说明'
    },
    is_public: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: '是否公开给前端: true-公开, false-仅后台'
    },
    status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '状态: 1-启用, 0-禁用'
    }
}, {
    tableName: 'app_configs',
    timestamps: true,
    indexes: [
        {
            fields: ['config_key']
        },
        {
            fields: ['category']
        }
    ]
});

module.exports = AppConfig;
