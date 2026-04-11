const crypto = require('crypto');
const cloudbaseSdk = require('@cloudbase/node-sdk');
const { createFilesystemStore } = require('./filesystem');

function normalizeSourceName(name) {
    return String(name || '').trim();
}

function isMissingCollectionError(error) {
    const message = String(error && error.message || '').toLowerCase();
    return message.includes('collection') && (message.includes('not exist') || message.includes('not found') || message.includes('does not exist'));
}

function toDocumentId(row) {
    const candidate = row && (row._id || row.id || row._legacy_id);
    return candidate == null || candidate === '' ? crypto.randomUUID() : String(candidate);
}

function createCloudBaseStore(options) {
    const {
        cloudbase,
        dataRoot,
        normalizedDataRoot,
        runtimeRoot,
        preferNormalizedData,
        isFunctionRuntime = false
    } = options;

    const fallbackStore = createFilesystemStore({
        dataRoot,
        normalizedDataRoot,
        runtimeRoot,
        preferNormalizedData,
        singletonRoot: runtimeRoot
    });

    const state = {
        ready: false,
        loadedAt: null,
        error: null,
        warnings: []
    };
    const cache = new Map();
    const singletonCache = new Map();
    const dirty = new Set();
    const pendingFlush = new Map();
    const dirtySingletons = new Set();
    const pendingSingletonFlush = new Map();
    const pageSize = 100;
    const singletonCollectionName = `${cloudbase.collectionPrefix || ''}admin_singletons`;
    const preloadCollections = [
        'admin_singletons',
        'admins',
        'admin_roles',
        'admin_audit_logs',
        'addresses',
        'app_configs',
        'banners',
        'branch_agent_claims',
        'branch_agent_stations',
        'cart_items',
        'categories',
        'commissions',
        'configs',
        'content_boards',
        'content_board_products',
        'contents',
        'coupon_auto_rules',
        'coupons',
        'dividend_executions',
        'group_activities',
        'group_members',
        'group_orders',
        'agent_exit_applications',
        'lottery_prizes',
        'lottery_records',
        'mass_messages',
        'material_groups',
        'materials',
        'notifications',
        'orders',
        'page_layouts',
        'pickup_stations',
        'point_accounts',
        'point_logs',
        'portal_accounts',
        'products',
        'refunds',
        'reviews',
        'skus',
        'slash_activities',
        'slash_helpers',
        'slash_records',
        'splash_screens',
        'stations',
        'station_staff',
        'user_coupons',
        'user_favorites',
        'user_mass_messages',
        'users',
        'upgrade_applications',
        'wallet_accounts',
        'wallet_logs',
        'wallet_recharge_orders',
        'withdrawals'
    ];

    if (!cloudbase.envId) {
        const error = new Error('ADMIN_DATA_SOURCE=cloudbase requires ADMIN_CLOUDBASE_ENV_ID');
        return {
            kind: 'cloudbase',
            description: 'CloudBase provider missing env id',
            readyPromise: Promise.reject(error),
            async flush() {
                throw error;
            },
            health() {
                return {
                    status: 'error',
                    mode: 'cloudbase',
                    ready: false,
                    env_id: '',
                    region: cloudbase.region || '',
                    last_error: error.message
                };
            },
            describe() {
                return {
                    source: 'cloudbase',
                    collection_source: 'cloudbase',
                    singleton_source: 'filesystem',
                    env_id: '',
                    region: cloudbase.region || '',
                    ready: false
                };
            },
            getCollection() {
                throw error;
            },
            saveCollection() {
                throw error;
            },
            getSingleton(name, fallback) {
                return fallbackStore.getSingleton(name, fallback);
            },
            saveSingleton(name, value) {
                return fallbackStore.saveSingleton(name, value);
            }
        };
    }

    let app = null;
    let db = null;
    if (isFunctionRuntime) {
        const wxCloud = require('wx-server-sdk');
        wxCloud.init({ env: wxCloud.DYNAMIC_CURRENT_ENV });
        app = wxCloud;
        db = wxCloud.database();
    } else {
        const initOptions = {
            env: cloudbase.envId
        };
        if (cloudbase.secretId && cloudbase.secretKey) {
            initOptions.secretId = cloudbase.secretId;
            initOptions.secretKey = cloudbase.secretKey;
            if (cloudbase.token) {
                initOptions.token = cloudbase.token;
            }
        }
        app = cloudbaseSdk.init(initOptions);
        db = app.database();
    }

    function getCollectionName(name) {
        const prefix = cloudbase.collectionPrefix || '';
        return `${prefix}${normalizeSourceName(name)}`;
    }

    async function fetchCollection(name) {
        const collection = db.collection(getCollectionName(name));
        let offset = 0;
        const rows = [];
        while (true) {
            const response = await collection.skip(offset).limit(pageSize).get();
            const batch = Array.isArray(response.data) ? response.data : [];
            rows.push(...batch);
            if (batch.length < pageSize) break;
            offset += batch.length;
        }
        return rows;
    }

    async function fetchSingletonRows() {
        const collection = db.collection(singletonCollectionName);
        let offset = 0;
        const rows = [];
        while (true) {
          const response = await collection.skip(offset).limit(pageSize).get();
          const batch = Array.isArray(response.data) ? response.data : [];
          rows.push(...batch);
          if (batch.length < pageSize) break;
          offset += batch.length;
        }
        return rows;
    }

    async function replaceCollection(name, rows) {
        const collection = db.collection(getCollectionName(name));
        const existingRows = await fetchCollection(name).catch(() => []);
        const existingIds = new Set(existingRows.map((item) => String(item._id)));
        const nextRows = Array.isArray(rows) ? rows : [];
        const nextIds = new Set();

        for (const row of nextRows) {
            const docId = toDocumentId(row);
            nextIds.add(docId);
            await collection.doc(docId).set({
                data: {
                    ...row,
                    _id: docId
                }
            });
        }

        for (const docId of existingIds) {
            if (!nextIds.has(docId)) {
                await collection.doc(docId).remove();
            }
        }
    }

    async function loadCollection(name) {
        if (name === 'admin_singletons') {
            try {
                const rows = await fetchSingletonRows();
                for (const row of rows) {
                    const key = String(row.key || row.name || row._id || '').trim();
                    if (!key) continue;
                    singletonCache.set(key, row.value);
                }
            } catch (error) {
                if (isMissingCollectionError(error)) {
                    state.warnings.push({ collection: name, message: error.message });
                    return;
                }
                state.error = error;
                throw error;
            }
            return;
        }
        try {
            const rows = await fetchCollection(name);
            cache.set(name, rows);
        } catch (error) {
            if (isMissingCollectionError(error)) {
                state.warnings.push({ collection: name, message: error.message });
                cache.set(name, []);
                return;
            }
            state.error = error;
            throw error;
        }
    }

    async function initialize() {
        for (const name of preloadCollections) {
            await loadCollection(name);
        }
        state.ready = true;
        state.loadedAt = new Date().toISOString();
        return {
            ready: true,
            loadedAt: state.loadedAt,
            collections: preloadCollections.length,
            warnings: state.warnings.length
        };
    }

    async function flushCollection(name) {
        const key = normalizeSourceName(name);
        const pending = pendingFlush.get(key);
        if (pending) return pending;
        const flushPromise = (async () => {
            let flushedRows = 0;
            while (dirty.has(key)) {
                dirty.delete(key);
                const rows = cache.get(key) || [];
                flushedRows = rows.length;
                await replaceCollection(key, rows);
            }
            return { success: true, rows: flushedRows };
        })();
        pendingFlush.set(key, flushPromise);
        try {
            return await flushPromise;
        } finally {
            pendingFlush.delete(key);
        }
    }

    async function flushSingleton(name) {
        const key = normalizeSourceName(name);
        const pending = pendingSingletonFlush.get(key);
        if (pending) return pending;
        const flushPromise = (async () => {
            const collection = db.collection(singletonCollectionName);
            while (dirtySingletons.has(key)) {
                dirtySingletons.delete(key);
                await collection.doc(key).set({
                    data: {
                        _id: key,
                        key,
                        value: singletonCache.get(key),
                        updated_at: new Date().toISOString()
                    }
                });
            }
            return { success: true, name: key };
        })();
        pendingSingletonFlush.set(key, flushPromise);
        try {
            return await flushPromise;
        } finally {
            pendingSingletonFlush.delete(key);
        }
    }

    const readyPromise = initialize().catch((error) => {
        state.error = error;
        throw error;
    });

    return {
        kind: 'cloudbase',
        description: isFunctionRuntime
            ? 'CloudBase 文档数据库（wx-server-sdk）+ CloudBase 单例配置'
            : 'CloudBase 文档数据库（@cloudbase/node-sdk）+ CloudBase 单例配置',
        readyPromise,
        async flush() {
            const tasks = [
                ...Array.from(dirty).map((name) => flushCollection(name)),
                ...Array.from(dirtySingletons).map((name) => flushSingleton(name))
            ];
            return Promise.allSettled(tasks);
        },
        health() {
            return {
                status: state.error ? 'error' : (state.warnings.length ? 'degraded' : (state.ready ? 'ok' : 'starting')),
                mode: 'cloudbase',
                ready: state.ready,
                env_id: cloudbase.envId || '',
                region: cloudbase.region || '',
                collection_prefix: cloudbase.collectionPrefix || '',
                cached_collections: cache.size,
                cached_singletons: singletonCache.size,
                dirty_collections: Array.from(dirty),
                dirty_singletons: Array.from(dirtySingletons),
                pending_flush_collections: Array.from(pendingFlush.keys()),
                pending_singleton_flushes: Array.from(pendingSingletonFlush.keys()),
                last_error: state.error ? state.error.message : null,
                warnings: state.warnings,
                loaded_at: state.loadedAt
            };
        },
        describe() {
            return {
                source: 'cloudbase',
                collection_source: 'cloudbase',
                singleton_source: 'cloudbase',
                env_id: cloudbase.envId || '',
                region: cloudbase.region || '',
                collection_prefix: cloudbase.collectionPrefix || '',
                ready: state.ready
            };
        },
        getCollection(name) {
            const key = normalizeSourceName(name);
            if (!cache.has(key)) {
                cache.set(key, []);
                state.warnings.push({ collection: key, message: 'collection requested before preload; verify preload list' });
            }
            return cache.get(key);
        },
        saveCollection(name, rows) {
            const key = normalizeSourceName(name);
            cache.set(key, Array.isArray(rows) ? rows : []);
            dirty.add(key);
            void flushCollection(key).catch((error) => {
                state.error = error;
            });
        },
        getSingleton(name, fallback) {
            const key = normalizeSourceName(name);
            return singletonCache.has(key) ? singletonCache.get(key) : fallback;
        },
        saveSingleton(name, value) {
            const key = normalizeSourceName(name);
            singletonCache.set(key, value);
            dirtySingletons.add(key);
            void flushSingleton(key).catch((error) => {
                state.error = error;
            });
        },
        _internals: { cache, singletonCache, dirty, dirtySingletons, state, db, app }
    };
}

module.exports = {
    createCloudBaseStore
};
