const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ContentBoard = sequelize.define('ContentBoard', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    board_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '榜单唯一标识，如 home.hero'
    },
    board_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '榜单名称（仅后台展示）'
    },
    scene: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'home',
        comment: '场景: home/activity/user'
    },
    board_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'image',
        comment: '榜单类型: image/product/mixed'
    },
    description: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '后台备注'
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用'
    },
    sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序值，越大越靠前'
    }
}, {
    tableName: 'content_boards',
    timestamps: true,
    indexes: [
        { fields: ['scene'] },
        { fields: ['is_active'] },
        { fields: ['sort_order'] }
    ]
});

module.exports = ContentBoard;
