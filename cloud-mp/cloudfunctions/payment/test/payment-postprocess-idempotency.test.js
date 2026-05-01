'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function createDbMock(options = {}) {
    const calls = [];
    const command = {
        exists: (value) => ({ op: 'exists', value }),
        in: (values) => ({ op: 'in', values }),
        inc: (value) => ({ op: 'inc', value }),
        or: (conditions) => ({ op: 'or', conditions }),
        remove: () => ({ op: 'remove' })
    };

    function collection(name) {
        if (name === 'orders') {
            return {
                where: (where) => ({
                    update: async ({ data }) => {
                        calls.push({ type: 'orders.where.update', where, data });
                        return { stats: { updated: 1 } };
                    }
                }),
                doc: (id) => ({
                    update: async ({ data }) => {
                        calls.push({ type: 'orders.doc.update', id, data });
                        return { stats: { updated: 1 } };
                    }
                })
            };
        }
        if (name === 'users') {
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
