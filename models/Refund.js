const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Refund = sequelize.define('Refund', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    refund_no: {
        type: DataTypes.STRING(50),
        unique: true,
        allowNull: false,
        comment: '退款单号'
    },
    order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '关联订单ID'
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '申请用户ID'
    },
    type: {
        type: DataTypes.STRING(20),
        defaultValue: 'refund_only',
        comment: '类型: refund_only/return_refund/exchange'
    },
    reason: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '退款原因: quality/wrong_item/not_needed/other'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '详细说明'
    },
    images: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '凭证图片URLs（JSON数组）',
        get() {
            const rawValue = this.getDataValue('images');
            return rawValue ? JSON.parse(rawValue) : [];
        },
        set(value) {
            this.setDataValue('images', JSON.stringify(value));
        }
    },
    amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '退款金额'
    },
    status: {
        type: DataTypes.STRING(20),
        defaultValue: 'pending',
        comment: '状态: pending/approved/rejected/processing/completed/cancelled'
    },
    admin_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '处理管理员ID'
    },
    admin_remark: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '管理员备注'
    },
    reject_reason: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '拒绝原因'
    },
    processed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '处理时间'
    },
    completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '完成时间'
    },
    // 退货相关
    return_tracking_no: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '退货快递单号'
    },
    return_company: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '退货快递公司'
    }
}, {
    tableName: 'refunds',
    timestamps: true
});

module.exports = Refund;
