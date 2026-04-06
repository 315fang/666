const assert = require('node:assert/strict');

const MemberTierService = require('../../services/MemberTierService');
const PricingService = require('../../services/PricingService');

const origGetMult = MemberTierService.getCommerceDiscountMultiplier;

afterEach(() => {
    MemberTierService.getCommerceDiscountMultiplier = origGetMult;
});

test('applyCommerceDiscount: discount_exempt 跳过乘数', () => {
    assert.equal(PricingService.applyCommerceDiscount(100, 0.9, true), 100);
});

test('applyCommerceDiscount: 正常乘数保留两位', () => {
    assert.equal(PricingService.applyCommerceDiscount(100, 0.98, false), 98);
});

test('applyCommerceDiscount: multiplier 非法则保持原价', () => {
    assert.equal(PricingService.applyCommerceDiscount(50, NaN, false), 50);
    assert.equal(PricingService.applyCommerceDiscount(50, 0, false), 50);
});

test('calculatePayableUnitPrice: 组合档位价与商业折扣系数', async () => {
    MemberTierService.getCommerceDiscountMultiplier = async () => 0.98;
    const product = { retail_price: 100, price_member: 90, discount_exempt: false };
    const payable = await PricingService.calculatePayableUnitPrice(product, null, 1, null);
    assert.equal(payable, Number((90 * 0.98).toFixed(2)));
});

test('calculatePayableUnitPrice: discount_exempt 不叠商业折', async () => {
    MemberTierService.getCommerceDiscountMultiplier = async () => 0.5;
    const product = { retail_price: 100, discount_exempt: true };
    const payable = await PricingService.calculatePayableUnitPrice(product, null, 1, null);
    assert.equal(payable, 100);
});

test('getCommerceDiscountMultiplier: 全场折与等级折相乘', async () => {
    const origPolicy = MemberTierService.getCommercePolicy;
    const origLevel = MemberTierService.getLevelDiscountRate;
    MemberTierService.getCommercePolicy = async () => ({
        global_discount: { enabled: true, rate: 0.95 },
        member_level_extra_discount: { enabled: true }
    });
    MemberTierService.getLevelDiscountRate = async () => 0.9;
    try {
        assert.equal(await MemberTierService.getCommerceDiscountMultiplier(1), 0.855);
    } finally {
        MemberTierService.getCommercePolicy = origPolicy;
        MemberTierService.getLevelDiscountRate = origLevel;
    }
});

test('getCommerceDiscountMultiplier: 全场关时等于等级折率', async () => {
    const origPolicy = MemberTierService.getCommercePolicy;
    const origLevel = MemberTierService.getLevelDiscountRate;
    MemberTierService.getCommercePolicy = async () => ({
        global_discount: { enabled: false, rate: 1 },
        member_level_extra_discount: { enabled: true }
    });
    MemberTierService.getLevelDiscountRate = async (lvl) => (Number(lvl) === 1 ? 0.9 : 1);
    try {
        assert.equal(await MemberTierService.getCommerceDiscountMultiplier(1), 0.9);
        assert.equal(await MemberTierService.getCommerceDiscountMultiplier(0), 1);
    } finally {
        MemberTierService.getCommercePolicy = origPolicy;
        MemberTierService.getLevelDiscountRate = origLevel;
    }
});
