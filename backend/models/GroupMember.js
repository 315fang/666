const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const GroupMember = sequelize.define('GroupMember', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    group_order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '关联团次ID'
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '参团用户ID'
    },
    order_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联的实际支付订单ID（支付后更新）'
    },
    is_leader: {
        type: DataTypes.TINYINT,
        defaultValue: 0,
        comment: '1=团长 0=普通成员'
    },
    inviter_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '★ 谁带来这个成员（分销归因，可能与团次的inviter_id不同）'
    },
    is_new_user: {
        type: DataTypes.TINYINT,
        defaultValue: 0,
        comment: '加入时是否为新用户（无parent_id），用于统计拉新效果'
    },
    was_bound: {
        type: DataTypes.TINYINT,
        defaultValue: 0,
        comment: '是否通过拼团成功绑定了分销关系（新用户才可能为1）'
    },
    status: {
        type: DataTypes.STRING(20),
        defaultValue: 'joined',
        comment: '状态: joined=已加入待支付 paid=已支付 refunded=已退款'
    },
    join_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '加入时间'
    },
    paid_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '支付时间'
    }
}, {
    tableName: 'group_members',
    timestamps: true,
    indexes: [
        {
            unique: true,
            fields: ['group_order_id', 'user_id'],
            name: 'uk_group_user'
        }
    ]
});

module.exports = GroupMember;
