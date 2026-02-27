const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PointLog = sequelize.define('PointLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID'
    },
    points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '积分变动量（正=收入 负=支出/过期）'
    },
    type: {
        type: DataTypes.STRING(30),
        allowNull: false,
        comment: '类型: register/purchase/share/review/checkin/invite_success/group_start/group_success/redeem/expire'
    },
    ref_id: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: '关联业务ID（订单号/分享ID等）'
    },
    remark: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '说明文字（前端展示用）'
    },
    balance_after: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '操作后余额快照'
    }
}, {
    tableName: 'point_logs',
    timestamps: true,
    updatedAt: false   // 流水只有创建时间
});

module.exports = PointLog;
