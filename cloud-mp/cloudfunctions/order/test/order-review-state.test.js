'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    REVIEW_MARKER,
    isOrderReviewed,
    isPendingReviewOrder
} = require('../order-review-state');

test('completed and unreviewed order enters pending_review', () => {
    const order = {
        _id: 'order-100',
        order_no: 'ORD100',
        status: 'completed'
    };

    assert.equal(isPendingReviewOrder(order, new Set()), true);
});

test('review markers from flag, reviewed_at, remark, or review lookup exclude pending_review', () => {
    const reviewLookup = new Set(['order-104']);

    assert.equal(isOrderReviewed({ _id: 'order-101', status: 'completed', reviewed: true }, reviewLookup), true);
    assert.equal(isOrderReviewed({ _id: 'order-102', status: 'completed', reviewed_at: '2026-04-18T10:00:00.000Z' }, reviewLookup), true);
    assert.equal(isOrderReviewed({ _id: 'order-103', status: 'completed', remark: `物流正常 ${REVIEW_MARKER}` }, reviewLookup), true);
    assert.equal(isOrderReviewed({ _id: 'order-104', status: 'completed' }, reviewLookup), true);

    assert.equal(isPendingReviewOrder({ _id: 'order-101', status: 'completed', reviewed: true }, reviewLookup), false);
    assert.equal(isPendingReviewOrder({ _id: 'order-102', status: 'completed', reviewed_at: '2026-04-18T10:00:00.000Z' }, reviewLookup), false);
    assert.equal(isPendingReviewOrder({ _id: 'order-103', status: 'completed', remark: `物流正常 ${REVIEW_MARKER}` }, reviewLookup), false);
    assert.equal(isPendingReviewOrder({ _id: 'order-104', status: 'completed' }, reviewLookup), false);
});

test('shipped order never enters pending_review even if unreviewed', () => {
    const order = {
        _id: 'order-105',
        order_no: 'ORD105',
        status: 'shipped'
    };

    assert.equal(isPendingReviewOrder(order, new Set()), false);
});
