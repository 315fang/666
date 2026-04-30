'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildAgentUpgradeProgress } = require('../user-upgrade-progress');

const memberLevels = [
    { level: 0, name: 'VIP用户' },
    { level: 1, name: '初级会员' },
    { level: 2, name: '高级会员' },
    { level: 3, name: '推广合伙人' },
    { level: 4, name: '运营合伙人' },
    { level: 5, name: '区域合伙人' }
];

test('buildAgentUpgradeProgress explains nearest path to C2 with growth or team-sales options', () => {
    const progress = buildAgentUpgradeProgress({
        memberLevels,
        currentRoleLevel: 1,
        growthValue: 900,
        effectiveSales: 500,
        rechargeTotal: 0,
        directMembers: [{ role_level: 1 }],
        upgradeRules: {
            c2_growth_value: 999,
            c2_referee_count: 2,
            c2_min_sales: 580,
            effective_order_days: 7
        }
    });

    assert.equal(progress.target_level, 2);
    assert.equal(progress.target_name, '高级会员');
    assert.equal(progress.state, 'pending');
    assert.equal(progress.recommended_path.key, 'c2_growth');
    assert.equal(progress.recommended_path.requirements[0].remaining, 99);
    assert.equal(progress.other_paths.length, 1);
    assert.match(progress.summary, /还差 99成长值/);
});

test('buildAgentUpgradeProgress recommends the closest B1 path across growth, team and recharge', () => {
    const progress = buildAgentUpgradeProgress({
        memberLevels,
        currentRoleLevel: 2,
        growthValue: 1200,
        effectiveSales: 900,
        rechargeTotal: 2800,
        directMembers: [{ role_level: 1 }, { role_level: 1 }],
        upgradeRules: {
            b1_growth_value: 3000,
            b1_referee_count: 10,
            b1_recharge: 3000
        }
    });

    assert.equal(progress.target_level, 3);
    assert.equal(progress.target_name, '推广合伙人');
    assert.equal(progress.recommended_path.key, 'b1_recharge');
    assert.equal(progress.recommended_path.requirements[0].remaining, 200);
    assert.match(progress.summary, /还差 ¥200/);
});

test('buildAgentUpgradeProgress marks level 5 and above as max automatic upgrade level', () => {
    const progress = buildAgentUpgradeProgress({
        memberLevels,
        currentRoleLevel: 5,
        growthValue: 198000,
        effectiveSales: 198000,
        rechargeTotal: 198000,
        directMembers: []
    });

    assert.equal(progress.state, 'max_auto_level');
    assert.equal(progress.target_level, null);
    assert.equal(progress.recommended_path, null);
});
