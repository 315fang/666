// 初始化数据库：建库、建用户、授权
const mysql2 = require('mysql2/promise');

async function setup() {
    const conn = await mysql2.createConnection({
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: ''
    });

    await conn.query('CREATE DATABASE IF NOT EXISTS `s2b2c_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    console.log('✅ 数据库 s2b2c_db 已建好');

    await conn.query("CREATE USER IF NOT EXISTS 's2b2c_user'@'localhost' IDENTIFIED BY 's2b2c_pass'");
    await conn.query("GRANT ALL PRIVILEGES ON `s2b2c_db`.* TO 's2b2c_user'@'localhost'");
    await conn.query('FLUSH PRIVILEGES');
    console.log('✅ 用户 s2b2c_user 已创建并授权');

    // 验证连接
    await conn.query('USE s2b2c_db');
    const [rows] = await conn.query('SELECT DATABASE() AS db');
    console.log('✅ 当前数据库:', rows[0].db);

    await conn.end();
    console.log('\n数据库初始化完成！');
}

setup().catch(e => { console.error('❌', e.message); process.exit(1); });
