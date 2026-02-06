const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Content = sequelize.define('Content', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    type: {
        type: DataTypes.STRING(30),
        allowNull: false,
        comment: '内容类型: about/culture/team/contact/page'
    },
    slug: {
        type: DataTypes.STRING(100),
        allowNull: true,
        unique: true,
        comment: '页面标识符，用于URL访问'
    },
    title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '标题'
    },
    subtitle: {
        type: DataTypes.STRING(300),
        allowNull: true,
        comment: '副标题'
    },
    cover_image: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '封面图'
    },
    content: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
        comment: '富文本内容'
    },
    extra_data: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'JSON格式扩展数据',
        get() {
            const rawValue = this.getDataValue('extra_data');
            return rawValue ? JSON.parse(rawValue) : null;
        },
        set(value) {
            this.setDataValue('extra_data', value ? JSON.stringify(value) : null);
        }
    },
    sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '排序权重'
    },
    status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '状态: 1-发布, 0-草稿'
    }
}, {
    tableName: 'contents',
    timestamps: true
});

module.exports = Content;
