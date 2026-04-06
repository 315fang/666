/**
 * OrderNumberService 单元测试
 */

const assert = require('node:assert/strict');

const OrderNumberService = require('../../services/OrderNumberService');

test('generateOrderNumber: 应该生成正确格式的订单号', () => {
    const orderNum = OrderNumberService.generateOrderNumber();
    assert.match(orderNum, /^ORD\d{14}[A-F0-9]{2}\d{4}[A-F0-9]{2}$/);
    assert.equal(orderNum.length, 25);
});

test('generateOrderNumber: 应该生成唯一的订单号', () => {
    const orderNum1 = OrderNumberService.generateOrderNumber();
    const orderNum2 = OrderNumberService.generateOrderNumber();
    assert.notEqual(orderNum1, orderNum2);
});

test('generateOrderNumber: 批量生成应该返回唯一订单号', () => {
    const count = 100;
    const orderNumbers = OrderNumberService.generateBatch(count);
    assert.equal(orderNumbers.length, count);

    const uniqueNumbers = new Set(orderNumbers);
    assert.equal(uniqueNumbers.size, count);
});

test('generateShortOrderNumber: 应该生成简化订单号', () => {
    const orderNum = OrderNumberService.generateShortOrderNumber();
    assert.match(orderNum, /^\d{14}[A-F0-9]{2}\d{3}$/);
    assert.equal(orderNum.length, 19);
});

test('parseOrderNumber: 应该正确解析订单号', () => {
    const orderNum = OrderNumberService.generateOrderNumber();
    const parsed = OrderNumberService.parseOrderNumber(orderNum);

    assert.notEqual(parsed, null);
    assert.equal(typeof parsed.machineId, 'string');
    assert.equal(typeof parsed.timestamp, 'number');
    assert.ok(parsed.timestamp > 0);
    assert.match(parsed.dateString, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});

test('parseOrderNumber: 应该处理无效订单号', () => {
    assert.equal(OrderNumberService.parseOrderNumber(null), null);
    assert.equal(OrderNumberService.parseOrderNumber(''), null);
    assert.equal(OrderNumberService.parseOrderNumber('invalid'), null);
});

test('isValidOrderNumber: 应该验证有效订单号', () => {
    const orderNum = OrderNumberService.generateOrderNumber();
    assert.equal(OrderNumberService.isValidOrderNumber(orderNum), true);
});

test('isValidOrderNumber: 应该拒绝无效订单号', () => {
    assert.equal(OrderNumberService.isValidOrderNumber(null), false);
    assert.equal(OrderNumberService.isValidOrderNumber(''), false);
    assert.equal(OrderNumberService.isValidOrderNumber('ABC123'), false);
    assert.equal(OrderNumberService.isValidOrderNumber('ORD123'), false);
});

test('isValidOrderNumber: 应该拒绝错误前缀的订单号', () => {
    assert.equal(OrderNumberService.isValidOrderNumber('ABC20260210143025A100012F'), false);
});

test('generateRefundNumber: 应该生成退款单号', () => {
    const refundNum = OrderNumberService.generateRefundNumber();
    assert.match(refundNum, /^RFD\d{14}[A-F0-9]{2}\d{4}[A-F0-9]{2}$/);
    assert.equal(refundNum.length, 25);
});

test('generateWithdrawalNumber: 应该生成提现单号', () => {
    const withdrawalNum = OrderNumberService.generateWithdrawalNumber();
    assert.match(withdrawalNum, /^WDR\d{14}[A-F0-9]{2}\d{4}[A-F0-9]{2}$/);
    assert.equal(withdrawalNum.length, 25);
});

test('性能测试: 应该在1秒内快速生成订单号', () => {
    const startTime = Date.now();
    const count = 500;
    const orderNumbers = [];

    for (let i = 0; i < count; i++) {
        orderNumbers.push(OrderNumberService.generateOrderNumber());
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    assert.ok(duration < 1000, `耗时 ${duration}ms 超过 1000ms 限制`);

    // 验证格式正确性
    for (const num of orderNumbers) {
        assert.match(num, /^ORD\d{14}[A-F0-9]{2}\d{4}[A-F0-9]{2}$/);
    }
});
