const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ContentBoardProduct = sequelize.define('ContentBoardProduct', {
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
    product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '商品ID'
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
    tableName: 'content_board_products',
    timestamps: true,
    indexes: [
        { unique: true, fields: ['board_id', 'product_id'] },
        { fields: ['board_id', 'sort_order'] },
        { fields: ['product_id'] }
    ]
});

module.exports = ContentBoardProduct;
