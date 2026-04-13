/**
 * 管理端退款审批集成测试（6 用例）
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

let buyerToken, adminToken, orderId, refundId;

beforeAll(async () => {
    await ensureDbReady(sequelize);
    await cleanupTestData(sequelize);

    const buyer = await createTestUser(User, { role_level: 1, nickname: '退款审批-买家' });
    const product = await createTestProduct(Product, { stock: 200, retail_price: 399 });
    const address = await createTestAddress(Address, buyer.id);
    buyerToken = signUserToken(buyer.id, buyer.openid);

    const admin = await createTestAdmin(Admin);
    adminToken = signAdminToken(admin.id);

    const createRes = await request(app).post('/api/orders').set(authHeader(buyerToken))
        .send({ items: [{ product_id: product.id, quantity: 1 }], address_id: address.id, delivery_type: 'express' });
    orderId = createRes.body.data.id;

    await request(app).post(`/api/orders/${orderId}/pay`).set(authHeader(buyerToken));
    await request(app).put(`/admin/api/orders/${orderId}/ship`).set(authHeader(adminToken))
        .send({ tracking_no: 'REFADM001', logistics_company: 'SF' });

    await request(app).post('/api/refunds').set(authHeader(buyerToken))
        .send({ order_id: orderId, reason: '退款审批测试', type: 'refund_only' });

    const refunds = await Refund.findAll({ where: { order_id: orderId } });
    refundId = refunds[0].id;
});

afterAll(async () => {
    await cleanupTestData(sequelize);
});

describe('管理端退款审批', () => {
    test('1. 查询退款列表', async () => {
        const res = await request(app).get('/admin/api/refunds').set(authHeader(adminToken));
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.list.length).toBeGreaterThan(0);
    });

    test('2. 按状态筛选退款列表', async () => {
        const res = await request(app).get('/admin/api/refunds?status=pending').set(authHeader(adminToken));
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.list.every((r) => r.status === 'pending')).toBe(true);
    });

    test('3. 查看退款详情', async () => {
        const res = await request(app).get(`/admin/api/refunds/${refundId}`).set(authHeader(adminToken));
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.id).toBe(refundId);
    });

    test('4. 审批通过退款', async () => {
        const res = await request(app).put(`/admin/api/refunds/${refundId}/approve`).set(authHeader(adminToken))
            .send({ remark: '同意退款' });
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        const refund = await Refund.findByPk(refundId);
        expect(refund.status).toBe('approved');
    });

    test('5. 完成退款 → 售后单 completed', async () => {
        // 走钱包退款路径，避免依赖微信 V3 配置与 refundOrder 真实调用
        await Order.update({ payment_method: 'wallet' }, { where: { id: orderId } });

        const res = await request(app).put(`/admin/api/refunds/${refundId}/complete`).set(authHeader(adminToken))
            .send({ remark: '退款完成' });
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        const refund = await Refund.findByPk(refundId);
        expect(refund.status).toBe('completed');
    });

    test('6. 拒绝另一条退款申请', async () => {
        const buyer2 = await createTestUser(User, { role_level: 1, nickname: '退款拒绝-买家' });
        const product2 = await createTestProduct(Product, { stock: 100, retail_price: 199 });
        const addr2 = await createTestAddress(Address, buyer2.id);
        const token2 = signUserToken(buyer2.id, buyer2.openid);

        const createRes = await request(app).post('/api/orders').set(authHeader(token2))
            .send({ items: [{ product_id: product2.id, quantity: 1 }], address_id: addr2.id, delivery_type: 'express' });
        const oid2 = createRes.body.data.id;

        await request(app).post(`/api/orders/${oid2}/pay`).set(authHeader(token2));
        await request(app).put(`/admin/api/orders/${oid2}/ship`).set(authHeader(adminToken))
            .send({ tracking_no: 'REFADM002', logistics_company: 'YT' });
        await request(app).post('/api/refunds').set(authHeader(token2))
            .send({ order_id: oid2, reason: '测试拒绝', type: 'refund_only' });

        const r2 = await Refund.findOne({ where: { order_id: oid2 } });
        const res = await request(app).put(`/admin/api/refunds/${r2.id}/reject`).set(authHeader(adminToken))
            .send({ reason: '不符合退款条件' });
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        const refund = await Refund.findByPk(r2.id);
        expect(refund.status).toBe('rejected');
    });
});
