const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserTag = sequelize.define('UserTag', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '标签名称'
    },
    description: {
        type: DataTypes.STRING(200),
        comment: '标签描述'
    },
    color: {
        type: DataTypes.STRING(20),
        defaultValue: '#409EFF',
        comment: '标签颜色'
    },
    userCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'user_count',
        comment: '用户数量'
    },
    createdBy: {
        type: DataTypes.INTEGER,
        field: 'created_by',
        comment: '创建人'
    }
}, {
    tableName: 'user_tags',
    timestamps: true,
    underscored: true
});

module.exports = UserTag;
