/**
 * ★ 全局业务常量集中管理
 * 
 * 所有业务参数统一在此配置，禁止在代码中硬编码数字。
 * 修改任何业务规则只需改这里一处，全局生效。
 * 
 * 未来可接入管理后台动态配置表 (config表)，实现热更新。
 */
require('dotenv').config();
const commissionIntervalMs = process.env.COMMISSION_SETTLE_INTERVAL
    ? parseInt(process.env.COMMISSION_SETTLE_INTERVAL, 10)
    : (parseInt(process.env.COMMISSION_SETTLEMENT_INTERVAL_HOURS || '1', 10) * 60 * 60 * 1000);

module.exports = {

    // ======================== 角色体系 ========================
    // 标准路径 (C/B)：C1=初级代理, C2=高级代理, B1=推广合伙人, B2=运营合伙人, B3=区域合伙人
    // N 路径（独立并行）：小n=N路径分销代理, 大N=N路径独立代理
    ROLES: {
        GUEST: 0,       // 普通用户/游客
        MEMBER: 1,      // C1 初级代理（购买299元产品升级）
        LEADER: 2,      // C2 高级代理
        AGENT: 3,       // B1 推广合伙人（¥3000入场）
        PARTNER: 4,     // B2 运营合伙人（¥30000）
        REGIONAL: 5,    // B3 区域合伙人（¥198000）
        N_MEMBER: 6,    // 小n — N路径分销代理（¥3000，由大N邀约）
        N_LEADER: 7,    // 大N — N路径独立代理（¥30000 或 10个小n）
    },

    ROLE_NAMES: {
        0: '普通用户',
        1: '初级代理',
        2: '高级代理',
        3: '推广合伙人',
        4: '运营合伙人',
        5: '区域合伙人',
        6: '小n代理',
        7: '大N独立代理',
    },

    // ======================== 升级条件 ========================
    UPGRADE_RULES: {
        // 普通用户 → C1：购买满299元产品
        GUEST_TO_MEMBER: {
            auto_on_purchase: true,
            min_purchase_amount: parseFloat(process.env.C1_MIN_PURCHASE || '299')
        },
        // C1 → C2：直推2个C1级别下线 + 销售满580元（C1推2个C1自动升C2）
        MEMBER_TO_LEADER: {
            referee_count: parseInt(process.env.LEADER_UPGRADE_REFEREE || '2'),
            referee_min_level: 1,
            min_sales_amount: parseFloat(process.env.C2_MIN_SALES || '580')
        },
        // C2 → B1：推荐10个C2 或 缴纳3000元
        LEADER_TO_AGENT: {
            referee_count_at_level: parseInt(process.env.B1_UPGRADE_REFEREE || '10'),
            referee_min_level: 2,
            recharge_amount: parseFloat(process.env.AGENT_UPGRADE_RECHARGE || '3000')
        },
        // B1 → B2：推荐10个B1 或 缴纳30000元
        AGENT_TO_PARTNER: {
            referee_count_at_level: parseInt(process.env.B2_UPGRADE_REFEREE || '10'),
            referee_min_level: 3,
            recharge_amount: parseFloat(process.env.B2_UPGRADE_RECHARGE || '30000')
        },
        // B2 → B3：缴纳198000元
        PARTNER_TO_REGIONAL: {
            recharge_amount: parseFloat(process.env.B3_UPGRADE_RECHARGE || '198000')
        },
        // ── N 路径 ──
        // 加入小n：被大N邀约，缴纳3000元入场
        N_JOIN: {
            recharge_amount: parseFloat(process.env.N_JOIN_RECHARGE || '3000'),
        },
        // 小n → 大N：直充3万，或名下累计10个已完成入场的小n
        N_MEMBER_TO_LEADER: {
            recharge_amount: parseFloat(process.env.N_UPGRADE_RECHARGE || '30000'),
            team_member_count: parseInt(process.env.N_UPGRADE_TEAM_COUNT || '10'),
        },
    },

    // ======================== N 路径专项配置 ========================
    N_SYSTEM: {
        // 小n升级为大N时，原大N获得的一次性脱离奖励比例
        SEPARATION_BONUS_RATE: parseFloat(process.env.N_SEPARATION_BONUS_RATE || '0.10'),
        // 差价佣金：小n提货价 - 大N提货价，差额归大N（进可提现余额）
        // 实际差价由 purchase_level_config 中 n_member / n_leader 两档价格决定
        PRICE_GAP_TO_LEADER_BALANCE: true,
    },

    // ======================== 佣金体系 ========================
    COMMISSION: {
        // T+N 天后佣金可结算（冻结天数）
        // ★ 必须 >= REFUND.MAX_REFUND_DAYS，否则佣金已结算但用户仍可申请退款导致坏账
        FREEZE_DAYS: parseInt(process.env.COMMISSION_FREEZE_DAYS || '15'),

        // 定时结算间隔（毫秒），默认1小时
        SETTLE_INTERVAL_MS: commissionIntervalMs,

        // 佣金精度：保留小数位数
        DECIMAL_PLACES: 2,
    },

    // ======================== 提现配置 ========================
    WITHDRAWAL: {
        // 最低提现金额
        MIN_AMOUNT: parseFloat(process.env.MIN_WITHDRAWAL_AMOUNT || process.env.WITHDRAWAL_MIN_AMOUNT || '10'),
        // 提现手续费比例 (0.006 = 0.6%)；百分比部分与 FEE_CAP_MAX 取 min 作为单笔实收手续费
        FEE_RATE: parseFloat(process.env.WITHDRAWAL_FEE_RATE || '0'),
        // 单笔手续费封顶（元），0 表示不封顶
        FEE_CAP_MAX: parseFloat(process.env.WITHDRAWAL_FEE_CAP_MAX || '0'),
        // 单日最大提现次数
        MAX_DAILY_COUNT: parseInt(process.env.MAX_DAILY_WITHDRAWAL || process.env.WITHDRAWAL_MAX_DAILY_COUNT || '3'),
        // 单次最大提现金额
        MAX_SINGLE_AMOUNT: parseFloat(process.env.MAX_WITHDRAWAL_AMOUNT || process.env.WITHDRAWAL_MAX_SINGLE_AMOUNT || '50000'),
    },

    // ======================== 安全配置 ========================
    SECURITY: {
        // JWT 密钥（所有环境都必须通过 .env 设置强密钥）
        // 使用弱默认值以便在启动检查时能捕获
        JWT_SECRET: process.env.JWT_SECRET || 'INSECURE-DEFAULT-user-secret-key',
        JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
        ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET || 'INSECURE-DEFAULT-admin-secret-key',
        ADMIN_JWT_EXPIRES_IN: process.env.ADMIN_JWT_EXPIRES_IN || '8h',

        // API限流
        API_RATE_LIMIT: parseInt(process.env.API_RATE_LIMIT || '100'),       // 每分钟每IP
        LOGIN_RATE_LIMIT: parseInt(process.env.LOGIN_RATE_LIMIT || '10'),    // 登录每分钟每IP
        WITHDRAWAL_RATE_LIMIT: parseInt(process.env.WITHDRAWAL_RATE_LIMIT || '5'), // 提现每分钟

        // 请求体大小限制
        BODY_SIZE_LIMIT: process.env.BODY_SIZE_LIMIT || '10mb',
    },

    // ======================== 用户与账号维护 ========================
    USER: {
        // 小程序内可用的本地路径或 HTTPS 完整地址
        DEFAULT_AVATAR_URL: (process.env.USER_DEFAULT_AVATAR_URL || '/assets/images/default-avatar.svg').trim(),
        /** 清理「长期未活跃、无任何业务痕迹」的纯游客；距最后登录超过该天数则参与检查。0=关闭 */
        IDLE_GUEST_PURGE_DAYS: parseInt(process.env.USER_IDLE_GUEST_PURGE_DAYS || '7', 10),
    },

    // ======================== 订单配置 ========================
    ORDER: {
        // 未支付自动取消时间（分钟）
        AUTO_CANCEL_MINUTES: parseInt(process.env.ORDER_AUTO_CANCEL_MINUTES || '30'),
        // 自动确认收货天数
        AUTO_CONFIRM_DAYS: parseInt(process.env.ORDER_AUTO_CONFIRM_DAYS || '15'),
        // ★ 代理商订单超时时间（小时）：超时未处理自动转为平台发货
        AGENT_TIMEOUT_HOURS: parseInt(process.env.AGENT_ORDER_TIMEOUT_HOURS || '24'),
    },

    // ======================== 购物袋（Cart）配置 ========================
    CART: {
        // 单个商品最大购买数量
        MAX_ITEM_QUANTITY: parseInt(process.env.CART_MAX_ITEM_QUANTITY || '99'),
    },

    // ======================== 售后配置 ========================
    REFUND: {
        // 确认收货后可申请售后的天数（★ 必须 <= COMMISSION.FREEZE_DAYS，防止佣金已结算但仍可退款）
        MAX_REFUND_DAYS: parseInt(process.env.REFUND_MAX_DAYS || '15'),
    },

    // ======================== 管理员配置 ========================
    ADMIN: {
        // 管理员用户ID（用于接收系统通知，如退款申请、提现申请）
        // 数据库中 user_id=0 表示系统/管理员，由此常量统一管理，禁止在代码中硬编码
        USER_ID: parseInt(process.env.ADMIN_USER_ID || '0'),
    },

    // ======================== 调试开关 ========================
    DEBUG: {
        // 是否启用调试路由（默认关闭，必须显式启用）
        ENABLE_DEBUG_ROUTES: process.env.ENABLE_DEBUG_ROUTES === 'true',
        // 是否启用测试接口（默认关闭，必须显式启用）
        ENABLE_TEST_ROUTES: process.env.ENABLE_TEST_ROUTES === 'true',
        // 是否允许 x-openid 直接认证（仅开发环境且显式启用）
        ALLOW_OPENID_AUTH: process.env.NODE_ENV === 'development' && process.env.ALLOW_OPENID_AUTH === 'true',
    },
};
