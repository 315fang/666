/**
 * 分支代理策略（区域站点认领 + 自提门店补贴金等）
 */
const { AppConfig } = require('../models');
const { parseServiceStationRemark, normalizePickupTierKey } = require('./serviceStationRemark');

const POLICY_KEY = 'branch_agent_policy';

/** 自提核销补贴档位：每档 = 订单实付比例 + 固定金额（元），合计入账认领人余额 */
const DEFAULT_PICKUP_TIERS = {
    A: { rate: 0, fixed_yuan: 2 },
    B: { rate: 0.005, fixed_yuan: 1 },
    C: { rate: 0.01, fixed_yuan: 0 },
    D: { rate: 0.015, fixed_yuan: 1 }
};

function mergePickupTiersFromParsed(parsed) {
    const base = JSON.parse(JSON.stringify(DEFAULT_PICKUP_TIERS));
    const incoming = parsed && typeof parsed.pickup_tiers === 'object' ? parsed.pickup_tiers : null;
    if (!incoming) return base;
    for (const k of ['A', 'B', 'C', 'D']) {
        if (incoming[k] && typeof incoming[k] === 'object') {
            const rate = Math.min(1, Math.max(0, Number(incoming[k].rate) || 0));
            const fixed_yuan = Math.max(0, Number(incoming[k].fixed_yuan) || 0);
            base[k] = { rate, fixed_yuan };
        }
    }
    return base;
}

const DEFAULT_BRANCH_AGENT_POLICY = {
    enabled: false,
    min_apply_role_level: 3,
    type_commission_rate: {
        school: 0.01,
        area: 0.015,
        city: 0.02,
        province: 0.03
    },
    pickup_station_subsidy_enabled: false,
    /** 兼容旧配置：档位合计为 0 时仍可用此固定额（元） */
    pickup_station_subsidy_amount: 0,
    pickup_tiers: { ...DEFAULT_PICKUP_TIERS }
};

async function getBranchAgentPolicy() {
    const row = await AppConfig.findOne({
        where: { category: 'branch_agent', config_key: POLICY_KEY, status: 1 }
    });
    if (!row?.config_value) return { ...DEFAULT_BRANCH_AGENT_POLICY };
    try {
        const parsed = JSON.parse(row.config_value) || {};
        return {
            ...DEFAULT_BRANCH_AGENT_POLICY,
            ...parsed,
            enabled: parsed.enabled === true,
            pickup_station_subsidy_enabled: parsed.pickup_station_subsidy_enabled === true,
            pickup_station_subsidy_amount: Math.max(0, Number(parsed.pickup_station_subsidy_amount) || 0),
            type_commission_rate: {
                ...DEFAULT_BRANCH_AGENT_POLICY.type_commission_rate,
                ...(parsed.type_commission_rate || {})
            },
            pickup_tiers: mergePickupTiersFromParsed(parsed)
        };
    } catch (_) {
        return { ...DEFAULT_BRANCH_AGENT_POLICY };
    }
}

/**
 * 自提核销成功后给站点认领人的补贴（与运费无关）
 * @returns {{ amount: number, tierKey: string, ratePart: number, fixedPart: number, legacyFixed?: boolean }}
 */
function computePickupSubsidyForOrder(order, station, policy) {
    if (!policy || policy.pickup_station_subsidy_enabled !== true) {
        return { amount: 0, tierKey: 'A', ratePart: 0, fixedPart: 0 };
    }
    const meta = parseServiceStationRemark(station?.remark);
    const tierKey = normalizePickupTierKey(meta.pickup_commission_tier);
    const tiers = policy.pickup_tiers || DEFAULT_PICKUP_TIERS;
    const tier = tiers[tierKey] || tiers.A || DEFAULT_PICKUP_TIERS.A;
    const base = Number(order?.actual_price ?? order?.total_amount ?? 0);
    const rate = Math.min(1, Math.max(0, Number(tier.rate) || 0));
    const ratePart = Math.max(0, parseFloat((base * rate).toFixed(2)));
    const fixedPart = Math.max(0, Number(tier.fixed_yuan) || 0);
    let amount = parseFloat((ratePart + fixedPart).toFixed(2));
    if (amount <= 0 && Number(policy.pickup_station_subsidy_amount) > 0) {
        const legacy = Math.max(0, Number(policy.pickup_station_subsidy_amount));
        return { amount: legacy, tierKey, ratePart: 0, fixedPart: legacy, legacyFixed: true };
    }
    return { amount, tierKey, ratePart, fixedPart };
}

module.exports = {
    POLICY_KEY,
    DEFAULT_BRANCH_AGENT_POLICY,
    DEFAULT_PICKUP_TIERS,
    getBranchAgentPolicy,
    computePickupSubsidyForOrder,
    mergePickupTiersFromParsed
};
