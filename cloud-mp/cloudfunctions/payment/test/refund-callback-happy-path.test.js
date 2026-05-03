'use strict';

/**
 * happy-path 单元测试：handleRefundCallback (canonical 退款回调路径)
 *
 * 背景（2026-05-03 审计 §P1-2）：
 *   payment.handleRefundCallback 是退款回调的 canonical 路径
 *   （admin-api/src/admin-refunds.js 里的 /admin/api/refunds/wechat-notify
 *   是 deprecated mirror，已加 [DEPRECATED-NOTIFY-HIT] 监控）。
 *   此前 payment/test/ 下 9 个测试无一直接覆盖 handleRefundCallback。
 *
 * 本文件只覆盖最高价值且 mock 成本低的 happy-path：
 *   1. 缺 out_refund_no 时不崩溃（防御微信畸形回调）
 *   2. 找不到 refund 记录时返回 SUCCESS（避免微信无限重试）
 *   3. refund 已处于终态时幂等（completed/failed 不重入）
 *      → 这条是 [DEPRECATED-NOTIFY-HIT] 监控的灵魂：即使 admin-api 旧路径
 *        被误命中触发同一条退款，handleRefundCallback 也保证不双倍处理。
 *
 * 不覆盖（成本超过价值）：
 *   - SUCCESS 路径完整结算（依赖 cancelPendingCommissionsForRefund /
 *     restoreRefundOrderInventory / reverseBuyerAssetsForRefund 等 10+ helper，
 *     全 mock 后测试本身比被测函数还大；属 Stage 6 集成测试范畴）。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadPaymentCallbackWithMocks(opts = {}) {
    const refundDocs = Array.isArray(opts.refundDocs) ? opts.refundDocs : [];
    const orderDocs = Array.isArray(opts.orderDocs) ? opts.orderDocs : [];
    const updateCalls = [];

    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                DYNAMIC_CURRENT_ENV: 'test-env',
                init: () => {},
                database: () => ({
                    command: {
                        in: (value) => ({ $in: value }),
                        lt: (value) => ({ $lt: value }),
                        gte: (value) => ({ $gte: value }),
                        inc: (value) => ({ $inc: value }),
                        push: (value) => ({ $push: value }),
                        remove: () => ({ $remove: true }),
                        or: (...value) => ({ $or: value })
                    },
                    collection: (name) => ({
                        where: (cond) => ({
                            limit: () => ({
                                get: async () => {
                                    if (name === 'refunds') return { data: refundDocs };
                                    if (name === 'orders') return { data: orderDocs };
                                    return { data: [] };
                                }
                            }),
                            update: async (payload) => {
                                updateCalls.push({ collection: name, where: cond, update: payload });
                                return { stats: { updated: 1 } };
                            },
                            get: async () => {
                                if (name === 'refunds') return { data: refundDocs };
                                if (name === 'orders') return { data: orderDocs };
                                return { data: [] };
                            }
                        }),
                        doc: () => ({
                            update: async (payload) => {
                                updateCalls.push({ collection: name, doc: true, update: payload });
                                return { stats: { updated: 1 } };
                            },
                            get: async () => ({ data: orderDocs[0] || null })
                        }),
                        add: async () => ({ _id: 'fake-id' })
                    }),
                    serverDate: () => new Date('2026-05-03T00:00:00.000Z')
                })
            };
        }
        // payment-deposit.handleDepositRefundCallback 是 handleRefundCallback 的第一步过滤；
        // mock 它返回 { handled: false } 让主路径继续走（本测试不覆盖押金退款分支）。
        if (request === './payment-deposit' && parent?.filename?.endsWith('payment-callback.js')) {
            return {
                handleDepositRefundCallback: async () => ({ handled: false })
            };
        }
        // wechat-pay-v3 在 handleRefundCallback 里**不**直接用，但 payment-callback.js
        // 顶层 require 它；为避免 require 解析真证书文件，照搬 security.test.js 的 stub。
        if (request === './wechat-pay-v3' && parent?.filename?.endsWith('payment-callback.js')) {
            return {
                verifySignature: () => true,
                decryptResource: () => ({}),
                loadPublicKey: async () => 'mock-public-key'
            };
        }
        return originalLoad(request, parent, isMain);
    };

    const modulePath = require.resolve('../payment-callback');
    delete require.cache[modulePath];
    const paymentCallback = require('../payment-callback');
    return {
        paymentCallback,
        updateCalls,
        restore: () => {
            Module._load = originalLoad;
            delete require.cache[modulePath];
        }
    };
}

test('handleRefundCallback returns SUCCESS without crashing when out_refund_no is missing', async () => {
    const harness = loadPaymentCallbackWithMocks();
    try {
        const result = await harness.paymentCallback.handleRefundCallback(
            { refund_status: 'SUCCESS' /* 故意缺 out_refund_no */ },
            'REFUND.SUCCESS'
        );
        assert.equal(result.code, 'SUCCESS', '畸形回调必须 ack SUCCESS 否则微信会无限重试');
        assert.equal(result.message, 'Missing refund no');
        assert.equal(harness.updateCalls.length, 0, '畸形回调不应触发任何 db 写入');
    } finally {
        harness.restore();
    }
});

test('handleRefundCallback returns SUCCESS when refund record does not exist (no infinite WeChat retry)', async () => {
    const harness = loadPaymentCallbackWithMocks({ refundDocs: [] });
    try {
        const result = await harness.paymentCallback.handleRefundCallback(
            { out_refund_no: 'NONEXISTENT-REFUND', refund_status: 'SUCCESS', refund_id: 'wx-refund-1' },
            'REFUND.SUCCESS'
        );
        assert.equal(result.code, 'SUCCESS');
        assert.equal(result.message, 'Refund record not found');
        assert.equal(harness.updateCalls.length, 0, '找不到 refund 不应有 db 写入');
    } finally {
        harness.restore();
    }
});

test('handleRefundCallback is idempotent when refund is already in completed terminal state', async () => {
    // 这一条直接对应 §P0-2 监控背景：admin-api 旧 wechat-notify 路径若被误命中，
    // 同一条退款会再次进入 canonical handler；终态幂等保证不会双倍取消佣金 / 双倍回退资产。
    const harness = loadPaymentCallbackWithMocks({
        refundDocs: [{
            _id: 'refund-doc-1',
            refund_no: 'REFUND-DUP-001',
            status: 'completed',
            order_id: 'order-1'
        }]
    });
    try {
        const result = await harness.paymentCallback.handleRefundCallback(
            { out_refund_no: 'REFUND-DUP-001', refund_status: 'SUCCESS', refund_id: 'wx-refund-2' },
            'REFUND.SUCCESS'
        );
        assert.equal(result.code, 'SUCCESS');
        assert.equal(result.message, 'Already in terminal state');
        assert.equal(harness.updateCalls.length, 0, '终态退款必须零写入，否则破坏幂等');
    } finally {
        harness.restore();
    }
});

test('handleRefundCallback is idempotent when refund is already in failed terminal state', async () => {
    const harness = loadPaymentCallbackWithMocks({
        refundDocs: [{
            _id: 'refund-doc-2',
            refund_no: 'REFUND-FAILED-002',
            status: 'failed',
            order_id: 'order-2'
        }]
    });
    try {
        const result = await harness.paymentCallback.handleRefundCallback(
            { out_refund_no: 'REFUND-FAILED-002', refund_status: 'ABNORMAL', refund_id: 'wx-refund-3' },
            'REFUND.ABNORMAL'
        );
        assert.equal(result.code, 'SUCCESS');
        assert.equal(result.message, 'Already in terminal state');
        assert.equal(harness.updateCalls.length, 0, '终态退款必须零写入，否则破坏幂等');
    } finally {
        harness.restore();
    }
});
