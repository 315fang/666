/**
 * 测试辅助：登录并获取 Token
 */
const axios = require('axios');

const BASE_ADMIN = 'http://localhost:3000/admin/api';
const BASE_API = 'http://localhost:3000/api';

/**
 * 获取管理员 Token
 */
async function getAdminToken() {
    const res = await axios.post(`${BASE_ADMIN}/login`, {
        username: 'admin',
        password: 'admin123'
    });
    return res.data.data.token;
}

/**
 * 创建带鉴权头的 axios 实例（admin）
 */
async function adminClient() {
    const token = await getAdminToken();
    return axios.create({
        baseURL: BASE_ADMIN,
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
    });
}

/**
 * 创建公共前台 axios 实例（无需登录）
 */
function publicClient() {
    return axios.create({
        baseURL: BASE_API,
        timeout: 10000
    });
}

module.exports = { getAdminToken, adminClient, publicClient, BASE_ADMIN, BASE_API };
