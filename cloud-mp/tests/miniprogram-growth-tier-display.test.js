'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    calculateCumulativeGrowthPercent,
    patchGrowthProgressForDisplay
} = require('../miniprogram/utils/growthTierDisplay');

test('growth card displays cumulative progress toward next threshold', () => {
    assert.equal(calculateCumulativeGrowthPercent(30545, 198000, 0), 15.4);
    assert.equal(calculateCumulativeGrowthPercent(198000, 198000, 0), 100);
});

test('growth progress display accepts legacy raw progress shape', () => {
    const patched = patchGrowthProgressForDisplay({
        growth_value: 30545,
        growth_progress: {
            tier: { name: 'legacy-current' },
            progress: 0,
            nextLevel: { name: 'legacy-next', threshold: 198000 }
        }
    });

    assert.equal(patched.current.name, '曜世');
    assert.equal(patched.next.name, '天冕');
    assert.equal(patched.percent, 0);
    assert.equal(patched.next_threshold, 198000);
});
