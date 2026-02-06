const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    openid: {
        type: DataTypes.STRING(100),
        unique: true,
        allowNull: false,
        comment: '微信openid'
    },
    nickname: {
        type: DataTypes.STRING(100),
        comment: '昵称'
    },
    avatar_url: {
        type: DataTypes.STRING(255),
        field: 'avatar_url',
        comment: '头像URL'
    },
    role_level: {
        type: DataTypes.TINYINT,
        defaultValue: 0,
        comment: '角色等级: 0-游客, 1-会员, 2-团长, 3-合伙人'
    },
    parent_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '上级用户ID'
    },
    parent_openid: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '上级openid（冗余字段）'
    },
    stock_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '云仓库存（仅Partner）'
    },
    balance: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00,
        comment: '可提现余额'
    },
    referee_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '直推人数'
    },
    order_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '累计订单数'
    },
    total_sales: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00,
        comment: '累计销售额'
    },
    last_login: {
        type: DataTypes.DATE,
        comment: '最后登录时间'
    }
}, {
    tableName: 'users',
    timestamps: true
});

module.exports = User;
