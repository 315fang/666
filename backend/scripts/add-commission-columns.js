// 一次性脚本：给 products 表补充三级佣金字段，给 users 表补充 agent_level
const { sequelize } = require('../models');

async function columnExists(table, column) {
    const [rows] = await sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`,
        { replacements: [table, column] }
    );
    return rows.length > 0;
}

async function addColumnIfMissing(table, column, definition) {
    const exists = await columnExists(table, column);
    if (exists) {
        console.log(`⏭️  ${table}.${column} 已存在，跳过`);
        return;
    }
    await sequelize.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`✅ 已添加 ${table}.${column}`);
}

async function run() {
    await addColumnIfMissing('products', 'commission_rate_3',   "DECIMAL(4,2) NULL COMMENT '三级分销比例'");
    await addColumnIfMissing('products', 'commission_amount_3', "DECIMAL(10,2) NULL COMMENT '三级分销固定金额'");
    await addColumnIfMissing('users',    'agent_level',         "TINYINT(1) NULL DEFAULT 1 COMMENT '代理级别 1/2/3'");

    // banners 表缺失字段
    await addColumnIfMissing('banners', 'subtitle',   "VARCHAR(200) NULL COMMENT '副标题/描述文字'");
    await addColumnIfMissing('banners', 'kicker',     "VARCHAR(100) NULL COMMENT '顶部小标'");
    await addColumnIfMissing('banners', 'product_id', "INT NULL COMMENT '关联商品ID'");

    console.log('\n所有字段处理完成，现在验证...');

    const [cols] = await sequelize.query(
        "SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='products' AND COLUMN_NAME IN ('commission_rate_3','commission_amount_3')"
    );
    console.log('products 新字段:', cols);

    const [ucols] = await sequelize.query(
        "SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='agent_level'"
    );
    console.log('users.agent_level:', ucols);

    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
