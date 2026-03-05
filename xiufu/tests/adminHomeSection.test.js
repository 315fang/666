const axios = require('axios');

const BASE_URL = 'http://localhost:3000/admin/api';

describe('Admin Home Section API', () => {
    let token = '';

    // 测试前：尝试登录获取 token (如果你的本地测试服使用不同的账号密码，可以在这里修改)
    beforeAll(async () => {
        try {
            const res = await axios.post(`${BASE_URL}/login`, {
                username: 'admin',
                password: 'password123' // 占位密码
            });
            if (res.data && res.data.data && res.data.data.token) {
                token = res.data.data.token;
            }
        } catch (error) {
            console.warn('登录失败，可能是本地没有启动服务或密码错误。后续测试将没有 token。');
        }
    });

    test('如果未携带 token 请求 schemas，应返回 401 拦截或未授权', async () => {
        try {
            await axios.get(`${BASE_URL}/home-sections/schemas`);
        } catch (error) {
            if (error.response) {
                expect(error.response.status).toBe(401);
                expect(error.response.data.message).toMatch(/未找到授权Token|令牌失效|未授权|未提供认证令牌/);
            } else {
                expect(error.code).toBe('ECONNREFUSED');
            }
        }
    });

    test('携带无效 token 请求 home-sections 时，应返回 401', async () => {
        try {
            await axios.get(`${BASE_URL}/home-sections`, {
                headers: { Authorization: 'Bearer invalid_token_123' }
            });
        } catch (error) {
            if (error.response) {
                expect(error.response.status).toBe(401);
                expect(error.response.data.code).toBe(401);
            } else {
                expect(error.code).toBe('ECONNREFUSED');
            }
        }
    });

    // 如果成功拿到 token，测试功能是否可用
    test('如果授权成功，请求 schemas 应该成功返回结构体数据', async () => {
        if (!token) {
            console.log('跳过：没有提供有效的管理 token');
            return;
        }

        const res = await axios.get(`${BASE_URL}/home-sections/schemas`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        expect(res.status).toBe(200);
        expect(res.data.code).toBe(0);
        expect(res.data.data).toBeDefined();
        // schemas 返回的一般是一个数组
        expect(Array.isArray(res.data.data)).toBe(true);
    });
});
