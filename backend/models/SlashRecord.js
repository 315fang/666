// backend/models/SlashRecord.js
/**
 * 用户的砍价记录（每个用户每个活动一条）
 * 关联：多条 SlashHelper（每位帮砍好友一条）
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SlashRecord = sequelize.define('SlashRecord', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    slash_no: {
        type: DataTypes.STRING(32),
        unique: true,
        allowNull: false,
        comment: '砍价单号（对外分享用）'
    },
    activity_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '关联活动ID'
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '发起砍价的用户ID'
    },
    product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '商品ID（冗余）'
    },
    // ── 价格快照 ──
    original_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '活动原价快照'
    },
    floor_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '底价快照（发起时锁定）'
    },
    current_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '当前砍后价格'
    },
    total_slashed: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
        comment: '累计砍掉金额'
    },
    helper_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '已帮砍人数'
    },
    // ── 状态 ──
    status: {
        type: DataTypes.ENUM('active', 'success', 'expired', 'purchased'),
        defaultValue: 'active',
        comment: 'active进行中, success砍到底价, expired已超时, purchased已购买'
    },
    expire_at: { type: DataTypes.DATE, allowNull: false },
    success_at: { type: DataTypes.DATE, allowNull: true },
    order_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '成功购买后关联的订单ID'
    }
}, {
    tableName: 'slash_records',
    timestamps: true
});

module.exports = SlashRecord;
