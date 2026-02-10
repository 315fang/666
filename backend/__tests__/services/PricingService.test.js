/**
 * PricingService 单元测试
 */

const PricingService = require('../../services/PricingService');

describe('PricingService', () => {
    describe('calculateDisplayPrice', () => {
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

        test('应该为普通用户返回零售价', () => {
            const price = PricingService.calculateDisplayPrice(mockProduct, null, 0);
            expect(price).toBe(100);
        });

        test('应该为会员返回会员价', () => {
            const price = PricingService.calculateDisplayPrice(mockProduct, null, 1);
            expect(price).toBe(90);
        });

        test('应该为团长返回团长价', () => {
            const price = PricingService.calculateDisplayPrice(mockProduct, null, 2);
            expect(price).toBe(80);
        });

        test('应该为代理商返回代理商价', () => {
            const price = PricingService.calculateDisplayPrice(mockProduct, null, 3);
            expect(price).toBe(70);
        });

        test('当有SKU时应该优先使用SKU价格', () => {
            const price = PricingService.calculateDisplayPrice(mockProduct, mockSku, 1);
            expect(price).toBe(88); // SKU会员价，不是商品会员价
        });

        test('当价格不存在时应该降级到下一级价格', () => {
            const productWithoutMemberPrice = {
                retail_price: 100,
                price_leader: 80
            };
            const price = PricingService.calculateDisplayPrice(productWithoutMemberPrice, null, 1);
            expect(price).toBe(100); // 没有会员价，降级到零售价
        });
    });

    describe('calculateCommissions', () => {
        const mockOrderItem = {
            price: 100,
            quantity: 2
        };

        const mockBuyer = {
            id: 1,
            role_level: 1 // 会员
        };

        const mockParent = {
            id: 2,
            role_level: 2 // 团长
        };

        const mockGrandparent = {
            id: 3,
            role_level: 3 // 代理商
        };

        test('应该计算购买者自购返利', () => {
            const result = PricingService.calculateCommissions(mockOrderItem, mockBuyer);
            expect(result.commissions).toHaveLength(1);
            expect(result.commissions[0].user_id).toBe(1);
            expect(result.commissions[0].type).toBe('self');
            expect(result.commissions[0].amount).toBe(10); // 200 * 5%
        });

        test('应该计算上级直推佣金', () => {
            const result = PricingService.calculateCommissions(mockOrderItem, mockBuyer, mockParent);
            expect(result.commissions).toHaveLength(2);

            const parentCommission = result.commissions.find(c => c.user_id === 2);
            expect(parentCommission).toBeDefined();
            expect(parentCommission.type).toBe('direct');
            expect(parentCommission.amount).toBe(16); // 200 * 8%
        });

        test('应该计算上上级间接佣金', () => {
            const result = PricingService.calculateCommissions(
                mockOrderItem,
                mockBuyer,
                mockParent,
                mockGrandparent
            );

            expect(result.commissions).toHaveLength(3);

            const grandparentCommission = result.commissions.find(c => c.user_id === 3);
            expect(grandparentCommission).toBeDefined();
            expect(grandparentCommission.type).toBe('indirect');
            expect(grandparentCommission.amount).toBe(10); // 200 * 5%
        });

        test('应该正确计算总佣金', () => {
            const result = PricingService.calculateCommissions(
                mockOrderItem,
                mockBuyer,
                mockParent,
                mockGrandparent
            );

            expect(result.totalCommission).toBe(36); // 10 + 16 + 10
        });

        test('普通用户购买不应产生自购返利', () => {
            const guestBuyer = { id: 1, role_level: 0 };
            const result = PricingService.calculateCommissions(mockOrderItem, guestBuyer);

            expect(result.commissions).toHaveLength(0);
            expect(result.totalCommission).toBe(0);
        });
    });

    describe('calculateOrderTotalCommission', () => {
        const mockOrderItems = [
            { price: 100, quantity: 1 },
            { price: 50, quantity: 2 }
        ];

        const mockBuyer = { id: 1, role_level: 1 };
        const mockParent = { id: 2, role_level: 2 };

        test('应该计算多个订单项的总佣金', () => {
            const total = PricingService.calculateOrderTotalCommission(
                mockOrderItems,
                mockBuyer,
                mockParent
            );

            // 第一项: 100 * 5% + 100 * 8% = 5 + 8 = 13
            // 第二项: 100 * 5% + 100 * 8% = 5 + 8 = 13
            // 总计: 26
            expect(total).toBe(26);
        });
    });

    describe('calculateRefundClawback', () => {
        const mockOrderItem = {
            id: 1,
            price: 100,
            quantity: 1
        };

        const mockCommissionRecords = [
            { id: 1, user_id: 1, amount: 5, description: '自购返利' },
            { id: 2, user_id: 2, amount: 8, description: '直推佣金' }
        ];

        test('应该生成正确的追回记录', () => {
            const clawback = PricingService.calculateRefundClawback(
                mockOrderItem,
                mockCommissionRecords
            );

            expect(clawback).toHaveLength(2);
            expect(clawback[0].amount).toBe(-5);
            expect(clawback[0].type).toBe('clawback');
            expect(clawback[1].amount).toBe(-8);
        });
    });

    describe('isValidPrice', () => {
        test('应该验证有效价格', () => {
            expect(PricingService.isValidPrice(0)).toBe(true);
            expect(PricingService.isValidPrice(100)).toBe(true);
            expect(PricingService.isValidPrice(99.99)).toBe(true);
        });

        test('应该拒绝无效价格', () => {
            expect(PricingService.isValidPrice(-1)).toBe(false);
            expect(PricingService.isValidPrice('100')).toBe(false);
            expect(PricingService.isValidPrice(null)).toBe(false);
            expect(PricingService.isValidPrice(undefined)).toBe(false);
            expect(PricingService.isValidPrice(Infinity)).toBe(false);
            expect(PricingService.isValidPrice(NaN)).toBe(false);
        });
    });

    describe('formatPrice', () => {
        test('应该格式化价格为两位小数', () => {
            expect(PricingService.formatPrice(100)).toBe('100.00');
            expect(PricingService.formatPrice(99.9)).toBe('99.90');
            expect(PricingService.formatPrice(99.999)).toBe('100.00');
        });

        test('应该处理无效价格', () => {
            expect(PricingService.formatPrice(null)).toBe('0.00');
            expect(PricingService.formatPrice(undefined)).toBe('0.00');
            expect(PricingService.formatPrice('abc')).toBe('0.00');
        });
    });
});
