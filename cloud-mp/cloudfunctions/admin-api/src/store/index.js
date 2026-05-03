const { dataSource, singletonSource, dataRoot, normalizedDataRoot, runtimeRoot, preferNormalizedData, mysql, cloudbase, enforceCloudbaseRuntime, isFunctionRuntime } = require('../config');
const { createFilesystemStore } = require('./providers/filesystem');
const { createMysqlStore } = require('./providers/mysql');
const { createCloudBaseStore } = require('./providers/cloudbase');

function buildUnsupportedStore(mode, error) {
    const message = error instanceof Error ? error.message : String(error || `${mode} unavailable`);
    const failure = error instanceof Error ? error : new Error(message);
    const rejectedReady = Promise.reject(failure);
    rejectedReady.catch((err) => { console.error('[store] 数据源初始化失败:', err.message || err); });
    return {
        kind: mode,
        description: `${mode} provider unavailable`,
        readyPromise: rejectedReady,
        async waitUntilReady() {
            throw failure;
        },
        async flush() {
            throw failure;
        },
        health() {
            return {
                status: 'error',
                mode,
                ready: false,
                cached_collections: 0,
                dirty_collections: [],
                pending_flush_collections: [],
                loaded_at: null,
                last_reload_at: null,
                last_error: message,
                warnings: []
            };
        },
        describe() {
            return {
                source: mode,
                collection_source: mode,
                singleton_source: mode,
                ready: false,
                error: message
            };
        },
        getCollection() {
            throw failure;
        },
        async reloadCollection() {
            throw failure;
        },
        async reloadCollections() {
            throw failure;
        },
        saveCollection() {
            throw failure;
        },
        getSingleton(_name, fallback) {
            return fallback;
        },
        saveSingleton() {
            throw failure;
        }
    };
}

function withCommonStoreHelpers(store) {
    return {
        ...store,
        async patchCollectionDocument(name, docId, updateData = {}) {
            if (typeof store.patchCollectionDocument === 'function') {
                return store.patchCollectionDocument(name, docId, updateData);
            }
            if (typeof store.getCollection !== 'function' || typeof store.saveCollection !== 'function') {
                throw new Error('当前数据源不支持精确更新');
            }
            const key = String(name || '').trim();
            const rows = store.getCollection(key);
            if (!Array.isArray(rows)) {
                throw new Error(`集合 ${key} 读取结果不是数组，无法执行精确更新`);
            }
            const index = rows.findIndex((item) => String(item && (item._id || item.id || item._legacy_id)) === String(docId));
            if (index === -1) {
                throw new Error(`集合 ${key} 中不存在文档 ${docId}`);
            }
            const { _id, ...safeUpdateData } = (updateData && typeof updateData === 'object') ? updateData : {};
            const nextRows = rows.slice();
            nextRows[index] = {
                ...nextRows[index],
                ...safeUpdateData,
                updated_at: safeUpdateData.updated_at || new Date().toISOString()
            };
            store.saveCollection(key, nextRows);
            return true;
        },
        async appendCollectionDocument(name, row = {}) {
            if (typeof store.appendCollectionDocument === 'function') {
                return store.appendCollectionDocument(name, row);
            }
            if (typeof store.getCollection !== 'function' || typeof store.saveCollection !== 'function') {
                throw new Error('当前数据源不支持追加写入');
            }
            const key = String(name || '').trim();
            const rows = store.getCollection(key);
            if (!Array.isArray(rows)) {
                throw new Error(`集合 ${key} 读取结果不是数组，无法执行追加写入`);
            }
            const nextRow = { ...row };
            const nextRows = rows.concat(nextRow);
            store.saveCollection(key, nextRows);
            return nextRow;
        },
        async waitUntilReady(timeoutMs = 8000) {
            if (typeof store.waitUntilReady === 'function') {
                return store.waitUntilReady(timeoutMs);
            }
            if (!store.readyPromise) return true;
            await Promise.race([
                Promise.resolve(store.readyPromise),
                new Promise((_, reject) => setTimeout(() => reject(new Error(`数据源初始化超时（>${timeoutMs}ms）`)), timeoutMs))
            ]);
            return true;
        },
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
        // 2026-05-03 审计 P1（Stage 3.10）：mysql 路径在云函数运行时被 enforceCloudbaseRuntime
        // 强制改写为 cloudbase（详见 config.js line 47）；只有本地 ADMIN_DATA_SOURCE=mysql + 非云函数
        // 环境才可能命中。每次命中都打警告：如果生产日志真出现这一行，就要排查为什么 admin-api
        // 在生产被以非云函数模式启动了。详见 providers/mysql.js 文件头 deprecation 说明。
        console.warn('[DEPRECATED-MYSQL-PROVIDER-HIT] admin-api dataSource=mysql selected. enforceCloudbaseRuntime=false. expected cloudbase in production. audit=2026-05-03 Stage3.10');
        try {
            return withCommonStoreHelpers(createMysqlStore({
                mysql,
                cloudbase,
                dataRoot,
                normalizedDataRoot,
                runtimeRoot,
                preferNormalizedData
            }));
        } catch (error) {
            return withCommonStoreHelpers(buildUnsupportedStore('mysql', error));
        }
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
