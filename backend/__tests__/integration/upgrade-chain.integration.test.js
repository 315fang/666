/**
 * 升级链路集成测试
 * 普通用户下单满额自动升 C1 → C1 申请升级
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

let product, adminToken;

beforeAll(async () => {
    await ensureDbReady(sequelize);
    await cleanupTestData(sequelize);

    product = await createTestProduct(Product, { stock: 1000, retail_price: 399 });

    const admin = await createTestAdmin(Admin);
    adminToken = signAdminToken(admin.id);
});

afterAll(async () => {
    await cleanupTestData(sequelize);
});

describe('自动升级：普通用户 → C1', () => {
    test('下单满 299 后自动升级为 C1 (role_level=1)', async () => {
        const guest = await createTestUser(User, { role_level: 0, nickname: '待升级用户' });
        const addr = await createTestAddress(Address, guest.id);
        const token = signUserToken(guest.id, guest.openid);

        const createRes = await request(app)
            .post('/api/orders')
            .set(authHeader(token))
            .send({
                items: [{ product_id: product.id, quantity: 1 }],
                address_id: addr.id,
                delivery_type: 'express'
            });
        expect(createRes.status).toBe(200);
        const orderId = createRes.body.data.id;

        let user = await User.findByPk(guest.id);
        expect(user.role_level).toBe(0);

        const payRes = await request(app)
            .post(`/api/orders/${orderId}/pay`)
            .set(authHeader(token))
            .send();
        expect(payRes.status).toBe(200);

        user = await User.findByPk(guest.id);
        expect(user.role_level).toBe(1);
    });

    test('下单金额不足时不升级', async () => {
        const cheapProduct = await createTestProduct(Product, {
            retail_price: 99,
            stock: 100
        });

        const guest2 = await createTestUser(User, { role_level: 0, nickname: '低价买家' });
        const addr2 = await createTestAddress(Address, guest2.id);
        const token2 = signUserToken(guest2.id, guest2.openid);

        const createRes = await request(app)
            .post('/api/orders')
            .set(authHeader(token2))
            .send({
                items: [{ product_id: cheapProduct.id, quantity: 1 }],
                address_id: addr2.id,
                delivery_type: 'express'
            });
        expect(createRes.status).toBe(200);
        const orderId2 = createRes.body.data.id;

        await request(app)
            .post(`/api/orders/${orderId2}/pay`)
            .set(authHeader(token2))
            .send();

        const user2 = await User.findByPk(guest2.id);
        expect(user2.role_level).toBe(0);
    });
});

describe('升级申请', () => {
    test('C1 用户提交升级申请', async () => {
        const c1User = await createTestUser(User, {
            role_level: 1,
            nickname: '申请升级的C1'
        });
        const token = signUserToken(c1User.id, c1User.openid);

        const res = await request(app)
            .post('/api/upgrade/apply')
            .set(authHeader(token))
            .send({
                target_level: 3,
                payment_method: 'offline'
            });

        // API 正常可访问即可（业务规则可能拒绝，但不应 500）
        expect(res.status).toBeLessThan(500);
    });

    test('查询我的升级申请', async () => {
        const c1User2 = await createTestUser(User, {
            role_level: 1,
            nickname: '查询升级的C1'
        });
        const token2 = signUserToken(c1User2.id, c1User2.openid);

        const res = await request(app)
            .get('/api/upgrade/my')
            .set(authHeader(token2));

        expect(res.status).toBe(200);
    });
});
