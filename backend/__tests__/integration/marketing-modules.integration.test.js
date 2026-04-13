/**
 * 拼团 / 砍价 / 抽奖 / N 路径 集成测试（14 用例）
 *
 * N 路径公开与业务路由见 backend/routes/n-system.js（挂载 /api/n）
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.test') });

const request = require('supertest');
const app = require('../../app');
const {
    sequelize, User, Product, GroupActivity, SlashActivity,
    LotteryPrize, AgentWalletAccount
} = require('../../models');
const constants = require('../../config/constants');
const PointService = require('../../services/PointService');
const {
    signUserToken, authHeader,
    createTestUser, createTestProduct, cleanupTestData
} = require('./testHelpers');
const { ensureDbReady } = require('./dbInit');

const { ROLES } = constants;

let productGroup;
let productSlash;
let leaderToken;
let memberToken;
let leaderId;
let memberId;
let activityGroupId;
let slashActivityId;
let groupNo;
let slashNo;

beforeAll(async () => {
    await ensureDbReady(sequelize);
    await cleanupTestData(sequelize);

    productGroup = await createTestProduct(Product, {
        stock: 500, retail_price: 399, enable_group_buy: 1, visible_in_mall: true
    });
    productSlash = await createTestProduct(Product, {
        stock: 500, retail_price: 299, visible_in_mall: true
    });

    const ga = await GroupActivity.create({
        product_id: productGroup.id,
        sku_id: null,
        min_members: 2,
        max_members: 10,
        group_price: 199,
        original_price: 399,
        expire_hours: 48,
        stock_limit: 100,
        sold_count: 0,
        status: 1,
        start_at: null,
        end_at: null
    });
    activityGroupId = ga.id;

    const sa = await SlashActivity.create({
        product_id: productSlash.id,
        sku_id: null,
        original_price: 299,
        floor_price: 99,
        initial_price: 299,
        max_slash_per_helper: 5,
        min_slash_per_helper: 0.1,
        max_helpers: 20,
        expire_hours: 48,
        stock_limit: 100,
        sold_count: 0,
        status: 1,
        start_at: null,
        end_at: null
    });
    slashActivityId = sa.id;

    await LotteryPrize.destroy({ where: {}, truncate: false });
    await LotteryPrize.bulkCreate([
        { name: '谢谢参与', cost_points: 10, probability: 80, stock: -1, type: 'miss', prize_value: 0, sort_order: 1, is_active: 1 },
        { name: '10积分', cost_points: 10, probability: 20, stock: -1, type: 'points', prize_value: 10, sort_order: 2, is_active: 1 }
    ]);

    const leader = await createTestUser(User, {
        role_level: ROLES.N_LEADER,
        nickname: 'N路径-大N',
        n_leader_id: null
    });
    leaderId = leader.id;
    leaderToken = signUserToken(leader.id, leader.openid);

    const member = await createTestUser(User, {
        role_level: ROLES.N_MEMBER,
        nickname: 'N路径-小n',
        n_leader_id: leaderId
    });
    memberId = member.id;
    memberToken = signUserToken(member.id, member.openid);

    await AgentWalletAccount.findOrCreate({
        where: { user_id: leaderId },
        defaults: {
            user_id: leaderId, balance: 10000, frozen_balance: 0,
            total_recharge: 10000, total_deduct: 0, status: 1
        }
    });
    const la = await AgentWalletAccount.findOne({ where: { user_id: leaderId } });
    if (parseFloat(la.balance) < 5000) {
        await la.update({ balance: 10000, total_recharge: 10000 });
    }

    await AgentWalletAccount.findOrCreate({
        where: { user_id: memberId },
        defaults: {
            user_id: memberId, balance: 0, frozen_balance: 0,
            total_recharge: 0, total_deduct: 0, status: 1
        }
    });
}, 120000);

afterAll(async () => {
    await cleanupTestData(sequelize);
});

describe('N 路径 API', () => {
    test('1. GET /api/n/invite-card 缺少 leader_id', async () => {
        const res = await request(app).get('/api/n/invite-card');
        expect(res.status).toBe(400);
        expect(res.body.code).toBe(-1);
    });

    test('2. GET /api/n/invite-card 非大N返回 404', async () => {
        const res = await request(app).get(`/api/n/invite-card?leader_id=${memberId}`);
        expect(res.status).toBe(404);
    });

    test('3. GET /api/n/invite-card 大N成功', async () => {
        const res = await request(app).get(`/api/n/invite-card?leader_id=${leaderId}`);
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.leader_id).toBe(leaderId);
    });

    test('4. POST /api/n/allocate 大N向小n 划拨货款', async () => {
        const res = await request(app).post('/api/n/allocate').set(authHeader(leaderToken))
            .send({ member_id: memberId, amount: 50, remark: '集成测试划拨' });
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
    });

    test('5. 小n 申请货款 + 大N 列表 + 审核通过', async () => {
        const reqRes = await request(app).post('/api/n/fund-request').set(authHeader(memberToken))
            .send({ amount: 30, note: '需要货款' });
        expect(reqRes.status).toBe(200);
        expect(reqRes.body.code).toBe(0);
        const fundReqId = reqRes.body.data.id;

        const listRes = await request(app).get('/api/n/fund-requests').set(authHeader(leaderToken));
        expect(listRes.status).toBe(200);
        expect(listRes.body.data.some((r) => r.id === fundReqId)).toBe(true);

        const reviewRes = await request(app).post(`/api/n/fund-requests/${fundReqId}/review`).set(authHeader(leaderToken))
            .send({ action: 'approve' });
        expect(reviewRes.status).toBe(200);
        expect(reviewRes.body.code).toBe(0);
    });

    test('6. GET /api/n/members、my-leader、upgrade-eligibility', async () => {
        const members = await request(app).get('/api/n/members').set(authHeader(leaderToken));
        expect(members.status).toBe(200);
        expect(members.body.code).toBe(0);

        const myLeader = await request(app).get('/api/n/my-leader').set(authHeader(memberToken));
        expect(myLeader.status).toBe(200);
        expect(myLeader.body.code).toBe(0);
        expect(myLeader.body.data).toBeTruthy();
        expect(myLeader.body.data.id).toBe(leaderId);

        const elig = await request(app).get('/api/n/upgrade-eligibility').set(authHeader(memberToken));
        expect(elig.status).toBe(200);
        expect(elig.body.code).toBe(0);
    });
});

describe('拼团 API', () => {
    test('7. GET /api/group/activities', async () => {
        const res = await request(app).get(`/api/group/activities?product_id=${productGroup.id}`);
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.length).toBeGreaterThan(0);
    });

    test('8. POST /api/group/orders 发起拼团', async () => {
        const u = await createTestUser(User, { role_level: 1, nickname: '拼团团长' });
        const tok = signUserToken(u.id, u.openid);
        const res = await request(app).post('/api/group/orders').set(authHeader(tok))
            .send({ activity_id: activityGroupId });
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        groupNo = res.body.data.group_no;
        expect(groupNo).toBeTruthy();
    });

    test('9. GET 团详情 + 参团 + 我的拼团', async () => {
        const detail = await request(app).get(`/api/group/orders/${groupNo}`);
        expect(detail.status).toBe(200);
        expect(detail.body.code).toBe(0);

        const u2 = await createTestUser(User, { role_level: 1, nickname: '拼团团员' });
        const tok2 = signUserToken(u2.id, u2.openid);
        const join = await request(app).post(`/api/group/orders/${groupNo}/join`).set(authHeader(tok2)).send({});
        expect(join.status).toBe(200);
        expect(join.body.code).toBe(0);

        const my = await request(app).get('/api/group/my').set(authHeader(tok2));
        expect(my.status).toBe(200);
        expect(my.body.code).toBe(0);
    });
});

describe('砍价 API', () => {
    test('10. GET /api/slash/activities', async () => {
        const res = await request(app).get(`/api/slash/activities?product_id=${productSlash.id}`);
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.length).toBeGreaterThan(0);
    });

    test('11. POST /api/slash/start + GET 详情', async () => {
        const u = await createTestUser(User, { role_level: 0, nickname: '砍价发起者' });
        const tok = signUserToken(u.id, u.openid);
        const start = await request(app).post('/api/slash/start').set(authHeader(tok))
            .send({ activity_id: slashActivityId });
        expect(start.status).toBe(200);
        expect(start.body.code).toBe(0);
        slashNo = start.body.data.slash_no;
        expect(slashNo).toBeTruthy();

        const det = await request(app).get(`/api/slash/${slashNo}`);
        expect(det.status).toBe(200);
        expect(det.body.code).toBe(0);
    });

    test('12. POST 帮砍 + GET /api/slash/my/list', async () => {
        const helper = await createTestUser(User, { role_level: 0, nickname: '帮砍用户' });
        const hTok = signUserToken(helper.id, helper.openid);
        const help = await request(app).post(`/api/slash/${slashNo}/help`).set(authHeader(hTok)).send({});
        expect(help.status).toBe(200);

        const leader = await createTestUser(User, { role_level: 1, nickname: '砍价团长查列表' });
        const lTok = signUserToken(leader.id, leader.openid);
        const start2 = await request(app).post('/api/slash/start').set(authHeader(lTok))
            .send({ activity_id: slashActivityId });
        const mySn = start2.body.data.slash_no;
        const myList = await request(app).get('/api/slash/my/list').set(authHeader(lTok));
        expect(myList.status).toBe(200);
        expect(myList.body.code).toBe(0);
        expect(myList.body.data.some((r) => r.slash_no === mySn)).toBe(true);
    });
});

describe('抽奖 API', () => {
    test('13. GET /api/lottery/prizes', async () => {
        const res = await request(app).get('/api/lottery/prizes').set(authHeader(memberToken));
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.length).toBeGreaterThan(0);
    });

    test('14. POST /api/lottery/draw + GET records', async () => {
        await PointService.addPoints(memberId, 500, 'test_seed', null, 'integration lottery', null);

        const draw = await request(app).post('/api/lottery/draw').set(authHeader(memberToken)).send({});
        expect(draw.status).toBe(200);
        expect(draw.body.code).toBe(0);

        const rec = await request(app).get('/api/lottery/records').set(authHeader(memberToken));
        expect(rec.status).toBe(200);
        expect(rec.body.code).toBe(0);
        expect(rec.body.data.list.length).toBeGreaterThan(0);
    });
});
