const test = require('node:test');
const assert = require('node:assert/strict');

const {
    calculateExpectedOrderGrowth,
    buildGrowthPreview
} = require('../orderGrowthPreview');

test('calculateExpectedOrderGrowth uses paid amount by default', () => {
    assert.equal(calculateExpectedOrderGrowth({ payAmount: 399.9 }), 399);
});

test('calculateExpectedOrderGrowth supports original amount rule', () => {
    const config = {
        growth_rule_config: {
            purchase: {
                multiplier: 2,
                fixed: 5,
                use_original_amount: true
            }
        }
    };
    assert.equal(calculateExpectedOrderGrowth({ payAmount: 399, originalAmount: 699, config }), 1403);
});

test('calculateExpectedOrderGrowth skips zero-cash exchange orders', () => {
    assert.equal(calculateExpectedOrderGrowth({ payAmount: 399, exchangeMode: true }), 0);
    assert.equal(calculateExpectedOrderGrowth({ payAmount: 399, limitedSpotOrder: true, limitedSpotMode: 'points' }), 0);
});

test('buildGrowthPreview projects next tier after this order', () => {
    const preview = buildGrowthPreview({
        expectedGrowth: 250,
        meta: {
            growth_value: 800,
            growth_tiers: [
                { min: 0, name: 'A' },
                { min: 999, name: 'B' },
                { min: 3000, name: 'C' }
            ]
        }
    });
    assert.equal(preview.has_meta, true);
    assert.equal(preview.current_growth, 800);
    assert.equal(preview.projected_growth, 1050);
    assert.equal(preview.reached_next, true);
    assert.ok(preview.next_tier_name);
    assert.equal(preview.remaining_growth, 1950);
});

test('buildGrowthPreview stays lightweight before tier meta loads', () => {
    const preview = buildGrowthPreview({ expectedGrowth: 120 });
    assert.equal(preview.has_meta, false);
    assert.equal(preview.expected_growth, 120);
    assert.equal(preview.next_tier_name, '');
    assert.equal(preview.progress_percent, 0);
});
