const { ok, okList, okAction, fail } = require('../../utils/adminResponse');

function createRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
}

describe('adminResponse helpers', () => {
    test('okList wraps arrays into data.list with pagination', () => {
        const res = createRes();

        okList(res, [{ id: 1 }], { total: 1, page: 1, limit: 20 }, '读取成功');

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({
            code: 0,
            data: {
                list: [{ id: 1 }],
                pagination: { total: 1, page: 1, limit: 20 }
            },
            message: '读取成功'
        });
    });

    test('okAction uses success payload by default', () => {
        const res = createRes();

        okAction(res, '保存成功');

        expect(res.body).toEqual({
            code: 0,
            data: { success: true },
            message: '保存成功'
        });
    });

    test('ok returns object data with extra fields', () => {
        const res = createRes();

        ok(res, { id: 3 }, '更新成功', { geocode_note: 'mock-note' });

        expect(res.body).toEqual({
            code: 0,
            data: { id: 3 },
            message: '更新成功',
            geocode_note: 'mock-note'
        });
    });

    test('fail uses http status and message', () => {
        const res = createRes();

        fail(res, 404, '不存在', { target: 'item' });

        expect(res.statusCode).toBe(404);
        expect(res.body).toEqual({
            code: 404,
            message: '不存在',
            data: { target: 'item' }
        });
    });
});
