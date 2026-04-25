/**
 * 成长值档位展示名（仅前端覆盖，与后端 configs 中 min 对齐即可）
 * 云函数包内不宜引用 cloudfunctions 外路径，故展示文案放在小程序侧。
 */
const TIERS_BY_MIN = [
    { min: 0, name: '星悦', desc: '新客礼遇' },
    { min: 299, name: '月华', desc: '购物9折' },
    { min: 999, name: '鎏光', desc: '购物8.5折' },
    { min: 3000, name: '云境', desc: '原价结算·成长会员权益升级' },
    { min: 30000, name: '曜世', desc: '尊享成长会员权益' },
    { min: 198000, name: '天冕', desc: '顶格成长礼遇' }
];

function toMin(row) {
    if (!row || typeof row !== 'object') return -1;
    const raw = row.min != null ? row.min : row.growth_threshold;
    const n = Number(raw);
    return Number.isFinite(n) ? n : -1;
}

/**
 * 按成长值解析当前展示档位（与后端阶梯 min 一致）
 */
function getDisplayTierForGrowth(growthValue) {
    const g = Number(growthValue) || 0;
    let cur = TIERS_BY_MIN[0];
    for (let i = 0; i < TIERS_BY_MIN.length; i++) {
        if (g >= TIERS_BY_MIN[i].min) cur = TIERS_BY_MIN[i];
        else break;
    }
    return cur;
}

function getDisplayNextTierForGrowth(growthValue) {
    const cur = getDisplayTierForGrowth(growthValue);
    const idx = TIERS_BY_MIN.findIndex((t) => t.min === cur.min);
    if (idx < 0 || idx >= TIERS_BY_MIN.length - 1) return null;
    return TIERS_BY_MIN[idx + 1];
}

/**
 * 列表/配置数组：按 min 覆盖 name、desc
 */
function applyGrowthTierDisplayNames(tiers) {
    if (!Array.isArray(tiers)) return tiers;
    const map = new Map(TIERS_BY_MIN.map((d) => [d.min, d]));
    return tiers.map((row) => {
        const min = toMin(row);
        const def = map.get(min);
        if (!def) return row;
        return { ...row, name: def.name, desc: def.desc };
    });
}

/**
 * 与 /user/profile 返回的 growth_progress 对齐，只改展示名
 */
function patchGrowthProgressForDisplay(info = {}) {
    const g = Number(info.growth_value) || 0;
    const cur = getDisplayTierForGrowth(g);
    const next = getDisplayNextTierForGrowth(g);
    const gp = info.growth_progress;
    if (!gp || typeof gp !== 'object') {
        return {
            current: { name: cur.name },
            next: next ? { name: next.name } : null,
            percent: 0,
            next_threshold: next != null ? next.min : null
        };
    }
    return {
        ...gp,
        current: { ...(gp.current || {}), name: cur.name },
        next: next ? { ...(gp.next || {}), name: next.name } : null
    };
}

module.exports = {
    TIERS_BY_MIN,
    getDisplayTierForGrowth,
    getDisplayNextTierForGrowth,
    applyGrowthTierDisplayNames,
    patchGrowthProgressForDisplay
};
