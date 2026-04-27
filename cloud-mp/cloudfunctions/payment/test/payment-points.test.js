'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadPaymentCallbackForTest() {
    const originalLoad = Module._load;

    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                DYNAMIC_CURRENT_ENV: 'test-env',
                init: () => {},
                database: () => ({
                    command: {},
                    collection: () => {
                        throw new Error('database should not be used in points unit tests');
                    },
                    serverDate: () => new Date('2026-04-27T00:00:00.000Z')
                })
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
                return {
                    handleTransferCallbackNotification: async () => ({ handled: false })
                };
            }
            if (request === './promotion-lineage') {
                return {
                    applyPromotionSeparation: async () => ({ skipped: true })
                };
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

test('order pay points use configured reward only without extra base points', () => {
    const { _test } = loadPaymentCallbackForTest();

    assert.equal(_test.calculateOrderPayPoints(3332.5, 500), 16662);
    assert.notEqual(_test.calculateOrderPayPoints(3332.5, 500), 19995);
    assert.equal(_test.calculateOrderPayPoints(3999, 500), 19995);
});

test('store role uses the level 5 points rule', () => {
    const { _test } = loadPaymentCallbackForTest();

    assert.equal(_test.resolvePointBenefitRoleLevel(6), 5);
});
