/**
 * OrderNumberService 单元测试
 */

const OrderNumberService = require('../../services/OrderNumberService');

describe('OrderNumberService', () => {
    describe('generateOrderNumber', () => {
        test('应该生成正确格式的订单号', () => {
            const orderNum = OrderNumberService.generateOrderNumber();

            expect(orderNum).toMatch(/^ORD\d{14}[A-F0-9]{2}\d{4}[A-F0-9]{2}$/);
            expect(orderNum).toHaveLength(25);
        });

        test('应该生成唯一的订单号', () => {
            const orderNum1 = OrderNumberService.generateOrderNumber();
            const orderNum2 = OrderNumberService.generateOrderNumber();

            expect(orderNum1).not.toBe(orderNum2);
        });

        test('批量生成应该返回唯一订单号', () => {
            const count = 100;
            const orderNumbers = OrderNumberService.generateBatch(count);

            expect(orderNumbers).toHaveLength(count);

            const uniqueNumbers = new Set(orderNumbers);
            expect(uniqueNumbers.size).toBe(count);
        });
    });

    describe('generateShortOrderNumber', () => {
        test('应该生成简化订单号', () => {
            const orderNum = OrderNumberService.generateShortOrderNumber();

            expect(orderNum).toMatch(/^\d{14}[A-F0-9]{2}\d{3}$/);
            expect(orderNum).toHaveLength(19);
        });
    });

    describe('parseOrderNumber', () => {
        test('应该正确解析订单号', () => {
            const orderNum = OrderNumberService.generateOrderNumber();
            const parsed = OrderNumberService.parseOrderNumber(orderNum);

            expect(parsed).not.toBeNull();
            expect(parsed.timestamp).toBeInstanceOf(Date);
            expect(parsed.machineId).toBeDefined();
            expect(parsed.sequence).toBeGreaterThanOrEqual(0);
            expect(parsed.dateString).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
        });

        test('应该处理无效订单号', () => {
            expect(OrderNumberService.parseOrderNumber(null)).toBeNull();
            expect(OrderNumberService.parseOrderNumber('')).toBeNull();
            expect(OrderNumberService.parseOrderNumber('invalid')).toBeNull();
        });
    });

    describe('isValidOrderNumber', () => {
        test('应该验证有效订单号', () => {
            const orderNum = OrderNumberService.generateOrderNumber();
            expect(OrderNumberService.isValidOrderNumber(orderNum)).toBe(true);
        });

        test('应该拒绝无效订单号', () => {
            expect(OrderNumberService.isValidOrderNumber(null)).toBe(false);
            expect(OrderNumberService.isValidOrderNumber('')).toBe(false);
            expect(OrderNumberService.isValidOrderNumber('ABC123')).toBe(false);
            expect(OrderNumberService.isValidOrderNumber('ORD123')).toBe(false);
        });

        test('应该拒绝错误前缀的订单号', () => {
            expect(OrderNumberService.isValidOrderNumber('ABC20260210143025A100012F')).toBe(false);
        });
    });

    describe('generateRefundNumber', () => {
        test('应该生成退款单号', () => {
            const refundNum = OrderNumberService.generateRefundNumber();

            expect(refundNum).toMatch(/^RFD\d{14}[A-F0-9]{2}\d{4}[A-F0-9]{2}$/);
            expect(refundNum).toHaveLength(25);
        });
    });

    describe('generateWithdrawalNumber', () => {
        test('应该生成提现单号', () => {
            const withdrawalNum = OrderNumberService.generateWithdrawalNumber();

            expect(withdrawalNum).toMatch(/^WDR\d{14}[A-F0-9]{2}\d{4}[A-F0-9]{2}$/);
            expect(withdrawalNum).toHaveLength(25);
        });
    });

    describe('性能测试', () => {
        test('应该在1秒内生成10000个唯一订单号', () => {
            const startTime = Date.now();
            const count = 10000;
            const orderNumbers = [];

            for (let i = 0; i < count; i++) {
                orderNumbers.push(OrderNumberService.generateOrderNumber());
            }

            const endTime = Date.now();
            const duration = endTime - startTime;

            expect(duration).toBeLessThan(1000);

            // 验证唯一性
            const uniqueNumbers = new Set(orderNumbers);
            expect(uniqueNumbers.size).toBe(count);
        });
    });
});
