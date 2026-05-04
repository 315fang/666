'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadCouponModule(db = null) {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                database: () => db || ({
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

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function matchesWhere(row, where = {}) {
    return Object.entries(where).every(([key, expected]) => {
        if (expected && typeof expected === 'object' && expected.__op === 'in') {
            return expected.values.some((value) => row[key] === value);
        }
        return row[key] === expected;
    });
}

function applyPatch(row, patch = {}) {
    Object.entries(patch).forEach(([key, value]) => {
        if (value && typeof value === 'object' && value.__op === 'inc') {
            row[key] = Number(row[key] || 0) + value.value;
        } else {
            row[key] = value;
        }
    });
}

function createFakeDb(initial = {}) {
    const collections = clone(initial);
    const db = {
        command: {
            in: (values) => ({ __op: 'in', values }),
            inc: (value) => ({ __op: 'inc', value })
        },
        serverDate: () => '2026-04-29T04:00:00.000Z',
        collection(name) {
            if (!collections[name]) collections[name] = [];
            const rows = collections[name];
            const makeQuery = (where = {}, offset = 0, max = null) => ({
                where(nextWhere) {
                    return makeQuery({ ...where, ...nextWhere }, offset, max);
                },
                skip(nextOffset) {
                    return makeQuery(where, nextOffset, max);
                },
                limit(nextMax) {
                    return makeQuery(where, offset, nextMax);
                },
                async count() {
                    return { total: rows.filter((row) => matchesWhere(row, where)).length };
                },
                async get() {
                    const matched = rows.filter((row) => matchesWhere(row, where));
                    const sliced = matched.slice(offset, max == null ? undefined : offset + max);
                    return { data: clone(sliced) };
                },
                async add({ data }) {
                    const _id = `added-${rows.length + 1}`;
                    rows.push({ _id, ...clone(data) });
                    return { _id };
                },
                doc(id) {
                    return {
                        async get() {
                            return { data: clone(rows.find((row) => String(row._id) === String(id)) || null) };
                        },
                        async set({ data }) {
                            const index = rows.findIndex((row) => String(row._id) === String(id));
                            const next = { _id: String(id), ...clone(data) };
                            if (index === -1) rows.push(next);
                            else rows[index] = next;
                            return { _id: String(id) };
                        },
                        async update({ data }) {
                            const row = rows.find((item) => String(item._id) === String(id));
                            if (row) applyPatch(row, data);
                            return { updated: row ? 1 : 0 };
                        },
                        async remove() {
                            const index = rows.findIndex((item) => String(item._id) === String(id));
                            if (index === -1) return { stats: { removed: 0 } };
                            rows.splice(index, 1);
                            return { stats: { removed: 1 } };
                        }
                    };
                }
            });
            return makeQuery();
        },
        _collections: collections
    };
    return db;
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

test('direct coupon claim treats string, numeric and document template ids as the same owned coupon', async () => {
    const db = createFakeDb({
        users: [{ _id: 'user-doc-8', id: 8, openid: 'openid-8' }],
        coupons: [{
            _id: 'coupon-doc-6',
            id: 6,
            name: '新人券',
            type: 'fixed',
            value: 9,
            valid_days: 7,
            is_active: 1,
            per_user_limit: 1,
            issued_count: 1
        }],
        user_coupons: [{
            _id: 'owned-1',
            openid: 'openid-8',
            user_id: 8,
            coupon_id: 6,
            status: 'unused'
        }]
    });
    const { module, restore } = loadCouponModule(db);

    try {
        const byStringId = await module.claimCoupon('openid-8', '6');
        assert.equal(byStringId.success, false);
        assert.match(byStringId.message, /已领取/);

        const byDocId = await module.claimCoupon('openid-8', 'coupon-doc-6');
        assert.equal(byDocId.success, false);
        assert.match(byDocId.message, /已领取/);

        assert.equal(db._collections.user_coupons.length, 1);
    } finally {
        restore();
    }
});

test('deleteCoupon removes only coupons owned by the caller identity', async () => {
    const db = createFakeDb({
        users: [
            { _id: 'user-alice', id: 8, openid: 'openid-alice' },
            { _id: 'user-bob', id: 9, openid: 'openid-bob' }
        ],
        user_coupons: [
            {
                _id: 'alice-coupon',
                user_id: 8,
                coupon_id: 6,
                status: 'unused'
            },
            {
                _id: 'bob-coupon',
                openid: 'openid-bob',
                coupon_id: 7,
                status: 'unused'
            }
        ]
    });
    const { module, restore } = loadCouponModule(db);

    try {
        await assert.rejects(
            () => module.deleteCoupon('openid-alice', 'bob-coupon'),
            /优惠券不存在/
        );
        assert.equal(db._collections.user_coupons.length, 2);

        const result = await module.deleteCoupon('openid-alice', 'alice-coupon');
        assert.equal(result.success, true);
        assert.deepEqual(
            db._collections.user_coupons.map((coupon) => coupon._id),
            ['bob-coupon']
        );
    } finally {
        restore();
    }
});
