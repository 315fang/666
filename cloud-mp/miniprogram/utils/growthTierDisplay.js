/**
 * 成长值档位展示名（仅前端覆盖，与后端 configs 中 min 对齐即可）
 * 云函数包内不宜引用 cloudfunctions 外路径，故展示文案放在小程序侧。
 */
const TIERS_BY_MIN = [
    { min: 0, name: '星悦', desc: '新客礼遇' },
    { min: 299, name: '月华', desc: '购物9折' },
    { min: 999, name: '鎏光', desc: '购物8.5折' },
    { min: 3000, name: '云境', desc: '成长值提升·权益进度升级' },
    { min: 30000, name: '曜世', desc: '尊享成长值权益' },
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
    const g = Math.max(0, Number(growthValue) || 0);
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

function toFiniteNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clampPercent(value) {
    return Math.min(100, Math.max(0, value));
}

function pickProgressPercent(gp = {}, fallback = 0) {
    const raw = gp.percent != null ? gp.percent : gp.progress;
    return clampPercent(toFiniteNumber(raw, fallback));
}

function resolveNextThreshold(gp = {}, fallback = null) {
    const raw = gp.next_threshold != null
        ? gp.next_threshold
        : (
            gp.nextThreshold != null
                ? gp.nextThreshold
                : (
                    gp.nextLevel?.threshold != null
                        ? gp.nextLevel.threshold
                        : (
                            gp.next?.threshold != null
                                ? gp.next.threshold
                                : gp.next?.min
                        )
                )
        );
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
    return fallback;
}

/**
 * 我的页/会员卡展示用：按「累计成长值 / 下一档门槛」展示进度。
 * 后端 progress 是当前档位段内进度，刚升档时会接近 0，不适合“累计成长值”卡片。
 */
function calculateCumulativeGrowthPercent(growthValue, nextThreshold, fallbackPercent = 0) {
    const threshold = Number(nextThreshold);
    if (!Number.isFinite(threshold) || threshold <= 0) {
        return clampPercent(toFiniteNumber(fallbackPercent, 0));
    }
    const growth = Math.max(0, toFiniteNumber(growthValue, 0));
    const raw = (growth / threshold) * 100;
    return clampPercent(Math.round(raw * 10) / 10);
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
    const g = Math.max(0, Number(info.growth_value) || 0);
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
    const currentMeta = gp.current || gp.tier || {};
    const nextMeta = gp.next || gp.nextLevel || null;
    const nextThreshold = resolveNextThreshold(gp, next != null ? next.min : null);
    return {
        ...gp,
        current: { ...currentMeta, name: cur.name },
        next: next ? { ...(nextMeta || {}), name: next.name } : null,
        percent: pickProgressPercent(gp, 0),
        next_threshold: nextThreshold
    };
}

module.exports = {
    TIERS_BY_MIN,
    calculateCumulativeGrowthPercent,
    getDisplayTierForGrowth,
    getDisplayNextTierForGrowth,
    applyGrowthTierDisplayNames,
    pickProgressPercent,
    resolveNextThreshold,
    patchGrowthProgressForDisplay
};
