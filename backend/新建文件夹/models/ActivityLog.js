const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * 活动日志模型
 * 记录所有后台和小程序的操作日志
 */
const ActivityLog = sequelize.define('ActivityLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '操作用户ID（小程序用户或管理员）'
    },
    user_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'user',
        comment: '用户类型: admin/user/guest'
    },
    username: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '用户名或昵称'
    },
    action: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '操作类型: create/update/delete/login/purchase/withdraw等'
    },
    resource: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '资源类型: product/order/user/banner/theme等'
    },
    resource_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '资源ID'
    },
    description: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '操作描述'
    },
    details: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '操作详情JSON'
    },
    ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: 'IP地址'
    },
    user_agent: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '用户代理'
    },
    platform: {
        type: DataTypes.STRING(20),
        defaultValue: 'web',
        comment: '平台: web/miniprogram/api'
    },
    status: {
        type: DataTypes.STRING(20),
        defaultValue: 'success',
        comment: '状态: success/failed/pending'
    },
    error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '错误信息'
    }
}, {
    tableName: 'activity_logs',
    timestamps: true,
    updatedAt: false, // 日志不需要更新时间
    indexes: [
        {
            fields: ['user_id']
        },
        {
            fields: ['action']
        },
        {
            fields: ['resource']
        },
        {
            fields: ['createdAt']
        },
        {
            fields: ['platform']
        }
    ]
});

module.exports = ActivityLog;
