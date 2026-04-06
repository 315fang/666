require('dotenv').config();
const { sequelize } = require('../config/database');

async function main() {
  try {
    console.log('[coupon-migration] 开始更新 coupons.type 枚举...');
    await sequelize.query(`
      ALTER TABLE coupons
      MODIFY COLUMN type ENUM('fixed', 'percent', 'no_threshold')
      NOT NULL DEFAULT 'fixed'
      COMMENT '类型: fixed满减券, percent折扣券, no_threshold无门槛券'
    `);
    console.log('[coupon-migration] coupons.type 枚举已更新成功');
    process.exit(0);
  } catch (error) {
    console.error('[coupon-migration] 更新失败:', error.message);
    process.exit(1);
  }
}

main();
