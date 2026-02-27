const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const GroupOrder = sequelize.define('GroupOrder', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    group_no: {
        type: DataTypes.STRING(32),
        unique: true,
        allowNull: false,
        comment: '团次编号（对外展示，如 GP20260223001）'
    },
    activity_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '关联活动ID'
    },
    product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '商品ID（冗余，方便查询）'
    },
    leader_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '团长用户ID'
    },
    inviter_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '分享链接来源用户ID（分销归因）'
    },
    status: {
        type: DataTypes.STRING(20),
        defaultValue: 'open',
        comment: '状态: open=进行中 success=已成团 fail=已失败 cancelled=已取消'
    },
    current_members: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '当前已加入人数'
    },
    min_members: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '成团所需最少人数（快照，防止活动修改影响进行中的团）'
    },
    max_members: {
        type: DataTypes.INTEGER,
        defaultValue: 10,
        comment: '最多人数（快照）'
    },
    group_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '成团价格（快照）'
    },
    expire_at: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '团次失效时间'
    },
    success_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '成团时间'
    },
    failed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '失败/取消时间'
    }
}, {
    tableName: 'group_orders',
    timestamps: true
});

module.exports = GroupOrder;
