/**
 * 管理端升级审批集成测试（5 用例）
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.test') });

const request = require('supertest');
const app = require('../../app');
const { sequelize, User, Admin, UpgradeApplication } = require('../../models');
const {
    signUserToken, signAdminToken, authHeader,
    createTestUser, createTestAdmin, cleanupTestData
} = require('./testHelpers');
const { ensureDbReady } = require('./dbInit');

let adminToken;
let applicationId;

beforeAll(async () => {
    await ensureDbReady(sequelize);
    await cleanupTestData(sequelize);

    const admin = await createTestAdmin(Admin);
    adminToken = signAdminToken(admin.id);
});

afterAll(async () => {
    await cleanupTestData(sequelize);
});

describe('管理端升级审批', () => {
    test('1. C2 用户提交线下升级申请 → pending_review', async () => {
        const c2 = await createTestUser(User, { role_level: 2, nickname: '待审批升级C2' });
        const token = signUserToken(c2.id, c2.openid);

        const res = await request(app).post('/api/upgrade/apply').set(authHeader(token))
            .send({ target_level: 3, payment_type: 'offline_transfer' });

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.status).toBe('pending_review');
        applicationId = res.body.data.id;
    });

    test('2. 查询升级申请列表', async () => {
        const res = await request(app).get('/admin/api/upgrade-applications').set(authHeader(adminToken));
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
    });

    test('3. 审批通过 → 用户 role_level 提升', async () => {
        const res = await request(app).put(`/admin/api/upgrade-applications/${applicationId}/review`).set(authHeader(adminToken))
            .send({ action: 'approve', remark: '审批通过' });
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);

        const appRow = await UpgradeApplication.findByPk(applicationId);
        expect(appRow.status).toBe('approved');

        const user = await User.findByPk(appRow.user_id);
        expect(user.role_level).toBeGreaterThanOrEqual(3);
    });

    test('4. 拒绝升级申请', async () => {
        const c2b = await createTestUser(User, { role_level: 2, nickname: '被拒绝升级C2' });
        const token = signUserToken(c2b.id, c2b.openid);
        const applyRes = await request(app).post('/api/upgrade/apply').set(authHeader(token))
            .send({ target_level: 3, payment_type: 'offline_transfer' });
        const appId = applyRes.body.data.id;

        const res = await request(app).put(`/admin/api/upgrade-applications/${appId}/review`).set(authHeader(adminToken))
            .send({ action: 'reject', remark: '不符合条件' });
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);

        const updated = await UpgradeApplication.findByPk(appId);
        expect(updated.status).toBe('rejected');

        const user = await User.findByPk(c2b.id);
        expect(user.role_level).toBe(2);
    });

    test('5. 已审批的申请不可再次审批', async () => {
        const res = await request(app).put(`/admin/api/upgrade-applications/${applicationId}/review`).set(authHeader(adminToken))
            .send({ action: 'approve', remark: '重复审批' });
        expect(res.body.code).toBe(-1);
    });
});
