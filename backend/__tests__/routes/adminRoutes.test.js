const express = require('express');
const request = require('supertest');

let mockCurrentAdmin;

jest.mock('../../middleware/adminAuth', () => {
    const actual = jest.requireActual('../../middleware/adminAuth');

    return {
        ...actual,
        adminAuth: jest.fn((req, res, next) => {
            req.admin = mockCurrentAdmin;
            req.user = { id: mockCurrentAdmin.id, role: mockCurrentAdmin.role };
            next();
        })
    };
});

jest.mock('../../config/constants', () => ({
    DEBUG: {
        ENABLE_TEST_ROUTES: false
    },
    SECURITY: {
        ADMIN_JWT_SECRET: 'test-secret',
        ADMIN_JWT_EXPIRES_IN: '1h'
    }
}));

jest.mock('../../services/EnvConfigService', () => ({
    getConfigReport: jest.fn(() => ({
        overallHealth: 100,
        summary: {
            missing: 0,
            error: 0,
            warning: 0,
            configured: 10,
            total: 10
        }
    })),
    compareWithExample: jest.fn(() => ({ ok: true })),
    generateEnvTemplate: jest.fn(() => 'FOO=bar'),
    parseEnvFile: jest.fn(() => ({ configs: { TEST: '1' } }))
}));

jest.mock('../../services/MassMessageService', () => ({
    getList: jest.fn(async () => ({ rows: [], count: 0 })),
    getDetail: jest.fn(async (id) => ({ id: Number(id) })),
    create: jest.fn(async (payload) => ({ id: 1, ...payload })),
    cancel: jest.fn(async () => ({ ok: true })),
    executeSend: jest.fn(async () => ({ ok: true })),
    delete: jest.fn(async () => undefined),
    getUserTags: jest.fn(async () => []),
    getTargetUsers: jest.fn(async () => []),
    getStatistics: jest.fn(async () => ({ total: 0 }))
}));

jest.mock('../../models', () => ({
    User: {
        findAll: jest.fn(async () => [])
    },
    sequelize: {
        query: jest.fn(async () => [[{ count: 0, paid: 0, total: 0 }]]),
        authenticate: jest.fn(async () => true)
    }
}));

jest.mock('../../utils/taskLock', () => ({
    getTaskStats: jest.fn(() => ({}))
}));

jest.mock('../../utils/wechat', () => ({
    getCertStatus: jest.fn(() => ({ ready: true })),
    refreshPlatformCert: jest.fn(async () => true)
}));

jest.mock('../../routes/admin/controllers/adminAuthController', () => ({
    login: (req, res) => res.json({ code: 0 }),
    getProfile: (req, res) => res.json({ code: 0 }),
    changePassword: (req, res) => res.json({ code: 0 }),
    logout: (req, res) => res.json({ code: 0 })
}));

jest.mock('../../routes/admin/controllers/adminProductController', () => ({
    getProducts: (req, res) => res.json({ code: 0, route: 'products' }),
    getProductById: (req, res) => res.json({ code: 0 }),
    createProduct: (req, res) => res.json({ code: 0 }),
    updateProduct: (req, res) => res.json({ code: 0 }),
    updateProductStatus: (req, res) => res.json({ code: 0 }),
    deleteProduct: (req, res) => res.json({ code: 0 }),
    getCategories: (req, res) => res.json({ code: 0 }),
    createCategory: (req, res) => res.json({ code: 0 }),
    updateCategory: (req, res) => res.json({ code: 0 }),
    deleteCategory: (req, res) => res.json({ code: 0 })
}));

jest.mock('../../routes/admin/controllers/adminProductBatchController', () => ({
    batchSetCommission: (req, res) => res.json({ code: 0 })
}));

jest.mock('../../routes/admin/controllers/adminOrderController', () => ({
    getOrders: (req, res) => res.json({ code: 0, route: 'orders' }),
    exportOrders: (req, res) => res.json({ code: 0 }),
    getOrderById: (req, res) => res.json({ code: 0 }),
    updateOrderStatus: (req, res) => res.json({ code: 0 }),
    shipOrder: (req, res) => res.json({ code: 0 }),
    updateShippingInfo: (req, res) => res.json({ code: 0 }),
    adjustOrderAmount: (req, res) => res.json({ code: 0, route: 'order_amount_adjust' }),
    addOrderRemark: (req, res) => res.json({ code: 0 }),
    transferOrderAgent: (req, res) => res.json({ code: 0 }),
    forceCompleteOrder: (req, res) => res.json({ code: 0 }),
    forceCancelOrder: (req, res) => res.json({ code: 0 }),
    batchShipOrders: (req, res) => res.json({ code: 0 }),
    getAdminOrderLogistics: (req, res) => res.json({ code: 0 })
}));

jest.mock('../../routes/admin/controllers/adminUserController', () => ({
    getUsers: (req, res) => res.json({ code: 0 }),
    getUserById: (req, res) => res.json({ code: 0 }),
    getUserTeamSummary: (req, res) => res.json({ code: 0 }),
    getUserTeam: (req, res) => res.json({ code: 0 }),
    getUserHistory: (req, res) => res.json({ code: 0 }),
    updateUserRole: (req, res) => res.json({ code: 0 }),
    updateUserStock: (req, res) => res.json({ code: 0 }),
    updateUserMemberNo: (req, res) => res.json({ code: 0 }),
    updateUserInviteCode: (req, res) => res.json({ code: 0 }),
    adjustUserBalance: (req, res) => res.json({ code: 0 }),
    changeUserParent: (req, res) => res.json({ code: 0 }),
    updateUserStatus: (req, res) => res.json({ code: 0 }),
    updateUserPurchaseLevel: (req, res) => res.json({ code: 0 }),
    updateUserRemark: (req, res) => res.json({ code: 0 }),
    updateUserCommerce: (req, res) => res.json({ code: 0 }),
    batchUpdateRole: (req, res) => res.json({ code: 0 })
}));

jest.mock('../../routes/admin/controllers/adminLogController', () => ({
    getLogs: (req, res) => res.json({ code: 0, route: 'logs' }),
    getLogStats: (req, res) => res.json({ code: 0 }),
    exportLogs: (req, res) => res.json({ code: 0 })
}));

jest.mock('../../routes/admin/controllers/adminUploadController', () => ({
    upload: (req, res) => res.json({ code: 0 }),
    uploadMultiple: (req, res) => res.json({ code: 0 }),
    getStorageConfig: (req, res) => res.json({ code: 0 }),
    updateStorageConfig: (req, res) => res.json({ code: 0 }),
    testStorageConfig: (req, res) => res.json({ code: 0 }),
    getUploadSignature: (req, res) => res.json({ code: 0 })
}));

jest.mock('../../routes/admin/content', () => {
    const router = require('express').Router();
    return router;
});

jest.mock('../../routes/admin/finance', () => {
    const router = require('express').Router();
    return router;
});

jest.mock('../../routes/admin/organization', () => {
    const router = require('express').Router();
    return router;
});

jest.mock('../../routes/admin/system', () => {
    const router = require('express').Router();
    return router;
});

jest.mock('../../routes/admin/themes', () => {
    const router = require('express').Router();
    return router;
});

const adminRoutes = require('../../routes/admin');

function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/admin/api', adminRoutes);
    return app;
}

function setAdmin({ role = 'guest', permissions = [] } = {}) {
    mockCurrentAdmin = {
        id: 1,
        role,
        permissions,
        status: 1
    };
}

describe('admin routes permission guards', () => {
    let app;

    beforeEach(() => {
        setAdmin();
        app = createApp();
    });

    test('rejects product list without products permission', async () => {
        const response = await request(app).get('/admin/api/products');

        expect(response.status).toBe(403);
        expect(response.body.message).toBe('无操作权限');
    });

    test('allows product list with products permission', async () => {
        setAdmin({ permissions: ['products'] });

        const response = await request(app).get('/admin/api/products');

        expect(response.status).toBe(200);
        expect(response.body.route).toBe('products');
    });

    test('requires dedicated permission for order amount adjustment', async () => {
        setAdmin({ permissions: ['orders'] });

        const denied = await request(app).put('/admin/api/orders/12/amount');
        expect(denied.status).toBe(403);

        setAdmin({ permissions: ['order_amount_adjust'] });
        const allowed = await request(app).put('/admin/api/orders/12/amount');

        expect(allowed.status).toBe(200);
        expect(allowed.body.route).toBe('order_amount_adjust');
    });

    test('allows logs with settings_manage secondary permission', async () => {
        setAdmin({ permissions: ['settings_manage'] });

        const response = await request(app).get('/admin/api/logs');

        expect(response.status).toBe(200);
        expect(response.body.route).toBe('logs');
    });

    test('restricts debug entry to super admin', async () => {
        setAdmin({ permissions: ['settings_manage'] });
        const denied = await request(app).get('/admin/api/debug/process');
        expect(denied.status).toBe(403);

        setAdmin({ role: 'super_admin' });
        const allowed = await request(app).get('/admin/api/debug/process');

        expect(allowed.status).toBe(200);
        expect(allowed.body.code).toBe(0);
    });

    test('restricts env report to super admin role', async () => {
        setAdmin({ permissions: ['settings_manage'] });
        const denied = await request(app).get('/admin/api/env-report');
        expect(denied.status).toBe(403);

        setAdmin({ role: 'super_admin' });
        const allowed = await request(app).get('/admin/api/env-report');

        expect(allowed.status).toBe(200);
        expect(allowed.body.code).toBe(0);
    });

    test('requires notification permission to create mass messages', async () => {
        setAdmin({ permissions: ['users'] });
        const denied = await request(app)
            .post('/admin/api/mass-messages')
            .send({ title: 't', content: 'c', targetType: 'all' });

        expect(denied.status).toBe(403);

        setAdmin({ permissions: ['notification'] });
        const allowed = await request(app)
            .post('/admin/api/mass-messages')
            .send({ title: 't', content: 'c', targetType: 'all' });

        expect(allowed.status).toBe(200);
        expect(allowed.body.code).toBe(0);
    });
});
