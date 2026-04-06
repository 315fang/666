/**
 * OrderCalcService 单元测试
 * 覆盖：generateOrderNo, buildWxJsapiShoppingDescription, calcShippingFeeByPolicy
 */
const {
    generateOrderNo,
    buildWxJsapiShoppingDescription,
    calcShippingFeeByPolicy,
} = require('../../services/OrderCalcService');

describe('OrderCalcService', () => {

    // ======================== generateOrderNo ========================
    describe('generateOrderNo', () => {
        it('应生成以 ORD 开头的订单号', () => {
            const no = generateOrderNo();
            expect(no.startsWith('ORD')).toBe(true);
        });

        it('应包含14位时间戳（年月日时分秒）+ 4位序列 + 6位随机hex', () => {
            const no = generateOrderNo();
            // ORD(3) + 时间(14) + 序列(4) + 随机(6) = 27位以上
            expect(no.length).toBeGreaterThanOrEqual(27);
            const hexPart = no.slice(-6);
            expect(hexPart).toMatch(/^[0-9a-f]{6}$/);
        });

        it('连续调用应生成不同的订单号', () => {
            const nos = new Set(Array.from({ length: 100 }, () => generateOrderNo()));
            expect(nos.size).toBe(100);
        });
    });

    // ======================== buildWxJsapiShoppingDescription ========================
    describe('buildWxJsapiShoppingDescription', () => {
        it('应返回商品名称', () => {
            const desc = buildWxJsapiShoppingDescription({ quantity: 1 }, '测试商品');
            expect(desc).toContain('测试商品');
        });

        it('数量大于1时应显示 xN 后缀', () => {
            const desc = buildWxJsapiShoppingDescription({ quantity: 3 }, '苹果');
            expect(desc).toBe('苹果×3');
        });

        it('数量为1或0时不应显示后缀', () => {
            expect(buildWxJsapiShoppingDescription({ quantity: 1 }, 'A')).toBe('A');
            expect(buildWxJsapiShoppingDescription({ quantity: 0 }, 'B')).toBe('B');
        });

        it('空名称应默认显示"商品"', () => {
            expect(buildWxJsapiShoppingDescription({ quantity: 1 }, '')).toBe('商品');
            expect(buildWxJsapiShoppingDescription({ quantity: 1 })).toBe('商品');
        });

        it('超长名称应截断到127字符', () => {
            const longName = 'A'.repeat(200);
            const desc = buildWxJsapiShoppingDescription({ quantity: 1 }, longName);
            expect(desc.length).toBe(127);
        });

        it('数量非数字时应不显示后缀', () => {
            const desc = buildWxJsapiShoppingDescription({ quantity: 'abc' }, 'X');
            expect(desc).toBe('X');
        });
    });

    // ======================== calcShippingFeeByPolicy ========================
    describe('calcShippingFeeByPolicy', () => {
        it('无运费策略时应返回0', () => {
            expect(calcShippingFeeByPolicy(null, {})).toBe(0);
            expect(calcShippingFeeByPolicy({}, {})).toBe(0);
        });

        it('远程运费未启用时应返回0', () => {
            const policy = { shipping: { remote_region_extra_fee_enabled: false } };
            expect(calcShippingFeeByPolicy(policy, {})).toBe(0);
        });

        it('远程运费费用为0时应返回0', () => {
            const policy = {
                shipping: { remote_region_extra_fee_enabled: true, remote_region_fee: 0 }
            };
            expect(calcShippingFeeByPolicy(policy, {})).toBe(0);
        });

        it('地址匹配偏远地区应返回运费', () => {
            const policy = {
                shipping: {
                    remote_region_extra_fee_enabled: true,
                    remote_region_fee: 15,
                    remote_regions: ['西藏', '新疆']
                }
            };
            expect(calcShippingFeeByPolicy(policy, { province: '西藏' })).toBe(15);
            expect(calcShippingFeeByPolicy(policy, { city: '乌鲁木齐' })).toBe(0); // 不完全匹配
        });

        it('地址不匹配偏远地区应返回0', () => {
            const policy = {
                shipping: {
                    remote_region_extra_fee_enabled: true,
                    remote_region_fee: 20,
                    remote_regions: ['西藏']
                }
            };
            expect(calcShippingFeeByPolicy(policy, { province: '北京', city: '朝阳' })).toBe(0);
        });

        it('remote_regions 非数组时应安全处理', () => {
            const policy = {
                shipping: {
                    remote_region_extra_fee_enabled: true,
                    remote_region_fee: 10,
                    remote_regions: '西藏'
                }
            };
            expect(calcShippingFeeByPolicy(policy, { province: '西藏' })).toBe(0);
        });

        it('城市名包含偏远关键词时应返回运费', () => {
            const policy = {
                shipping: {
                    remote_region_extra_fee_enabled: true,
                    remote_region_fee: 12,
                    remote_regions: ['喀什']
                }
            };
            expect(calcShippingFeeByPolicy(policy, { province: '新疆', city: '喀什地区' })).toBe(12);
        });
    });
});
