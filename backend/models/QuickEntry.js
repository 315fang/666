const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * 首页快捷入口模型
 * 用于配置首页的金刚区导航
 */
const QuickEntry = sequelize.define('QuickEntry', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '入口名称'
    },
    icon: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '图标URL或SVG路径'
    },
    icon_type: {
        type: DataTypes.STRING(20),
        defaultValue: 'image',
        comment: '图标类型: image/svg/emoji'
    },
    bg_color: {
        type: DataTypes.STRING(20),
        defaultValue: '#EFF6FF',
        comment: '背景颜色'
    },
    link_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: '链接类型: category/page/product/url/action'
    },
    link_value: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '链接值: 分类ID/页面路径/商品ID/外部URL/动作类型'
    },
    position: {
        type: DataTypes.STRING(50),
        defaultValue: 'home',
        comment: '展示位置: home/category'
    },
    sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '排序权重，数字越大越靠前'
    },
    tags: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '标签，用逗号分隔'
    },
    start_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '开始展示时间'
    },
    end_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '结束展示时间'
    },
    status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '状态: 1-启用, 0-禁用'
    }
}, {
    tableName: 'quick_entries',
    timestamps: true,
    indexes: [
        {
            fields: ['position', 'sort_order']
        },
        {
            fields: ['status']
        }
    ]
});

module.exports = QuickEntry;
