const { get } = require('../../utils/request');

const DEFAULT_PRESET_AMOUNTS = [];

function normalizePresetAmounts(config = {}) {
    const rawAmounts = Array.isArray(config.preset_amounts) && config.preset_amounts.length > 0
        ? config.preset_amounts
        : (Array.isArray(config.options) ? config.options.map((item) => item && item.amount) : []);
    const seen = {};
    return rawAmounts
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .filter((value) => {
            const key = String(value);
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });
}

async function loadRechargeConfig(page) {
    try {
        const res = await get('/agent/wallet/recharge-config');
        if (res && res.code === 0 && res.data) {
            const presets = normalizePresetAmounts(res.data);
            const defIdx = presets.length > 0 ? Math.min(2, presets.length - 1) : -1;
            page.setData({
                rechargeEnabled: res.data.enabled !== false,
                presetAmounts: presets,
                selectedAmount: defIdx >= 0 ? presets[defIdx] : null,
                selectedIdx: defIdx,
                bonusEnabled: !!res.data.bonus_enabled,
                bonusTiers: Array.isArray(res.data.bonus_tiers) ? res.data.bonus_tiers.sort((a, b) => a.min - b.min) : []
            });
            updateBonusHint(page);
        }
    } catch (_) {}
}

function getBonusForAmount(page, amount) {
    if (!page.data.bonusEnabled || !page.data.bonusTiers.length) return 0;
    let bonus = 0;
    for (const tier of page.data.bonusTiers) {
        if (amount >= tier.min) bonus = tier.bonus;
    }
    return bonus;
}

function getRechargeAmount(page) {
    if (page.data.useCustom && page.data.customAmount) {
        return parseFloat(page.data.customAmount);
    }
    return page.data.selectedAmount;
}

function updateBonusHint(page) {
    const amount = getRechargeAmount(page) || 0;
    const bonus = getBonusForAmount(page, amount);
    const hint = bonus > 0 ? `充 ¥${amount} 送 ¥${bonus}，实际到账 ¥${amount + bonus}` : '';
    page.setData({ currentBonusHint: hint });
}

module.exports = {
    DEFAULT_PRESET_AMOUNTS,
    normalizePresetAmounts,
    loadRechargeConfig,
    getBonusForAmount,
    getRechargeAmount,
    updateBonusHint
};
