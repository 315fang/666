'use strict';

const {
    DEFAULT_AGENT_UPGRADE_RULES,
    DEFAULT_ROLE_NAMES
} = require('./shared/agent-config');

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function roundMoney(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
}

function normalizeCount(value) {
    return Math.max(0, Math.floor(toNumber(value, 0)));
}

function formatMoney(value) {
    const amount = roundMoney(value);
    return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function formatNumber(value) {
    const num = toNumber(value, 0);
    return Number.isInteger(num) ? String(num) : String(Math.round(num * 100) / 100);
}

function roleNameFor(level, memberLevels = []) {
    const matched = (Array.isArray(memberLevels) ? memberLevels : [])
        .find((item) => Number(item && item.level) === Number(level));
    return (matched && matched.name) || DEFAULT_ROLE_NAMES[level] || `等级${level}`;
}

function progressPercent(current, target) {
    const threshold = toNumber(target, 0);
    if (threshold <= 0) return 100;
    return Math.max(0, Math.min(100, Math.floor((toNumber(current, 0) / threshold) * 100)));
}

function buildRequirement({
    key,
    label,
    current,
    target,
    unit = '',
    kind = 'number'
}) {
    const normalizedCurrent = kind === 'count'
        ? normalizeCount(current)
        : roundMoney(current);
    const normalizedTarget = kind === 'count'
        ? normalizeCount(target)
        : roundMoney(target);
    const remaining = Math.max(0, roundMoney(normalizedTarget - normalizedCurrent));
    const done = normalizedCurrent >= normalizedTarget || normalizedTarget <= 0;
    const currentText = kind === 'money'
        ? `¥${formatMoney(normalizedCurrent)}`
        : `${formatNumber(normalizedCurrent)}${unit}`;
    const targetText = kind === 'money'
        ? `¥${formatMoney(normalizedTarget)}`
        : `${formatNumber(normalizedTarget)}${unit}`;
    const remainingText = done
        ? '已达成'
        : (kind === 'money' ? `还差 ¥${formatMoney(remaining)}` : `还差 ${formatNumber(remaining)}${unit}`);

    return {
        key,
        label,
        current: normalizedCurrent,
        target: normalizedTarget,
        remaining,
        unit,
        kind,
        done,
        percent: progressPercent(normalizedCurrent, normalizedTarget),
        current_text: currentText,
        target_text: targetText,
        remaining_text: remainingText,
        value_text: `${currentText} / ${targetText}`
    };
}

function buildPath({ key, title, desc = '', requirements = [] }) {
    const list = requirements.filter((item) => item && item.target > 0);
    const done = list.length > 0 && list.every((item) => item.done);
    const percent = list.length
        ? Math.floor(list.reduce((sum, item) => sum + item.percent, 0) / list.length)
        : 0;
    const missing = list.filter((item) => !item.done).map((item) => item.remaining_text);
    return {
        key,
        title,
        desc,
        requirements: list,
        done,
        percent: done ? 100 : percent,
        summary: done ? '已满足该升级路径' : missing.join('，')
    };
}

function pickRecommendedPath(paths = []) {
    if (!paths.length) return null;
    return paths
        .slice()
        .sort((a, b) => {
            if (a.done !== b.done) return a.done ? -1 : 1;
            return b.percent - a.percent;
        })[0];
}

function countDirectMembersAtLeast(directMembers = [], level = 1) {
    return (Array.isArray(directMembers) ? directMembers : [])
        .filter((member) => toNumber(member && (member.role_level ?? member.distributor_level), 0) >= level)
        .length;
}

function buildPathsForTarget(targetLevel, metrics, rules) {
    if (targetLevel === 1) {
        return [
            buildPath({
                key: 'c1_sales',
                title: '完成一次有效消费',
                desc: '订单完成并过售后观察期后计入升级消费',
                requirements: [
                    buildRequirement({
                        key: 'effective_sales',
                        label: '有效消费',
                        current: metrics.effectiveSales,
                        target: rules.c1_min_purchase,
                        kind: 'money'
                    })
                ]
            })
        ];
    }

    if (targetLevel === 2) {
        return [
            buildPath({
                key: 'c2_growth',
                title: '成长值直升',
                desc: '消费、任务等成长值达到门槛即可升级',
                requirements: [
                    buildRequirement({
                        key: 'growth_value',
                        label: '成长值',
                        current: metrics.growthValue,
                        target: rules.c2_growth_value,
                        unit: '成长值'
                    })
                ]
            }),
            buildPath({
                key: 'c2_team_sales',
                title: '推荐与销售达标',
                desc: '直推 C1 达标，同时有效消费达到门槛',
                requirements: [
                    buildRequirement({
                        key: 'direct_c1_count',
                        label: '直推 C1 及以上',
                        current: metrics.directC1Count,
                        target: rules.c2_referee_count,
                        unit: '人',
                        kind: 'count'
                    }),
                    buildRequirement({
                        key: 'effective_sales',
                        label: '有效消费',
                        current: metrics.effectiveSales,
                        target: rules.c2_min_sales,
                        kind: 'money'
                    })
                ]
            })
        ];
    }

    if (targetLevel === 3) {
        return [
            buildPath({
                key: 'b1_growth',
                title: '成长值直升',
                desc: '成长值达到门槛即可升级',
                requirements: [
                    buildRequirement({
                        key: 'growth_value',
                        label: '成长值',
                        current: metrics.growthValue,
                        target: rules.b1_growth_value,
                        unit: '成长值'
                    })
                ]
            }),
            buildPath({
                key: 'b1_team',
                title: '推荐 C1 达标',
                desc: '直推初级会员数量达到门槛',
                requirements: [
                    buildRequirement({
                        key: 'direct_c1_count',
                        label: '直推 C1 及以上',
                        current: metrics.directC1Count,
                        target: rules.b1_referee_count,
                        unit: '人',
                        kind: 'count'
                    })
                ]
            }),
            buildPath({
                key: 'b1_recharge',
                title: '充值达标',
                desc: '累计充值达到门槛',
                requirements: [
                    buildRequirement({
                        key: 'recharge_total',
                        label: '累计充值',
                        current: metrics.rechargeTotal,
                        target: rules.b1_recharge,
                        kind: 'money'
                    })
                ]
            })
        ];
    }

    if (targetLevel === 4) {
        return [
            buildPath({
                key: 'b2_team',
                title: '推荐 B1 达标',
                desc: '直推推广合伙人数量达到门槛',
                requirements: [
                    buildRequirement({
                        key: 'direct_b1_count',
                        label: '直推 B1 及以上',
                        current: metrics.directB1Count,
                        target: rules.b2_referee_count,
                        unit: '人',
                        kind: 'count'
                    })
                ]
            }),
            buildPath({
                key: 'b2_recharge',
                title: '充值达标',
                desc: '累计充值达到门槛',
                requirements: [
                    buildRequirement({
                        key: 'recharge_total',
                        label: '累计充值',
                        current: metrics.rechargeTotal,
                        target: rules.b2_recharge,
                        kind: 'money'
                    })
                ]
            })
        ];
    }

    if (targetLevel === 5) {
        return [
            buildPath({
                key: 'b3_team_b2',
                title: '推荐 B2 达标',
                desc: '直推运营合伙人数量达到门槛',
                requirements: [
                    buildRequirement({
                        key: 'direct_b2_count',
                        label: '直推 B2 及以上',
                        current: metrics.directB2Count,
                        target: rules.b3_referee_b2_count,
                        unit: '人',
                        kind: 'count'
                    })
                ]
            }),
            buildPath({
                key: 'b3_team_b1',
                title: '推荐 B1 达标',
                desc: '直推推广合伙人数量达到门槛',
                requirements: [
                    buildRequirement({
                        key: 'direct_b1_count',
                        label: '直推 B1 及以上',
                        current: metrics.directB1Count,
                        target: rules.b3_referee_b1_count,
                        unit: '人',
                        kind: 'count'
                    })
                ]
            }),
            buildPath({
                key: 'b3_recharge',
                title: '充值达标',
                desc: '累计充值达到门槛',
                requirements: [
                    buildRequirement({
                        key: 'recharge_total',
                        label: '累计充值',
                        current: metrics.rechargeTotal,
                        target: rules.b3_recharge,
                        kind: 'money'
                    })
                ]
            })
        ];
    }

    return [];
}

function buildAgentUpgradeProgress(evaluation = {}) {
    const currentLevel = normalizeCount(evaluation.currentRoleLevel);
    const rules = {
        ...DEFAULT_AGENT_UPGRADE_RULES,
        ...(evaluation.upgradeRules || {})
    };
    const memberLevels = evaluation.memberLevels || [];
    const directMembers = evaluation.directMembers || [];
    const totalGrowthValue = roundMoney(evaluation.growthValue);
    const upgradeGrowthValue = roundMoney(
        evaluation.upgradeGrowthValue != null ? evaluation.upgradeGrowthValue : evaluation.growthValue
    );
    const metrics = {
        growthValue: upgradeGrowthValue,
        totalGrowthValue,
        pendingGrowthValue: Math.max(0, roundMoney(totalGrowthValue - upgradeGrowthValue)),
        effectiveSales: roundMoney(evaluation.effectiveSales),
        rechargeTotal: roundMoney(evaluation.rechargeTotal),
        directC1Count: countDirectMembersAtLeast(directMembers, 1),
        directB1Count: countDirectMembersAtLeast(directMembers, 3),
        directB2Count: countDirectMembersAtLeast(directMembers, 4)
    };

    if (currentLevel >= 5) {
        return {
            visible: true,
            state: 'max_auto_level',
            current_level: currentLevel,
            current_name: roleNameFor(currentLevel, memberLevels),
            target_level: null,
            target_name: '',
            title: '已达到自动升级最高等级',
            summary: currentLevel >= 6 ? '门店身份由后台人工认定' : '更高身份由后台人工认定',
            effective_order_days: normalizeCount(rules.effective_order_days),
            metrics,
            recommended_path: null,
            other_paths: []
        };
    }

    const targetLevel = currentLevel + 1;
    const paths = buildPathsForTarget(targetLevel, metrics, rules);
    const recommended = pickRecommendedPath(paths);
    const otherPaths = paths.filter((item) => !recommended || item.key !== recommended.key);
    const targetName = roleNameFor(targetLevel, memberLevels);
    const currentName = roleNameFor(currentLevel, memberLevels);
    const canUpgrade = !!(recommended && recommended.done);

    return {
        visible: true,
        state: canUpgrade ? 'ready' : 'pending',
        current_level: currentLevel,
        current_name: currentName,
        target_level: targetLevel,
        target_name: targetName,
        title: canUpgrade ? `已满足升级到${targetName}` : `距离${targetName}还差`,
        summary: canUpgrade ? '当前已满足升级条件，系统会同步最新等级' : (recommended ? recommended.summary : '暂无可用升级路径'),
        effective_order_days: normalizeCount(rules.effective_order_days),
        metrics,
        recommended_path: recommended,
        other_paths: otherPaths
    };
}

module.exports = {
    buildAgentUpgradeProgress,
    buildRequirement,
    buildPath
};
