const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * 主题配置模型
 * 用于存储各种节日主题的配置
 */
const Theme = sequelize.define('Theme', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    theme_key: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '主题唯一标识: spring_festival/qingming/dragon_boat/mid_autumn/default'
    },
    theme_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '主题名称'
    },
    description: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '主题描述'
    },
    primary_color: {
        type: DataTypes.STRING(20),
        defaultValue: '#FF4757',
        comment: '主色调'
    },
    secondary_color: {
        type: DataTypes.STRING(20),
        defaultValue: '#FFA502',
        comment: '辅助色'
    },
    banner_images: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '轮播图配置数组'
    },
    quick_entries: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '快捷入口配置数组'
    },
    homepage_config: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '首页其他配置'
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: '是否当前激活主题'
    },
    auto_start_date: {
        type: DataTypes.STRING(10),
        allowNull: true,
        comment: '自动启用日期 MM-DD 格式'
    },
    auto_end_date: {
        type: DataTypes.STRING(10),
        allowNull: true,
        comment: '自动结束日期 MM-DD 格式'
    },
    icon: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '主题图标'
    },
    status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '状态: 1-启用, 0-禁用'
    }
}, {
    tableName: 'themes',
    timestamps: true,
    indexes: [
        {
            fields: ['theme_key']
        },
        {
            fields: ['is_active']
        }
    ]
});

module.exports = Theme;
