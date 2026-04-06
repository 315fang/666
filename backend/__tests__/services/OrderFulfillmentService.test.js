jest.mock('../../models', () => {
    const transaction = {
        LOCK: { UPDATE: 'UPDATE' },
        commit: jest.fn(async () => undefined),
        rollback: jest.fn(async () => undefined)
    };

    return {
        Order: {
            findOne: jest.fn(),
            findByPk: jest.fn()
        },
        User: {
            findByPk: jest.fn()
        },
        Product: {
            findByPk: jest.fn()
        },
        CommissionLog: {
            update: jest.fn(async () => [1])
        },
        sequelize: {
            transaction: jest.fn(async () => transaction)
        },
        __transaction: transaction
    };
});

jest.mock('../../utils/logger', () => ({
    error: jest.fn()
}));

jest.mock('../../services/CommissionService', () => ({
    calculateGapAndFulfillmentCommissions: jest.fn(async () => ({ middleCommissionTotal: 0 }))
}));

jest.mock('../../services/WechatShippingInfoService', () => ({
    scheduleUploadShippingInfoAfterShip: jest.fn()
}));

const OrderFulfillmentService = require('../../services/OrderFulfillmentService');
const models = require('../../models');

describe('OrderFulfillmentService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('completeShippedOrder sets settlement deadline and frozen commission deadline', async () => {
        const order = {
            id: 21,
            status: 'shipped',
            remark: 'base',
            save: jest.fn(async () => undefined)
        };

        const before = Date.now();
        const result = await OrderFulfillmentService._completeShippedOrder(order, models.__transaction, ' [force]');
        const after = Date.now();

        expect(order.status).toBe('completed');
        expect(order.completed_at).toBeInstanceOf(Date);
        expect(order.remark).toContain('[force]');
        expect(order.settlement_at).toBeInstanceOf(Date);
        expect(order.settlement_at.getTime()).toBeGreaterThan(before);
        expect(order.settlement_at.getTime()).toBeLessThanOrEqual(after + (16 * 24 * 60 * 60 * 1000));
        expect(result.refundDays).toBe(15);
        expect(models.CommissionLog.update).toHaveBeenCalledWith(
            { refund_deadline: order.settlement_at },
            expect.objectContaining({
                where: { order_id: 21, status: 'frozen' },
                transaction: models.__transaction
            })
        );
    });

    test('confirmOrder completes shipped order and commits transaction', async () => {
        const order = {
            id: 9,
            buyer_id: 1,
            status: 'shipped',
            remark: '',
            save: jest.fn(async () => undefined)
        };
        models.Order.findOne.mockResolvedValue(order);

        const result = await OrderFulfillmentService.confirmOrder({
            user: { id: 1 },
            params: { id: 9 }
        });

        expect(models.sequelize.transaction).toHaveBeenCalled();
        expect(models.Order.findOne).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 9, buyer_id: 1 },
            transaction: models.__transaction,
            lock: models.__transaction.LOCK.UPDATE
        }));
        expect(models.__transaction.commit).toHaveBeenCalled();
        expect(result.message).toContain('确认收货成功');
        expect(result.message).toContain('15天');
    });

    test('confirmOrder rolls back and returns generic failure when status is invalid', async () => {
        models.Order.findOne.mockResolvedValue({
            id: 9,
            buyer_id: 1,
            status: 'paid'
        });

        await expect(OrderFulfillmentService.confirmOrder({
            user: { id: 1 },
            params: { id: 9 }
        })).rejects.toThrow('确认收货失败');

        expect(models.__transaction.rollback).toHaveBeenCalled();
    });
});
