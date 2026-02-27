// backend/models/SlashHelper.js
/**
 * 帮砍记录
 * 每位好友帮砍一刀产生一条记录
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SlashHelper = sequelize.define('SlashHelper', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    slash_record_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '关联砍价主记录ID'
    },
    helper_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '帮砍用户ID'
    },
    slash_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '本次砍掉的金额'
    },
    is_new_user: {
        type: DataTypes.TINYINT,
        defaultValue: 0,
        comment: '帮砍者是否为新用户（无上级关系）'
    }
}, {
    tableName: 'slash_helpers',
    timestamps: true,
    indexes: [
        {
            unique: true,
            fields: ['slash_record_id', 'helper_user_id'],
            name: 'uk_slash_helper'
        }
    ]
});

module.exports = SlashHelper;
