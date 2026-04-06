const mockVerifyNotifySign = jest.fn();
const mockDecryptNotifyResource = jest.fn();
const mockQueryJsapiOrderByOutTradeNo = jest.fn();

jest.mock('../../models', () => {
    const transaction = {
        LOCK: { UPDATE: 'UPDATE' },
        commit: jest.fn(async () => undefined),
        rollback: jest.fn(async () => undefined),
        finished: false
    };

    return {
        Order: {
            findOne: jest.fn(),
            findAll: jest.fn(async () => [])
        },
        Product: {
            findByPk: jest.fn(async () => null)
        },
        User: {
            findByPk: jest.fn()
        },
        AgentWalletLog: {
            findOne: jest.fn()
        },
        AppConfig: {
            findOne: jest.fn(async () => null)
        },
        sequelize: {
            transaction: jest.fn(async () => transaction)
        },
        __transaction: transaction
    };
});

jest.mock('../../utils/logger', () => ({
    logOrder: jest.fn(),
    logCommission: jest.fn(),
    error: jest.fn()
}));

jest.mock('../../utils/wechat', () => ({
    createUnifiedOrder: jest.fn(),
    buildJsApiParams: jest.fn(),
    decryptNotifyResource: (...args) => mockDecryptNotifyResource(...args),
    verifyNotifySign: (...args) => mockVerifyNotifySign(...args),
    queryJsapiOrderByOutTradeNo: (...args) => mockQueryJsapiOrderByOutTradeNo(...args)
}));

jest.mock('../../services/PointService', () => ({
    addPoints: jest.fn(),
    addGrowthValue: jest.fn()
}));

jest.mock('../../services/MemberTierService', () => ({
    getCommercePolicy: jest.fn(async () => ({}))
}));

jest.mock('../../services/AgentWalletService', () => ({
    recharge: jest.fn()
}));

jest.mock('../../services/WechatShoppingOrderService', () => ({
    uploadAfterWechatPay: jest.fn()
}));

jest.mock('../../services/PickupService', () => ({
    generatePickupCredentials: jest.fn(() => ({
        pickup_code: 'PICKUP1',
        pickup_qr_token: 'TOKEN1'
    }))
}));

jest.mock('../../services/StationProfitService', () => ({
    attributeRegionalProfit: jest.fn()
}));

jest.mock('../../models/notificationUtil', () => ({
    sendNotification: jest.fn(() => Promise.resolve())
}));

jest.mock('../../services/TransactionHelper', () => ({
    runAfterCommit: jest.fn()
}));

const OrderPaymentService = require('../../services/OrderPaymentService');
const models = require('../../models');

function buildNotifyReq(bodyString = '{"resource":{"ciphertext":"x"}}') {
    return {
        headers: { 'wechatpay-serial': 'serial' },
        rawBody: bodyString
    };
}

function mockSuccessNotify({ orderNo = 'ORD1001', amount = 1999, tradeState = 'SUCCESS' } = {}) {
    mockVerifyNotifySign.mockResolvedValue(true);
    mockDecryptNotifyResource.mockReturnValue({
        trade_state: tradeState,
        trade_state_desc: tradeState === 'SUCCESS' ? '支付成功' : '支付失败',
        out_trade_no: orderNo,
        transaction_id: 'wx_txn_1',
        mchid: 'mch_1',
        payer: { openid: 'openid_1' },
        amount: { total: amount }
    });
}

describe('OrderPaymentService.wechatPayNotify', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        models.__transaction.finished = false;
    });

    test('returns 400 when notify body is empty', async () => {
        const result = await OrderPaymentService.wechatPayNotify({ headers: {}, body: null });

        expect(result).toEqual({ json_fail: 'empty body', statusCode: 400 });
    });

    test('returns 401 when signature verification fails', async () => {
        mockVerifyNotifySign.mockResolvedValue(false);

        const result = await OrderPaymentService.wechatPayNotify(buildNotifyReq());

        expect(result).toEqual({ json_fail: 'sign error', statusCode: 401 });
    });

    test('returns success for non-success trade state', async () => {
        mockSuccessNotify({ tradeState: 'CLOSED' });

        const result = await OrderPaymentService.wechatPayNotify(buildNotifyReq());

        expect(result).toEqual({ json_success: true });
    });

    test('returns 404 when order does not exist', async () => {
        mockSuccessNotify({ amount: 1999 });
        models.Order.findOne.mockResolvedValue(null);

        const result = await OrderPaymentService.wechatPayNotify(buildNotifyReq());

        expect(models.__transaction.rollback).toHaveBeenCalled();
        expect(result).toEqual({ json_fail: 'order not found', statusCode: 404 });
    });

    test('returns success for duplicate callback when order is already processed', async () => {
        mockSuccessNotify({ amount: 1999 });
        models.Order.findOne.mockResolvedValue({
            status: 'paid'
        });

        const result = await OrderPaymentService.wechatPayNotify(buildNotifyReq());

        expect(models.__transaction.rollback).toHaveBeenCalled();
        expect(result).toEqual({ json_success: true });
    });

    test('returns 400 when paid amount does not match order total', async () => {
        mockSuccessNotify({ amount: 2999 });
        models.Order.findOne.mockResolvedValue({
            id: 10,
            status: 'pending',
            total_amount: 19.99
        });

        const result = await OrderPaymentService.wechatPayNotify(buildNotifyReq());

        expect(models.__transaction.rollback).toHaveBeenCalled();
        expect(result).toEqual({ json_fail: 'amount mismatch', statusCode: 400 });
    });

    test('marks pending order as paid and commits transaction on valid notify', async () => {
        mockSuccessNotify({ amount: 1999 });
        const buyer = {
            id: 3,
            role_level: 1,
            city: 'Shanghai',
            parent_id: null,
            increment: jest.fn(async () => undefined),
            save: jest.fn(async () => undefined)
        };
        const order = {
            id: 10,
            buyer_id: 3,
            product_id: 6,
            order_no: 'ORD1001',
            status: 'pending',
            total_amount: 19.99,
            actual_price: 19.99,
            quantity: 1,
            delivery_type: 'express',
            address_snapshot: {},
            save: jest.fn(async () => undefined)
        };

        models.Order.findOne.mockResolvedValue(order);
        models.User.findByPk.mockResolvedValue(buyer);

        const result = await OrderPaymentService.wechatPayNotify(buildNotifyReq());

        expect(result).toEqual({ json_success: true });
        expect(order.payment_method).toBe('wechat');
        expect(order.status).toBe('paid');
        expect(order.paid_at).toBeInstanceOf(Date);
        expect(models.__transaction.commit).toHaveBeenCalled();
        expect(order.save).toHaveBeenCalled();
    });
});
