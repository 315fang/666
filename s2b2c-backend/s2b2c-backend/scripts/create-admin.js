/**
 * 创建管理员账号脚本
 * 
 * 使用方法:
 *   node scripts/create-admin.js
 * 
 * 或指定参数:
 *   node scripts/create-admin.js --username admin --password 123456 --name 管理员
 */

require('dotenv').config();
const { Admin, sequelize } = require('../models');

async function createAdmin() {
    try {
        // 解析命令行参数
        const args = process.argv.slice(2);
        let username = 'admin';
        let password = 'admin123';
        let name = '超级管理员';

        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--username' && args[i + 1]) {
                username = args[i + 1];
            }
            if (args[i] === '--password' && args[i + 1]) {
                password = args[i + 1];
            }
            if (args[i] === '--name' && args[i + 1]) {
                name = args[i + 1];
            }
        }

        // 同步数据库
        await sequelize.sync();

        // 检查是否已存在
        const existing = await Admin.findOne({ where: { username } });
        if (existing) {
            console.log(`❌ 管理员 "${username}" 已存在`);
            process.exit(1);
        }

        // 创建管理员
        const admin = Admin.build({
            username,
            name,
            role: 'super_admin',
            status: 1
        });
        admin.setPassword(password);
        await admin.save();

        console.log('');
        console.log('✅ 管理员账号创建成功！');
        console.log('');
        console.log('┌────────────────────────────────┐');
        console.log(`│ 用户名: ${username.padEnd(22)} │`);
        console.log(`│ 密码:   ${password.padEnd(22)} │`);
        console.log(`│ 姓名:   ${name.padEnd(22)} │`);
        console.log(`│ 角色:   super_admin            │`);
        console.log('└────────────────────────────────┘');
        console.log('');
        console.log('请登录后立即修改密码！');
        console.log('');

        process.exit(0);
    } catch (error) {
        console.error('❌ 创建失败:', error.message);
        process.exit(1);
    }
}

createAdmin();
