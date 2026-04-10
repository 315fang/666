/**
 * cloudfunctions/shared/growth.js
 * 
 * 用户成长等级计算模块（提取自 login 和 user 云函数）
 * 避免重复定义，保证逻辑一致
 */

/**
 * 默认成长等级配置
 */
const DEFAULT_GROWTH_TIERS = [
    {
        level: 1,
        name: '普通会员',
        min: 0,
        discount: 1.0,
        benefits: '基础会员权益',
        enabled: true
    },
    {
        level: 2,
        name: '银牌会员',
        min: 100,
        discount: 0.95,
        benefits: '享受95折优惠',
        enabled: true
    },
    {
        level: 3,
        name: '金牌会员',
        min: 500,
        discount: 0.90,
        benefits: '享受90折优惠',
        enabled: true
    },
    {
        level: 4,
        name: '铂金会员',
        min: 1000,
        discount: 0.85,
        benefits: '享受85折优惠',
        enabled: true
    },
    {
        level: 5,
        name: '钻石会员',
        min: 5000,
        discount: 0.80,
        benefits: '享受80折优惠',
        enabled: true
    }
];

/**
 * 根据成长值计算会员等级
 * @param {number} pointsValue - 用户成长值/积分
 * @param {Array} tierConfig - 可选的自定义等级配置
 * @returns {Object} 用户等级信息
 */
function calculateTier(pointsValue, tierConfig = null) {
    const tiers = tierConfig || DEFAULT_GROWTH_TIERS;
    const points = Number(pointsValue) || 0;

    // 从高到低查找匹配的等级
    for (let i = tiers.length - 1; i >= 0; i--) {
        const tier = tiers[i];
        if (points >= tier.min && tier.enabled !== false) {
            return {
                level: tier.level,
                name: tier.name,
                points: points,
                discount: tier.discount || 1.0,
                benefits: tier.benefits || '',
                nextLevel: i < tiers.length - 1 ? tiers[i + 1] : null,
                nextThreshold: i < tiers.length - 1 ? tiers[i + 1].min : null,
                pointsNeeded: i < tiers.length - 1 ? Math.max(0, tiers[i + 1].min - points) : 0
            };
        }
    }

    // 默认返回最低等级
    return {
        level: 1,
        name: tiers[0].name || '普通会员',
        points: points,
        discount: tiers[0].discount || 1.0,
        benefits: tiers[0].benefits || '',
        nextLevel: tiers.length > 1 ? tiers[1] : null,
        nextThreshold: tiers.length > 1 ? tiers[1].min : null,
        pointsNeeded: tiers.length > 1 ? Math.max(0, tiers[1].min - points) : 0
    };
}

/**
 * 构建完整的成长进度对象
 * @param {number} pointsValue - 成长值
 * @param {Array} tierConfig - 等级配置
 * @returns {Object} 成长进度信息
 */
function buildGrowthProgress(pointsValue, tierConfig = null) {
    const tier = calculateTier(pointsValue, tierConfig);
    const tiers = tierConfig || DEFAULT_GROWTH_TIERS;

    // 计算进度百分比
    const currentLevel = tier;
    const nextTierConfig = currentLevel.nextLevel || (tiers.length > 0 ? tiers[tiers.length - 1] : { min: 0 });
    const nextThreshold = currentLevel.nextThreshold || (tiers.length > 0 ? tiers[tiers.length - 1].min : 0);
    const currentThreshold = currentLevel.nextLevel 
        ? (tiers.find(t => t.level === tier.level)?.min || 0)
        : (tiers.length > 0 ? tiers[tiers.length - 2]?.min || 0 : 0);

    const progress = nextThreshold > currentThreshold
        ? Math.round(((pointsValue - currentThreshold) / (nextThreshold - currentThreshold)) * 100)
        : 100;

    return {
        points: pointsValue,
        tier: {
            level: tier.level,
            name: tier.name,
            discount: tier.discount
        },
        progress: Math.min(100, Math.max(0, progress)),
        nextLevel: currentLevel.nextLevel ? {
            level: currentLevel.nextLevel.level,
            name: currentLevel.nextLevel.name,
            threshold: currentLevel.nextThreshold
        } : null,
        pointsNeeded: currentLevel.pointsNeeded,
        allTiers: tiers.map(t => ({
            level: t.level,
            name: t.name,
            min: t.min,
            discount: t.discount,
            enabled: t.enabled !== false
        }))
    };
}

/**
 * 根据配置从数据库加载等级配置
 * @param {Object} db - CloudBase db 对象
 * @returns {Promise<Array>} 等级配置数组
 */
async function loadTierConfig(db) {
    try {
        if (!db) return DEFAULT_GROWTH_TIERS;

        const configRes = await db
            .collection('configs')
            .where({ type: 'growth_tiers', active: true })
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));

        if (configRes.data.length > 0) {
            const config = configRes.data[0];
            if (config.tiers && Array.isArray(config.tiers)) {
                return config.tiers;
            }
        }

        return DEFAULT_GROWTH_TIERS;
    } catch (_) {
        return DEFAULT_GROWTH_TIERS;
    }
}

module.exports = {
    DEFAULT_GROWTH_TIERS,
    calculateTier,
    buildGrowthProgress,
    loadTierConfig
};
