/**
 * 03 - 商品管理测试 (Admin Product)
 */
const { adminClient } = require('./helpers/auth');

describe('【Admin】商品管理模块 (Product)', () => {
    let client;
    let createdCategory = null;

    beforeAll(async () => {
        client = await adminClient();
    });

    // ========== 1. 分类管理 ==========
    test('1. 获取分类列表', async () => {
        const res = await client.get('/categories');
        expect(res.status).toBe(200);
        expect(res.data.code).toBe(0);
        expect(Array.isArray(res.data.data)).toBe(true);
    });

    test('2. 创建测试分类', async () => {
        const catData = {
            name: 'API自动测试分类',
            sort_order: 99,
            is_visible: 1,
            icon: ''
        };
        const res = await client.post('/categories', catData);
        expect(res.status).toBe(200);
        expect(res.data.code).toBe(0);
        createdCategory = res.data.data.id;
        expect(createdCategory).toBeTruthy();
    });

    test('3. 更新且删除测试分类', async () => {
        if (!createdCategory) return;

        // 更新
        const updateRes = await client.put(`/categories/${createdCategory}`, { name: '自动化更新名称' });
        expect(updateRes.data.code).toBe(0);

        // 删除
        const delRes = await client.delete(`/categories/${createdCategory}`);
        expect(delRes.data.code).toBe(0);
    });

    // ========== 2. 商品列表 ==========
    test('4. 获取商品列表', async () => {
        const res = await client.get('/products?page=1&limit=5');
        expect(res.status).toBe(200);
        expect(res.data.code).toBe(0);
        expect(res.data.data.list).toBeDefined();
        expect(Array.isArray(res.data.data.list)).toBe(true);
    });
});
