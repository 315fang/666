jest.mock('../../models', () => ({
    CommissionLog: {},
    User: {},
    Order: {},
    Product: {},
    SKU: {},
    AppConfig: {},
    sequelize: {}
}));

jest.mock('../../utils/logger', () => ({
    error: jest.fn(),
    warn: jest.fn()
}));

jest.mock('../../services/CacheService', () => ({
    getCache: jest.fn(async () => null),
    setCache: jest.fn(async () => undefined)
}));

jest.mock('../../services/MemberTierService', () => ({}));

jest.mock('../../config/commissionPolicy', () => ({
    allowProductFixedCommission: jest.fn(() => true)
}));

const CommissionService = require('../../services/CommissionService');

describe('CommissionService.calculateOrderCommissions', () => {
    const customRates = {
        PERCENTAGE_RATES: {
            DIRECT: {
                1: 0.2,
                2: 0.3,
                3: 0.4
            },
            INDIRECT: {
                2: 0.05,
                3: 0.08
            }
        }
    };

    test('calculates direct and indirect commissions from global config', async () => {
        const result = await CommissionService.calculateOrderCommissions({
            order: {
                total_amount: 100,
                actual_price: 100,
                locked_agent_cost: 40
            },
            buyer: { id: 10, role_level: 0 },
            parent: { id: 11, role_level: 1 },
            grandparent: { id: 12, role_level: 2 },
            customRates
        });

        expect(result.calculationMode).toBe('global_config');
        expect(result.profitPool).toBe(60);
        expect(result.totalCommission).toBe(25);
        expect(result.agentProfit).toBe(35);
        expect(result.commissions).toEqual([
            expect.objectContaining({ user_id: 11, amount: 20, type: 'direct', level: 1 }),
            expect.objectContaining({ user_id: 12, amount: 5, type: 'indirect', level: 2 })
        ]);
    });

    test('prefers product fixed commission over global percentages', async () => {
        const result = await CommissionService.calculateOrderCommissions({
            order: {
                total_amount: 100,
                actual_price: 100,
                locked_agent_cost: 50
            },
            buyer: { id: 10, role_level: 0 },
            parent: { id: 11, role_level: 1 },
            grandparent: { id: 12, role_level: 2 },
            customRates,
            product: {
                commission_amount_1: 12,
                commission_amount_2: 6,
                commission_rate_1: 0.9,
                commission_rate_2: 0.9
            }
        });

        expect(result.calculationMode).toBe('product_specific');
        expect(result.totalCommission).toBe(18);
        expect(result.agentProfit).toBe(32);
        expect(result.commissions[0]).toEqual(expect.objectContaining({ amount: 12 }));
        expect(result.commissions[1]).toEqual(expect.objectContaining({ amount: 6 }));
    });

    test('skips oversized direct commission and still allocates eligible indirect commission within profit pool', async () => {
        const result = await CommissionService.calculateOrderCommissions({
            order: {
                total_amount: 100,
                actual_price: 100,
                locked_agent_cost: 90
            },
            buyer: { id: 10, role_level: 0 },
            parent: { id: 11, role_level: 3 },
            grandparent: { id: 12, role_level: 3 },
            customRates
        });

        expect(result.profitPool).toBe(10);
        expect(result.totalCommission).toBe(8);
        expect(result.agentProfit).toBe(2);
        expect(result.commissions).toHaveLength(1);
        expect(result.commissions[0]).toEqual(expect.objectContaining({ user_id: 12, amount: 8, type: 'indirect' }));
    });
});
