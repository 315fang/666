'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    acceptDirectedInvite,
    createDirectedInvite,
    getDirectedInviteTicket,
    revokeDirectedInvite
} = require('../directed-invite-service');

function createFakeDb(seed = {}) {
    const collections = {
        users: seed.users || [],
        directed_invites: seed.directed_invites || [],
        wallet_accounts: seed.wallet_accounts || [],
        wallet_logs: seed.wallet_logs || [],
        goods_fund_logs: seed.goods_fund_logs || [],
        orders: seed.orders || [],
        commissions: seed.commissions || [],
        withdrawals: seed.withdrawals || []
    };

    function filterRows(rows, criteria = {}) {
        return rows.filter((row) => Object.keys(criteria).every((key) => {
            const expected = criteria[key];
            if (expected && typeof expected === 'object' && Array.isArray(expected.$in)) {
                return expected.$in.some((item) => String(row[key]) === String(item));
            }
            return String(row[key]) === String(expected);
        }));
    }

    return {
        collections,
        command: {
            in(values = []) {
                return { $in: values };
            }
        },
        collection(name) {
            return {
                where(criteria) {
                    return {
                        limit(size = 20) {
                            return {
                                async get() {
                                    return { data: filterRows(collections[name] || [], criteria).slice(0, size) };
                                }
                            };
                        },
                        async get() {
                            return { data: filterRows(collections[name] || [], criteria) };
                        },
                        async update({ data }) {
                            const rows = collections[name] || [];
                            let updated = 0;
                            rows.forEach((row, index) => {
                                if (!filterRows([row], criteria).length) return;
                                rows[index] = {
                                    ...row,
                                    ...data
                                };
                                updated += 1;
                            });
                            return { stats: { updated } };
                        }
                    };
                },
                doc(id) {
                    return {
                        async get() {
                            const row = (collections[name] || []).find((item) => String(item._id || item.id || item.invite_id) === String(id));
                            return { data: row || null };
                        },
                        async set({ data }) {
                            assert.equal(Object.prototype.hasOwnProperty.call(data, '_id'), false, 'set data should not contain _id');
                            const rows = collections[name] || [];
                            const nextRow = { ...data, _id: String(id) };
                            const index = rows.findIndex((item) => String(item._id || item.id || item.invite_id) === String(id));
                            if (index === -1) rows.push(nextRow);
                            else rows[index] = nextRow;
                        },
                        async update({ data }) {
                            const rows = collections[name] || [];
                            const index = rows.findIndex((item) => String(item._id || item.id || item.invite_id) === String(id));
                            if (index === -1) {
                                return { stats: { updated: 0 } };
                            }
                            rows[index] = {
                                ...rows[index],
                                ...data
                            };
                            return { stats: { updated: 1 } };
                        }
                    };
                },
                async add({ data }) {
                    const rows = collections[name] || [];
                    const nextId = `${name}-${rows.length + 1}`;
                    rows.push({ _id: nextId, ...data });
                    return { _id: nextId };
                }
            };
        }
    };
}

test('createDirectedInvite writes invite doc without _id in set payload', async () => {
    const db = createFakeDb({
        users: [
            {
                _id: 'user-1',
                id: 1,
                openid: 'initiator-openid',
                role_level: 4,
                nickname: '发起人',
                avatar_url: '',
                invite_code: 'INV-1',
                agent_wallet_balance: 5000
            }
        ]
    });

    const invite = await createDirectedInvite(db, null, 'initiator-openid', {
        transfer_amount: 3000
    });

    assert.equal(invite.status, 'sent');
    assert.equal(invite.transfer_amount, 3000);
    assert.equal(invite.freeze_status, 'frozen');
    assert.equal(invite.lock_status, 'unlocked');
    assert.equal(invite.can_share, true);
    assert.equal(invite.can_preview, true);
    assert.equal(db.collections.directed_invites.length, 1);
    assert.equal(db.collections.directed_invites[0]._id, db.collections.directed_invites[0].invite_id);
    assert.equal(db.collections.users[0].agent_wallet_balance, 2000);
    assert.equal(db.collections.users[0].agent_wallet_frozen_amount, 3000);
    assert.equal(db.collections.wallet_accounts.length, 1);
    assert.equal(db.collections.wallet_accounts[0].balance, 2000);
    assert.equal(db.collections.wallet_accounts[0].frozen_balance, 3000);
    assert.equal(db.collections.wallet_logs.length, 1);
    assert.equal(db.collections.goods_fund_logs.length, 1);
});

test('createDirectedInvite works when transaction connection has no command helper', async () => {
    const baseDb = createFakeDb({
        users: [
            {
                _id: 'user-1',
                id: 1,
                openid: 'initiator-openid',
                role_level: 4,
                nickname: '发起人',
                avatar_url: '',
                invite_code: 'INV-1',
                agent_wallet_balance: 5000
            }
        ]
    });

    const txLikeDb = {
        collections: baseDb.collections,
        collection: baseDb.collection
    };

    const invite = await createDirectedInvite(txLikeDb, null, 'initiator-openid', {
        transfer_amount: 3000
    });

    assert.equal(invite.status, 'sent');
    assert.equal(invite.transfer_amount, 3000);
    assert.equal(baseDb.collections.directed_invites.length, 1);
    assert.equal(baseDb.collections.users[0].agent_wallet_balance, 2000);
    assert.equal(baseDb.collections.users[0].agent_wallet_frozen_amount, 3000);
});

test('revokeDirectedInvite releases frozen goods fund for inviter', async () => {
    const db = createFakeDb({
        users: [
            {
                _id: 'user-1',
                id: 1,
                openid: 'initiator-openid',
                role_level: 4,
                nickname: '发起人',
                avatar_url: '',
                invite_code: 'INV-1',
                agent_wallet_balance: 2000,
                wallet_balance: 2000,
                agent_wallet_frozen_amount: 3000,
                goods_fund_frozen_amount: 3000
            }
        ],
        wallet_accounts: [
            {
                _id: 'wallet-user-1',
                id: 'wallet-user-1',
                user_id: 'user-1',
                openid: 'initiator-openid',
                balance: 2000,
                frozen_balance: 3000,
                account_type: 'goods_fund',
                status: 'active',
                created_at: '2026-04-20T00:00:00.000Z',
                updated_at: '2026-04-20T00:00:00.000Z'
            }
        ],
        directed_invites: [
            {
                _id: 'invite-1',
                invite_id: 'invite-1',
                invite_type: 'directed_b1',
                inviter_openid: 'initiator-openid',
                transfer_amount: 3000,
                frozen_amount: 3000,
                freeze_status: 'frozen',
                frozen_transfer_no: 'DIRFRZ_invite-1',
                status: 'sent',
                review_status: '',
                ticket_id: 'ticket-1',
                ticket_expire_at: '2099-01-01T00:00:00.000Z',
                created_at: '2026-04-20T00:00:00.000Z',
                updated_at: '2026-04-20T00:00:00.000Z'
            }
        ]
    });

    const result = await revokeDirectedInvite(db, 'initiator-openid', {
        id: 'invite-1'
    });

    assert.equal(result.status, 'revoked');
    assert.equal(result.freeze_status, 'released');
    assert.equal(result.lock_status, 'locked');
    assert.equal(result.can_share, false);
    assert.equal(result.can_preview, false);
    assert.equal(db.collections.users[0].agent_wallet_balance, 5000);
    assert.equal(db.collections.users[0].agent_wallet_frozen_amount, 0);
    assert.equal(db.collections.wallet_accounts[0].balance, 5000);
    assert.equal(db.collections.wallet_accounts[0].frozen_balance, 0);
    assert.equal(db.collections.wallet_logs.length, 1);
    assert.equal(db.collections.goods_fund_logs.length, 1);
});

test('getDirectedInviteTicket exposes strict reroute capability for bound VIP0 with clean history', async () => {
    const db = createFakeDb({
        users: [
            {
                _id: 'parent-1',
                id: 11,
                openid: 'old-parent-openid',
                role_level: 4,
                nickname: '旧上级',
                avatar_url: '',
                invite_code: 'OLDPARENT'
            },
            {
                _id: 'inviter-1',
                id: 12,
                openid: 'new-parent-openid',
                role_level: 4,
                nickname: '新上级',
                avatar_url: '',
                invite_code: 'NEWPARENT'
            },
            {
                _id: 'user-2',
                id: 2,
                openid: 'candidate-openid',
                role_level: 0,
                nickname: '候选用户',
                avatar_url: '',
                referrer_openid: 'old-parent-openid',
                parent_openid: 'old-parent-openid',
                parent_id: 'parent-1'
            }
        ],
        directed_invites: [
            {
                _id: 'invite-2',
                invite_id: 'invite-2',
                inviter_openid: 'new-parent-openid',
                inviter_snapshot: { openid: 'new-parent-openid', nickname: '新上级', role_level: 4 },
                transfer_amount: 3000,
                frozen_amount: 3000,
                freeze_status: 'frozen',
                status: 'sent',
                review_status: '',
                ticket_id: 'ticket-2',
                ticket_expire_at: '2099-01-01T00:00:00.000Z',
                created_at: '2026-04-20T00:00:00.000Z',
                updated_at: '2026-04-20T00:00:00.000Z'
            }
        ]
    });

    const view = await getDirectedInviteTicket(db, 'candidate-openid', {
        ticket: 'ticket-2'
    });

    assert.equal(view.can_accept, true);
    assert.equal(view.can_reroute, true);
    assert.equal(view.reroute, true);
    assert.match(view.accept_hint, /覆盖 parent\/referrer/);
    assert.match(view.reroute_hint, /严格改线条件/);
    assert.match(view.reroute_required_review_note, /不回算历史订单、佣金与资金数据/);
    assert.equal(view.reroute_from_parent_openid, 'old-parent-openid');
    assert.equal(view.reroute_from_parent_id, 'parent-1');
    assert.equal(view.reroute_from_parent_snapshot.openid, 'old-parent-openid');
});

test('acceptDirectedInvite records reroute metadata for bound VIP0 with clean history', async () => {
    const db = createFakeDb({
        users: [
            {
                _id: 'parent-1',
                id: 11,
                openid: 'old-parent-openid',
                role_level: 4,
                nickname: '旧上级',
                avatar_url: '',
                invite_code: 'OLDPARENT'
            },
            {
                _id: 'inviter-1',
                id: 12,
                openid: 'new-parent-openid',
                role_level: 4,
                nickname: '新上级',
                avatar_url: '',
                invite_code: 'NEWPARENT'
            },
            {
                _id: 'user-2',
                id: 2,
                openid: 'candidate-openid',
                role_level: 0,
                nickname: '候选用户',
                avatar_url: '',
                referrer_openid: 'old-parent-openid',
                parent_openid: 'old-parent-openid',
                parent_id: 'parent-1'
            }
        ],
        directed_invites: [
            {
                _id: 'invite-2',
                invite_id: 'invite-2',
                inviter_openid: 'new-parent-openid',
                inviter_snapshot: { openid: 'new-parent-openid', nickname: '新上级', role_level: 4 },
                transfer_amount: 3000,
                frozen_amount: 3000,
                freeze_status: 'frozen',
                status: 'sent',
                review_status: '',
                ticket_id: 'ticket-2',
                ticket_expire_at: '2099-01-01T00:00:00.000Z',
                created_at: '2026-04-20T00:00:00.000Z',
                updated_at: '2026-04-20T00:00:00.000Z'
            }
        ]
    });

    const accepted = await acceptDirectedInvite(db, null, 'candidate-openid', {
        ticket: 'ticket-2'
    });

    assert.equal(accepted.status, 'accepted');
    assert.equal(accepted.review_status, 'pending');
    assert.equal(accepted.reroute, true);
    assert.equal(accepted.can_reroute, true);
    assert.equal(db.collections.directed_invites[0].reroute, true);
    assert.equal(db.collections.directed_invites[0].reroute_from_parent_openid, 'old-parent-openid');
    assert.equal(db.collections.directed_invites[0].reroute_from_parent_id, 'parent-1');
    assert.equal(db.collections.directed_invites[0].reroute_recalculate_history, false);
    assert.match(db.collections.directed_invites[0].reroute_required_review_note, /不回算历史订单、佣金与资金数据/);
});

test('acceptDirectedInvite rejects reroute when bound VIP0 has non-test paid orders', async () => {
    const db = createFakeDb({
        users: [
            {
                _id: 'parent-1',
                id: 11,
                openid: 'old-parent-openid',
                role_level: 4,
                nickname: '旧上级',
                avatar_url: '',
                invite_code: 'OLDPARENT'
            },
            {
                _id: 'inviter-1',
                id: 12,
                openid: 'new-parent-openid',
                role_level: 4,
                nickname: '新上级',
                avatar_url: '',
                invite_code: 'NEWPARENT'
            },
            {
                _id: 'user-2',
                id: 2,
                openid: 'candidate-openid',
                role_level: 0,
                nickname: '候选用户',
                avatar_url: '',
                referrer_openid: 'old-parent-openid',
                parent_openid: 'old-parent-openid',
                parent_id: 'parent-1'
            }
        ],
        orders: [
            {
                _id: 'order-1',
                order_no: 'ORDER-1',
                openid: 'candidate-openid',
                status: 'paid',
                is_test: false
            }
        ],
        directed_invites: [
            {
                _id: 'invite-2',
                invite_id: 'invite-2',
                inviter_openid: 'new-parent-openid',
                inviter_snapshot: { openid: 'new-parent-openid', nickname: '新上级', role_level: 4 },
                transfer_amount: 3000,
                frozen_amount: 3000,
                freeze_status: 'frozen',
                status: 'sent',
                review_status: '',
                ticket_id: 'ticket-2',
                ticket_expire_at: '2099-01-01T00:00:00.000Z',
                created_at: '2026-04-20T00:00:00.000Z',
                updated_at: '2026-04-20T00:00:00.000Z'
            }
        ]
    });

    await assert.rejects(
        () => acceptDirectedInvite(db, null, 'candidate-openid', { ticket: 'ticket-2' }),
        /非测试已支付订单/
    );
});
