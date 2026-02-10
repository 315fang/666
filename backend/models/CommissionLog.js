const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * 佣金日志模型
 * 
 * 状态流转：
 * frozen(冻结) → pending_approval(待审批,售后期结束后) → approved(审批通过) → settled(已结算到账)
 *            ↘ cancelled(因退款/拒绝取消)
 * 
 * 业务规则：
 * 1. 发货时产生佣金，状态为 frozen
 * 2. 确认收货后设置 refund_deadline（售后期结束时间）
 * 3. 定时任务检查：售后期结束 + 无退款申请 → 状态变为 pending_approval
 * 4. 管理员手动审批 → approved → 自动结算 → settled（到账）
 */
const CommissionLog = sequelize.define('CommissionLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '订单ID'
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '获得佣金的用户ID'
    },
    amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '佣金金额'
    },
    type: {
        type: DataTypes.STRING(20),
        comment: '佣金类型: gap(级差)/agent_fulfillment(代理商发货利润)/direct(直推)/indirect(间推)'
    },
    status: {
        type: DataTypes.STRING(20),
        defaultValue: 'frozen',
        comment: '佣金状态: frozen(冻结)/pending_approval(待审批)/approved(审批通过)/settled(已结算)/cancelled(已取消)'
    },
    remark: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '备注说明'
    },
    // ★ 售后期结束时间（过了这个时间 + 无退款 → 进入待审批）
    refund_deadline: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '售后期结束时间（确认收货后N天）'
    },
    // ★ 可提现时间（审批通过后设置）
    available_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '可结算时间（审批通过后设置）'
    },
    // ★ 审批相关字段
    approved_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '审批管理员ID'
    },
    approved_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '审批时间'
    },
    // ★ 结算时间
    settled_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '实际结算到账时间'
    }
}, {
    tableName: 'commission_logs',
    timestamps: true
});

module.exports = CommissionLog;
