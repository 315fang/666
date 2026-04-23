'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { __internals } = require('../index');

function createFakeDb(seed = {}) {
    const collections = {
        users: seed.users || [],
        orders: seed.orders || [],
        commissions: seed.commissions || [],
        withdrawals: seed.withdrawals || [],
        wallet_logs: seed.wallet_logs || [],
        goods_fund_logs: seed.goods_fund_logs || [],
        directed_invites: seed.directed_invites || [],
        addresses: seed.addresses || [],
        cart_items: seed.cart_items || [],
        notifications: seed.notifications || [],
        point_accounts: seed.point_accounts || [],
        point_logs: seed.point_logs || [],
        user_coupons: seed.user_coupons || [],
        user_favorites: seed.user_favorites || [],
        user_mass_messages: seed.user_mass_messages || []
    };

    function filterRows(rows, criteria = {}) {
        return rows.filter((row) => Object.keys(criteria).every((key) => String(row[key]) === String(criteria[key])));
    }

    function buildQuery(name, criteria = null, offset = 0, size = null) {
        return {
            where(nextCriteria) {
                return buildQuery(name, nextCriteria, offset, size);
            },
            skip(nextOffset = 0) {
                return buildQuery(name, criteria, nextOffset, size);
            },
            limit(nextSize = 20) {
                return buildQuery(name, criteria, offset, nextSize);
            },
            async get() {
                let rows = collections[name] || [];
                if (criteria) rows = filterRows(rows, criteria);
                if (offset) rows = rows.slice(offset);
                if (size != null) rows = rows.slice(0, size);
                return { data: rows };
            }
        };
    }

    return {
        collections,
        collection(name) {
            return {
                where(criteria) {
                    return buildQuery(name, criteria);
                },
                skip(offset = 0) {
                    return buildQuery(name, null, offset);
                },
                limit(size = 20) {
                    return buildQuery(name, null, 0, size);
                },
                async get() {
                    return { data: collections[name] || [] };
                },
                doc(id) {
                    return {
                        async update({ data }) {
                            const rows = collections[name] || [];
                            const index = rows.findIndex((row) => String(row._id || row.id) === String(id));
                            if (index === -1) return { stats: { updated: 0 } };
                            rows[index] = {
                                ...rows[index],
                                ...data
                            };
                            return { stats: { updated: 1 } };
                        },
                        async remove() {
                            const rows = collections[name] || [];
                            const index = rows.findIndex((row) => String(row._id || row.id) === String(id));
                            if (index === -1) return { stats: { removed: 0 } };
                            rows.splice(index, 1);
                            return { stats: { removed: 1 } };
                        }
                    };
                }
            };
        }
    };
}

test('processVisitorAccounts hides visitor accounts older than 24 hours without business relations', async () => {
    const db = createFakeDb({
        users: [
            {
                _id: 'user-1',
                openid: 'visitor-openid',
                role_level: 0,
                nickname: '新用户',
                avatar_url: '',
                phone: '',
                account_visibility: 'visible',
                created_at: '2026-04-20T00:00:00.000Z'
            }
        ]
    });

    const summary = await __internals.processVisitorAccounts(db, new Date('2026-04-22T02:00:00.000Z'));

    assert.equal(summary.hidden, 1);
    assert.equal(summary.deleted, 0);
    assert.equal(db.collections.users[0].account_visibility, 'hidden');
    assert.equal(db.collections.users[0].hidden_reason, 'visitor_cleanup');
    assert.equal(db.collections.users[0].hidden_at, '2026-04-22T02:00:00.000Z');
});

test('processVisitorAccounts keeps visitor accounts visible when they already have business relations', async () => {
    const db = createFakeDb({
        users: [
            {
                _id: 'user-1',
                openid: 'visitor-openid',
                role_level: 0,
                nickname: '新用户',
                avatar_url: '',
                phone: '',
                account_visibility: 'visible',
                created_at: '2026-04-20T00:00:00.000Z'
            }
        ],
        orders: [
            {
                _id: 'order-1',
                openid: 'visitor-openid',
                status: 'paid'
            }
        ]
    });

    const summary = await __internals.processVisitorAccounts(db, new Date('2026-04-22T02:00:00.000Z'));

    assert.equal(summary.hidden, 0);
    assert.equal(summary.skipped_with_business_relation, 1);
    assert.equal(db.collections.users[0].account_visibility, 'visible');
});

test('processVisitorAccounts deletes hidden visitor accounts after 7 days when still relation-free', async () => {
    const db = createFakeDb({
        users: [
            {
                _id: 'user-1',
                openid: 'visitor-openid',
                role_level: 0,
                nickname: '新用户',
                avatar_url: '',
                phone: '',
                account_visibility: 'hidden',
                hidden_reason: 'visitor_cleanup',
                hidden_at: '2026-04-10T00:00:00.000Z',
                created_at: '2026-04-09T00:00:00.000Z'
            }
        ]
    });

    const summary = await __internals.processVisitorAccounts(db, new Date('2026-04-22T02:00:00.000Z'));

    assert.equal(summary.hidden, 0);
    assert.equal(summary.deleted, 1);
    assert.equal(db.collections.users.length, 0);
});

test('processVisitorAccounts dry run reports candidates without mutating users', async () => {
    const db = createFakeDb({
        users: [
            {
                _id: 'user-1',
                openid: 'visitor-openid',
                role_level: 0,
                nickname: '新用户',
                avatar_url: '',
                phone: '',
                account_visibility: 'visible',
                created_at: '2026-04-20T00:00:00.000Z'
            }
        ]
    });

    const summary = await __internals.processVisitorAccounts(db, new Date('2026-04-22T02:00:00.000Z'), { dryRun: true });

    assert.equal(summary.dry_run, true);
    assert.equal(summary.hidden, 1);
    assert.equal(db.collections.users[0].account_visibility, 'visible');
    assert.equal(db.collections.users[0].hidden_reason, undefined);
});

test('processVisitorAccounts keeps hidden visitor accounts with side relations from deletion', async () => {
    const db = createFakeDb({
        users: [
            {
                _id: 'user-1',
                id: 101,
                openid: 'visitor-openid',
                role_level: 0,
                nickname: '新用户',
                account_visibility: 'hidden',
                hidden_reason: 'visitor_cleanup',
                hidden_at: '2026-04-10T00:00:00.000Z',
                created_at: '2026-04-09T00:00:00.000Z'
            }
        ],
        cart_items: [
            {
                _id: 'cart-1',
                user_id: 101
            }
        ]
    });

    const summary = await __internals.processVisitorAccounts(db, new Date('2026-04-22T02:00:00.000Z'));

    assert.equal(summary.deleted, 0);
    assert.equal(summary.skipped_with_side_relation, 1);
    assert.equal(db.collections.users.length, 1);
});
