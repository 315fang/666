require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { sequelize } = require('../config/database');

async function cleanupUserIndexes() {
    const [rows] = await sequelize.query('SHOW INDEX FROM users');
    const grouped = rows.reduce((acc, row) => {
        if (row.Key_name === 'PRIMARY') return acc;
        if (!acc[row.Column_name]) acc[row.Column_name] = [];
        acc[row.Column_name].push(row.Key_name);
        return acc;
    }, {});

    const keepNames = {
        openid: 'openid',
        invite_code: 'invite_code',
        member_no: 'member_no'
    };

    for (const [column, indexes] of Object.entries(grouped)) {
        const uniqueIndexes = [...new Set(indexes)];
        const keep = keepNames[column] || uniqueIndexes[0];
        const dropList = uniqueIndexes.filter((name) => name !== keep);

        for (const idx of dropList) {
            console.log(`Dropping duplicate index ${idx} on users.${column}`);
            await sequelize.query(`ALTER TABLE users DROP INDEX \`${idx}\``);
        }
    }

    console.log('User duplicate index cleanup completed.');
}

cleanupUserIndexes()
    .then(() => sequelize.close())
    .catch((err) => {
        console.error('cleanup-user-duplicate-indexes failed:', err.message);
        sequelize.close();
        process.exit(1);
    });
