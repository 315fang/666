const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PageLayout = sequelize.define('PageLayout', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    page_key: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '页面标识，如 home/activity/user'
    },
    page_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '页面名称（后台展示）'
    },
    scene: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'home',
        comment: '页面场景: home/activity/user'
    },
    layout_schema: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
        comment: '页面模块编排定义'
    },
    data_sources: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: '模块所引用的资源池/榜单池/活动池'
    },
    status: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1,
        comment: '状态: 1-启用 0-停用'
    },
    sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序值，越大越靠前'
    }
}, {
    tableName: 'page_layouts',
    timestamps: true,
    underscored: true,
    indexes: [
        { unique: true, fields: ['page_key'] },
        { fields: ['scene'] },
        { fields: ['status'] },
        { fields: ['sort_order'] }
    ]
});

module.exports = PageLayout;
