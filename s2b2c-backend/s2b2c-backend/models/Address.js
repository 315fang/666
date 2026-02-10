const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Address = sequelize.define('Address', {
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
    receiver_name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '收货人姓名'
    },
    phone: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: '联系电话'
    },
    province: {
        type: DataTypes.STRING(50),
        comment: '省份'
    },
    city: {
        type: DataTypes.STRING(50),
        comment: '城市'
    },
    district: {
        type: DataTypes.STRING(50),
        comment: '区县'
    },
    detail: {
        type: DataTypes.STRING(200),
        comment: '详细地址'
    },
    is_default: {
        type: DataTypes.TINYINT,
        defaultValue: 0,
        comment: '是否默认地址: 1-是, 0-否'
    }
}, {
    tableName: 'addresses',
    timestamps: true
});

module.exports = Address;
