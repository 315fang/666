const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * AdminLog - 管理员操作日志表
 * 记录管理员的操作行为，用于审计追溯
 */
const AdminLog = sequelize.define('AdminLog', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    admin_id: { type: DataTypes.INTEGER, allowNull: false, comment: '管理员ID' },
    admin_name: { type: DataTypes.STRING(50), comment: '管理员名称（冗余）' },
    action: { type: DataTypes.STRING(50), allowNull: false, comment: '操作类型' },
    module: { type: DataTypes.STRING(50), comment: '模块名称' },
    target_id: { type: DataTypes.STRING(50), comment: '操作对象ID' },
    target_type: { type: DataTypes.STRING(50), comment: '操作对象类型' },
    content: { type: DataTypes.TEXT, comment: '操作内容/描述' },
    before_data: { type: DataTypes.TEXT, comment: '操作前数据（JSON）' },
    after_data: { type: DataTypes.TEXT, comment: '操作后数据（JSON）' },
    ip: { type: DataTypes.STRING(50), comment: 'IP地址' },
    user_agent: { type: DataTypes.STRING(255), comment: '浏览器UA' },
    status: { type: DataTypes.STRING(20), defaultValue: 'success', comment: '操作结果: success/failed' },
    error_message: { type: DataTypes.TEXT, allowNull: true, comment: '失败原因' }
}, {
    tableName: 'admin_logs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
});

module.exports = AdminLog;
