jest.mock('../../services/MemberTierService', () => ({
    getPointRules: jest.fn(async () => ({
        purchase: { remark: '消费积分' }
    })),
    getPointLevels: jest.fn(async () => ([
        { level: 1, name: 'Lv1', min: 0, perks: [] },
        { level: 2, name: 'Lv2', min: 100, perks: [] }
    ]))
}));

jest.mock('../../models', () => {
    const transaction = {
        LOCK: { UPDATE: 'UPDATE' },
        commit: jest.fn(async () => undefined),
        rollback: jest.fn(async () => undefined)
    };

    const account = {
        level: 1,
        total_points: 10,
        used_points: 0,
        balance_points: 10,
        save: jest.fn(async function save() { return this; })
    };

    return {
        PointAccount: {
            findOrCreate: jest.fn(async () => [account, false]),
            findOne: jest.fn(async () => account)
        },
        PointLog: {
            create: jest.fn(async payload => payload)
        },
        User: {
            findByPk: jest.fn(async () => ({ growth_value: 0 }))
        },
        sequelize: {
            transaction: jest.fn(async () => transaction)
        },
        __transaction: transaction,
        __account: account
    };
});

const PointService = require('../../services/PointService');
const models = require('../../models');

describe('PointService.addPoints', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        models.__account.level = 1;
        models.__account.total_points = 10;
        models.__account.used_points = 0;
        models.__account.balance_points = 10;
    });

    test('commits successfully and returns levelUp without referencing undefined variables', async () => {
        const result = await PointService.addPoints(1, 5, 'purchase', 'order_1', '消费积分');

        expect(models.__transaction.commit).toHaveBeenCalled();
        expect(result.levelUp).toBeNull();
        expect(result.account.balance_points).toBe(15);
        expect(result.log.remark).toBe('消费积分');
    });
});
