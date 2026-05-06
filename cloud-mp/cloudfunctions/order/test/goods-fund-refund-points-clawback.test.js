'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function applyDataPatch(target, data = {}) {
    Object.entries(data).forEach(([key, value]) => {
        if (value && value.__op === 'inc') {
            target[key] = (Number(target[key]) || 0) + value.value;
            return;
        }
        if (value && value.__op === 'remove') {
            delete target[key];
            return;
        }
        target[key] = value;
    });
}

function createQuery({ get = async () => ({ data: [] }), update = async () => ({ stats: { updated: 1 } }) } = {}) {
    return {
        limit: () => createQuery({ get, update }),
        get,
        update
    };
}

function matchesCriteria(row = {}, criteria = {}) {
    return Object.entries(criteria || {}).every(([key, expected]) => {
        if (expected && expected.__op === 'in') {
            return expected.values.map(String).includes(String(row[key]));
        }
        return String(row[key]) === String(expected);
    });
}

function createDbMock(options = {}) {
    const command = {
        inc: (value) => ({ __op: 'inc', value }),
        in: (values) => ({ __op: 'in', values }),
        or: (conditions) => ({ __op: 'or', conditions }),
        remove: () => ({ __op: 'remove' })
    };
    const user = {
        _id: 'user-doc-1',
        id: 1,
        openid: 'buyer-openid',
        points: options.userPoints ?? 50,
        growth_value: options.userGrowthValue ?? 200,
        total_spent: 100,
        order_count: 1,
        agent_wallet_balance: 0,
        wallet_balance: 0
    };
    const walletAccount = {
        _id: 'wallet-1',
        id: 'wallet-1',
        user_id: 1,
        openid: 'buyer-openid',
        balance: 0
    };
    const order = {
        _id: 'order-1',
        id: 'order-1',
        order_no: 'ORD-GF-1',
        openid: 'buyer-openid',
        status: 'paid',
        payment_method: 'goods_fund',
        pay_amount: 100,
        total_amount: 100,
        points_earned: 10,
        growth_earned: 100,
        reward_points_clawback_total: 0,
        growth_clawback_total: 0,
        items: [
            {
                product_id: 'product-1',
                sku_id: '',
                quantity: 1,
                item_amount: 100,
                cash_paid_allocated_amount: 100,
                refunded_quantity: 0,
                refunded_cash_amount: 0,
                refund_item_key: 'product-1::nosku::0',
                refund_basis_version: 'snapshot_v1'
            }
        ]
    };
    const refund = {
        _id: 'refund-1',
        id: 'refund-1',
        order_id: 'order-1',
        order_no: 'ORD-GF-1',
        refund_no: 'REF-GF-1',
        openid: 'buyer-openid',
        status: 'processing',
        payment_method: 'goods_fund',
        amount: 100,
        refund_amount: 100,
        type: 'refund_only',
        refund_quantity_effective: 1,
        refund_items: [
            {
                refund_item_key: 'product-1::nosku::0',
                product_id: 'product-1',
                sku_id: '',
                quantity: 1,
                cash_refund_amount: 100
            }
        ]
    };
    const refunds = options.includeInitialRefund === false ? [] : [refund];
    const commissions = options.commissions || [];

    const adds = [];
    const db = {
        command,
        serverDate: () => '2026-05-04T00:00:00.000Z',
        collection: (name) => {
            if (name === 'users') {
                return {
                    where: () => createQuery({
                        get: async () => ({ data: [user] }),
                        update: async ({ data }) => {
                            applyDataPatch(user, data);
                            return { stats: { updated: 1 } };
                        }
                    })
                };
            }
            if (name === 'wallet_accounts') {
                return {
                    where: () => createQuery({ get: async () => ({ data: [walletAccount] }) }),
                    doc: () => ({
                        update: async ({ data }) => {
                            applyDataPatch(walletAccount, data);
                            return { stats: { updated: 1 } };
                        },
                        set: async ({ data }) => {
                            applyDataPatch(walletAccount, data);
                            return { stats: { updated: 1 } };
                        }
                    })
                };
            }
            if (name === 'orders') {
                return {
                    doc: () => ({
                        get: async () => ({ data: order }),
                        update: async ({ data }) => {
                            applyDataPatch(order, data);
                            return { stats: { updated: 1 } };
                        }
                    })
                };
            }
            if (name === 'refunds') {
                return {
                    where: (criteria = {}) => createQuery({
                        get: async () => ({ data: refunds.filter((row) => matchesCriteria(row, criteria)) })
                    }),
                    add: async ({ data }) => {
                        const row = { _id: `refund-${refunds.length + 1}`, ...data };
                        refunds.push(row);
                        adds.push({ collection: name, data: row });
                        return { _id: row._id };
                    },
                    doc: () => ({
                        get: async () => ({ data: refunds[0] || null }),
                        update: async ({ data }) => {
                            if (refunds[0]) applyDataPatch(refunds[0], data);
                            return { stats: { updated: 1 } };
                        }
                    })
                };
            }
            if (name === 'commissions') {
                return {
                    where: (criteria = {}) => createQuery({
                        get: async () => ({ data: commissions.filter((row) => matchesCriteria(row, criteria)) }),
                        update: async ({ data }) => {
                            const rows = commissions.filter((row) => matchesCriteria(row, criteria));
                            rows.forEach((row) => applyDataPatch(row, data));
                            return { stats: { updated: rows.length } };
                        }
                    }),
                    add: async ({ data }) => {
                        const row = { _id: `commission-${commissions.length + 1}`, ...data };
                        commissions.push(row);
                        adds.push({ collection: name, data: row });
                        return { _id: row._id };
                    }
                };
            }
            if (name === 'wallet_logs' || name === 'goods_fund_logs') {
                return {
                    where: () => createQuery({ get: async () => ({ data: [] }) }),
                    add: async ({ data }) => {
                        adds.push({ collection: name, data });
                        return { _id: `${name}-${adds.length}` };
                    },
                    doc: () => ({ remove: async () => ({ stats: { removed: 1 } }) })
                };
            }
            return {
                where: () => createQuery(),
                doc: () => ({
                    get: async () => ({ data: null }),
                    update: async () => ({ stats: { updated: 1 } }),
                    remove: async () => ({ stats: { removed: 1 } })
                }),
                add: async ({ data } = {}) => {
                    adds.push({ collection: name, data });
                    return { _id: `${name}-${adds.length}` };
                }
            };
        }
    };

    return { db, user, walletAccount, order, refund, refunds, commissions };
}

function loadOrderLifecycleWithDb(db, options = {}) {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                DYNAMIC_CURRENT_ENV: 'test-env',
                init: () => {},
                database: () => db
            };
        }
        if (request === './order-query') {
            return {
                getOrderByIdOrNo: async () => options.order || null,
                listRefunds: async () => [],
                getRefundDetail: async () => null
            };
        }
        if (request === './order-coupon') {
            return { restoreUsedCoupon: async () => ({ restored: true }) };
        }
        if (request === './pickup-station-stock') {
            return {
                releasePickupStationInventoryForOrder: async () => ({ released: 0 }),
                restorePickupStationInventoryForRefund: async () => ({ restored: 0 }),
                rollbackPickupStationPrincipalForOrder: async () => ({ reversed: false })
            };
        }
        return originalLoad(request, parent, isMain);
    };

    const modulePath = require.resolve('../order-lifecycle');
    delete require.cache[modulePath];
    try {
        return {
            module: require('../order-lifecycle'),
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

test('goods fund refund claws back paid order reward points and clamps growth at zero', async () => {
    const { db, user, walletAccount, order, refund } = createDbMock({ userGrowthValue: 20 });
    const { module, restore } = loadOrderLifecycleWithDb(db);
    try {
        await module.completeGoodsFundRefundSettlement('order-1', order, refund);

        assert.equal(user.agent_wallet_balance, 100);
        assert.equal(user.wallet_balance, 100);
        assert.equal(walletAccount.balance, 100);
        assert.equal(user.points, 40);
        assert.equal(user.growth_value, 0);
        assert.equal(user.total_spent, 0);
        assert.equal(user.order_count, 0);
        assert.equal(order.reward_points_clawback_total, 10);
        assert.equal(order.growth_clawback_total, 100);
        assert.equal(order.status, 'refunded');
        assert.equal(refund.reward_points_clawback_amount, 10);
        assert.equal(refund.growth_clawback_amount, 100);
        assert.equal(refund.growth_clawback_basis, 'order_growth_earned');
        assert.equal(refund.status, 'completed');
        assert.ok(refund.buyer_assets_reversed_at);
    } finally {
        restore();
    }
});

test('goods fund refund records spent reward point shortfall as negative balance', async () => {
    const { db, user, order, refund } = createDbMock({ userPoints: 3, userGrowthValue: 20 });
    const { module, restore } = loadOrderLifecycleWithDb(db);
    try {
        await module.completeGoodsFundRefundSettlement('order-1', order, refund);

        assert.equal(user.points, -7);
        assert.equal(user.growth_value, 0);
        assert.equal(order.reward_points_clawback_total, 10);
        assert.equal(refund.reward_points_clawback_amount, 10);
    } finally {
        restore();
    }
});

test('goods fund refund creates idempotent refund development fee ledger', async () => {
    const { db, order, refund, commissions } = createDbMock({
        userGrowthValue: 20,
        commissions: [{
            _id: 'same-level-1',
            order_id: 'order-1',
            order_no: 'ORD-GF-1',
            openid: 'store-openid',
            user_id: 'store-user',
            type: 'same_level',
            status: 'frozen',
            bonus_role_level: 6,
            amount: 20
        }]
    });
    const { module, restore } = loadOrderLifecycleWithDb(db);
    try {
        await module.completeGoodsFundRefundSettlement('order-1', order, refund);

        const devFee = commissions.find((row) => row.type === 'refund_dev_fee');
        assert.ok(devFee, 'expected refund development fee record');
        assert.equal(devFee.status, 'recorded');
        assert.equal(devFee.amount, 1.5);
        assert.equal(devFee.refund_id, 'refund-1');
        assert.equal(devFee.openid, 'store-openid');
        assert.equal(devFee.user_id, 'store-user');
        assert.equal(devFee.from_openid, 'buyer-openid');
        assert.equal(devFee.source_commission_id, 'same-level-1');

        await module.ensureRefundDevFeeRecord('order-1', order, refund);
        assert.equal(commissions.filter((row) => row.type === 'refund_dev_fee').length, 1);
    } finally {
        restore();
    }
});

test('goods fund refund does not deduct unreleased frozen reward points', async () => {
    const { db, user, order, refund } = createDbMock({ userPoints: 3, userGrowthValue: 20 });
    order.points_award_status = 'frozen';
    order.reward_points_released_total = 0;
    const { module, restore } = loadOrderLifecycleWithDb(db);
    try {
        await module.completeGoodsFundRefundSettlement('order-1', order, refund);

        assert.equal(user.points, 3);
        assert.equal(user.growth_value, 0);
        assert.equal(order.reward_points_clawback_total, 0);
        assert.equal(refund.reward_points_clawback_amount, 0);
    } finally {
        restore();
    }
});

test('goods fund return refund stays pending instead of auto completing from user apply', async () => {
    const { db, user, walletAccount, order, refunds } = createDbMock({ includeInitialRefund: false, userGrowthValue: 20 });
    order.status = 'shipped';
    const { module, restore } = loadOrderLifecycleWithDb(db, { order });
    try {
        const result = await module.applyRefund('buyer-openid', {
            order_id: 'order-1',
            type: 'return_refund',
            reason: '与商家协商一致退货',
            refund_quantity: 1,
            refund_items: [{ refund_item_key: 'product-1::nosku::0', quantity: 1 }]
        });

        assert.equal(result.success, true);
        assert.equal(result.auto_refunded, undefined);
        assert.equal(refunds.length, 1);
        assert.equal(refunds[0].status, 'pending');
        assert.equal(refunds[0].type, 'return_refund');
        assert.equal(order.status, 'refunding');
        assert.equal(user.agent_wallet_balance, 0);
        assert.equal(walletAccount.balance, 0);
        assert.equal(user.points, 50);
        assert.equal(user.growth_value, 20);
        assert.equal(order.refunded_cash_total || 0, 0);
    } finally {
        restore();
    }
});

test('goods fund refund-only stays pending instead of auto completing from user apply', async () => {
    const { db, user, walletAccount, order, refunds } = createDbMock({ includeInitialRefund: false, userGrowthValue: 20 });
    order.status = 'paid';
    const { module, restore } = loadOrderLifecycleWithDb(db, { order });
    try {
        const result = await module.applyRefund('buyer-openid', {
            order_id: 'order-1',
            type: 'refund_only',
            reason: '不想要了/买重复了',
            refund_quantity: 1,
            refund_items: [{ refund_item_key: 'product-1::nosku::0', quantity: 1 }]
        });

        assert.equal(result.success, true);
        assert.equal(result.auto_refunded, undefined);
        assert.equal(refunds.length, 1);
        assert.equal(refunds[0].status, 'pending');
        assert.equal(refunds[0].type, 'refund_only');
        assert.equal(order.status, 'refunding');
        assert.equal(user.agent_wallet_balance, 0);
        assert.equal(walletAccount.balance, 0);
        assert.equal(user.points, 50);
        assert.equal(user.growth_value, 20);
        assert.equal(order.refunded_cash_total || 0, 0);
    } finally {
        restore();
    }
});

test('return shipping keeps return refund approved for merchant completion', async () => {
    const { db, refund } = createDbMock();
    refund.type = 'return_refund';
    refund.status = 'approved';
    const { module, restore } = loadOrderLifecycleWithDb(db);
    try {
        const result = await module.returnShipping('buyer-openid', 'refund-1', {
            return_company: '顺丰速运',
            return_tracking_no: 'SF123456'
        });

        assert.equal(result.success, true);
        assert.equal(refund.status, 'approved');
        assert.equal(refund.return_company, '顺丰速运');
        assert.equal(refund.return_tracking_no, 'SF123456');
        assert.ok(refund.return_shipping_submitted_at);
    } finally {
        restore();
    }
});

test('return shipping requires tracking number', async () => {
    const { db, refund } = createDbMock();
    refund.type = 'return_refund';
    refund.status = 'approved';
    const { module, restore } = loadOrderLifecycleWithDb(db);
    try {
        await assert.rejects(
            () => module.returnShipping('buyer-openid', 'refund-1', { return_company: '顺丰速运' }),
            /退货物流单号/
        );
        assert.equal(refund.return_tracking_no, undefined);
    } finally {
        restore();
    }
});
