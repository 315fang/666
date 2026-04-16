const { dataSource, singletonSource, dataRoot, normalizedDataRoot, runtimeRoot, preferNormalizedData, mysql, cloudbase, enforceCloudbaseRuntime, isFunctionRuntime } = require('../config');
const { createFilesystemStore } = require('./providers/filesystem');
const { createMysqlStore } = require('./providers/mysql');
const { createCloudBaseStore } = require('./providers/cloudbase');

function withCommonStoreHelpers(store) {
    return {
        ...store,
        async reloadCollections(names = []) {
            if (typeof store.reloadCollections === 'function') {
                return store.reloadCollections(names);
            }
            if (typeof store.reloadCollection !== 'function') return [];
            const source = Array.isArray(names) ? names : [];
            return Promise.all(source.map((name) => store.reloadCollection(name)));
        },
        cacheHealth() {
            const health = typeof store.health === 'function' ? store.health() : {};
            return {
                mode: health.mode || 'unknown',
                ready: !!health.ready,
                cached_collections: health.cached_collections ?? 0,
                dirty_collections: Array.isArray(health.dirty_collections) ? health.dirty_collections : [],
                pending_flush_collections: Array.isArray(health.pending_flush_collections) ? health.pending_flush_collections : [],
                loaded_at: health.loaded_at || null,
                last_reload_at: health.last_reload_at || null,
                last_error: health.last_error || null,
                warnings: Array.isArray(health.warnings) ? health.warnings : []
            };
        }
    };
}

function createDataStore() {
    const filesystemStore = createFilesystemStore({
        dataRoot,
        normalizedDataRoot,
        runtimeRoot,
        preferNormalizedData,
        singletonRoot: runtimeRoot
    });

    if (dataSource === 'mysql') {
        return withCommonStoreHelpers(createMysqlStore({
            mysql,
            cloudbase,
            dataRoot,
            normalizedDataRoot,
            runtimeRoot,
            preferNormalizedData
        }));
    }

    if (dataSource === 'cloudbase') {
        return withCommonStoreHelpers(createCloudBaseStore({
            cloudbase,
            dataRoot,
            normalizedDataRoot,
            runtimeRoot,
            preferNormalizedData,
            isFunctionRuntime
        }));
    }

    if (dataSource === 'filesystem') {
        return withCommonStoreHelpers(filesystemStore);
    }

    if (enforceCloudbaseRuntime) {
        return withCommonStoreHelpers(createCloudBaseStore({
            cloudbase,
            dataRoot,
            normalizedDataRoot,
            runtimeRoot,
            preferNormalizedData,
            isFunctionRuntime
        }));
    }

    return withCommonStoreHelpers({
        ...filesystemStore,
        kind: 'filesystem',
        description: `unknown data source "${dataSource}", falling back to filesystem`,
        describe() {
            return {
                source: 'filesystem',
                collection_source: 'filesystem',
                singleton_source: singletonSource || 'filesystem',
                prefer_normalized_data: preferNormalizedData,
                fallback_reason: `unsupported ADMIN_DATA_SOURCE=${dataSource}`
            };
        }
    });
}

module.exports = {
    createDataStore
};
