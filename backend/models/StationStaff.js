const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const StationStaff = sequelize.define('StationStaff', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    station_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '门店ID'
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '成员用户ID'
    },
    role: {
        type: DataTypes.ENUM('manager', 'staff'),
        allowNull: false,
        defaultValue: 'staff',
        comment: '门店角色：manager=店长, staff=店员'
    },
    can_verify: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: '是否拥有核销权限: 1-是 0-否'
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
        comment: '成员状态'
    },
    remark: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '备注'
    }
}, {
    tableName: 'station_staff',
    timestamps: true,
    indexes: [
        { unique: true, fields: ['station_id', 'user_id'] },
        { fields: ['user_id', 'status'] },
        { fields: ['station_id', 'status'] }
    ]
});

module.exports = StationStaff;
