const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const MassMessage = sequelize.define('MassMessage', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '消息标题'
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '消息内容'
    },
    contentType: {
        type: DataTypes.ENUM('text', 'image', 'link', 'miniapp'),
        defaultValue: 'text',
        field: 'content_type',
        comment: '内容类型'
    },
    targetType: {
        type: DataTypes.ENUM('all', 'role', 'tag', 'specific'),
        allowNull: false,
        field: 'target_type',
        comment: '目标类型'
    },
    targetRoles: {
        type: DataTypes.JSON,
        field: 'target_roles',
        comment: '目标角色'
    },
    targetUsers: {
        type: DataTypes.JSON,
        field: 'target_users',
        comment: '特定用户ID列表'
    },
    targetTags: {
        type: DataTypes.JSON,
        field: 'target_tags',
        comment: '用户标签'
    },
    sendType: {
        type: DataTypes.ENUM('immediate', 'scheduled'),
        defaultValue: 'immediate',
        field: 'send_type',
        comment: '发送类型'
    },
    scheduledAt: {
        type: DataTypes.DATE,
        field: 'scheduled_at',
        comment: '定时发送时间'
    },
    status: {
        type: DataTypes.ENUM('draft', 'pending', 'sending', 'completed', 'failed', 'cancelled'),
        defaultValue: 'draft',
        comment: '状态'
    },
    totalCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'total_count',
        comment: '目标用户总数'
    },
    sentCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'sent_count',
        comment: '已发送数'
    },
    readCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'read_count',
        comment: '已读数'
    },
    failCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'fail_count',
        comment: '失败数'
    },
    resultDetails: {
        type: DataTypes.JSON,
        field: 'result_details',
        comment: '发送结果详情'
    },
    errorMessage: {
        type: DataTypes.TEXT,
        field: 'error_message',
        comment: '错误信息'
    },
    createdBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'created_by',
        comment: '创建人ID'
    },
    sentAt: {
        type: DataTypes.DATE,
        field: 'sent_at',
        comment: '实际发送时间'
    },
    completedAt: {
        type: DataTypes.DATE,
        field: 'completed_at',
        comment: '完成时间'
    }
}, {
    tableName: 'mass_messages',
    timestamps: true,
    underscored: true
});

module.exports = MassMessage;
