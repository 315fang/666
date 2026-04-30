const {
    TIERS_BY_MIN,
    applyGrowthTierDisplayNames,
    calculateCumulativeGrowthPercent
} = require('../../utils/growthTierDisplay');

const DEFAULT_GROWTH_RULES = {
    purchase: {
        enabled: true,
        multiplier: 1,
        fixed: 0,
        use_original_amount: false
    }
};

function toFiniteNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function clampPercent(value) {
    return Math.max(0, Math.min(100, toFiniteNumber(value, 0)));
}

function resolveGrowthRuleConfig(config = {}) {
    const raw = config.growth_rule_config || config.growth_rules || config || {};
    const purchase = raw.purchase && typeof raw.purchase === 'object' ? raw.purchase : {};
    return {
        purchase: {
            ...DEFAULT_GROWTH_RULES.purchase,
            ...purchase
        }
    };
}

function calculateExpectedOrderGrowth(options = {}) {
    if (options.exchangeMode) return 0;
    if (options.limitedSpotOrder && String(options.limitedSpotMode || '') === 'points') return 0;

    const rules = resolveGrowthRuleConfig(options.config || {});
    const purchaseRule = rules.purchase;
    if (purchaseRule.enabled === false) return 0;

    const payAmount = Math.max(0, toFiniteNumber(options.payAmount, 0));
    const originalAmount = Math.max(0, toFiniteNumber(options.originalAmount, payAmount));
    const baseAmount = purchaseRule.use_original_amount ? originalAmount : payAmount;
    if (baseAmount <= 0) return 0;

    const multiplier = toFiniteNumber(purchaseRule.multiplier, 1);
    const fixed = toFiniteNumber(purchaseRule.fixed, 0);
    return Math.max(0, Math.floor(baseAmount * multiplier + fixed));
}

function normalizeGrowthTiers(rawTiers) {
    const source = Array.isArray(rawTiers) && rawTiers.length > 0 ? rawTiers : TIERS_BY_MIN;
    return applyGrowthTierDisplayNames(source)
        .map((tier, index) => ({
            level: toFiniteNumber(tier.level, index + 1),
            name: tier.name || `成长档位${index + 1}`,
            min: Math.max(0, toFiniteNumber(tier.min != null ? tier.min : tier.growth_threshold, 0))
        }))
        .sort((a, b) => a.min - b.min);
}

function findTierByGrowth(tiers, growthValue) {
    let current = tiers[0] || null;
    for (let i = 0; i < tiers.length; i += 1) {
        if (growthValue >= tiers[i].min) current = tiers[i];
        else break;
    }
    return current;
}

function findNextTier(tiers, growthValue) {
    return tiers.find((tier) => growthValue < tier.min) || null;
}

function buildGrowthPreview(options = {}) {
    const meta = options.meta && typeof options.meta === 'object' ? options.meta : {};
    const expectedGrowth = Math.max(0, Math.floor(toFiniteNumber(options.expectedGrowth, 0)));
    const hasMeta = meta.growth_value != null || Array.isArray(meta.growth_tiers);
    if (expectedGrowth <= 0) {
        return null;
    }
    if (!hasMeta) {
        return {
            visible: true,
            has_meta: false,
            expected_growth: expectedGrowth,
            current_growth: 0,
            projected_growth: expectedGrowth,
            current_tier_name: '',
            next_tier_name: '',
            remaining_growth: 0,
            remaining_text: '',
            progress_percent: 0,
            summary: `本单支付成功后预计增加 ${expectedGrowth} 成长值`,
            reached_next: false
        };
    }

    const tiers = normalizeGrowthTiers(meta.growth_tiers);
    const currentGrowth = Math.max(0, Math.floor(toFiniteNumber(meta.growth_value, 0)));
    const projectedGrowth = currentGrowth + expectedGrowth;
    const currentTier = findTierByGrowth(tiers, currentGrowth);
    const nextBeforeOrder = findNextTier(tiers, currentGrowth);
    const nextAfterOrder = findNextTier(tiers, projectedGrowth);
    const targetTier = nextAfterOrder || nextBeforeOrder;
    const progressPercent = targetTier
        ? calculateCumulativeGrowthPercent(projectedGrowth, targetTier.min, 0)
        : 100;
    const remainingGrowth = nextAfterOrder
        ? Math.max(0, Math.ceil(nextAfterOrder.min - projectedGrowth))
        : 0;

    let summary = expectedGrowth > 0
        ? `本单支付成功后预计增加 ${expectedGrowth} 成长值`
        : '本单暂无成长值增加';
    if (nextBeforeOrder && projectedGrowth >= nextBeforeOrder.min) {
        summary = nextAfterOrder
            ? `支付后可达「${nextBeforeOrder.name}」，距离「${nextAfterOrder.name}」还差 ${remainingGrowth} 成长值`
            : `支付后可达「${nextBeforeOrder.name}」，已到当前最高成长档`;
    } else if (nextAfterOrder) {
        summary = `支付后预计 ${projectedGrowth} 成长值，距离「${nextAfterOrder.name}」还差 ${remainingGrowth} 成长值`;
    } else if (hasMeta) {
        summary = `支付后预计 ${projectedGrowth} 成长值，已到当前最高成长档`;
    }

    return {
        visible: expectedGrowth > 0 || hasMeta,
        has_meta: true,
        expected_growth: expectedGrowth,
        current_growth: currentGrowth,
        projected_growth: projectedGrowth,
        current_tier_name: currentTier ? currentTier.name : '',
        next_tier_name: nextAfterOrder ? nextAfterOrder.name : '',
        remaining_growth: remainingGrowth,
        remaining_text: nextAfterOrder ? `还差${remainingGrowth}` : '已达最高',
        progress_percent: clampPercent(progressPercent),
        summary,
        reached_next: !!(nextBeforeOrder && projectedGrowth >= nextBeforeOrder.min)
    };
}

module.exports = {
    calculateExpectedOrderGrowth,
    buildGrowthPreview,
    resolveGrowthRuleConfig,
    _test: {
        normalizeGrowthTiers,
        findTierByGrowth,
        findNextTier
    }
};
