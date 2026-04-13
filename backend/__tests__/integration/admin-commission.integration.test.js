/**
 * 管理端佣金审批+结算集成测试
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.test') });

const request = require('supertest');
const app = require('../../app');
const { sequelize, User, Product, Order, Address, CommissionLog, Admin, AgentWalletAccount } = require('../../models');
const {
    signUserToken, signAdminToken, authHeader,
    createTestUser, createTestProduct, createTestAddress, createTestAdmin,
    cleanupTestData
} = require('./testHelpers');
const { ensureDbReady } = require('./dbInit');

let buyerToken, adminToken, orderId, commLogIds = [], seedUserId;

beforeAll(async () => {
    await ensureDbReady(sequelize);
    await cleanupTestData(sequelize);

    const agentB1 = await createTestUser(User, { role_level: 3, agent_level: 1, nickname: '佣金审批-B1', balance: 0, stock_count: 100 });
    const parentC2 = await createTestUser(User, { role_level: 2, nickname: '佣金审批-C2', parent_id: agentB1.id });
    const buyerC1 = await createTestUser(User, { role_level: 1, nickname: '佣金审批-C1', parent_id: parentC2.id, agent_id: agentB1.id });

    await AgentWalletAccount.findOrCreate({
        where: { user_id: agentB1.id },
        defaults: { user_id: agentB1.id, balance: 50000, frozen_balance: 0, total_recharge: 50000, total_deduct: 0, status: 1 }
    });

    const product = await createTestProduct(Product, { stock: 500, retail_price: 399, supply_price_b1: 120 });
    const address = await createTestAddress(Address, buyerC1.id);
    buyerToken = signUserToken(buyerC1.id, buyerC1.openid);
    seedUserId = buyerC1.id;

    const admin = await createTestAdmin(Admin);
    adminToken = signAdminToken(admin.id);

    // 创建订单 → 支付 → 代理发货 → 确认收货 → 产生佣金
    const createRes = await request(app).post('/api/orders').set(authHeader(buyerToken))
        .send({ items: [{ product_id: product.id, quantity: 1 }], address_id: address.id, delivery_type: 'express' });
    orderId = createRes.body.data.id;

    await request(app).post(`/api/orders/${orderId}/pay`).set(authHeader(buyerToken));
    await new Promise(r => setTimeout(r, 2000));

    await Order.update({ fulfillment_type: 'Agent_Pending' }, { where: { id: orderId } });
    await request(app).put(`/admin/api/orders/${orderId}/ship`).set(authHeader(adminToken))
        .send({ tracking_no: 'COMM001', logistics_company: 'SF' });

    await request(app).post(`/api/orders/${orderId}/confirm`).set(authHeader(buyerToken));

    // 将佣金推到 pending_approval
    await CommissionLog.update(
        { status: 'pending_approval', refund_deadline: new Date('2020-01-01') },
        { where: { order_id: orderId, status: 'frozen' } }
    );

    const logs = await CommissionLog.findAll({ where: { order_id: orderId } });
    commLogIds = logs.map(l => l.id);
}, 90000);

afterAll(async () => {
    await cleanupTestData(sequelize);
});

describe('佣金审批', () => {
    test('1. 查询待审批佣金列表', async () => {
        const res = await request(app)
            .get('/admin/api/commissions/pending')
            .set(authHeader(adminToken));

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.list.length).toBeGreaterThan(0);
    });

    test('2. 查看佣金详情', async () => {
        const res = await request(app)
            .get(`/admin/api/commissions/${commLogIds[0]}`)
            .set(authHeader(adminToken));

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.id).toBe(commLogIds[0]);
    });

    test('3. 佣金列表分页', async () => {
        const res = await request(app)
            .get('/admin/api/commissions?page=1&limit=10')
            .set(authHeader(adminToken));

        expect(res.status).toBe(200);
        expect(res.body.data.pagination).toBeDefined();
        expect(res.body.data.stats).toBeDefined();
    });

    test('4. 审批通过单条佣金', async () => {
        const targetId = commLogIds[0];
        const res = await request(app)
            .put(`/admin/api/commissions/${targetId}/approve`)
            .set(authHeader(adminToken))
            .send({ remark: '测试审批通过' });

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);

        const log = await CommissionLog.findByPk(targetId);
        expect(log.status).toBe('approved');
    });

    test('5. 拒绝单条佣金', async () => {
        // 创建一条新的 pending_approval 佣金用于拒绝
        const newLog = await CommissionLog.create({
            order_id: orderId, user_id: commLogIds[0] ? (await CommissionLog.findByPk(commLogIds[0]))?.user_id : 1,
            amount: 10, type: 'gap', level: 1, status: 'pending_approval'
        });

        const res = await request(app)
            .put(`/admin/api/commissions/${newLog.id}/reject`)
            .set(authHeader(adminToken))
            .send({ reason: '测试拒绝' });

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);

        const log = await CommissionLog.findByPk(newLog.id);
        expect(log.status).toBe('cancelled');
    });

    test('6. 批量审批通过', async () => {
        const logs = await Promise.all([
            CommissionLog.create({ order_id: orderId, user_id: seedUserId, amount: 5, type: 'gap', level: 1, status: 'pending_approval' }),
            CommissionLog.create({ order_id: orderId, user_id: seedUserId, amount: 8, type: 'gap', level: 2, status: 'pending_approval' })
        ]);

        const res = await request(app)
            .post('/admin/api/commissions/batch-approve')
            .set(authHeader(adminToken))
            .send({ ids: logs.map(l => l.id) });

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
    });

    test('7. 批量拒绝', async () => {
        const logs = await Promise.all([
            CommissionLog.create({ order_id: orderId, user_id: seedUserId, amount: 3, type: 'gap', level: 1, status: 'pending_approval' }),
            CommissionLog.create({ order_id: orderId, user_id: seedUserId, amount: 4, type: 'gap', level: 2, status: 'pending_approval' })
        ]);

        const res = await request(app)
            .post('/admin/api/commissions/batch-reject')
            .set(authHeader(adminToken))
            .send({ ids: logs.map(l => l.id), reason: '批量拒绝测试' });

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
    });

    test('8. 结算到期 → 用户余额增加', async () => {
        const user = await createTestUser(User, { role_level: 1, nickname: '结算测试用户', balance: 0 });
        const log = await CommissionLog.create({
            order_id: orderId, user_id: user.id, amount: 100,
            type: 'agent_fulfillment', level: 1, status: 'approved',
            available_at: new Date('2020-01-01')
        });

        await new Promise((r) => setTimeout(r, 4000));

        const OrderJobService = require('../../services/OrderJobService');
        await OrderJobService.settleCommissions();

        const settled = await CommissionLog.findByPk(log.id);
        expect(settled.status).toBe('settled');

        const updatedUser = await User.findByPk(user.id);
        expect(parseFloat(updatedUser.balance)).toBeGreaterThanOrEqual(100);
    }, 120000);
});
