const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserFavorite = sequelize.define(
    'UserFavorite',
    {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: '用户ID'
        },
        product_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: '商品ID'
        }
    },
    {
        tableName: 'user_product_favorites',
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ['user_id', 'product_id'],
                name: 'uniq_user_product_favorite'
            },
            { fields: ['user_id'] },
            { fields: ['product_id'] }
        ]
    }
);

module.exports = UserFavorite;
