'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildSlashExpireAt,
    normalizeSlashExpireHours,
    normalizeSlashRecordStatus,
    resolveSlashExpiryState
} = require('../shared/slash-expiry');

test('slash expiry writes bounded expiry time from activity hours', () => {
    assert.equal(normalizeSlashExpireHours(0), 1);
    assert.equal(normalizeSlashExpireHours(900), 720);

    const expireAt = buildSlashExpireAt(2, '2026-04-24T10:00:00.000Z');
    assert.equal(expireAt, '2026-04-24T12:00:00.000Z');
});

test('slash expiry falls back to created_at plus activity expire_hours for legacy records', () => {
    const state = resolveSlashExpiryState(
        { created_at: '2026-04-24T10:00:00.000Z' },
        { expire_hours: 2 },
        '2026-04-24T13:00:00.000Z'
    );

    assert.equal(state.expireAt, '2026-04-24T12:00:00.000Z');
    assert.equal(state.remainSeconds, 0);
    assert.equal(state.expired, true);
});

test('slash status treats completed records as expired after the deadline', () => {
    const status = normalizeSlashRecordStatus(
        {
            status: 'completed',
            current_price: 99,
            target_price: 99,
            expire_at: '2026-04-24T10:00:00.000Z'
        },
        {},
        '2026-04-24T10:00:01.000Z'
    );

    assert.equal(status, 'expired');
});

test('slash status keeps records purchasable before expiry', () => {
    const status = normalizeSlashRecordStatus(
        {
            status: 'active',
            current_price: 120,
            target_price: 99,
            expire_at: '2026-04-24T10:00:00.000Z'
        },
        {},
        '2026-04-24T09:59:00.000Z'
    );

    assert.equal(status, 'active');
});
