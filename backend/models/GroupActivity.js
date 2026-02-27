const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const GroupActivity = sequelize.define('GroupActivity', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '关联商品ID'
    },
    sku_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'NULL=全规格适用，非NULL=仅限该SKU'
    },
    min_members: {
        type: DataTypes.INTEGER,
        defaultValue: 2,
        comment: '最少成团人数'
    },
    max_members: {
        type: DataTypes.INTEGER,
        defaultValue: 10,
        comment: '最多参团人数'
    },
    group_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '拼团价格'
    },
    original_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '对比原价（划线价显示，NULL则用商品零售价）'
    },
    expire_hours: {
        type: DataTypes.INTEGER,
        defaultValue: 24,
        comment: '开团后有效小时数'
    },
    stock_limit: {
        type: DataTypes.INTEGER,
        defaultValue: 999,
        comment: '活动总库存'
    },
    sold_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '已拼成功件数'
    },
    status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '1=上线 0=下线'
    },
    start_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '活动开始时间'
    },
    end_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '活动结束时间'
    }
}, {
    tableName: 'group_activities',
    timestamps: true
});

module.exports = GroupActivity;
