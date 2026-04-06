/**
 * orderController 集成测试骨架
 * 测试 HTTP 请求/响应流程 + OrderCoreService 协调器委托
 *
 * 运行方式: npx jest __tests__/controllers/orderController.test.js
 *
 * 注意: 这些测试需要 mock req/res/next 和 Service 层
 */
const orderController = require('../../controllers/orderController');

// Mock 依赖
jest.mock('../../services/OrderCoreService', () => ({
    createOrder: jest.fn(),
    prepayOrder: jest.fn(),
    wechatPayNotify: jest.fn(),
    syncPendingOrderWechatPay: jest.fn(),
    payOrder: jest.fn(),
    confirmOrder: jest.fn(),
    forceCompleteOrderByAdmin: jest.fn(),
    agentConfirmOrder: jest.fn(),
    requestShipping: jest.fn(),
    shipOrder: jest.fn(),
    cancelOrder: jest.fn(),
}));

jest.mock('../../services/OrderQueryService', () => ({
    getAgentOrders: jest.fn(),
    getOrders: jest.fn(),
    getOrderById: jest.fn(),
}));

jest.mock('../../services/OrderReviewService', () => ({
    submitOrderReview: jest.fn(),
}));

const OrderCore = require('../../services/OrderCoreService');
const OrderQueryService = require('../../services/OrderQueryService');
const OrderReviewService = require('../../services/OrderReviewService');

describe('orderController (集成测试骨架)', () => {
    let mockReq, mockRes;

    beforeEach(() => {
        jest.clearAllMocks();
        mockReq = { user: { id: 1 }, body: {}, params: {}, query: {} };
        mockRes = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            send: jest.fn(),
        };
    });

    // ======================== createOrder ========================
    describe('POST /orders/create', () => {
        it('成功时应返回 code:0 并展开结果', async () => {
            const fakeOrder = { id: 999, total_amount: 299 };
            OrderCore.createOrder.mockResolvedValue(fakeOrder);

            await orderController.createOrder(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                code: 0,
                id: 999,
                total_amount: 299,
            }));
        });

        it('返回 xml_success 时应输出微信兼容 XML', async () => {
            OrderCore.createOrder.mockResolvedValue({ xml_success: true });

            await orderController.createOrder(mockReq, mockRes);

            expect(mockRes.set).toHaveBeenCalledWith('Content-Type', 'text/xml');
            expect(mockRes.send).toHaveBeenCalledWith(expect.stringContaining('<return_code><![CDATA[SUCCESS]]></return_code>'));
        });

        it('返回 xml_fail 时应输出失败 XML', async () => {
            OrderCore.createOrder.mockResolvedValue({ xml_fail: '库存不足' });

            await orderController.createOrder(mockReq, mockRes);

            expect(mockRes.set).toHaveBeenCalledWith('Content-Type', 'text/xml');
            expect(mockRes.send).toHaveBeenCalledWith(expect.stringContaining('<![CDATA[库存不足]]>'));
        });

        it('失败时应返回 400 错误（非 next）', async () => {
            const err = new Error('创建订单失败');
            OrderCore.createOrder.mockRejectedValue(err);

            await orderController.createOrder(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                code: -1,
                message: '创建订单失败',
            }));
        });
    });

    // ======================== prepayOrder ========================
    describe('POST /orders/prepay', () => {
        it('成功时应展开返回微信支付参数', async () => {
            const payParams = { appId: 'wx...', timeStamp: '...' };
            OrderCore.prepayOrder.mockResolvedValue(payParams);

            await orderController.prepayOrder(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                code: 0,
                appId: 'wx...',
            }));
        });
    });

    // ======================== confirmOrder ========================
    describe('POST /orders/:id/confirm', () => {
        it('成功时返回 code:0', async () => {
            OrderCore.confirmOrder.mockResolvedValue({ success: true });
            mockReq.params = { id: '123' };

            await orderController.confirmOrder(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0 }));
        });
    });

    // ======================== cancelOrder ========================
    describe('POST /orders/:id/cancel', () => {
        it('成功时返回 code:0', async () => {
            OrderCore.cancelOrder.mockResolvedValue({});
            mockReq.params = { id: '456' };

            await orderController.cancelOrder(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0 }));
        });

        it('失败时返回 400 错误', async () => {
            OrderCore.cancelOrder.mockRejectedValue(new Error('无法取消'));

            await orderController.cancelOrder(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                code: -1,
                message: expect.any(String),
            }));
        });
    });

    // ======================== shipOrder ========================
    describe('POST /orders/:id/ship', () => {
        it('成功时返回 code:0', async () => {
            OrderCore.shipOrder.mockResolvedValue({});
            mockReq.params = { id: '789' };

            await orderController.shipOrder(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0 }));
        });
    });

    describe('POST /wechat/pay/notify', () => {
        it('json_success 时应返回微信成功响应', async () => {
            OrderCore.wechatPayNotify.mockResolvedValue({ json_success: true });

            await orderController.wechatPayNotify(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ code: 'SUCCESS', message: '成功' });
        });

        it('json_fail 时应返回指定状态码', async () => {
            OrderCore.wechatPayNotify.mockResolvedValue({ json_fail: '签名失败', statusCode: 401 });

            await orderController.wechatPayNotify(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ code: 'ERROR', message: '签名失败' });
        });
    });

    describe('GET /orders', () => {
        it('列表查询应委托给 OrderQueryService', async () => {
            OrderQueryService.getOrders.mockResolvedValue({ data: { list: [], pagination: { total: 0, page: 1, limit: 20 } } });

            await orderController.getOrders(mockReq, mockRes);

            expect(OrderQueryService.getOrders).toHaveBeenCalledWith(mockReq);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0 }));
        });
    });

    describe('GET /orders/:id', () => {
        it('详情查询应委托给 OrderQueryService', async () => {
            OrderQueryService.getOrderById.mockResolvedValue({ data: { id: 123 } });
            mockReq.params = { id: '123' };

            await orderController.getOrderById(mockReq, mockRes);

            expect(OrderQueryService.getOrderById).toHaveBeenCalledWith(mockReq);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0, data: { id: 123 } }));
        });
    });

    describe('POST /orders/:id/review', () => {
        it('评价提交应委托给 OrderReviewService', async () => {
            OrderReviewService.submitOrderReview.mockResolvedValue({ data: { id: 7 }, message: '评价提交成功' });
            mockReq.params = { id: '123' };

            await orderController.submitOrderReview(mockReq, mockRes);

            expect(OrderReviewService.submitOrderReview).toHaveBeenCalledWith(mockReq);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0, message: '评价提交成功' }));
        });
    });
});
