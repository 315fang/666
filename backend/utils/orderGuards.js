function toInt(value, fallback = 0) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
}

function getSafeRestoreQuantity({ orderQuantity, requestedQuantity, completedReturnRefundQuantity }) {
    const total = Math.max(0, toInt(orderQuantity, 0));
    const requested = Math.max(0, toInt(requestedQuantity, 0));
    const completed = Math.max(0, toInt(completedReturnRefundQuantity, 0));

    const remaining = Math.max(0, total - completed);
    if (requested > remaining) {
        throw new Error(`退货数量超过可退货数量（本次${requested}，剩余${remaining}）`);
    }

    return requested;
}

function shouldRestoreCoupon({ otherActiveOrderCount }) {
    return Number(otherActiveOrderCount || 0) <= 0;
}

function isManualStatusBypassRisk(status) {
    return ['shipped', 'refunded'].includes(String(status || '').toLowerCase());
}

module.exports = {
    getSafeRestoreQuantity,
    shouldRestoreCoupon,
    isManualStatusBypassRisk
};
