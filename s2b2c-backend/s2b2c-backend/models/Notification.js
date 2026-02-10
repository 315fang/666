const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Notification = sequelize.define('Notification', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '接收通知的用户ID'
    },
    title: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '通知标题'
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '通知内容'
    },
    type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: '通知类型: upgrade (升级), commission (分润), stock (库存), system (系统)'
    },
    is_read: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: '是否已读'
    },
    related_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '关联ID (如订单ID)'
    }
}, {
    tableName: 'notifications',
    underscored: true,
    timestamps: true
});

module.exports = Notification;
