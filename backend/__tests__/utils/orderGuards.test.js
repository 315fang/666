/**
 * orderGuards 单元测试（增强版）
 * 覆盖：getSafeRestoreQuantity, shouldRestoreCoupon, isManualStatusBypassRisk
 */
const {
    getSafeRestoreQuantity,
    shouldRestoreCoupon,
    isManualStatusBypassRisk,
} = require('../../utils/orderGuards');

describe('orderGuards', () => {

    // ======================== getSafeRestoreQuantity ========================
    describe('getSafeRestoreQuantity', () => {
        it('正常情况应返回请求数量', () => {
            expect(getSafeRestoreQuantity({
                orderQuantity: 10,
                requestedQuantity: 3,
                completedReturnRefundQuantity: 2
            })).toBe(3);
        });

        it('退货数量超过剩余量时应抛错', () => {
            expect(() => getSafeRestoreQuantity({
                orderQuantity: 5,
                requestedQuantity: 10,
                completedReturnRefundQuantity: 0
            })).toThrow('退货数量超过可退货数量');
        });

        it('已全部退款后再申请应抛错', () => {
            expect(() => getSafeRestoreQuantity({
                orderQuantity: 3,
                requestedQuantity: 1,
                completedReturnRefundQuantity: 3
            })).toThrow('退货数量超过可退货数量');
        });

        it('边界值: 刚好退完所有剩余应通过', () => {
            expect(getSafeRestoreQuantity({
                orderQuantity: 10,
                requestedQuantity: 7,
                completedReturnRefundQuantity: 3
            })).toBe(7);
        });

        it('非数字输入应使用 fallback=0', () => {
            expect(getSafeRestoreQuantity({
                orderQuantity: 'abc',
                requestedQuantity: 0,
                completedReturnRefundQuantity: null
            })).toBe(0);
        });

        it('负数输入应归零处理', () => {
            expect(getSafeRestoreQuantity({
                orderQuantity: -5,
                requestedQuantity: 0,
                completedReturnRefundQuantity: -3
            })).toBe(0);
        });
    });

    // ======================== shouldRestoreCoupon ========================
    describe('shouldRestoreCoupon', () => {
        it('无其他活跃订单时应恢复优惠券', () => {
            expect(shouldRestoreCoupon({ otherActiveOrderCount: 0 })).toBe(true);
            expect(shouldRestoreCoupon({ otherActiveOrderCount: -1 })).toBe(true);
        });

        it('有其他活跃订单时不恢复优惠券', () => {
            expect(shouldRestoreCoupon({ otherActiveOrderCount: 1 })).toBe(false);
            expect(shouldRestoreCoupon({ otherActiveOrderCount: 5 })).toBe(false);
        });

        it('null/undefined 应视为0（恢复优惠券）', () => {
            expect(shouldRestoreCoupon({ otherActiveOrderCount: null })).toBe(true);
            expect(shouldRestoreCoupon({})).toBe(true);
        });
    });

    // ======================== isManualStatusBypassRisk ========================
    describe('isManualStatusBypassRisk', () => {
        it('shipped 状态应返回 true', () => {
            expect(isManualStatusBypassRisk('shipped')).toBe(true);
        });

        it('refunded 状态应返回 true', () => {
            expect(isManualStatusBypassRisk('refunded')).toBe(true);
        });

        it('pending/paid 等其他状态应返回 false', () => {
            expect(isManualStatusBypassRisk('pending')).toBe(false);
            expect(isManualStatusBypassRisk('paid')).toBe(false);
            expect(isManualStatusBypassRisk('cancelled')).toBe(false);
        });

        it('大小写不敏感', () => {
            expect(isManualStatusBypassRisk('SHIPPED')).toBe(true);
            expect(isManualStatusBypassRisk('Refunded')).toBe(true);
        });

        it('null/undefined/空字符串应返回 false', () => {
            expect(isManualStatusBypassRisk(null)).toBe(false);
            expect(isManualStatusBypassRisk(undefined)).toBe(false);
            expect(isManualStatusBypassRisk('')).toBe(false);
        });
    });
});
