const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Banner = sequelize.define('Banner', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    title: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '标题/备注'
    },
    image_url: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: '图片URL'
    },
    link_type: {
        type: DataTypes.STRING(20),
        defaultValue: 'none',
        comment: '链接类型: none/product/page/url'
    },
    link_value: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '链接值: 商品ID/页面路径/外部URL'
    },
    position: {
        type: DataTypes.STRING(50),
        defaultValue: 'home',
        comment: '展示位置: home/category/activity'
    },
    sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '排序权重'
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
    tableName: 'banners',
    timestamps: true
});

module.exports = Banner;
