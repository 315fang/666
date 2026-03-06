/**
 * 02 - 首页装修管理测试 (Admin Home Section)
 */
const { adminClient } = require('./helpers/auth');

describe('【Admin】首页装修模块 (Home Section)', () => {
    let client;
    let createdSectionId = null;

    beforeAll(async () => {
        client = await adminClient();
    });

    test('1. 获取装修 schemas', async () => {
        const res = await client.get('/home-sections/schemas');
        expect(res.status).toBe(200);
        expect(res.data.code).toBe(0);
        expect(Array.isArray(res.data.data)).toBe(true);
        expect(res.data.data.length).toBeGreaterThan(0);
    });

    test('2. 获取首页装修列表', async () => {
        const res = await client.get('/home-sections');
        expect(res.status).toBe(200);
        expect(res.data.code).toBe(0);
        expect(Array.isArray(res.data.data)).toBe(true);
    });

    test('3. 创建新的金刚区 (navigator) 模块', async () => {
        // 创建一个用于测试的模块
        const sectionData = {
            section_type: 'navigator',
            title: '自动测试金刚区',
            sort_order: 999,
            is_visible: 1,
            config: {
                items: [
                    { title: "测试项1", icon: "", link: "" }
                ]
            }
        };
        const res = await client.post('/home-sections', sectionData);
        expect(res.status).toBe(200);
        expect(res.data.code).toBe(0);
        expect(res.data.data).toHaveProperty('id');
        createdSectionId = res.data.data.id;
    });

    test('4. 更新刚创建的模块可见性', async () => {
        if (!createdSectionId) return;
        const res = await client.put(`/home-sections/${createdSectionId}/toggle`, {
            is_visible: 0
        });
        expect(res.status).toBe(200);
        expect(res.data.code).toBe(0);
    });

    test('5. 删除刚创建的测试模块', async () => {
        if (!createdSectionId) return;
        const res = await client.delete(`/home-sections/${createdSectionId}`);
        expect(res.status).toBe(200);
        expect(res.data.code).toBe(0);
    });
});
