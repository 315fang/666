const { get } = require('../../utils/request');

const DEFAULT_PRESET_AMOUNTS = [100, 300, 500, 1000, 2000, 5000];

async function loadRechargeConfig(page) {
    try {
        const res = await get('/agent/wallet/recharge-config');
        if (res && res.code === 0 && res.data) {
            const presets = Array.isArray(res.data.preset_amounts) && res.data.preset_amounts.length > 0
                ? res.data.preset_amounts
                : DEFAULT_PRESET_AMOUNTS;
            const defIdx = Math.min(2, presets.length - 1);
            page.setData({
                presetAmounts: presets,
                selectedAmount: presets[defIdx] || 500,
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
    loadRechargeConfig,
    getBonusForAmount,
    getRechargeAmount,
    updateBonusHint
};
