const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * CommissionSettlement - 佣金批次结算表
 *
 * 用途：记录佣金批量结算批次和统计信息
 * 特性：
 * - 批次管理（按日/周/月结算）
 * - 结算状态跟踪
 * - 自动/手动结算支持
 */
const CommissionSettlement = sequelize.define('CommissionSettlement', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    settlement_no: {
        type: DataTypes.STRING(50),
        unique: true,
        allowNull: false,
        comment: '结算批次号 (格式: STL20260212001)'
    },
    settlement_type: {
        type: DataTypes.ENUM('auto', 'manual'),
        defaultValue: 'auto',
        comment: '结算类型: auto=自动结算, manual=手动结算'
    },
    period_start: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: '结算周期开始日期'
    },
    period_end: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: '结算周期结束日期'
    },
    status: {
        type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
        defaultValue: 'pending',
        comment: '状态: pending=待处理, processing=处理中, completed=已完成, failed=失败',
        index: true
    },
    total_commissions: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '总佣金记录数'
    },
    total_amount: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00,
        comment: '总结算金额'
    },
    approved_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '已批准数量'
    },
    rejected_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '已拒绝数量'
    },
    settled_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '已结算数量'
    },
    settled_amount: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00,
        comment: '实际结算金额'
    },
    operator_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '操作员ID（手动结算时记录）'
    },
    started_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '开始处理时间'
    },
    completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '完成时间'
    },
    error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '错误信息（失败时记录）'
    },
    remark: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '备注说明'
    },
    metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'JSON元数据（统计信息、处理详情等）'
    }
}, {
    tableName: 'commission_settlements',
    timestamps: true,
    indexes: [
        { fields: ['status', 'created_at'] },
        { fields: ['period_start', 'period_end'] },
        { fields: ['settlement_type'] }
    ]
});

/**
 * 静态方法：创建新的结算批次
 */
CommissionSettlement.createBatch = async function({ period_start, period_end, settlement_type = 'auto', operator_id = null, remark = null }) {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const count = await CommissionSettlement.count({
        where: {
            settlement_no: { [sequelize.Sequelize.Op.like]: `STL${today}%` }
        }
    });
    const settlement_no = `STL${today}${String(count + 1).padStart(3, '0')}`;

    return await CommissionSettlement.create({
        settlement_no,
        settlement_type,
        period_start,
        period_end,
        operator_id,
        remark
    });
};

/**
 * 实例方法：更新统计信息
 */
CommissionSettlement.prototype.updateStats = async function(stats) {
    this.total_commissions = stats.total_commissions || this.total_commissions;
    this.total_amount = stats.total_amount || this.total_amount;
    this.approved_count = stats.approved_count || this.approved_count;
    this.rejected_count = stats.rejected_count || this.rejected_count;
    this.settled_count = stats.settled_count || this.settled_count;
    this.settled_amount = stats.settled_amount || this.settled_amount;
    return await this.save();
};

/**
 * 实例方法：标记为处理中
 */
CommissionSettlement.prototype.markProcessing = async function() {
    this.status = 'processing';
    this.started_at = new Date();
    return await this.save();
};

/**
 * 实例方法：标记为完成
 */
CommissionSettlement.prototype.markCompleted = async function() {
    this.status = 'completed';
    this.completed_at = new Date();
    return await this.save();
};

/**
 * 实例方法：标记为失败
 */
CommissionSettlement.prototype.markFailed = async function(errorMessage) {
    this.status = 'failed';
    this.error_message = errorMessage;
    this.completed_at = new Date();
    return await this.save();
};

module.exports = CommissionSettlement;
