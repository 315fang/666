const { checkPermission } = require('../../middleware/adminAuth');

function createMockRes() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
    };
}

describe('adminAuth.checkPermission', () => {
    test('super_admin 应该直接放行', () => {
        const middleware = checkPermission('admins');
        const req = { admin: { role: 'super_admin', permissions: [] } };
        const res = createMockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    test('settings 别名应归一到 settings_manage', () => {
        const middleware = checkPermission('settings');
        const req = { admin: { role: 'admin', permissions: [] } };
        const res = createMockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
    });

    test('system 别名应归一到 settings_manage', () => {
        const middleware = checkPermission('system');
        const req = { admin: { role: 'admin', permissions: [] } };
        const res = createMockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
    });

    test('settlements 别名应归一到 commissions', () => {
        const middleware = checkPermission('commissions');
        const req = { admin: { role: 'warehouse', permissions: ['settlements'] } };
        const res = createMockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
    });

    test('缺少权限时应返回 403', () => {
        const middleware = checkPermission('admins');
        const req = { admin: { role: 'operator', permissions: [] } };
        const res = createMockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ code: -1, message: '无操作权限' });
    });
});
