/**
 * 优惠券 + 分红池集成测试（7 用例）
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.test') });

const request = require('supertest');
const app = require('../../app');
const { sequelize, User, Admin, Coupon, UserCoupon } = require('../../models');
const {
    signUserToken, signAdminToken, authHeader,
    createTestUser, createTestAdmin, cleanupTestData
} = require('./testHelpers');
const { ensureDbReady } = require('./dbInit');

let adminToken, userToken, userId, couponId;

beforeAll(async () => {
    await ensureDbReady(sequelize);
    await cleanupTestData(sequelize);

    const admin = await createTestAdmin(Admin);
    adminToken = signAdminToken(admin.id);

    const user = await createTestUser(User, { role_level: 1, nickname: '优惠券测试用户' });
    userId = user.id;
    userToken = signUserToken(user.id, user.openid);
});

afterAll(async () => {
    await cleanupTestData(sequelize);
});

describe('优惠券与分红', () => {
    test('1. 管理端创建优惠券模板', async () => {
        const res = await request(app).post('/admin/api/coupons').set(authHeader(adminToken))
            .send({
                name: '满100减10测试券', type: 'fixed',
                value: 10, min_purchase: 100,
                scope: 'all', valid_days: 30, stock: 100
            });
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        couponId = res.body.data.id;
    });

    test('2. 管理端优惠券列表与详情', async () => {
        const listRes = await request(app).get('/admin/api/coupons?page=1&limit=20').set(authHeader(adminToken));
        expect(listRes.status).toBe(200);
        expect(listRes.body.code).toBe(0);
        expect(listRes.body.data.list.length).toBeGreaterThan(0);

        const detailRes = await request(app).get(`/admin/api/coupons/${couponId}`).set(authHeader(adminToken));
        expect(detailRes.status).toBe(200);
        expect(detailRes.body.code).toBe(0);
        expect(detailRes.body.data.id).toBe(couponId);
    });

    test('3. 更新优惠券', async () => {
        const res = await request(app).put(`/admin/api/coupons/${couponId}`).set(authHeader(adminToken))
            .send({ name: '满100减15升级版', value: 15 });
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        const coupon = await Coupon.findByPk(couponId);
        expect(coupon.name).toBe('满100减15升级版');
    });

    test('4. 发放优惠券给指定用户', async () => {
        const res = await request(app).post(`/admin/api/coupons/${couponId}/issue`).set(authHeader(adminToken))
            .send({ user_ids: [userId] });
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        const uc = await UserCoupon.findOne({ where: { user_id: userId, coupon_id: couponId } });
        expect(uc).not.toBeNull();
    });

    test('5. C 端我的优惠券与可用券', async () => {
        const mine = await request(app).get('/api/coupons/mine?status=unused').set(authHeader(userToken));
        expect(mine.status).toBe(200);
        expect(mine.body.code).toBe(0);
        expect(mine.body.data.length).toBeGreaterThan(0);

        const avail = await request(app).get('/api/coupons/available?amount=200').set(authHeader(userToken));
        expect(avail.status).toBe(200);
        expect(avail.body.code).toBe(0);
    });

    test('6. 删除未被领取的优惠券模板', async () => {
        const createRes = await request(app).post('/admin/api/coupons').set(authHeader(adminToken))
            .send({ name: '待删除券', type: 'fixed', value: 5, scope: 'all', valid_days: 7, stock: 10 });
        const delId = createRes.body.data.id;
        const res = await request(app).delete(`/admin/api/coupons/${delId}`).set(authHeader(adminToken));
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
    });

    test('7. 分红规则与预览', async () => {
        const rules = await request(app).get('/admin/api/agent-system/dividend-rules').set(authHeader(adminToken));
        expect(rules.status).toBe(200);
        expect(rules.body.code).toBe(0);

        const preview = await request(app)
            .get('/admin/api/agent-system/dividend/preview?year=2025&pool=100000')
            .set(authHeader(adminToken));
        expect(preview.status).toBeLessThan(500);
    });
});
