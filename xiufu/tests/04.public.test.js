/**
 * 04 - 前台/公共端基础接口测试
 * (无需登录即可访问的数据，最容易集成在小程序启动页和首页)
 */
const { publicClient } = require('./helpers/auth');

describe('【Public】小程序前台公共接口 (Wechat Mini Program)', () => {
    let client;

    beforeAll(() => {
        client = publicClient();
    });

    test('1. 获取节日活动配置 (Festival Config)', async () => {
        const res = await client.get('/activity/festival-config');
        expect(res.status).toBe(200);
        expect(res.data.code).toBe(0);
        expect(res.data.data).toHaveProperty('active');
    });

    test('2. 获取气泡通告数据 (Bubbles)', async () => {
        const res = await client.get('/activity/bubbles');
        expect(res.status).toBe(200);
        // 如果后端不返回异常 code
        expect(res.data.code).toBe(0);
        expect(Array.isArray(res.data.data)).toBe(true);
    });

    test('3. 获取前台轮播图数据', async () => {
        const res = await client.get('/content/banners');
        expect(res.status).toBe(200);
        expect(res.data.code).toBe(0);
        expect(Array.isArray(res.data.data)).toBe(true);
    });

    test('4. 前台获取商品列表', async () => {
        // 商品列表在有或无 token 时都可以拉取，仅区别是否有分销等隐私字段
        const res = await client.get('/products/products?page=1&limit=10');
        expect(res.status).toBe(200);
        expect(res.data.code).toBe(0);
        expect(res.data.data.list).toBeDefined();
        expect(Array.isArray(res.data.data.list)).toBe(true);
    });
});
