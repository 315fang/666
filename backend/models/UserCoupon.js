// backend/models/UserCoupon.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserCoupon = sequelize.define('UserCoupon', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID'
    },
    coupon_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '优惠券模板ID'
    },
    // 快照字段（发放时锁定，防止后续修改影响）
    coupon_name: { type: DataTypes.STRING(100), comment: '名称快照' },
    coupon_type: { type: DataTypes.STRING(20), comment: '类型快照' },
    coupon_value: { type: DataTypes.DECIMAL(10, 2), comment: '面值快照' },
    min_purchase: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0, comment: '门槛快照' },
    scope: { type: DataTypes.STRING(20), defaultValue: 'all', comment: '范围快照' },
    scope_ids: { type: DataTypes.JSON, allowNull: true, comment: '范围ID快照' },
    // 状态
    status: {
        type: DataTypes.ENUM('unused', 'used', 'expired'),
        defaultValue: 'unused',
        comment: '状态: unused未用, used已用, expired已过期'
    },
    expire_at: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '过期时间'
    },
    used_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '使用时间'
    },
    used_order_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '使用的订单ID'
    }
}, {
    tableName: 'user_coupons',
    timestamps: true
});

module.exports = UserCoupon;
