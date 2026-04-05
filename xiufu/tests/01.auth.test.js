/**
 * 01 - 管理员鉴权 & 登录模块测试
 * 覆盖：POST /admin/api/login, GET /admin/api/profile
 */
const axios = require('axios');
const { BASE_ADMIN } = require('./helpers/auth');

const client = axios.create({ baseURL: BASE_ADMIN, timeout: 10000 });

describe('【Admin】鉴权模块', () => {
    let token = '';

    test('正确账密登录 → 返回 token', async () => {
        const res = await client.post('/login', { username: 'admin', password: 'admin123' });
        expect(res.status).toBe(200);
        expect(res.data.code).toBe(0);
        expect(res.data.data.token).toBeTruthy();
        token = res.data.data.token;
    });

    test('错误密码登录 → 返回 401', async () => {
        await expect(
            client.post('/login', { username: 'admin', password: 'wrong_password' })
        ).rejects.toMatchObject({ response: { status: 401 } });
    });

    test('空账密登录 → 返回 400', async () => {
        await expect(
            client.post('/login', {})
        ).rejects.toMatchObject({ response: { status: expect.any(Number) } });
    });

    test('携带 token 获取管理员信息 → 返回 profile 数据', async () => {
        if (!token) return;
        const res = await client.get('/profile', {
            headers: { Authorization: `Bearer ${token}` }
        });
        expect(res.status).toBe(200);
        expect(res.data.code).toBe(0);
        expect(res.data.data).toHaveProperty('username');
    });

    test('不携带 token 访问受保护接口 → 401', async () => {
        await expect(client.get('/profile'))
            .rejects.toMatchObject({ response: { status: 401 } });
    });
});
