/**
 * 提现/钱包集成测试
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.test') });

const request = require('supertest');
const app = require('../../app');
const { sequelize, User, Admin, Withdrawal, CommissionLog } = require('../../models');
const {
    signUserToken, signAdminToken, authHeader,
    createTestUser, createTestAdmin, cleanupTestData
} = require('./testHelpers');
const { ensureDbReady } = require('./dbInit');

let userToken, adminToken, userId, withdrawalId;

beforeAll(async () => {
    await ensureDbReady(sequelize);
    await cleanupTestData(sequelize);

    const user = await createTestUser(User, {
        role_level: 2, nickname: '提现测试用户', balance: 500
    });
    userId = user.id;
    userToken = signUserToken(user.id, user.openid);

    const admin = await createTestAdmin(Admin);
    adminToken = signAdminToken(admin.id);
});

afterAll(async () => {
    await cleanupTestData(sequelize);
});

describe('钱包信息', () => {
    test('1. 获取钱包信息', async () => {
        const res = await request(app)
            .get('/api/wallet')
            .set(authHeader(userToken));

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.balance).toBeDefined();
        expect(res.body.data.commission).toBeDefined();
    });

    test('2. 查询佣金明细', async () => {
        await CommissionLog.create({
            order_id: null, user_id: userId, amount: 50,
            type: 'gap', level: 1, status: 'settled'
        });

        const res = await request(app)
            .get('/api/wallet/commissions')
            .set(authHeader(userToken));

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.list.length).toBeGreaterThan(0);
    });
});

describe('提现流程', () => {
    test('3. 申请提现', async () => {
        const res = await request(app)
            .post('/api/wallet/withdraw')
            .set(authHeader(userToken))
            .send({ amount: 100, method: 'wechat' });

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        withdrawalId = res.body.data.id;

        const user = await User.findByPk(userId);
        expect(parseFloat(user.balance)).toBeLessThan(500);
    });

    test('4. 余额不足时提现被拒', async () => {
        const res = await request(app)
            .post('/api/wallet/withdraw')
            .set(authHeader(userToken))
            .send({ amount: 999999, method: 'wechat' });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe(-1);
    });

    test('5. 查看提现记录', async () => {
        const res = await request(app)
            .get('/api/wallet/withdrawals')
            .set(authHeader(userToken));

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.list.length).toBeGreaterThan(0);
    });

    test('6. 管理员查看提现列表', async () => {
        const res = await request(app)
            .get('/admin/api/withdrawals')
            .set(authHeader(adminToken));

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.list.length).toBeGreaterThan(0);
    });

    test('7. 管理员审批通过提现', async () => {
        const res = await request(app)
            .put(`/admin/api/withdrawals/${withdrawalId}/approve`)
            .set(authHeader(adminToken));

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);

        const w = await Withdrawal.findByPk(withdrawalId);
        expect(w.status).toBe('approved');
    });

    test('8. 管理员拒绝提现 → 余额退回', async () => {
        // 创建新提现
        const user2 = await createTestUser(User, { role_level: 1, nickname: '拒绝提现用户', balance: 200 });
        const token2 = signUserToken(user2.id, user2.openid);

        const applyRes = await request(app)
            .post('/api/wallet/withdraw')
            .set(authHeader(token2))
            .send({ amount: 50, method: 'wechat' });

        const wId = applyRes.body.data.id;

        const res = await request(app)
            .put(`/admin/api/withdrawals/${wId}/reject`)
            .set(authHeader(adminToken))
            .send({ reason: '信息不完整' });

        expect(res.status).toBe(200);

        const w = await Withdrawal.findByPk(wId);
        expect(w.status).toBe('rejected');

        const updated = await User.findByPk(user2.id);
        expect(parseFloat(updated.balance)).toBe(200);
    });
});
