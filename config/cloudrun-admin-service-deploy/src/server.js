const app = require('./app');

const port = Number(process.env.PORT || 3200);

(async () => {
    try {
        const dataStore = app.locals.dataStore;
        if (dataStore?.readyPromise) {
            await dataStore.readyPromise;
        }
        app.listen(port, () => {
            console.log(`[cloudrun-admin-service] listening on ${port}`);
        });
    } catch (error) {
        console.error('[cloudrun-admin-service] failed to start:', error?.message || error);
        process.exit(1);
    }
})();
