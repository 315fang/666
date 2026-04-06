const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Review = sequelize.define('Review', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    product_id: { type: DataTypes.INTEGER, allowNull: false, comment: '商品ID' },
    user_id: { type: DataTypes.INTEGER, allowNull: false, comment: '评论用户ID' },
    order_id: { type: DataTypes.INTEGER, allowNull: true, comment: '关联订单ID' },
    rating: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5, comment: '评分1-5' },
    content: { type: DataTypes.TEXT, allowNull: false, comment: '评论内容' },
    images: { type: DataTypes.JSON, allowNull: true, defaultValue: [], comment: '评论图片数组' },
    status: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, comment: '1-显示 0-隐藏' },
    is_featured: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '1-精选 0-普通' },
    reply_content: { type: DataTypes.TEXT, allowNull: true, comment: '后台回复' }
}, {
    tableName: 'reviews',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = Review;
