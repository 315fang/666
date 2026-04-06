const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getSafeRestoreQuantity,
    shouldRestoreCoupon,
    isManualStatusBypassRisk
} = require('../../utils/orderGuards');

test('getSafeRestoreQuantity returns requested quantity when within remaining limit', () => {
    const qty = getSafeRestoreQuantity({
        orderQuantity: 5,
        requestedQuantity: 2,
        completedReturnRefundQuantity: 1
    });

    assert.equal(qty, 2);
});

test('getSafeRestoreQuantity throws when requested quantity exceeds remaining limit', () => {
    assert.throws(() => {
        getSafeRestoreQuantity({
            orderQuantity: 5,
            requestedQuantity: 5,
            completedReturnRefundQuantity: 2
        });
    }, /超过可退货数量/);
});

test('shouldRestoreCoupon returns false when there are other active orders using coupon', () => {
    const ok = shouldRestoreCoupon({ otherActiveOrderCount: 1 });
    assert.equal(ok, false);
});

test('shouldRestoreCoupon returns true when no other active orders use coupon', () => {
    const ok = shouldRestoreCoupon({ otherActiveOrderCount: 0 });
    assert.equal(ok, true);
});

test('isManualStatusBypassRisk flags shipped as bypass risk', () => {
    assert.equal(isManualStatusBypassRisk('shipped'), true);
    assert.equal(isManualStatusBypassRisk('completed'), false);
});
