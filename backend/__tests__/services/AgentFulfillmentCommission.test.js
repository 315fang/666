/**
 * 代理发货佣金链路测试
 *
 * 验证 CommissionService.calculateGapAndFulfillmentCommissions 的核心场景：
 *   1. 级差佣金分配（buyer→parent→grandparent 跨等级）
 *   2. 三级代理层间佣金（agent_level 递进）
 *   3. 代理商发货利润计算
 *   4. 协助奖分配
 *   5. 平台顶级代理补位
 *   6. 利润池上限保护（不超发）
 *   7. 循环引用保护
 *   8. 百分比模式（use_price_gap_middle_commission=false）
 */

const createdLogs = [];
let mockUsers = {};

jest.mock('../../models', () => {
    const logs = require('./AgentFulfillmentCommission.test').__createdLogs || [];
    return {
        CommissionLog: {
            create: jest.fn(async (data) => {
                createdLogs.push(data);
                return data;
            }),
            count: jest.fn(async () => 0)
        },
        User: {
            findByPk: jest.fn(async (id) => {
                const users = require('./AgentFulfillmentCommission.test').__mockUsers || {};
                return users[id] || null;
            })
        },
        AppConfig: {
            findOne: jest.fn(async () => null)
        },
        Notification: {
            create: jest.fn(async () => ({}))
        },
        sequelize: {}
    };
});

jest.mock('../../utils/logger', () => ({
    error: jest.fn(),
    warn: jest.fn()
}));

jest.mock('../../services/CacheService', () => ({
    getCache: jest.fn(async () => null),
    setCache: jest.fn(async () => undefined)
}));

jest.mock('../../services/MemberTierService', () => ({
    getCommercePolicy: jest.fn(async () => ({
        platform_top_agent: { enabled: false }
    }))
}));

jest.mock('../../config/commissionPolicy', () => ({
    COMMISSION_BASE_FIELD: 'actual_price',
    allowProductFixedCommission: jest.fn(() => true)
}));

const CommissionService = require('../../services/CommissionService');
const { User, CommissionLog, AppConfig } = require('../../models');

// 暴露给 mock 内部用
module.exports.__createdLogs = createdLogs;
module.exports.__mockUsers = mockUsers;

function makeUser(id, role_level, parent_id = null, agent_level = null, status = 1) {
    return { id, role_level, parent_id, agent_level, status, stock_count: 0 };
}

function makeOrder(overrides = {}) {
    return {
        id: 100,
        order_no: 'ORD202604120001',
        actual_price: 399,
        locked_agent_cost: 100,
        quantity: 1,
        middle_commission_total: 0,
        ...overrides
    };
}

function makeProduct(overrides = {}) {
    return {
        retail_price: 399,
        price_member: 350,
        price_leader: 300,
        price_agent: 200,
        cost_price: 100,
        ...overrides
    };
}

describe('代理发货佣金链路 (calculateGapAndFulfillmentCommissions)', () => {

    beforeEach(() => {
        createdLogs.length = 0;
        jest.clearAllMocks();
        Object.keys(mockUsers).forEach(k => delete mockUsers[k]);
        AppConfig.findOne.mockResolvedValue(null);
    });

    // ================================================================
    // 场景1: 基础级差佣金 — buyer(C1,lv1) → parent(C2,lv2) → grandparent(B1,lv3)
    // ================================================================
    describe('场景1: 基础级差佣金（价差模式）', () => {
        test('buyer(C1) → parent(C2) → grandparent(B1) 产生两层级差 + 代理商利润', async () => {
            const buyer = makeUser(10, 1, 20);      // C1, parent=20
            const parent = makeUser(20, 2, 30);      // C2, parent=30
            const grandparent = makeUser(30, 3, null, 1); // B1, 一级代理
            const agentId = 30;

            mockUsers[20] = parent;
            mockUsers[30] = grandparent;
            User.findByPk.mockImplementation(async (id) => mockUsers[id] || null);

            const order = makeOrder({ actual_price: 399, locked_agent_cost: 100 });
            const product = makeProduct();

            const result = await CommissionService.calculateGapAndFulfillmentCommissions({
                order, buyer, product, agentId, transaction: {}, notifySource: '代理商发货'
            });

            // C1→C2 级差: (350 - 300) × 1 = 50
            // C2→B1 级差: 发货代理商自己，跳过
            // 代理商利润: 399 - 100 - 级差总额
            expect(result.middleCommissionTotal).toBeGreaterThan(0);

            const gapLogs = createdLogs.filter(l => l.type === 'gap');
            expect(gapLogs.length).toBeGreaterThanOrEqual(1);

            // 所有佣金都是 frozen 状态
            createdLogs.forEach(log => {
                if (log.type !== 'agent_fulfillment') {
                    expect(log.status).toBe('frozen');
                }
            });

            // 代理商利润记录存在
            const agentProfitLog = createdLogs.find(l => l.type === 'agent_fulfillment');
            expect(agentProfitLog).toBeDefined();
            expect(agentProfitLog.user_id).toBe(agentId);
            expect(agentProfitLog.amount).toBeGreaterThan(0);
        });

        test('buyer 和 agent 同级时无级差，利润全归代理商', async () => {
            const buyer = makeUser(10, 3, null, 3);   // B1
            const agentId = 10;

            User.findByPk.mockResolvedValue(null);

            const order = makeOrder({ actual_price: 399, locked_agent_cost: 100 });
            const product = makeProduct();

            const result = await CommissionService.calculateGapAndFulfillmentCommissions({
                order, buyer, product, agentId, transaction: {}, notifySource: '代理商发货'
            });

            const gapLogs = createdLogs.filter(l => l.type === 'gap');
            expect(gapLogs.length).toBe(0);

            const agentProfitLog = createdLogs.find(l => l.type === 'agent_fulfillment');
            expect(agentProfitLog).toBeDefined();
            expect(agentProfitLog.amount).toBe(299); // 399 - 100
        });
    });

    // ================================================================
    // 场景2: 三级代理层间佣金
    // ================================================================
    describe('场景2: 三级代理层间佣金', () => {
        test('三级代理(agent_level=3) → 二级代理(agent_level=2) → 一级代理(agent_level=1)', async () => {
            const buyer = makeUser(10, 3, 20, 3);     // 三级代理
            const agent2 = makeUser(20, 3, 30, 2);     // 二级代理
            const agent1 = makeUser(30, 3, null, 1);    // 一级代理（发货方）
            const agentId = 30;

            mockUsers[20] = agent2;
            mockUsers[30] = agent1;
            User.findByPk.mockImplementation(async (id) => mockUsers[id] || null);

            const order = makeOrder({ actual_price: 399, locked_agent_cost: 100 });
            const product = makeProduct();

            const result = await CommissionService.calculateGapAndFulfillmentCommissions({
                order, buyer, product, agentId, transaction: {}, notifySource: '代理商发货'
            });

            // 二级代理应获得层间佣金（默认3%×399）
            const agent2Log = createdLogs.find(l => l.user_id === 20 && l.type === 'gap');
            expect(agent2Log).toBeDefined();
            expect(agent2Log.amount).toBeCloseTo(399 * 0.03, 1);
        });
    });

    // ================================================================
    // 场景3: 利润池保护 — 佣金不超过可分佣池
    // ================================================================
    describe('场景3: 利润池上限保护', () => {
        test('利润池很小时，佣金被截断', async () => {
            const buyer = makeUser(10, 1, 20);
            const parent = makeUser(20, 2, 30);
            const grandparent = makeUser(30, 3, null, 1);
            const agentId = 30;

            mockUsers[20] = parent;
            mockUsers[30] = grandparent;
            User.findByPk.mockImplementation(async (id) => mockUsers[id] || null);

            // 利润池只有 5 元 (actual_price=105, locked_agent_cost=100)
            const order = makeOrder({ actual_price: 105, locked_agent_cost: 100 });
            const product = makeProduct();

            await CommissionService.calculateGapAndFulfillmentCommissions({
                order, buyer, product, agentId, transaction: {}, notifySource: '代理商发货'
            });

            const totalCommission = createdLogs.reduce((sum, l) => sum + l.amount, 0);
            // 总佣金（含代理利润）不能超过利润池
            expect(totalCommission).toBeLessThanOrEqual(5 + 0.01); // 浮点容差
        });

        test('利润池为零时不产生任何佣金', async () => {
            const buyer = makeUser(10, 1, null);
            const agentId = 50;

            User.findByPk.mockResolvedValue(null);

            const order = makeOrder({ actual_price: 100, locked_agent_cost: 100 });
            const product = makeProduct();

            await CommissionService.calculateGapAndFulfillmentCommissions({
                order, buyer, product, agentId, transaction: {}, notifySource: '代理商发货'
            });

            expect(createdLogs.length).toBe(0);
        });
    });

    // ================================================================
    // 场景4: 百分比模式 (use_price_gap_middle_commission=false)
    // ================================================================
    describe('场景4: 百分比模式', () => {
        test('直推/间推按实付金额百分比分佣', async () => {
            // 配置：关闭价差模式，启用百分比模式
            AppConfig.findOne.mockImplementation(async ({ where }) => {
                if (where?.config_key === 'agent_system_commission') {
                    return {
                        config_value: JSON.stringify({
                            use_price_gap_middle_commission: false,
                            direct_pct_by_role: { 1: 20, 2: 30, 3: 40 },
                            indirect_pct_by_role: { 2: 5, 3: 8 },
                            tertiary_pct_factor: 50
                        })
                    };
                }
                return null;
            });

            const buyer = makeUser(10, 0, 20);       // 普通用户
            const parent = makeUser(20, 1, 30);       // C1
            const grandparent = makeUser(30, 2, null); // C2
            const agentId = 50;

            mockUsers[20] = parent;
            mockUsers[30] = grandparent;
            User.findByPk.mockImplementation(async (id) => mockUsers[id] || null);

            const order = makeOrder({ actual_price: 400, locked_agent_cost: 100 });
            const product = makeProduct();

            await CommissionService.calculateGapAndFulfillmentCommissions({
                order, buyer, product, agentId, transaction: {}, notifySource: '代理商发货'
            });

            // parent(C1): 400 × 20% = 80
            const parentLog = createdLogs.find(l => l.user_id === 20 && l.type === 'gap');
            expect(parentLog).toBeDefined();
            expect(parentLog.amount).toBe(80);

            // grandparent(C2): 400 × 5% = 20
            const gpLog = createdLogs.find(l => l.user_id === 30 && l.type === 'gap');
            expect(gpLog).toBeDefined();
            expect(gpLog.amount).toBe(20);
        });

        test('三级分佣 = 间推比例 × tertiary_pct_factor', async () => {
            AppConfig.findOne.mockImplementation(async ({ where }) => {
                if (where?.config_key === 'agent_system_commission') {
                    return {
                        config_value: JSON.stringify({
                            use_price_gap_middle_commission: false,
                            direct_pct_by_role: { 2: 30 },
                            indirect_pct_by_role: { 2: 10 },
                            tertiary_pct_factor: 50
                        })
                    };
                }
                return null;
            });

            const buyer = makeUser(10, 0, 20);
            const parent = makeUser(20, 2, 30);
            const grandparent = makeUser(30, 2, 40);
            const greatgp = makeUser(40, 2, null);
            const agentId = 50;

            mockUsers[20] = parent;
            mockUsers[30] = grandparent;
            mockUsers[40] = greatgp;
            User.findByPk.mockImplementation(async (id) => mockUsers[id] || null);

            const order = makeOrder({ actual_price: 1000, locked_agent_cost: 100 });
            const product = makeProduct();

            await CommissionService.calculateGapAndFulfillmentCommissions({
                order, buyer, product, agentId, transaction: {}, notifySource: '代理商发货'
            });

            // greatgp(C2): 1000 × 10% × 50% = 50
            const ggpLog = createdLogs.find(l => l.user_id === 40 && l.type === 'gap');
            expect(ggpLog).toBeDefined();
            expect(ggpLog.amount).toBe(50);
        });
    });

    // ================================================================
    // 场景5: 协助奖
    // ================================================================
    describe('场景5: 协助奖分配', () => {
        test('发货代理商的上级获得协助奖', async () => {
            AppConfig.findOne.mockImplementation(async ({ where }) => {
                if (where?.config_key === 'agent_system_assist_bonus') {
                    return {
                        config_value: JSON.stringify({
                            enabled: true,
                            tiers: [{ max_orders: 100, bonus: 40 }]
                        })
                    };
                }
                return null;
            });

            const buyer = makeUser(10, 1, null);
            const shippingAgent = makeUser(50, 3, 60, 2);  // 发货代理，上级=60
            const superAgent = makeUser(60, 3, null, 1);    // 上级代理

            mockUsers[50] = shippingAgent;
            mockUsers[60] = superAgent;
            User.findByPk.mockImplementation(async (id) => mockUsers[id] || null);

            const order = makeOrder({ actual_price: 399, locked_agent_cost: 100, agent_id: 50 });
            const product = makeProduct();

            await CommissionService.calculateGapAndFulfillmentCommissions({
                order, buyer, product, agentId: 50, transaction: {}, notifySource: '代理商发货'
            });

            const assistLog = createdLogs.find(l => l.type === 'agent_assist');
            expect(assistLog).toBeDefined();
            expect(assistLog.user_id).toBe(60);
            expect(assistLog.amount).toBe(40);
            expect(assistLog.status).toBe('frozen');
        });
    });

    // ================================================================
    // 场景6: 平台顶级代理补位
    // ================================================================
    describe('场景6: 平台顶级代理补位', () => {
        test('无上级代理链时，剩余级差归平台代理', async () => {
            const MemberTierService = require('../../services/MemberTierService');
            MemberTierService.getCommercePolicy.mockResolvedValue({
                platform_top_agent: { enabled: true, user_id: 999 }
            });

            const platformUser = makeUser(999, 3, null, 1);
            const buyer = makeUser(10, 1, null);  // 无上级

            mockUsers[999] = platformUser;
            User.findByPk.mockImplementation(async (id) => mockUsers[id] || null);

            const order = makeOrder({ actual_price: 399, locked_agent_cost: 100 });
            const product = makeProduct();

            await CommissionService.calculateGapAndFulfillmentCommissions({
                order, buyer, product, agentId: 999, transaction: {}, notifySource: '平台代发'
            });

            // 平台代理作为 agentId，不应给自己发 gap，应以 agent_fulfillment 获利
            const agentProfitLog = createdLogs.find(l => l.type === 'agent_fulfillment' && l.user_id === 999);
            expect(agentProfitLog).toBeDefined();
            expect(agentProfitLog.amount).toBeGreaterThan(0);
        });
    });

    // ================================================================
    // 场景7: 佣金状态验证
    // ================================================================
    describe('场景7: 佣金初始状态验证', () => {
        test('所有佣金记录初始状态为 frozen', async () => {
            const buyer = makeUser(10, 1, 20);
            const parent = makeUser(20, 2, 30);
            const grandparent = makeUser(30, 3, null, 1);

            mockUsers[20] = parent;
            mockUsers[30] = grandparent;
            User.findByPk.mockImplementation(async (id) => mockUsers[id] || null);

            const order = makeOrder({ actual_price: 500, locked_agent_cost: 100 });
            const product = makeProduct();

            await CommissionService.calculateGapAndFulfillmentCommissions({
                order, buyer, product, agentId: 30, transaction: {}, notifySource: '代理商发货'
            });

            expect(createdLogs.length).toBeGreaterThan(0);
            createdLogs.forEach(log => {
                expect(log.status).toBe('frozen');
                expect(log.order_id).toBe(100);
            });
        });
    });

    // ================================================================
    // 场景8: 发货代理商自己不吃级差
    // ================================================================
    describe('场景8: 发货代理商不重复获得级差佣金', () => {
        test('agentId 与上级链中某节点重合时，该节点不获得 gap 佣金', async () => {
            const buyer = makeUser(10, 1, 30);        // C1, 直接上级就是发货代理
            const agent = makeUser(30, 3, null, 1);   // B1, 也是 agentId

            mockUsers[30] = agent;
            User.findByPk.mockImplementation(async (id) => mockUsers[id] || null);

            const order = makeOrder({ actual_price: 399, locked_agent_cost: 100 });
            const product = makeProduct();

            await CommissionService.calculateGapAndFulfillmentCommissions({
                order, buyer, product, agentId: 30, transaction: {}, notifySource: '代理商发货'
            });

            // 代理商(30)不应有 gap 类型的佣金
            const gapForAgent = createdLogs.filter(l => l.type === 'gap' && l.user_id === 30);
            expect(gapForAgent.length).toBe(0);

            // 但应有 agent_fulfillment
            const profitLog = createdLogs.find(l => l.type === 'agent_fulfillment' && l.user_id === 30);
            expect(profitLog).toBeDefined();
        });
    });

    // ================================================================
    // 场景9: 金额精度
    // ================================================================
    describe('场景9: 金额精度（保留两位小数）', () => {
        test('佣金金额保留两位小数', async () => {
            AppConfig.findOne.mockImplementation(async ({ where }) => {
                if (where?.config_key === 'agent_system_commission') {
                    return {
                        config_value: JSON.stringify({
                            use_price_gap_middle_commission: false,
                            direct_pct_by_role: { 1: 33 },
                            indirect_pct_by_role: {},
                            tertiary_pct_factor: 50
                        })
                    };
                }
                return null;
            });

            const buyer = makeUser(10, 0, 20);
            const parent = makeUser(20, 1, null);
            mockUsers[20] = parent;
            User.findByPk.mockImplementation(async (id) => mockUsers[id] || null);

            // 333 × 33% = 109.89
            const order = makeOrder({ actual_price: 333, locked_agent_cost: 100 });
            const product = makeProduct();

            await CommissionService.calculateGapAndFulfillmentCommissions({
                order, buyer, product, agentId: 50, transaction: {}, notifySource: '代理商发货'
            });

            createdLogs.forEach(log => {
                const decimals = (log.amount.toString().split('.')[1] || '').length;
                expect(decimals).toBeLessThanOrEqual(2);
            });
        });
    });
});
