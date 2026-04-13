/**
 * 集成测试辅助工具
 * - JWT 签发（绕过微信登录）
 * - 种子数据工厂函数
 * - 数据清理
 */
const jwt = require('jsonwebtoken');
const path = require('path');

const constants = require('../../config/constants');
const JWT_SECRET = constants.SECURITY.JWT_SECRET;
const ADMIN_JWT_SECRET = constants.SECURITY.ADMIN_JWT_SECRET;

function signUserToken(userId, openid) {
    return jwt.sign({ id: userId, openid: openid || `test_openid_${userId}`, type: 'user' }, JWT_SECRET, { expiresIn: '1h' });
}

function signAdminToken(adminId) {
    return jwt.sign({ id: adminId, type: 'admin', role: 'super_admin' }, ADMIN_JWT_SECRET, { expiresIn: '1h' });
}

function authHeader(token) {
    return { Authorization: `Bearer ${token}` };
}

async function createTestUser(User, overrides = {}) {
    const ts = Date.now();
    return User.create({
        openid: `test_openid_${ts}_${Math.random().toString(36).slice(2, 8)}`,
        nickname: `测试用户_${ts}`,
        role_level: 0,
        status: 1,
        balance: 0,
        total_sales: 0,
        ...overrides
    });
}

async function createTestProduct(Product, overrides = {}) {
    return Product.create({
        name: `测试商品_${Date.now()}`,
        retail_price: 399,
        price_member: 350,
        price_leader: 300,
        price_agent: 200,
        cost_price: 100,
        wholesale_price: 100,
        stock: 9999,
        status: 1,
        supports_pickup: 0,
        supply_price_b1: 120,
        supply_price_b2: 110,
        supply_price_b3: 100,
        ...overrides
    });
}

async function createTestAddress(Address, userId, overrides = {}) {
    return Address.create({
        user_id: userId,
        receiver_name: '测试收件人',
        phone: '13800138000',
        province: '广东省',
        city: '深圳市',
        district: '南山区',
        detail: '科技园路1号',
        is_default: 1,
        ...overrides
    });
}

async function createTestAdmin(Admin, overrides = {}) {
    const ts = Date.now();
    const salt = Admin.generateSalt();
    const password_hash = Admin.hashPassword('test123456', salt);
    return Admin.create({
        username: `test_admin_${ts}`,
        password_hash,
        salt,
        role: 'super_admin',
        status: 1,
        ...overrides
    });
}

const CLEANUP_TABLES = [
    'lottery_records',
    'slash_helpers',
    'slash_records',
    'group_members',
    'group_orders',
    'n_fund_requests',
    'user_coupons',
    'withdrawals',
    'commission_logs',
    'commission_settlements',
    'refunds',
    'orders',
    'carts',
    'addresses',
    'upgrade_applications',
    'notifications',
    'point_logs',
    'point_accounts',
    'agent_wallet_logs',
    'agent_wallet_accounts',
    'stock_transactions',
    'stock_reservations',
    'group_activities',
    'slash_activities',
    'coupons',
    'lottery_prizes',
    'users',
    'products',
    'admins'
];

async function cleanupTestData(sequelize) {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of CLEANUP_TABLES) {
        try {
            await sequelize.query(`DELETE FROM \`${table}\` WHERE 1=1`);
        } catch (_) {
            // 表可能不存在，忽略
        }
    }
    // 重置自增，使 ADMIN_USER_ID=1 与首条测试用户一致（notifications 外键）
    try {
        await sequelize.query('ALTER TABLE `users` AUTO_INCREMENT = 1');
    } catch (_) { /* ignore */ }
    try {
        await sequelize.query('ALTER TABLE `admins` AUTO_INCREMENT = 1');
    } catch (_) { /* ignore */ }
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
}

module.exports = {
    signUserToken,
    signAdminToken,
    authHeader,
    createTestUser,
    createTestProduct,
    createTestAddress,
    createTestAdmin,
    cleanupTestData,
    JWT_SECRET,
    ADMIN_JWT_SECRET
};
