const { dataSource, singletonSource, dataRoot, normalizedDataRoot, runtimeRoot, preferNormalizedData, mysql, cloudbase, enforceCloudbaseRuntime, isFunctionRuntime } = require('../config');
const { createFilesystemStore } = require('./providers/filesystem');
const { createMysqlStore } = require('./providers/mysql');
const { createCloudBaseStore } = require('./providers/cloudbase');

function createDataStore() {
    const filesystemStore = createFilesystemStore({
        dataRoot,
        normalizedDataRoot,
        runtimeRoot,
        preferNormalizedData,
        singletonRoot: runtimeRoot
    });

    if (dataSource === 'mysql') {
        return createMysqlStore({
            mysql,
            cloudbase,
            dataRoot,
            normalizedDataRoot,
            runtimeRoot,
            preferNormalizedData
        });
    }

    if (dataSource === 'cloudbase') {
        return createCloudBaseStore({
            cloudbase,
            dataRoot,
            normalizedDataRoot,
            runtimeRoot,
            preferNormalizedData,
            isFunctionRuntime
        });
    }

    if (dataSource === 'filesystem') {
        return filesystemStore;
    }

    if (enforceCloudbaseRuntime) {
        return createCloudBaseStore({
            cloudbase,
            dataRoot,
            normalizedDataRoot,
            runtimeRoot,
            preferNormalizedData,
            isFunctionRuntime
        });
    }

    return {
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
    };
}

module.exports = {
    createDataStore
};
