'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function createDbMock(options = {}) {
    const calls = [];
    const mutableOrder = options.order ? { ...options.order } : null;
    const mutableOrders = Array.isArray(options.orders)
        ? options.orders.map((row) => ({ ...row }))
        : (mutableOrder ? [mutableOrder] : []);
    const mutableUsers = Array.isArray(options.users) ? options.users : null;
    const mutableCommissions = Array.isArray(options.commissions) ? options.commissions : null;
    const command = {
        exists: (value) => ({ op: 'exists', value }),
        in: (values) => ({ op: 'in', values }),
        inc: (value) => ({ op: 'inc', value }),
        or: (conditions) => ({ op: 'or', conditions }),
        remove: () => ({ op: 'remove' })
    };

    function matches(row = {}, where = {}) {
        return Object.entries(where || {}).every(([key, expected]) => {
            if (expected && expected.op === 'in') return expected.values.map(String).includes(String(row[key]));
            if (expected && expected.op === 'exists') return expected.value ? row[key] !== undefined : row[key] === undefined;
            return String(row[key]) === String(expected);
        });
    }

    function applyData(target, data = {}) {
        Object.entries(data || {}).forEach(([key, value]) => {
            if (value && value.op === 'remove') {
                delete target[key];
                return;
            }
            if (value && value.op === 'inc') {
                target[key] = (Number(target[key]) || 0) + value.value;
                return;
            }
            target[key] = value;
        });
    }

    function collection(name) {
        if (name === 'orders') {
            function orderQuery(where = {}, offset = 0, limitCount = Infinity) {
                const scopedRows = () => mutableOrders.filter((row) => matches(row, where));
                return {
                    skip: (nextOffset) => orderQuery(where, nextOffset, limitCount),
                    limit: (nextLimit) => orderQuery(where, offset, nextLimit),
                    get: async () => ({ data: scopedRows().slice(offset, offset + limitCount).map((row) => ({ ...row })) }),
                    update: async ({ data }) => {
                        calls.push({ type: 'orders.where.update', where, data });
                        if (mutableOrders.length === 0) return { stats: { updated: 1 } };
                        const rows = scopedRows();
                        rows.forEach((row) => applyData(row, data));
                        return { stats: { updated: rows.length } };
                    }
                };
            }
            return {
                where: (where) => orderQuery(where),
                doc: (id) => ({
                    get: async () => {
                        const row = mutableOrders.find((item) => String(item._id || item.id) === String(id)) || mutableOrder;
                        return { data: row ? { ...row } : null };
                    },
                    update: async ({ data }) => {
                        calls.push({ type: 'orders.doc.update', id, data });
                        const row = mutableOrders.find((item) => String(item._id || item.id) === String(id)) || mutableOrder;
                        if (row) applyData(row, data);
                        return { stats: { updated: row ? 1 : (mutableOrders.length === 0 ? 1 : 0) } };
                    }
                })
            };
        }
        if (name === 'users') {
            if (mutableUsers) {
                return {
                    where: (where) => ({
                        limit: () => ({
                            get: async () => ({ data: mutableUsers.filter((row) => matches(row, where)) })
                        }),
                        update: async ({ data }) => {
                            calls.push({ type: 'users.update', where, data });
                            const rows = mutableUsers.filter((row) => matches(row, where));
                            rows.forEach((row) => applyData(row, data));
                            return { stats: { updated: rows.length } };
                        }
                    }),
                    doc: (id) => ({
                        get: async () => ({ data: mutableUsers.find((row) => String(row._id || row.id) === String(id)) || null }),
                        update: async ({ data }) => {
                            const row = mutableUsers.find((item) => String(item._id || item.id) === String(id));
                            if (row) applyData(row, data);
                            return { stats: { updated: row ? 1 : 0 } };
                        }
                    })
                };
            }
            return {
                where: (where) => ({
                    limit: () => ({
                        get: async () => ({ data: [{ openid: where.openid, role_level: 0 }] })
                    }),
                    update: async ({ data }) => {
                        calls.push({ type: 'users.update', where, data });
                        if (options.failUserUpdate) throw new Error('user update failed');
                        return { stats: { updated: 1 } };
                    }
                }),
                doc: () => ({
                    get: async () => ({ data: null })
                })
            };
        }
        if (name === 'point_logs') {
            return {
                where: () => ({
                    limit: () => ({
                        get: async () => ({ data: [] })
                    })
                }),
                add: async ({ data }) => {
                    calls.push({ type: 'point_logs.add', data });
                    return { _id: 'point-log-1' };
                }
            };
        }
        if (name === 'configs' || name === 'app_configs') {
            return {
                where: () => ({
                    limit: () => ({
                        get: async () => ({ data: [] })
                    })
                })
            };
        }
        if (name === 'commissions') {
            if (mutableCommissions) {
                return {
                    where: (where = {}) => ({
                        limit: () => ({ get: async () => ({ data: mutableCommissions.filter((row) => matches(row, where)) }) }),
                        get: async () => ({ data: mutableCommissions.filter((row) => matches(row, where)) }),
                        update: async ({ data }) => {
                            calls.push({ type: 'commissions.update', where, data });
                            const rows = mutableCommissions.filter((row) => matches(row, where));
                            rows.forEach((row) => applyData(row, data));
                            return { stats: { updated: rows.length } };
                        }
                    }),
                    doc: (id) => ({
                        update: async ({ data }) => {
                            calls.push({ type: 'commissions.doc.update', id, data });
                            const row = mutableCommissions.find((item) => String(item._id || item.id) === String(id));
                            if (row) applyData(row, data);
                            return { stats: { updated: row ? 1 : 0 } };
                        }
                    }),
                    add: async ({ data }) => {
                        calls.push({ type: 'commissions.add', data });
                        const row = { _id: `commission-${mutableCommissions.length + 1}`, ...data };
                        mutableCommissions.push(row);
                        return { _id: row._id };
                    }
                };
            }
            return {
                where: () => ({
                    limit: () => ({ get: async () => ({ data: [] }) })
                }),
                add: async ({ data }) => {
                    calls.push({ type: 'commissions.add', data });
                    return { _id: 'commission-1' };
                }
            };
        }
        return {
            where: () => ({
                limit: () => ({ get: async () => ({ data: [] }) }),
                get: async () => ({ data: [] }),
                update: async () => ({ stats: { updated: 1 } })
            }),
            doc: () => ({
                get: async () => ({ data: null }),
                update: async () => ({ stats: { updated: 1 } })
            }),
            add: async () => ({ _id: 'unused' })
        };
    }

    return {
        calls,
        db: {
            command,
            serverDate: () => new Date('2026-05-01T00:00:00.000Z'),
            collection
        }
    };
}

function loadPaymentCallback(db) {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                DYNAMIC_CURRENT_ENV: 'test-env',
                init: () => {},
                database: () => db
            };
        }
        if (parent?.filename?.endsWith('payment-callback.js')) {
            if (request === './wechat-pay-v3') {
                return {
                    verifySignature: () => true,
                    decryptResource: () => ({}),
                    loadPublicKey: async () => 'mock-public-key'
                };
            }
            if (request === './payment-deposit') {
                return {
                    handleDepositPaidCallback: async () => ({ handled: false }),
                    handleDepositRefundCallback: async () => ({ handled: false })
                };
            }
            if (request === './payment-transfer') {
                return { handleTransferCallbackNotification: async () => ({ handled: false }) };
            }
            if (request === './promotion-lineage') {
                return { applyPromotionSeparation: async () => ({ skipped: true }) };
            }
            if (request === './upgrade-piggy-bank') {
                return {
                    DEFAULT_UPGRADE_PIGGY_BANK_CONFIG: {},
                    createUpgradePiggyBankForOrder: async () => ({ skipped: true }),
                    reverseUpgradePiggyBankForRefund: async () => ({ skipped: true }),
                    unlockUpgradePiggyBankForRole: async () => ({ skipped: true })
                };
            }
        }
        return originalLoad(request, parent, isMain);
    };

    const modulePath = require.resolve('../payment-callback');
    delete require.cache[modulePath];
    try {
        return require('../payment-callback');
    } finally {
        Module._load = originalLoad;
        delete require.cache[modulePath];
    }
}

test('ensurePointsAwarded writes completion marker only after user update and point log', async () => {
    const { db, calls } = createDbMock();
    const paymentCallback = loadPaymentCallback(db);

    await paymentCallback._test.ensurePointsAwarded('order-1', {
        _id: 'order-1',
        openid: 'buyer-openid',
        pay_amount: 100,
        total_amount: 100
    });

    const userUpdateIndex = calls.findIndex((call) => call.type === 'users.update');
    const logIndex = calls.findIndex((call) => call.type === 'point_logs.add');
    const completeIndex = calls.findIndex((call) => call.type === 'orders.doc.update' && call.data.points_awarded_at);

    assert.ok(userUpdateIndex >= 0);
    assert.ok(logIndex > userUpdateIndex);
    assert.ok(completeIndex > logIndex);
    const userPatch = calls[userUpdateIndex].data;
    assert.equal(userPatch.points, undefined);
    assert.equal(userPatch.growth_value.value, 100);
    const pointLog = calls[logIndex].data;
    assert.equal(pointLog.status, 'frozen');
    assert.equal(pointLog.amount, 50);
    assert.equal(pointLog.release_at instanceof Date, true);
    const completePatch = calls[completeIndex].data;
    assert.equal(completePatch.points_award_status, 'frozen');
    assert.equal(completePatch.reward_points_released_total, 0);
});

test('ensurePointsAwarded clears processing lock without completion marker when user update fails', async () => {
    const { db, calls } = createDbMock({ failUserUpdate: true });
    const paymentCallback = loadPaymentCallback(db);

    await assert.rejects(
        () => paymentCallback._test.ensurePointsAwarded('order-1', {
            _id: 'order-1',
            openid: 'buyer-openid',
            pay_amount: 100,
            total_amount: 100
        }),
        /用户积分\/成长值更新失败|user update failed/
    );

    const failurePatch = calls.find((call) => call.type === 'orders.doc.update' && call.data.points_award_error);
    assert.ok(failurePatch);
    assert.equal(failurePatch.data.points_awarded_at, undefined);
    assert.deepEqual(failurePatch.data.points_awarding_at, { op: 'remove' });
});

test('ensurePointsAwarded skips rewards when refund progress already exists', async () => {
    const { db, calls } = createDbMock();
    const paymentCallback = loadPaymentCallback(db);

    const result = await paymentCallback._test.ensurePointsAwarded('order-1', {
        _id: 'order-1',
        openid: 'buyer-openid',
        status: 'paid',
        pay_amount: 100,
        total_amount: 100,
        refunded_cash_total: 100,
        refunded_at: '2026-05-01T00:00:00.000Z'
    });

    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'refund_progress_exists');
    assert.equal(calls.some((call) => call.type === 'users.update'), false);
    assert.equal(calls.some((call) => call.type === 'point_logs.add'), false);
    const completePatch = calls.find((call) => call.type === 'orders.doc.update' && call.data.points_awarded_at);
    assert.ok(completePatch);
    assert.equal(completePatch.data.points_earned, 0);
    assert.equal(completePatch.data.growth_earned, 0);
});

test('processPaidOrder skips all post-pay benefits after a settled refund', async () => {
    const { db, calls } = createDbMock({
        order: {
            _id: 'order-1',
            openid: 'buyer-openid',
            status: 'paid',
            pay_amount: 100,
            total_amount: 100,
            refunded_cash_total: 100,
            refunded_quantity_total: 1,
            refunded_at: '2026-05-01T00:00:00.000Z'
        }
    });
    const paymentCallback = loadPaymentCallback(db);

    const result = await paymentCallback.processPaidOrder('order-1', {
        _id: 'order-1',
        openid: 'buyer-openid',
        status: 'paid',
        pay_amount: 100,
        total_amount: 100
    });

    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'refund_progress_exists');
    assert.equal(calls.some((call) => call.type === 'users.update'), false);
    assert.equal(calls.some((call) => call.type === 'point_logs.add'), false);
    assert.equal(calls.some((call) => call.type === 'commissions.add'), false);
    const skippedPatch = calls.find((call) => call.type === 'orders.doc.update' && call.data.payment_post_process_skipped_reason);
    assert.ok(skippedPatch);
    assert.equal(skippedPatch.data.payment_post_process_skipped_reason, 'refund_progress_exists');
    assert.equal(skippedPatch.data.points_earned, 0);
    assert.equal(skippedPatch.data.growth_earned, 0);
});

test('processPaidOrder does not finalize skip marker while refund is only pending', async () => {
    const { db, calls } = createDbMock({
        order: {
            _id: 'order-1',
            openid: 'buyer-openid',
            status: 'refunding',
            pay_amount: 100,
            total_amount: 100
        }
    });
    const paymentCallback = loadPaymentCallback(db);

    const result = await paymentCallback.processPaidOrder('order-1', {
        _id: 'order-1',
        openid: 'buyer-openid',
        status: 'paid',
        pay_amount: 100,
        total_amount: 100
    });

    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'status_refunding');
    assert.equal(calls.some((call) => call.type === 'users.update'), false);
    assert.equal(calls.some((call) => call.type === 'orders.doc.update' && call.data.payment_post_processed_at), false);
});

test('ensureCommissionsCreated marks completion after the commission path is resolved', async () => {
    const { db, calls } = createDbMock();
    const paymentCallback = loadPaymentCallback(db);

    const result = await paymentCallback._test.ensureCommissionsCreated('order-1', {
        _id: 'order-1',
        openid: '',
        pay_amount: 0,
        total_amount: 0
    });

    assert.equal(result.created, 0);
    const completePatch = calls.find((call) => call.type === 'orders.doc.update' && call.data.commissions_created_at);
    assert.ok(completePatch);
    assert.deepEqual(completePatch.data.commissions_creating_at, { op: 'remove' });
});

test('refund growth clawback uses stored growth_earned snapshot', () => {
    const { db } = createDbMock();
    const paymentCallback = loadPaymentCallback(db);

    const settlement = paymentCallback._test.buildOrderPatchAfterRefund({
        _id: 'order-1',
        status: 'paid',
        pay_amount: 100,
        growth_earned: 20,
        points_earned: 10,
        quantity: 2,
        refunded_cash_total: 0,
        refunded_quantity_total: 0,
        items: [
            { refund_item_key: 'item-1', quantity: 2, item_amount: 100, cash_paid_allocated_amount: 100 }
        ]
    }, {
        _id: 'refund-1',
        amount: 50,
        refund_quantity_effective: 1,
        refund_items: [{ refund_item_key: 'item-1', quantity: 1, cash_refund_amount: 50 }]
    });

    assert.equal(settlement.growthClawback, 10);
    assert.equal(settlement.growthClawbackBasis, 'order_growth_earned');
});

test('upgrade growth ignores paid order growth before effective window', async () => {
    const { db } = createDbMock({
        orders: [
            {
                _id: 'order-1',
                openid: 'buyer-openid',
                status: 'paid',
                pay_amount: 3000,
                growth_earned: 3000,
                growth_clawback_total: 0
            }
        ]
    });
    const paymentCallback = loadPaymentCallback(db);

    const stableGrowth = await paymentCallback._test.getStableUpgradeGrowth('buyer-openid', 3000, 7);
    const nextRole = paymentCallback._test.deriveEligibleRoleLevel(0, 0, [], 0, undefined, stableGrowth);

    assert.equal(stableGrowth, 0);
    assert.equal(nextRole, 0);
});

test('refund does not claw back frozen order reward points before release', () => {
    const { db } = createDbMock();
    const paymentCallback = loadPaymentCallback(db);

    const settlement = paymentCallback._test.buildOrderPatchAfterRefund({
        _id: 'order-1',
        status: 'paid',
        pay_amount: 100,
        growth_earned: 20,
        points_earned: 10,
        points_award_status: 'frozen',
        reward_points_released_total: 0,
        quantity: 1,
        refunded_cash_total: 0,
        refunded_quantity_total: 0,
        items: [
            { refund_item_key: 'item-1', quantity: 1, item_amount: 100, cash_paid_allocated_amount: 100 }
        ]
    }, {
        _id: 'refund-1',
        amount: 100,
        refund_quantity_effective: 1,
        refund_items: [{ refund_item_key: 'item-1', quantity: 1, cash_refund_amount: 100 }]
    });

    assert.equal(settlement.rewardPointsClawback, 0);
    assert.equal(settlement.growthClawback, 20);
});

test('refund claws back released order reward points only', () => {
    const { db } = createDbMock();
    const paymentCallback = loadPaymentCallback(db);

    const settlement = paymentCallback._test.buildOrderPatchAfterRefund({
        _id: 'order-1',
        status: 'paid',
        pay_amount: 100,
        growth_earned: 20,
        points_earned: 10,
        points_award_status: 'partially_released',
        reward_points_released_total: 6,
        quantity: 1,
        refunded_cash_total: 0,
        refunded_quantity_total: 0,
        items: [
            { refund_item_key: 'item-1', quantity: 1, item_amount: 100, cash_paid_allocated_amount: 100 }
        ]
    }, {
        _id: 'refund-1',
        amount: 100,
        refund_quantity_effective: 1,
        refund_items: [{ refund_item_key: 'item-1', quantity: 1, cash_refund_amount: 100 }]
    });

    assert.equal(settlement.rewardPointsClawback, 6);
    assert.equal(settlement.growthClawback, 20);
});

test('clawBackSettledCommissions converts commission shortfall into debt', async () => {
    const users = [{
        _id: 'user-1',
        openid: 'agent-openid',
        balance: 5,
        commission_balance: 5,
        total_earned: 5,
        debt_amount: 2
    }];
    const commissions = [{
        _id: 'commission-1',
        order_id: 'order-1',
        order_no: 'ORDER-1',
        openid: 'agent-openid',
        amount: 12,
        status: 'settled'
    }];
    const { db } = createDbMock({ users, commissions });
    const paymentCallback = loadPaymentCallback(db);

    await paymentCallback._test.clawBackSettledCommissions('order-1');

    assert.equal(users[0].balance, 0);
    assert.equal(users[0].commission_balance, 0);
    assert.equal(users[0].total_earned, 0);
    assert.equal(users[0].debt_amount, 9);
    assert.equal(commissions[0].status, 'cancelled');
    assert.equal(commissions[0].commission_cancel_scope, 'whole_order_on_any_refund');
    assert.equal(commissions[0].commission_cancel_policy, 'partial_refund_policy_v1');
    assert.equal(commissions[0].clawback_debited, 5);
    assert.equal(commissions[0].clawback_debt_added, 7);
});

test('ensurePeerBonusCreated creates Lv6 store same-level cash bonus at 20 percent', async () => {
    const users = [
        { _id: 'parent-user', id: 1001, openid: 'parent-openid', role_level: 6 },
        { _id: 'buyer-user', id: 1002, openid: 'buyer-openid', parent_openid: 'parent-openid', role_level: 6 }
    ];
    const commissions = [];
    const { db } = createDbMock({ users, commissions });
    const paymentCallback = loadPaymentCallback(db);

    const result = await paymentCallback._test.ensurePeerBonusCreated('order-store-lv6', {
        _id: 'order-store-lv6',
        order_no: 'ORD-STORE-LV6',
        openid: 'buyer-openid',
        pay_amount: 30000
    }, {
        upgraded: true,
        nextRoleLevel: 6,
        roleName: '线下实体门店',
        previousParentOpenid: 'parent-openid'
    });

    assert.equal(result.created, true);
    assert.equal(result.amount, 6000);
    assert.equal(result.bonusLevel, 6);
    assert.equal(result.version, 'store_cash');
    assert.equal(commissions.length, 1);
    assert.equal(commissions[0].type, 'same_level');
    assert.equal(commissions[0].status, 'frozen');
    assert.equal(commissions[0].bonus_role_level, 6);
    assert.equal(commissions[0].exchange_coupons, 0);
    assert.ok(commissions[0].refund_deadline instanceof Date);
});
