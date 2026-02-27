const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserTagRelation = sequelize.define('UserTagRelation', {
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
    tagId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'tag_id',
        comment: '标签ID'
    }
}, {
    tableName: 'user_tag_relations',
    timestamps: true,
    underscored: true,
    updatedAt: false
});

module.exports = UserTagRelation;
