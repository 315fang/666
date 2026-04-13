/**
 * 积分体系集成测试
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.test') });

const request = require('supertest');
const app = require('../../app');
const { sequelize, User } = require('../../models');
const {
    signUserToken, authHeader,
    createTestUser, cleanupTestData
} = require('./testHelpers');
const { ensureDbReady } = require('./dbInit');

let userToken, userId;

beforeAll(async () => {
    await ensureDbReady(sequelize);
    await cleanupTestData(sequelize);

    const user = await createTestUser(User, { role_level: 1, nickname: '积分测试用户' });
    userId = user.id;
    userToken = signUserToken(user.id, user.openid);
});

afterAll(async () => {
    await cleanupTestData(sequelize);
});

describe('积分体系', () => {
    test('1. 获取积分账户', async () => {
        const res = await request(app)
            .get('/api/points/account')
            .set(authHeader(userToken));

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data).toBeDefined();
    });

    test('2. 每日签到', async () => {
        const res = await request(app)
            .post('/api/points/checkin')
            .set(authHeader(userToken));

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.points_earned).toBeGreaterThan(0);
    });

    test('3. 重复签到被拒', async () => {
        const res = await request(app)
            .post('/api/points/checkin')
            .set(authHeader(userToken));

        expect(res.body.code).not.toBe(0);
    });

    test('4. 签到状态查询', async () => {
        const res = await request(app)
            .get('/api/points/sign-in/status')
            .set(authHeader(userToken));

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
    });

    test('5. 积分流水', async () => {
        const res = await request(app)
            .get('/api/points/logs')
            .set(authHeader(userToken));

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.list.length).toBeGreaterThan(0);
    });

    test('6. 积分任务列表', async () => {
        const res = await request(app)
            .get('/api/points/tasks')
            .set(authHeader(userToken));

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
    });

    test('7. 等级特权说明', async () => {
        const res = await request(app)
            .get('/api/points/levels')
            .set(authHeader(userToken));

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
    });
});
