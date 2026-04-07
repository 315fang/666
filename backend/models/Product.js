const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Product = sequelize.define('Product', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '商品名称'
    },
    category_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '类目ID'
    },
    description: {
        type: DataTypes.TEXT,
        comment: '商品描述'
    },
    images: {
        type: DataTypes.TEXT,
        comment: '商品图片URLs（JSON数组）',
        get() {
            const rawValue = this.getDataValue('images');
            if (rawValue == null || rawValue === '') return [];
            try {
                const v = JSON.parse(rawValue);
                return Array.isArray(v) ? v : [];
            } catch (_) {
                return [];
            }
        },
        set(value) {
            this.setDataValue('images', JSON.stringify(value));
        }
    },
    detail_images: {
        type: DataTypes.TEXT,
        comment: '商品详情图URLs（JSON数组，长图拼接展示）',
        get() {
            const rawValue = this.getDataValue('detail_images');
            if (rawValue == null || rawValue === '') return [];
            try {
                const v = JSON.parse(rawValue);
                return Array.isArray(v) ? v : [];
            } catch (_) {
                return [];
            }
        },
        set(value) {
            this.setDataValue('detail_images', value ? JSON.stringify(value) : null);
        }
    },
    retail_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '零售价 ¥299'
    },
    member_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '会员价（兼容旧字段）'
    },
    wholesale_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '批发价（兼容旧字段）'
    },
    price_member: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '会员价 ¥239'
    },
    price_leader: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '团长价 ¥209'
    },
    price_agent: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '代理价 ¥150'
    },
    cost_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '成本价/进货价 - 供应商给平台的价格'
    },
    supply_price_b1: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: 'B1 推广合伙人代理发货成本价'
    },
    supply_price_b2: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: 'B2 运营合伙人代理发货成本价'
    },
    supply_price_b3: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: 'B3 区域合伙人代理发货成本价'
    },
    commission_rate_1: {
        type: DataTypes.DECIMAL(4, 2),
        allowNull: true,
        comment: '一级分销比例 (e.g. 0.20), 空则用默认'
    },
    commission_rate_2: {
        type: DataTypes.DECIMAL(4, 2),
        allowNull: true,
        comment: '二级分销比例 (e.g. 0.10), 空则用默认'
    },
    commission_amount_1: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '一级分销固定金额 (e.g. 10.00), 优先于比例'
    },
    commission_amount_2: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '二级分销固定金额 (e.g. 5.00), 优先于比例'
    },
    commission_rate_3: {
        type: DataTypes.DECIMAL(4, 2),
        allowNull: true,
        comment: '三级分销比例 (e.g. 0.05), 空则用默认'
    },
    commission_amount_3: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '三级分销固定金额 (e.g. 3.00), 优先于比例'
    },
    ai_review_status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        defaultValue: 'pending',
        comment: 'AI审查状态'
    },
    ai_review_reason: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: 'AI审查原因'
    },
    stock: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '商品总库存'
    },
    status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '状态: 1-上架, 0-下架'
    },
    custom_commissions: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '段位定制佣金配置，例如 {"fixed": {"MEMBER": 10, "LEADER": 20}, "rate": {"AGENT": 0.15}}'
    },
    // ★ Phase 5：热度管理
    view_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '商品展示页访问次数'
    },
    purchase_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '近30天内购买单数（定期刷新）'
    },
    heat_score: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '热度分（purchase×40+view×10+manual×50，呢单排行用）'
    },
    manual_weight: {
        type: DataTypes.TINYINT,
        defaultValue: 0,
        comment: '后台手动热度权重 0-100，运营可干预榜单'
    },
    heat_updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '热度最近刷新时间'
    },
    market_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: null,
        comment: '市场价/原价（划线价）'
    },
    discount_exempt: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: '是否免于复购折扣（爆品/折扣商品设为true，下单时不叠加等级折扣）'
    },
    product_tag: {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: 'normal',
        comment: '商品标签: normal=普通, hot=爆品, discount=折扣品, new=新品'
    },
    supports_pickup: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: '是否支持到店自提 0否 1是'
    },
    visible_in_mall: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否在商城列表/搜索/热门等展示；false 时仍可供限时活动、下单详情等使用'
    },
    enable_coupon: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1,
        comment: '是否允许使用优惠券'
    },
    enable_group_buy: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: '是否参与拼团（需在拼团活动中关联）'
    }
}, {
    tableName: 'products',
    timestamps: true
});

module.exports = Product;
