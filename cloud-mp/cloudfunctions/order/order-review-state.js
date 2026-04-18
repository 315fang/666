'use strict';

const REVIEW_MARKER = '[已评价]';

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function normalizeLookupToken(value) {
    if (!hasValue(value)) return '';
    return String(value).trim();
}

function uniqueTokens(values = []) {
    return [...new Set((Array.isArray(values) ? values : [values])
        .map((value) => normalizeLookupToken(value))
        .filter(Boolean))];
}

function hasReviewRemark(remark) {
    return normalizeLookupToken(remark).includes(REVIEW_MARKER);
}

function isExplicitlyReviewed(order = {}) {
    return order.reviewed === true || hasValue(order.reviewed_at) || hasReviewRemark(order.remark);
}

function collectOrderReviewLookupTokens(order = {}) {
    return uniqueTokens([
        order && order._id,
        order && order.id,
        order && order._legacy_id,
        order && order.order_no
    ]);
}

function collectReviewLookupTokens(review = {}) {
    return uniqueTokens([
        review && review.order_id,
        review && review.order_no
    ]);
}

function isOrderReviewed(order = {}, reviewLookup) {
    if (isExplicitlyReviewed(order)) return true;
    if (!reviewLookup || typeof reviewLookup.has !== 'function') return false;
    return collectOrderReviewLookupTokens(order).some((token) => reviewLookup.has(token));
}

function isPendingReviewOrder(order = {}, reviewLookup) {
    return normalizeLookupToken(order && order.status) === 'completed' && !isOrderReviewed(order, reviewLookup);
}

module.exports = {
    REVIEW_MARKER,
    hasReviewRemark,
    isExplicitlyReviewed,
    collectOrderReviewLookupTokens,
    collectReviewLookupTokens,
    isOrderReviewed,
    isPendingReviewOrder
};
