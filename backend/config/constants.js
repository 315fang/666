/**
 * ★ 全局业务常量集中管理
 * 
 * 所有业务参数统一在此配置，禁止在代码中硬编码数字。
 * 修改任何业务规则只需改这里一处，全局生效。
 * 
 * 未来可接入管理后台动态配置表 (config表)，实现热更新。
 */
require('dotenv').config();

function getEnvValue(keys, fallback) {
    for (const key of keys) {
        const value = process.env[key];
        if (value !== undefined && value !== '') {
            return value;
        }
    }
    return fallback;
}

function getIntEnv(keys, fallback) {
    return parseInt(getEnvValue(keys, fallback), 10);
}

function getFloatEnv(keys, fallback) {
    return parseFloat(getEnvValue(keys, fallback));
}

function getIntervalMsEnv(msKeys, hourKeys, fallbackMs) {
    const directMs = getEnvValue(msKeys, '');
    if (directMs !== '') {
        return parseInt(directMs, 10);
    }

    const hours = getEnvValue(hourKeys, '');
    if (hours !== '') {
        return parseInt(hours, 10) * 60 * 60 * 1000;
    }

    return fallbackMs;
}

module.exports = {

    // ======================== 角色体系 ========================
    ROLES: {
        GUEST: 0,       // 普通用户/游客
        MEMBER: 1,      // 会员（购买后自动升级）
        LEADER: 2,      // 团长
        AGENT: 3,       // 代理商/合伙人
    },

    ROLE_NAMES: {
        0: '普通用户',
        1: '会员',
        2: '团长',
        3: '代理商',
    },

    // ======================== 升级条件 ========================
    UPGRADE_RULES: {
        // 普通用户 → 会员：购买任意商品即升级
        GUEST_TO_MEMBER: { auto_on_purchase: true },
        // 会员 → 团长：直推人数 >= N
        MEMBER_TO_LEADER: { referee_count: parseInt(process.env.LEADER_UPGRADE_REFEREE || '2') },
        // 团长 → 代理商：累计订单数 >= N 或 充值金额 >= N
        LEADER_TO_AGENT: {
            order_count: parseInt(process.env.AGENT_UPGRADE_ORDERS || '10'),
            recharge_amount: parseFloat(process.env.AGENT_UPGRADE_RECHARGE || '3000')
        },
    },

    // ======================== 佣金体系 ========================
    COMMISSION: {
        // T+N 天后佣金可结算（冻结天数）
        // ★ 必须 >= REFUND.MAX_REFUND_DAYS，否则佣金已结算但用户仍可申请退款导致坏账
        FREEZE_DAYS: getIntEnv(['COMMISSION_FREEZE_DAYS'], '15'),

        // 定时结算间隔（毫秒），默认1小时
        SETTLE_INTERVAL_MS: getIntervalMsEnv(
            ['COMMISSION_SETTLE_INTERVAL'],
            ['COMMISSION_SETTLEMENT_INTERVAL_HOURS'],
            60 * 60 * 1000
        ),

        // 佣金精度：保留小数位数
        DECIMAL_PLACES: 2,
    },

    // ======================== 提现配置 ========================
    WITHDRAWAL: {
        // 最低提现金额
        MIN_AMOUNT: getFloatEnv(['MIN_WITHDRAWAL_AMOUNT', 'WITHDRAWAL_MIN_AMOUNT'], '10'),
        // 提现手续费比例 (0.006 = 0.6%)
        FEE_RATE: getFloatEnv(['WITHDRAWAL_FEE_RATE'], '0'),
        // 单日最大提现次数
        MAX_DAILY_COUNT: getIntEnv(['MAX_DAILY_WITHDRAWAL', 'WITHDRAWAL_MAX_DAILY_COUNT'], '3'),
        // 单次最大提现金额
        MAX_SINGLE_AMOUNT: getFloatEnv(['MAX_WITHDRAWAL_AMOUNT', 'WITHDRAWAL_MAX_SINGLE_AMOUNT'], '50000'),
    },

    // ======================== 安全配置 ========================
    SECURITY: {
        // JWT 密钥（所有环境都必须通过 .env 设置强密钥）
        // 生产环境禁止使用默认值，必须显式配置
        JWT_SECRET: (() => {
            const secret = process.env.JWT_SECRET;
            if (!secret || secret === 'INSECURE-DEFAULT-user-secret-key') {
                if (process.env.NODE_ENV === 'production') {
                    throw new Error('【安全错误】生产环境必须配置 JWT_SECRET 环境变量，禁止使用默认值');
                }
                console.warn('【警告】JWT_SECRET 使用默认值，仅限开发环境使用');
                return 'INSECURE-DEV-ONLY-' + Date.now();
            }
            return secret;
        })(),
        JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
        ADMIN_JWT_SECRET: (() => {
            const secret = process.env.ADMIN_JWT_SECRET;
            if (!secret || secret === 'INSECURE-DEFAULT-admin-secret-key') {
                if (process.env.NODE_ENV === 'production') {
                    throw new Error('【安全错误】生产环境必须配置 ADMIN_JWT_SECRET 环境变量，禁止使用默认值');
                }
                console.warn('【警告】ADMIN_JWT_SECRET 使用默认值，仅限开发环境使用');
                return 'INSECURE-DEV-ONLY-' + Date.now();
            }
            return secret;
        })(),
        ADMIN_JWT_EXPIRES_IN: process.env.ADMIN_JWT_EXPIRES_IN || '8h',

        // API限流
        API_RATE_LIMIT: getIntEnv(['API_RATE_LIMIT'], '100'),       // 每分钟每IP
        LOGIN_RATE_LIMIT: getIntEnv(['LOGIN_RATE_LIMIT'], '10'),    // 登录每分钟每IP
        WITHDRAWAL_RATE_LIMIT: getIntEnv(['WITHDRAWAL_RATE_LIMIT'], '5'), // 提现每分钟

        // 请求体大小限制
        BODY_SIZE_LIMIT: process.env.BODY_SIZE_LIMIT || '10mb',
    },

    // ======================== 订单配置 ========================
    ORDER: {
        // 未支付自动取消时间（分钟）
        AUTO_CANCEL_MINUTES: getIntEnv(['ORDER_AUTO_CANCEL_MINUTES'], '30'),
        // 自动确认收货天数
        AUTO_CONFIRM_DAYS: getIntEnv(['ORDER_AUTO_CONFIRM_DAYS'], '15'),
        // ★ 代理商订单超时时间（小时）：超时未处理自动转为平台发货
        AGENT_TIMEOUT_HOURS: getIntEnv(['AGENT_ORDER_TIMEOUT_HOURS'], '24'),
        // 代理商申请发货时的库存预扣标记
        STOCK_RESERVE_MARKER: '[库存已预扣]',
    },

    // ======================== 购物车配置 ========================
    CART: {
        // 单个商品最大购买数量
        MAX_ITEM_QUANTITY: getIntEnv(['CART_MAX_ITEM_QUANTITY'], '99'),
    },

    // ======================== 售后配置 ========================
    REFUND: {
        // 确认收货后可申请售后的天数（★ 必须 <= COMMISSION.FREEZE_DAYS，防止佣金已结算但仍可退款）
        MAX_REFUND_DAYS: getIntEnv(['REFUND_MAX_DAYS'], '15'),
    },

    // ======================== 管理员配置 ========================
    ADMIN: {
        // 管理员用户ID（用于接收系统通知，如退款申请、提现申请）
        // 数据库中 user_id=0 表示系统/管理员，由此常量统一管理，禁止在代码中硬编码
        USER_ID: getIntEnv(['ADMIN_USER_ID'], '0'),
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
