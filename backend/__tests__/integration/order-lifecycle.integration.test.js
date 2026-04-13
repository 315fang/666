/**
 * 订单全生命周期集成测试
 * 创建订单 → 支付 → 发货 → 确认收货
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.test') });

const request = require('supertest');
const app = require('../../app');
const { sequelize, User, Product, Order, Address, Admin } = require('../../models');
const {
    signUserToken, signAdminToken, authHeader,
    createTestUser, createTestProduct, createTestAddress, createTestAdmin,
    cleanupTestData
} = require('./testHelpers');
const { ensureDbReady } = require('./dbInit');

let buyer, product, address, buyerToken, adminToken, adminId;

beforeAll(async () => {
    await ensureDbReady(sequelize);
    await cleanupTestData(sequelize);

    buyer = await createTestUser(User, { role_level: 0, nickname: '买家A' });
    product = await createTestProduct(Product, { stock: 100, retail_price: 399 });
    address = await createTestAddress(Address, buyer.id);
    buyerToken = signUserToken(buyer.id, buyer.openid);

    const admin = await createTestAdmin(Admin);
    adminId = admin.id;
    adminToken = signAdminToken(adminId);
});

afterAll(async () => {
    await cleanupTestData(sequelize);
});

describe('订单全生命周期', () => {
    let orderId;

    test('1. 创建订单 → status=pending', async () => {
        const res = await request(app)
            .post('/api/orders')
            .set(authHeader(buyerToken))
            .send({
                items: [{ product_id: product.id, quantity: 1 }],
                address_id: address.id,
                delivery_type: 'express'
            });

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);

        const orderData = res.body.data;
        orderId = orderData.id;
        expect(orderData.status).toBe('pending');
        expect(parseFloat(orderData.total_amount)).toBeGreaterThan(0);
    });

    test('2. 手动支付 → status=paid', async () => {
        const res = await request(app)
            .post(`/api/orders/${orderId}/pay`)
            .set(authHeader(buyerToken))
            .send();

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);

        const order = await Order.findByPk(orderId);
        expect(order.status).toBe('paid');
        expect(order.paid_at).not.toBeNull();
    });

    test('3. 后台发货（平台发货）→ status=shipped', async () => {
        const res = await request(app)
            .put(`/admin/api/orders/${orderId}/ship`)
            .set(authHeader(adminToken))
            .send({
                tracking_no: 'SF1234567890',
                logistics_company: 'SF'
            });

        expect(res.status).toBe(200);

        const order = await Order.findByPk(orderId);
        expect(order.status).toBe('shipped');
        expect(order.tracking_no).toBe('SF1234567890');
        expect(order.shipped_at).not.toBeNull();
    });

    test('4. 确认收货 → status=completed', async () => {
        const res = await request(app)
            .post(`/api/orders/${orderId}/confirm`)
            .set(authHeader(buyerToken))
            .send();

        expect(res.status).toBe(200);

        const order = await Order.findByPk(orderId);
        expect(order.status).toBe('completed');
        expect(order.completed_at).not.toBeNull();
    });

    test('5. 已完成订单不能重复确认', async () => {
        const res = await request(app)
            .post(`/api/orders/${orderId}/confirm`)
            .set(authHeader(buyerToken))
            .send();

        expect(res.status).not.toBe(200);
    });
});

describe('订单取消', () => {
    test('创建订单后取消 → 库存恢复', async () => {
        const stockBefore = (await Product.findByPk(product.id)).stock;

        const createRes = await request(app)
            .post('/api/orders')
            .set(authHeader(buyerToken))
            .send({
                items: [{ product_id: product.id, quantity: 2 }],
                address_id: address.id,
                delivery_type: 'express'
            });
        expect(createRes.status).toBe(200);
        const cancelOrderId = createRes.body.data.id;

        const cancelRes = await request(app)
            .post(`/api/orders/${cancelOrderId}/cancel`)
            .set(authHeader(buyerToken))
            .send();
        expect(cancelRes.status).toBe(200);

        const order = await Order.findByPk(cancelOrderId);
        expect(order.status).toBe('cancelled');

        const stockAfter = (await Product.findByPk(product.id)).stock;
        expect(stockAfter).toBe(stockBefore);
    });
});
