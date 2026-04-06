/**
 * 种入超级管理员账号
 * 如已存在则跳过，否则创建
 */
const { Admin } = require('../models');

async function run() {
    const initPassword = process.env.ADMIN_INIT_PASSWORD;
    if (!initPassword || initPassword.length < 12) {
        console.error('❌ 请通过环境变量 ADMIN_INIT_PASSWORD 提供至少 12 位的初始化密码');
        process.exit(1);
    }

    const SUPER_ADMIN = {
        username: 'admin',
        password: initPassword,
        name: '超级管理员',
        role: 'super_admin',
        permissions: ['*'],
        status: 1
    };

    const existing = await Admin.findOne({ where: { username: SUPER_ADMIN.username } });
    if (existing) {
        console.log(`⏭️  管理员 "${SUPER_ADMIN.username}" 已存在，跳过创建`);
        console.log(`   当前角色: ${existing.role}`);
    } else {
        const admin = Admin.build({
            username:    SUPER_ADMIN.username,
            name:        SUPER_ADMIN.name,
            role:        SUPER_ADMIN.role,
            permissions: SUPER_ADMIN.permissions,
            status:      SUPER_ADMIN.status
        });
        admin.setPassword(SUPER_ADMIN.password);
        await admin.save();
        console.log(`✅ 已创建超级管理员账号`);
        console.log(`   用户名: ${SUPER_ADMIN.username}`);
        console.log(`   密  码: [已从环境变量注入，未回显]`);
        console.log(`   ⚠️  请登录后立即修改密码`);
    }
    process.exit(0);
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
