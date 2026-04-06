const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ContentBoardItem = sequelize.define('ContentBoardItem', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    board_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '所属榜单ID'
    },
    image_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '图片地址'
    },
    link_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'none',
        comment: '跳转类型: none/product/activity/group_buy/slash/lottery/page/url/copy'
    },
    link_value: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '跳转值'
    },
    extra_data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '扩展数据（如 gradient/end_time）'
    },
    start_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '开始时间'
    },
    end_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '结束时间'
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
    tableName: 'content_board_items',
    timestamps: true,
    indexes: [
        { fields: ['board_id'] },
        { fields: ['is_active'] },
        { fields: ['sort_order'] },
        { fields: ['start_time', 'end_time'] }
    ]
});

module.exports = ContentBoardItem;
