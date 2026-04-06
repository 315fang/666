const { sequelize } = require('../models');
async function run() {
    const [rows] = await sequelize.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='banners' ORDER BY ORDINAL_POSITION"
    );
    console.log('banners 实际列:', rows.map(x => x.COLUMN_NAME).join(', '));
    process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
