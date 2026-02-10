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
        comment: '角色等级: 0-普通用户, 1-会员, 2-团长, 3-代理商'
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
    agent_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '所属代理商ID'
    },
    stock_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '云仓库存（仅代理商有效）'
    },
    invite_code: {
        type: DataTypes.STRING(6),
        unique: true,
        allowNull: true,
        comment: '6位数字唯一邀请码'
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
    },
    joined_team_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '加入团队时间（绑定上级时设置）'
    },
    // ★ 欠款金额：退款时佣金追回余额不足产生的待追回金额
    debt_amount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00,
        comment: '欠款金额（佣金追回余额不足时的待还金额）'
    }
}, {
    tableName: 'users',
    timestamps: true
});

module.exports = User;
