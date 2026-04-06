/**
 * PricingService 单元测试
 */

const assert = require('node:assert/strict');

const PricingService = require('../../services/PricingService');

// ==================== calculateDisplayPrice ====================

test('calculateDisplayPrice: 应该为普通用户返回零售价', () => {
    const mockProduct = {
        retail_price: 100,
        price_member: 90,
        price_leader: 80,
        price_agent: 70
    };

    const price = PricingService.calculateDisplayPrice(mockProduct, null, 0);
    assert.equal(price, 100);
});

test('calculateDisplayPrice: 应该为会员返回会员价', () => {
    const mockProduct = {
        retail_price: 100,
        price_member: 90,
        price_leader: 80,
        price_agent: 70
    };

    const price = PricingService.calculateDisplayPrice(mockProduct, null, 1);
    assert.equal(price, 90);
});

test('calculateDisplayPrice: 应该为团长返回团长价', () => {
    const mockProduct = {
        retail_price: 100,
        price_member: 90,
        price_leader: 80,
        price_agent: 70
    };

    const price = PricingService.calculateDisplayPrice(mockProduct, null, 2);
    assert.equal(price, 80);
});

test('calculateDisplayPrice: 应该为代理商返回代理商价', () => {
    const mockProduct = {
        retail_price: 100,
        price_member: 90,
        price_leader: 80,
        price_agent: 70
    };

    const price = PricingService.calculateDisplayPrice(mockProduct, null, 3);
    assert.equal(price, 70);
});

test('calculateDisplayPrice: 当有SKU时应该优先使用SKU价格', () => {
    const mockProduct = {
        retail_price: 100,
        price_member: 90,
        price_leader: 80,
        price_agent: 70
    };
    const mockSku = {
        price: 100,
        price_member: 88,
        price_leader: 78,
        price_agent: 68
    };

    const price = PricingService.calculateDisplayPrice(mockProduct, mockSku, 1);
    assert.equal(price, 88); // SKU会员价，不是商品会员价
});

test('calculateDisplayPrice: 当价格不存在时应该降级到下一级价格', () => {
    const productWithoutMemberPrice = {
        retail_price: 100,
        price_leader: 80
    };
    const price = PricingService.calculateDisplayPrice(productWithoutMemberPrice, null, 1);
    assert.equal(price, 100); // 没有会员价，降级到零售价
});

// ==================== calculateCommissions ====================

test('calculateCommissions: 应该计算购买者自购返利', () => {
    const mockOrderItem = { price: 100, quantity: 2 };
    const mockBuyer = { id: 1, role_level: 1 }; // 会员 (MEMBER)

    const result = PricingService.calculateCommissions(mockOrderItem, mockBuyer);
    assert.equal(result.commissions.length, 1);
    assert.equal(result.commissions[0].user_id, 1);
    assert.equal(result.commissions[0].type, 'self');
    assert.equal(result.commissions[0].amount, 40); // 200 * 20%
});

test('calculateCommissions: 应该计算上级直推佣金', () => {
    const mockOrderItem = { price: 100, quantity: 2 };
    const mockBuyer = { id: 1, role_level: 1 }; // 会员
    const mockParent = { id: 2, role_level: 2 }; // 团长

    const result = PricingService.calculateCommissions(mockOrderItem, mockBuyer, mockParent);
    assert.equal(result.commissions.length, 2);

    const parentCommission = result.commissions.find(c => c.user_id === 2);
    assert.ok(parentCommission !== undefined);
    assert.equal(parentCommission.type, 'direct');
    assert.equal(parentCommission.amount, 60); // 200 * 30%
});

test('calculateCommissions: 应该计算上上级间接佣金', () => {
    const mockOrderItem = { price: 100, quantity: 2 };
    const mockBuyer = { id: 1, role_level: 1 }; // 会员
    const mockParent = { id: 2, role_level: 2 }; // 团长
    const mockGrandparent = { id: 3, role_level: 3 }; // 代理商

    const result = PricingService.calculateCommissions(
        mockOrderItem,
        mockBuyer,
        mockParent,
        mockGrandparent
    );

    assert.equal(result.commissions.length, 3);

    const grandparentCommission = result.commissions.find(c => c.user_id === 3);
    assert.ok(grandparentCommission !== undefined);
    assert.equal(grandparentCommission.type, 'indirect');
    assert.equal(grandparentCommission.amount, 16); // 200 * 8%
});

test('calculateCommissions: 应该正确计算总佣金', () => {
    const mockOrderItem = { price: 100, quantity: 2 };
    const mockBuyer = { id: 1, role_level: 1 };
    const mockParent = { id: 2, role_level: 2 };
    const mockGrandparent = { id: 3, role_level: 3 };

    const result = PricingService.calculateCommissions(
        mockOrderItem,
        mockBuyer,
        mockParent,
        mockGrandparent
    );

    assert.equal(result.totalCommission, 116); // 40 + 60 + 16
});

test('calculateCommissions: 普通用户购买不应产生自购返利', () => {
    const guestBuyer = { id: 1, role_level: 0 };
    const mockOrderItem = { price: 100, quantity: 2 };

    const result = PricingService.calculateCommissions(mockOrderItem, guestBuyer);
    assert.equal(result.commissions.length, 0);
    assert.equal(result.totalCommission, 0);
});

// ==================== calculateOrderTotalCommission ====================

test('calculateOrderTotalCommission: 应该计算多个订单项的总佣金', () => {
    const mockOrderItems = [
        { price: 100, quantity: 1 },
        { price: 50, quantity: 2 }
    ];
    const mockBuyer = { id: 1, role_level: 1 }; // 会员
    const mockParent = { id: 2, role_level: 2 }; // 团长

    const total = PricingService.calculateOrderTotalCommission(
        mockOrderItems,
        mockBuyer,
        mockParent
    );

    // item1 (100元): 自购20 + 直推30 = 50
    // item2 (200元=50×2): 自购20 + 直推30 = 50
    // 总计: 100
    assert.equal(total, 100);
});

// ==================== calculateRefundClawback ====================

test('calculateRefundClawback: 应该生成正确的追回记录', () => {
    const mockOrderItem = { id: 1, price: 100, quantity: 1 };
    const mockCommissionRecords = [
        { id: 1, user_id: 1, amount: 5, description: '自购返利' },
        { id: 2, user_id: 2, amount: 8, description: '直推佣金' }
    ];

    const clawback = PricingService.calculateRefundClawback(
        mockOrderItem,
        mockCommissionRecords
    );

    assert.equal(clawback.length, 2);
    assert.equal(clawback[0].amount, -5);
    assert.equal(clawback[0].type, 'clawback');
    assert.equal(clawback[1].amount, -8);
});

// ==================== isValidPrice ====================

test('isValidPrice: 应该验证有效价格', () => {
    assert.equal(PricingService.isValidPrice(0), true);
    assert.equal(PricingService.isValidPrice(100), true);
    assert.equal(PricingService.isValidPrice(99.99), true);
});

test('isValidPrice: 应该拒绝无效价格', () => {
    assert.equal(PricingService.isValidPrice(-1), false);
    assert.equal(PricingService.isValidPrice('100'), false);
    assert.equal(PricingService.isValidPrice(null), false);
    assert.equal(PricingService.isValidPrice(undefined), false);
    assert.equal(PricingService.isValidPrice(Infinity), false);
    assert.equal(Number.isNaN(PricingService.isValidPrice(NaN)), false); // NaN != NaN
});

// ==================== formatPrice ====================

test('formatPrice: 应该格式化价格为两位小数', () => {
    assert.equal(PricingService.formatPrice(100), '100.00');
    assert.equal(PricingService.formatPrice(99.9), '99.90');
    assert.equal(PricingService.formatPrice(99.999), '100.00');
});

test('formatPrice: 应该处理无效价格', () => {
    assert.equal(PricingService.formatPrice(null), '0.00');
    assert.equal(PricingService.formatPrice(undefined), '0.00');
    assert.equal(PricingService.formatPrice('abc'), '0.00');
});
