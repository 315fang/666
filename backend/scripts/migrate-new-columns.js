require('dotenv').config();
const { sequelize } = require('../models');

async function addColumnIfNotExists(table, column, definition) {
  const [rows] = await sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' AND COLUMN_NAME = '${column}'`
  );
  if (rows.length === 0) {
    await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`✓ ${table}.${column} 列添加成功`);
  } else {
    console.log(`- ${table}.${column} 列已存在，跳过`);
  }
}

async function createTableIfNotExists(tableName, ddl) {
  const [rows] = await sequelize.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${tableName}'`
  );
  if (rows.length === 0) {
    await sequelize.query(ddl);
    console.log(`✓ ${tableName} 表创建成功`);
  } else {
    console.log(`- ${tableName} 表已存在，跳过`);
  }
}

(async () => {
  try {
    await addColumnIfNotExists('products', 'discount_exempt', "TINYINT(1) NOT NULL DEFAULT 0");
    await addColumnIfNotExists('products', 'product_tag', "VARCHAR(50) NOT NULL DEFAULT 'normal'");
    await addColumnIfNotExists('users', 'purchase_level_code', "VARCHAR(32) NULL");

    await createTableIfNotExists('upgrade_applications', `
      CREATE TABLE upgrade_applications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        from_level INT NOT NULL DEFAULT 0,
        to_level INT NOT NULL,
        status ENUM('pending','approved','rejected','paid') NOT NULL DEFAULT 'pending',
        pay_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        pay_method VARCHAR(50) DEFAULT NULL,
        pay_order_no VARCHAR(100) DEFAULT NULL,
        reviewer_id INT DEFAULT NULL,
        review_remark TEXT DEFAULT NULL,
        reviewed_at DATETIME DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await createTableIfNotExists('partner_exit_applications', `
      CREATE TABLE partner_exit_applications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        role_level INT NOT NULL,
        reason TEXT DEFAULT NULL,
        wallet_refund DECIMAL(10,2) NOT NULL DEFAULT 0,
        balance_refund DECIMAL(10,2) NOT NULL DEFAULT 0,
        refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        status ENUM('pending','processing','completed','rejected') NOT NULL DEFAULT 'pending',
        reviewer_id INT DEFAULT NULL,
        review_remark TEXT DEFAULT NULL,
        reviewed_at DATETIME DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log('\n✅ 数据库迁移全部完成！请重启后端服务。');
    process.exit(0);
  } catch (e) {
    console.error('❌ 迁移失败:', e.message);
    process.exit(1);
  }
})();
