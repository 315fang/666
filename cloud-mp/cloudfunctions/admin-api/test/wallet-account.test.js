'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildWalletAccountWriteModel } = require('../src/shared/wallet-account');

test('buildWalletAccountWriteModel strips _id from cloud write payload', () => {
    const result = buildWalletAccountWriteModel({
        existingAccount: {
            _id: 'wallet-user-1',
            id: 'wallet-user-1',
            user_id: 'user-1',
            openid: 'openid-1',
            account_type: 'goods_fund',
            status: 'active',
            created_at: '2026-04-19T00:00:00.000Z'
        },
        accountId: 'wallet-user-1',
        userId: 'user-1',
        openid: 'openid-1',
        patch: {
            balance: 5200,
            updated_at: '2026-04-19T12:00:00.000Z'
        },
        createdAt: '2026-04-19T00:00:00.000Z'
    });

    assert.equal(result.accountId, 'wallet-user-1');
    assert.equal(result.localRow._id, 'wallet-user-1');
    assert.equal(result.localRow.balance, 5200);
    assert.equal(Object.prototype.hasOwnProperty.call(result.cloudData, '_id'), false);
    assert.equal(result.cloudData.id, 'wallet-user-1');
    assert.equal(result.cloudData.balance, 5200);
});
