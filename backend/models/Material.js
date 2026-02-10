const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Material = sequelize.define('Material', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: '素材类型: image/video/text/poster'
    },
    title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '素材标题'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '素材描述/文案内容'
    },
    url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '资源URL（图片/视频）'
    },
    thumbnail_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '缩略图URL'
    },
    product_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联商品ID'
    },
    category: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '素材分类: product/activity/brand'
    },
    tags: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '标签，逗号分隔'
    },
    download_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '下载/使用次数'
    },
    sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '排序权重'
    },
    status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '状态: 1-启用, 0-禁用'
    }
}, {
    tableName: 'materials',
    timestamps: true
});

module.exports = Material;
