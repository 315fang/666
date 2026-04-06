const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PointAccount = sequelize.define('PointAccount', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        comment: '关联用户ID'
    },
    total_points: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '累计获得积分（只增不减）'
    },
    used_points: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '已使用/已过期积分'
    },
    balance_points: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '当前可用余额 = total - used'
    },
    level: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '成长值特权档位（与 point_level_config 一致，按 users.growth_value 定级，非积分余额）'
    },
    last_checkin: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: '最后签到日期（YYYY-MM-DD）'
    },
    checkin_streak: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '当前连续签到天数'
    }
}, {
    tableName: 'point_accounts',
    timestamps: true
});

module.exports = PointAccount;
