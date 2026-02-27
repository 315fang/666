const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Order = sequelize.define('Order', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    order_no: {
        type: DataTypes.STRING(50),
        unique: true,
        allowNull: false,
        comment: '订单号'
    },
    buyer_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '购买者ID'
    },
    distributor_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '分销商ID'
    },
    distributor_role: {
        type: DataTypes.TINYINT,
        allowNull: true,
        comment: '下单时分销商角色（锁定）'
    },
    product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '商品ID'
    },
    quantity: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        comment: '数量'
    },
    total_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '订单总金额'
    },
    actual_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '实际支付价格'
    },
    fulfillment_type: {
        type: DataTypes.STRING(20),
        comment: '履约类型: Company/Partner'
    },
    fulfillment_partner_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '实际发货的Partner ID'
    },
    agent_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '所属代理商ID（团队归属）'
    },
    tracking_no: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '物流单号'
    },
    logistics_company: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '物流公司代码（SF/YTO/ZTO/YD/EMS等）'
    },
    status: {
        type: DataTypes.STRING(20),
        defaultValue: 'pending',
        comment: '订单状态: pending/paid/agent_confirmed/shipping_requested/shipped/completed/cancelled/refunded'
    },
    sku_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'SKU ID'
    },
    address_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '收货地址ID'
    },
    // ★ 地址快照：创建订单时冻结的收货信息，不受用户后续修改/删除影响
    address_snapshot: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '收货地址快照（JSON）',
        get() {
            const rawValue = this.getDataValue('address_snapshot');
            if (!rawValue) return null;
            try { return JSON.parse(rawValue); } catch (e) { return null; }
        },
        set(value) {
            this.setDataValue('address_snapshot', value ? JSON.stringify(value) : null);
        }
    },
    remark: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '订单备注'
    },
    paid_at: {
        type: DataTypes.DATE,
        comment: '支付时间'
    },
    agent_confirmed_at: {
        type: DataTypes.DATE,
        comment: '代理人确认时间'
    },
    shipping_requested_at: {
        type: DataTypes.DATE,
        comment: '申请发货时间'
    },
    shipped_at: {
        type: DataTypes.DATE,
        comment: '发货时间'
    },
    completed_at: {
        type: DataTypes.DATE,
        comment: '完成时间'
    },
    settlement_at: {
        type: DataTypes.DATE,
        comment: '佣金结算时间（完成后+7天）'
    },
    commission_settled: {
        type: DataTypes.TINYINT,
        defaultValue: 0,
        comment: '佣金是否已结算: 0-未结算, 1-已结算'
    },
    // ★ 记录支付时中间层级的佣金总额，供发货时计算代理商利润
    middle_commission_total: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00,
        comment: '中间层级佣金总额（发货利润扣除用）'
    },
    // ★ 运费字段（预留），当前包邮模式默认为 0，后续可按区域计算
    shipping_fee: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00,
        comment: '运费金额，包邮为0'
    },
    // ★ 下单时是否扣了平台库存（代理商云库存兜底下单时为 false，发货时不需要补回平台库存）
    platform_stock_deducted: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '创建订单时是否扣了平台库存: 1-已扣, 0-未扣（走代理商云库存）'
    },
    // ★ 锁定下单时的代理商进货成本单价，防止发货时价格变动导致利润计算偏差
    locked_agent_cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '下单时锁定的代理商进货价（单价），发货利润以此为准'
    },
    // ★ 拆单支持：当代理商库存不足以覆盖整单时，拆为两个子订单
    parent_order_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '父订单ID（拆单时子订单指向父订单）'
    },
    // ★ Phase 2：优惠券字段
    coupon_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '使用的优惠券ID（user_coupons.id）'
    },
    coupon_discount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00,
        comment: '优惠券抵扣金额'
    },
    // ★ Phase 2：积分抵扣字段
    points_used: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '本单消耗积分数量'
    },
    points_discount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00,
        comment: '积分抵扣金额（points_used × 0.1 元/积分）'
    },
    // ★ Phase 2：成长值折扣（下单时锁定，防止后续等级变化影响历史订单）
    member_discount_rate: {
        type: DataTypes.DECIMAL(4, 2),
        defaultValue: 1.00,
        comment: '下单时锁定的会员折扣比例'
    },
    // ★ Phase 4：自提核销字段
    delivery_type: {
        type: DataTypes.ENUM('express', 'pickup'),
        defaultValue: 'express',
        comment: '配送方式: express=快递, pickup=到店自提'
    },
    pickup_station_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '自提服务站点ID'
    },
    pickup_code: {
        type: DataTypes.STRING(16),
        allowNull: true,
        comment: '16位大写字母数字核销码（工人手动输入用）'
    },
    pickup_qr_token: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: '二维码扫码颞面token（SHA256）'
    },
    verified_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '自提核销完成时间'
    }
}, {
    tableName: 'orders',
    timestamps: true
});

module.exports = Order;
