const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * 首页区块配置模型
 * 用于控制首页各个模块的显示顺序和样式
 */
const HomeSection = sequelize.define('HomeSection', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    section_key: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '区块唯一标识: banner/quick_entries/category_tabs/products_grid/recommend'
    },
    section_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '区块名称'
    },
    section_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: '区块类型: banner/grid/list/tabs/custom'
    },
    title: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '区块标题（前端显示）'
    },
    subtitle: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '区块副标题'
    },
    config: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '区块配置(JSON): 样式、数据源、显示参数等'
    },
    sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '排序权重，数字越大越靠前'
    },
    is_visible: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: '是否显示'
    },
    data_source: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '数据源API endpoint'
    },
    cache_ttl: {
        type: DataTypes.INTEGER,
        defaultValue: 300,
        comment: '缓存时长（秒）'
    },
    status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '状态: 1-启用, 0-禁用'
    }
}, {
    tableName: 'home_sections',
    timestamps: true,
    indexes: [
        {
            fields: ['section_key']
        },
        {
            fields: ['sort_order']
        }
    ]
});

module.exports = HomeSection;
