'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadCouponModule() {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                database: () => ({
                    command: {},
                    collection: () => ({})
                })
            };
        }
        return originalLoad(request, parent, isMain);
    };

    const modulePath = require.resolve('../user-coupons');
    delete require.cache[modulePath];
    try {
        return {
            module: require('../user-coupons'),
            restore: () => {
                Module._load = originalLoad;
                delete require.cache[modulePath];
            }
        };
    } catch (error) {
        Module._load = originalLoad;
        delete require.cache[modulePath];
        throw error;
    }
}

test('poster coupon claim rules enforce activity, total, daily and per-user limits', () => {
    const { module, restore } = loadCouponModule();
    const nowTs = Date.parse('2026-04-29T04:00:00.000Z');
    const nowParts = { dayKey: '2026-04-29', minuteOfDay: 12 * 60 };
    const baseCoupon = {
        id: 9,
        name: '海报带券',
        type: 'fixed',
        is_active: 1,
        activity_enabled: 1,
        activity_start_at: '2026-04-28T00:00:00.000Z',
        activity_end_at: '2026-04-30T00:00:00.000Z',
        stock: -1,
        issued_count: 0,
        total_claim_limit: -1,
        daily_claim_limit: -1,
        per_user_limit: 1,
        claim_day_key: '2026-04-29',
        claimed_today_count: 0
    };

    try {
        assert.equal(module.resolveTemplateClaimAvailability(baseCoupon, { nowTs, nowParts }).canClaim, true);

        const inactive = module.resolveTemplateClaimAvailability({ ...baseCoupon, activity_enabled: 0 }, { nowTs, nowParts });
        assert.equal(inactive.canClaim, false);
        assert.equal(inactive.state, 'inactive');

        const exhausted = module.resolveTemplateClaimAvailability({ ...baseCoupon, issued_count: 3, total_claim_limit: 3 }, { nowTs, nowParts });
        assert.equal(exhausted.canClaim, false);
        assert.equal(exhausted.state, 'out_of_stock');

        const dailyExhausted = module.resolveTemplateClaimAvailability({ ...baseCoupon, daily_claim_limit: 2, claimed_today_count: 2 }, { nowTs, nowParts });
        assert.equal(dailyExhausted.canClaim, false);
        assert.equal(dailyExhausted.state, 'daily_exhausted');

        const owned = module.resolveTemplateClaimAvailability(baseCoupon, { nowTs, nowParts, ownedCount: 1 });
        assert.equal(owned.canClaim, false);
        assert.equal(owned.state, 'already_owned');
    } finally {
        restore();
    }
});
