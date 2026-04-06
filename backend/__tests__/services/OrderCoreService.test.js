jest.mock('../../services/OrderCreationService', () => ({
    createOrder: jest.fn()
}));

jest.mock('../../services/OrderPaymentService', () => ({
    prepayOrder: jest.fn(),
    wechatPayNotify: jest.fn(),
    syncPendingOrderWechatPay: jest.fn(),
    payOrder: jest.fn()
}));

jest.mock('../../services/OrderFulfillmentService', () => ({
    confirmOrder: jest.fn(),
    forceCompleteOrderByAdmin: jest.fn(),
    agentConfirmOrder: jest.fn(),
    requestShipping: jest.fn(),
    shipOrder: jest.fn()
}));

jest.mock('../../services/OrderCancellationService', () => ({
    cancelOrder: jest.fn()
}));

const OrderCoreService = require('../../services/OrderCoreService');
const OrderCreationService = require('../../services/OrderCreationService');
const OrderPaymentService = require('../../services/OrderPaymentService');
const OrderFulfillmentService = require('../../services/OrderFulfillmentService');
const OrderCancellationService = require('../../services/OrderCancellationService');

describe('OrderCoreService lifecycle delegation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('delegates createOrder to OrderCreationService', async () => {
        const req = { user: { id: 1 }, body: { items: [{ product_id: 1, quantity: 1 }] } };
        const result = { data: { order_no: 'O1' } };
        OrderCreationService.createOrder.mockResolvedValue(result);

        await expect(OrderCoreService.createOrder(req)).resolves.toBe(result);
        expect(OrderCreationService.createOrder).toHaveBeenCalledWith(req);
    });

    test('delegates prepayOrder to OrderPaymentService', async () => {
        const req = { user: { id: 1 }, params: { id: 9 }, body: {} };
        const result = { data: { appId: 'wx-test' } };
        OrderPaymentService.prepayOrder.mockResolvedValue(result);

        await expect(OrderCoreService.prepayOrder(req)).resolves.toBe(result);
        expect(OrderPaymentService.prepayOrder).toHaveBeenCalledWith(req);
    });

    test('delegates confirmOrder to OrderFulfillmentService', async () => {
        const req = { user: { id: 1 }, params: { id: 9 } };
        const result = { message: '确认收货成功' };
        OrderFulfillmentService.confirmOrder.mockResolvedValue(result);

        await expect(OrderCoreService.confirmOrder(req)).resolves.toBe(result);
        expect(OrderFulfillmentService.confirmOrder).toHaveBeenCalledWith(req);
    });

    test('delegates cancelOrder to OrderCancellationService', async () => {
        const req = { user: { id: 1 }, params: { id: 9 } };
        const result = { message: '订单已取消' };
        OrderCancellationService.cancelOrder.mockResolvedValue(result);

        await expect(OrderCoreService.cancelOrder(req)).resolves.toBe(result);
        expect(OrderCancellationService.cancelOrder).toHaveBeenCalledWith(req);
    });

    test('keeps error propagation unchanged for delegated lifecycle calls', async () => {
        const error = new Error('订单状态不正确');
        OrderPaymentService.prepayOrder.mockRejectedValue(error);

        await expect(OrderCoreService.prepayOrder({ params: { id: 2 }, user: { id: 1 } })).rejects.toThrow('订单状态不正确');
    });
});
