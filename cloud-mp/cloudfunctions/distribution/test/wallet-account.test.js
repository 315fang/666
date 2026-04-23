'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildWalletAccountSyncDoc } = require('../shared/wallet-account');

test('buildWalletAccountSyncDoc excludes _id from persisted data but preserves it in returned view', () => {
    const result = buildWalletAccountSyncDoc({
        walletAccount: {
            _id: 'wallet-user_1',
            created_at: '2026-04-19T00:00:00.000Z',
            account_type: 'goods_fund',
            status: 'active'
        },
        user: {
            openid: 'openid-1'
        },
        openid: 'openid-1',
        userId: 'user-1',
        balance: 3200,
        frozenBalance: 1800,
        now: '2026-04-19T12:00:00.000Z'
    });

    assert.equal(result.accountId, 'wallet-user_1');
    assert.equal(Object.prototype.hasOwnProperty.call(result.data, '_id'), false);
    assert.equal(result.data.id, 'wallet-user_1');
    assert.equal(result.data.balance, 3200);
    assert.equal(result.data.frozen_balance, 1800);
    assert.equal(result.view._id, 'wallet-user_1');
    assert.equal(result.view.frozen_balance, 1800);
});
