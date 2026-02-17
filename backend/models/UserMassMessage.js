const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserMassMessage = sequelize.define('UserMassMessage', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'user_id',
        comment: '用户ID'
    },
    massMessageId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'mass_message_id',
        comment: '群发消息ID'
    },
    status: {
        type: DataTypes.ENUM('unread', 'read'),
        defaultValue: 'unread',
        comment: '阅读状态'
    },
    receivedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: 'received_at',
        comment: '接收时间'
    },
    readAt: {
        type: DataTypes.DATE,
        field: 'read_at',
        comment: '阅读时间'
    }
}, {
    tableName: 'user_mass_messages',
    timestamps: false,
    underscored: true
});

module.exports = UserMassMessage;
