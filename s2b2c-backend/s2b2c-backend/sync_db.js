require('dotenv').config();
const { sequelize } = require('./models');

async function syncDatabase() {
    try {
        console.log('Connecting to database...');
        await sequelize.authenticate();
        console.log('Database connected successfully.');

        console.log('Syncing models with { alter: true }...');
        await sequelize.sync({ alter: true });
        console.log('Database sync completed! Schema should now match models.');

    } catch (error) {
        console.error('Sync failed:', error);
    } finally {
        await sequelize.close();
    }
}

syncDatabase();
