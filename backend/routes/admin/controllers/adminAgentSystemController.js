/**
 * 代理体系管理控制器 — 问兰代理体系4.0/3.0完整落地
 * 所有配置存储在 app_configs 表，所有数字参数可在后台动态调节，所有模块支持独立开关。
 */
const { AppConfig } = require('../../../models');
const DividendService = require('../../../services/DividendService');
const AgentWalletService = require('../../../services/AgentWalletService');

const CONFIG_KEYS = {
    UPGRADE_RULES: 'agent_system_upgrade_rules',
    COMMISSION: 'agent_system_commission',   // 含佣金比例 + 成本结构，统一存一个 key
    PEER_BONUS: 'agent_system_peer_bonus',
    ASSIST_BONUS: 'agent_system_assist_bonus',
    FUND_POOL: 'agent_system_fund_pool',
    DIVIDEND_RULES: 'agent_system_dividend_rules',
    EXIT_RULES: 'agent_system_exit_rules',
    RECHARGE_CONFIG: 'agent_system_recharge_config'
};

// ===== 默认值（与计划书4.0/3.0对齐）=====

const DEFAULT_UPGRADE_RULES = {
    enabled: true,
    c1_min_purchase: 299,
    c2_referee_count: 2, c2_min_sales: 580,
    b1_referee_count: 10, b1_recharge: 3000,
    b2_referee_count: 10, b2_recharge: 30000,
    b3_recharge: 198000
};

/**
 * 佣金配置默认值
 *
 * 佣金部分：直推/二级/三级均为「占订单实付 %」（0–100 整数）
 * 成本结构部分：内部核算四维，不参与自动佣金计算
 * 上级代理协助奖（固定元/单）在独立的 DEFAULT_ASSIST_BONUS
 */
const DEFAULT_COMMISSION = {
    /** true=默认平台发货；false=按代理可用库存优先走代理发货 */
    default_platform_fulfillment: true,
    /** false=百分比模式（推荐）；true=级差模式（依赖商品多级价） */
    use_price_gap_middle_commission: false,
    /** 直推上级按其 role_level 拿实付的百分之几（0–100） */
    direct_pct_by_role: { 1: 20, 2: 30, 3: 40, 4: 40 },
    /** 二级上级（上上级）按其 role_level 拿实付的百分之几 */
    indirect_pct_by_role: { 2: 5, 3: 8 },
    /** 三级有效比例 = 二级比例 × tertiary_pct_factor / 100 */
    tertiary_pct_factor: 50,
    /** 级差模式下每跳占实付百分比（use_price_gap_middle_commission=true 时生效） */
    agent_layer_between_pct: 3,
    /** B端拿货折扣率（小数，0.60 = 6折） */
    agent_cost_discount_rate: 0.60,
    /** 成本结构：内部核算四维，不影响佣金分配 */
    cost_split: {
        direct_sales_pct: 40,      // 直销收益（代理层佣金总额）
        operations_pct: 25,        // 运营成本（物流/仓储/损耗等）
        mirror_operations_pct: 5,  // 镜像运营成本（海报/招商/会晤等）
        profit_pct: 30             // 利润
    }
};

const DEFAULT_PEER_BONUS = {
    enabled: true,
    level_1: 20, level_2: 50, level_3: 100, level_4: 2000, level_5: 5000,
    product_sets_3: 2, product_sets_4: 15, product_sets_5: 20
};

const DEFAULT_ASSIST_BONUS = {
    enabled: true,
    tiers: [
        { max_orders: 30, bonus: 40 },
        { max_orders: 50, bonus: 50 },
        { max_orders: 100, bonus: 60 }
    ]
};

const DEFAULT_FUND_POOL = {
    enabled: true,
    b1: { total: 480, mirror_ops_pct: 42, travel_pct: 31, parent_pct: 11, personal_pct: 16 },
    b2: { total: 4600, mirror_ops_pct: 42, travel_pct: 31, parent_pct: 11, personal_pct: 16 },
    b3: { total: 0, mirror_ops_pct: 42, travel_pct: 31, parent_pct: 11, personal_pct: 16 }
};

const DEFAULT_DIVIDEND_RULES = {
    enabled: true,
    min_months: 2,
    source_pct: 3,
    b_team_award: {
        enabled: true,
        pool_pct: 2,
        ranks: [
            { rank: 1, count: 1, pct: 1.0, label: '冠军' },
            { rank: 2, count: 2, pct: 0.6, label: '亚军' },
            { rank: 3, count: 3, pct: 0.4, label: '季军' }
        ]
    },
    b1_personal_award: {
        enabled: true,
        pool_pct: 1,
        ranks: [
            { rank: 1, count: 1, pct: 0.5, label: '冠军' },
            { rank: 2, count: 2, pct: 0.3, label: '亚军' },
            { rank: 3, count: 3, pct: 0.2, label: '季军' }
        ]
    }
};

const DEFAULT_RECHARGE_CONFIG = {
    preset_amounts: [100, 300, 500, 1000, 2000, 5000],
    bonus_enabled: false,
    bonus_tiers: [
        { min: 1000, bonus: 50 },
        { min: 3000, bonus: 200 },
        { min: 5000, bonus: 500 }
    ]
};

const DEFAULT_EXIT_RULES = {
    enabled: true,
    under_1_year_min_days: 60,
    under_1_year_max_days: 90,
    over_1_year_min_days: 45,
    over_1_year_max_days: 60,
    refund_scope: '仅退本人后台账户余额（货款余额+佣金余额），不含利息及其他费用',
    auto_revoke_identity: true
};

// ===== 通用读写 =====

async function getConfig(key, fallback) {
    const row = await AppConfig.findOne({ where: { config_key: key, status: 1 } });
    if (row && row.config_value) {
        try { return { ...fallback, ...JSON.parse(row.config_value) }; } catch (_) {}
    }
    return fallback;
}

async function setConfig(key, value, category = 'agent_system') {
    const [row] = await AppConfig.findOrCreate({
        where: { config_key: key },
        defaults: { config_value: JSON.stringify(value), config_type: 'json', category, status: 1 }
    });
    row.config_value = JSON.stringify(value);
    await row.save();
}

function makeHandler(configKey, defaultVal) {
    return {
        get: async (req, res) => {
            try {
                const data = await getConfig(configKey, defaultVal);
                res.json({ code: 0, data });
            } catch (e) { res.status(500).json({ code: -1, message: e.message }); }
        },
        update: async (req, res) => {
            try {
                await setConfig(configKey, req.body);
                res.json({ code: 0, message: '保存成功' });
            } catch (e) { res.status(500).json({ code: -1, message: e.message }); }
        }
    };
}

// ===== 各模块 CRUD =====

const upgradeHandler = makeHandler(CONFIG_KEYS.UPGRADE_RULES, DEFAULT_UPGRADE_RULES);
exports.getUpgradeRules = upgradeHandler.get;
exports.updateUpgradeRules = upgradeHandler.update;

const commissionHandler = makeHandler(CONFIG_KEYS.COMMISSION, DEFAULT_COMMISSION);

/** 旧版「元/单」配置迁移为百分比展示（参考客单价 400 元换算，仅当未配置 direct_pct_by_role 时） */
function migrateCommissionYuanToPct(data) {
    const out = { ...data };
    const ref = 400;
    const hasPct = out.direct_pct_by_role && typeof out.direct_pct_by_role === 'object'
        && Object.keys(out.direct_pct_by_role).length > 0;
    if (!hasPct && (out.c1_direct != null || out.c2_direct != null)) {
        out.direct_pct_by_role = {
            1: Math.min(100, Math.round(((Number(out.c1_direct) || 0) / ref) * 1000) / 10),
            2: Math.min(100, Math.round(((Number(out.c2_direct) || 0) / ref) * 1000) / 10),
            3: Math.min(100, Math.round(((Number(out.b1_direct) || 0) / ref) * 1000) / 10),
            4: Math.min(100, Math.round(((Number(out.b2_direct) || 0) / ref) * 1000) / 10)
        };
    }
    if ((!out.indirect_pct_by_role || !Object.keys(out.indirect_pct_by_role).length)
        && (out.c2_team != null || out.b1_team != null)) {
        out.indirect_pct_by_role = {
            2: Math.min(100, Math.round(((Number(out.c2_team) || 0) / ref) * 1000) / 10),
            3: Math.min(100, Math.round(((Number(out.b1_team) || 0) / ref) * 1000) / 10)
        };
    }
    return out;
}

exports.getCommissionConfig = async (req, res) => {
    try {
        let data = await getConfig(CONFIG_KEYS.COMMISSION, DEFAULT_COMMISSION);
        data = migrateCommissionYuanToPct(data);
        // 确保布尔值明确：新配置默认 false（百分比分配）；旧数据如需保留级差行为请手动设为 true
        if (data.use_price_gap_middle_commission === undefined || data.use_price_gap_middle_commission === null) {
            data.use_price_gap_middle_commission = false;
        }
        if (data.default_platform_fulfillment === undefined || data.default_platform_fulfillment === null) {
            data.default_platform_fulfillment = true;
        }
        // 注：该字段不再暴露给运营界面，仅在 JSON 层面保留用于技术排查
        // 确保 cost_split 有默认结构（旧数据可能没有该字段）
        if (!data.cost_split || typeof data.cost_split !== 'object') {
            data.cost_split = DEFAULT_COMMISSION.cost_split;
        }
        res.json({ code: 0, data });
    } catch (e) {
        res.status(500).json({ code: -1, message: e.message });
    }
};
exports.updateCommissionConfig = commissionHandler.update;

const peerHandler = makeHandler(CONFIG_KEYS.PEER_BONUS, DEFAULT_PEER_BONUS);
exports.getPeerBonusConfig = peerHandler.get;
exports.updatePeerBonusConfig = peerHandler.update;

const assistHandler = makeHandler(CONFIG_KEYS.ASSIST_BONUS, DEFAULT_ASSIST_BONUS);
exports.getAssistBonusConfig = assistHandler.get;
exports.updateAssistBonusConfig = assistHandler.update;

const fundPoolHandler = makeHandler(CONFIG_KEYS.FUND_POOL, DEFAULT_FUND_POOL);
exports.getFundPoolConfig = fundPoolHandler.get;
exports.updateFundPoolConfig = fundPoolHandler.update;

const dividendRulesHandler = makeHandler(CONFIG_KEYS.DIVIDEND_RULES, DEFAULT_DIVIDEND_RULES);
exports.getDividendRules = dividendRulesHandler.get;
exports.updateDividendRules = dividendRulesHandler.update;

const exitRulesHandler = makeHandler(CONFIG_KEYS.EXIT_RULES, DEFAULT_EXIT_RULES);
exports.getExitRules = exitRulesHandler.get;
exports.updateExitRules = exitRulesHandler.update;

const rechargeConfigHandler = makeHandler(CONFIG_KEYS.RECHARGE_CONFIG, DEFAULT_RECHARGE_CONFIG);
exports.getRechargeConfig = rechargeConfigHandler.get;
exports.updateRechargeConfig = rechargeConfigHandler.update;

// ===== 年终分红 - 预览/执行 =====

exports.getDividendPreview = async (req, res) => {
    try {
        const { year, pool } = req.query;
        if (!year || !pool) return res.status(400).json({ code: -1, message: '请提供年份和分红池金额' });
        const data = await DividendService.previewDividend(Number(year), Number(pool));
        res.json({ code: 0, data });
    } catch (e) { res.status(500).json({ code: -1, message: e.message }); }
};

exports.executeDividend = async (req, res) => {
    try {
        const { year, pool } = req.body;
        if (!year || !pool) return res.status(400).json({ code: -1, message: '请提供年份和分红池金额' });
        const data = await DividendService.executeDividend(Number(year), Number(pool), req.admin?.id);
        res.json({ code: 0, data, message: '分红发放完成' });
    } catch (e) { res.status(500).json({ code: -1, message: e.message }); }
};

// ===== 合伙人退出（系统化流程）=====

const { User, PartnerExitApplication, AgentWalletAccount } = require('../../../models');

exports.getExitApplications = async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const where = {};
        if (status) where.status = status;
        const { count, rows } = await PartnerExitApplication.findAndCountAll({
            where,
            include: [{ model: User, as: 'user', attributes: ['id', 'nickname', 'avatar_url', 'phone', 'role_level'] }],
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        });
        res.json({ code: 0, data: { list: rows, total: count } });
    } catch (e) { res.status(500).json({ code: -1, message: e.message }); }
};

exports.createExitApplication = async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const { reason } = req.body;
        if (!userId) return res.status(400).json({ code: -1, message: '用户ID无效' });

        const user = await User.findByPk(userId);
        if (!user || user.role_level < 3) return res.status(400).json({ code: -1, message: '该用户不是合伙人' });

        const existing = await PartnerExitApplication.findOne({
            where: { user_id: userId, status: ['pending', 'approved', 'finance_pending'] }
        });
        if (existing) return res.json({ code: -1, message: '已有进行中的退出申请' });

        const walletAccount = await AgentWalletAccount.findOne({ where: { user_id: userId } });
        const walletBalance = walletAccount ? parseFloat(walletAccount.balance || 0) : 0;
        const userBalance = parseFloat(user.balance || 0);

        const app = await PartnerExitApplication.create({
            user_id: userId,
            role_level_before: user.role_level,
            reason: reason || '',
            refund_wallet: walletBalance,
            refund_balance: userBalance,
            refund_total: parseFloat((walletBalance + userBalance).toFixed(2)),
            status: 'pending',
            registered_at: user.joined_team_at || user.created_at
        });

        res.json({ code: 0, data: app, message: '退出申请已创建' });
    } catch (e) { res.status(500).json({ code: -1, message: e.message }); }
};

exports.reviewExitApplication = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, remark } = req.body;
        const app = await PartnerExitApplication.findByPk(id);
        if (!app) return res.status(404).json({ code: -1, message: '申请不存在' });

        if (action === 'approve' && app.status === 'pending') {
            const data = await AgentWalletService.processPartnerExit(app.user_id, req.admin?.id, app.reason);
            app.status = 'finance_pending';
            app.admin_id = req.admin?.id;
            app.admin_remark = remark || '';
            app.reviewed_at = new Date();
            app.refund_wallet = data.walletRefund;
            app.refund_balance = data.balanceRefund;
            app.refund_total = data.refundAmount;
            await app.save();
            res.json({ code: 0, data: app, message: '已审核通过，待财务打款' });
        } else if (action === 'complete' && app.status === 'finance_pending') {
            app.status = 'completed';
            app.finance_completed_at = new Date();
            app.admin_remark = [app.admin_remark, remark].filter(Boolean).join(' | ');
            await app.save();
            res.json({ code: 0, message: '已标记打款完成' });
        } else if (action === 'reject' && app.status === 'pending') {
            app.status = 'rejected';
            app.admin_id = req.admin?.id;
            app.admin_remark = remark || '';
            app.reviewed_at = new Date();
            await app.save();
            res.json({ code: 0, message: '已驳回' });
        } else {
            res.status(400).json({ code: -1, message: '操作无效或状态不匹配' });
        }
    } catch (e) { res.status(500).json({ code: -1, message: e.message }); }
};
