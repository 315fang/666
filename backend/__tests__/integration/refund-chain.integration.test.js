/**
 * 退款链路集成测试
 * 已发货订单 → 申请退款 → 验证退款记录
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.test') });

const request = require('supertest');
const app = require('../../app');
const { sequelize, User, Product, Order, Address, Refund, Admin } = require('../../models');
const {
    signUserToken, signAdminToken, authHeader,
    createTestUser, createTestProduct, createTestAddress, createTestAdmin,
    cleanupTestData
} = require('./testHelpers');
const { ensureDbReady } = require('./dbInit');

let buyer, product, address, buyerToken, adminToken;

beforeAll(async () => {
    await ensureDbReady(sequelize);
    await cleanupTestData(sequelize);

    buyer = await createTestUser(User, {
        role_level: 1, nickname: '退款测试-买家'
    });

    product = await createTestProduct(Product, { stock: 200, retail_price: 399 });
    address = await createTestAddress(Address, buyer.id);
    buyerToken = signUserToken(buyer.id, buyer.openid);

    const admin = await createTestAdmin(Admin);
    adminToken = signAdminToken(admin.id);
});

afterAll(async () => {
    await cleanupTestData(sequelize);
});

describe('退款链路', () => {
    let orderId;

    test('1. 创建订单 + 支付 + 发货', async () => {
        const createRes = await request(app)
            .post('/api/orders')
            .set(authHeader(buyerToken))
            .send({
                items: [{ product_id: product.id, quantity: 1 }],
                address_id: address.id,
                delivery_type: 'express'
            });
        expect(createRes.status).toBe(200);
        orderId = createRes.body.data.id;

        const payRes = await request(app)
            .post(`/api/orders/${orderId}/pay`)
            .set(authHeader(buyerToken))
            .send();
        expect(payRes.status).toBe(200);

        const shipRes = await request(app)
            .put(`/admin/api/orders/${orderId}/ship`)
            .set(authHeader(adminToken))
            .send({ tracking_no: 'TK001', logistics_company: 'SF' });
        expect(shipRes.status).toBe(200);

        const order = await Order.findByPk(orderId);
        expect(order.status).toBe('shipped');
    });

    test('2. 已发货订单申请退款 → 退款记录创建', async () => {
        const res = await request(app)
            .post('/api/refunds')
            .set(authHeader(buyerToken))
            .send({
                order_id: orderId,
                reason: '商品质量问题',
                type: 'refund_only'
            });

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);

        const refunds = await Refund.findAll({ where: { order_id: orderId } });
        expect(refunds.length).toBe(1);
        expect(refunds[0].status).toBe('pending');
    });

    test('3. 不能重复申请退款', async () => {
        const res = await request(app)
            .post('/api/refunds')
            .set(authHeader(buyerToken))
            .send({
                order_id: orderId,
                reason: '再次申请',
                type: 'refund_only'
            });

        expect(res.body.code).toBe(-1);
    });
});

describe('取消未付款订单 → 库存恢复', () => {
    test('取消待付款订单后库存恢复', async () => {
        const stockBefore = (await Product.findByPk(product.id)).stock;

        const createRes = await request(app)
            .post('/api/orders')
            .set(authHeader(buyerToken))
            .send({
                items: [{ product_id: product.id, quantity: 3 }],
                address_id: address.id,
                delivery_type: 'express'
            });
        expect(createRes.status).toBe(200);
        const newOrderId = createRes.body.data.id;

        const cancelRes = await request(app)
            .post(`/api/orders/${newOrderId}/cancel`)
            .set(authHeader(buyerToken))
            .send();
        expect(cancelRes.status).toBe(200);

        const stockAfter = (await Product.findByPk(product.id)).stock;
        expect(stockAfter).toBe(stockBefore);
    });
});
