const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/** 限时活动卡片下「专享商品」已售计数（与 activity_links_config 中配置联动） */
const ActivitySpotStock = sequelize.define('ActivitySpotStock', {
    card_id: {
        type: DataTypes.STRING(64),
        primaryKey: true,
        allowNull: false
    },
    offer_id: {
        type: DataTypes.STRING(64),
        primaryKey: true,
        allowNull: false
    },
    sold: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    }
}, {
    tableName: 'activity_spot_stock',
    timestamps: true,
    updatedAt: 'updated_at',
    createdAt: 'created_at'
});

module.exports = ActivitySpotStock;
