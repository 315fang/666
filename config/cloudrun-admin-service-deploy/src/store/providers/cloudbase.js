const crypto = require('crypto');
const cloudbaseSdk = require('@cloudbase/node-sdk');
const { createFilesystemStore } = require('./filesystem');

function normalizeSourceName(name) {
    return String(name || '').trim();
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
        preferNormalizedData
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
    const dirty = new Set();
    const pendingFlush = new Map();
    const pageSize = 100;
    const preloadCollections = [
        'admins',
        'admin_audit_logs',
        'addresses',
        'app_configs',
        'banners',
        'cart_items',
        'categories',
        'commissions',
        'configs',
        'content_boards',
        'content_board_products',
        'contents',
        'coupons',
        'group_activities',
        'group_members',
        'group_orders',
        'lottery_prizes',
        'lottery_records',
        'mass_messages',
        'material_groups',
        'materials',
        'notifications',
        'orders',
        'page_layouts',
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
        'user_coupons',
        'user_favorites',
        'user_mass_messages',
        'users',
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
    const app = cloudbaseSdk.init(initOptions);
    const db = app.database();

    function getCollectionName(name) {
        const prefix = cloudbase.collectionPrefix || '';
        return `${prefix}${normalizeSourceName(name)}`;
    }

    async function fetchAll(name) {
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

    async function replaceCollection(name, rows) {
        const collection = db.collection(getCollectionName(name));
        const existingRows = await fetchAll(name).catch(() => []);
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
        try {
            const rows = await fetchAll(name);
            cache.set(name, rows);
        } catch (error) {
            state.warnings.push({ collection: name, message: error.message });
            cache.set(name, fallbackStore.getCollection(name));
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
            await replaceCollection(key, cache.get(key) || []);
            dirty.delete(key);
            return { success: true, rows: (cache.get(key) || []).length };
        })();
        pendingFlush.set(key, flushPromise);
        try {
            return await flushPromise;
        } finally {
            pendingFlush.delete(key);
        }
    }

    const readyPromise = initialize().catch((error) => {
        state.error = error;
        throw error;
    });

    return {
        kind: 'cloudbase',
        description: 'CloudBase 文档数据库 + 单例文件 fallback',
        readyPromise,
        async flush() {
            const tasks = Array.from(dirty).map((name) => flushCollection(name));
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
                dirty_collections: Array.from(dirty),
                pending_flush_collections: Array.from(pendingFlush.keys()),
                last_error: state.error ? state.error.message : null,
                warnings: state.warnings,
                loaded_at: state.loadedAt
            };
        },
        describe() {
            return {
                source: 'cloudbase',
                collection_source: 'cloudbase',
                singleton_source: 'filesystem',
                env_id: cloudbase.envId || '',
                region: cloudbase.region || '',
                collection_prefix: cloudbase.collectionPrefix || '',
                ready: state.ready
            };
        },
        getCollection(name) {
            const key = normalizeSourceName(name);
            if (!cache.has(key)) cache.set(key, []);
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
            return fallbackStore.getSingleton(name, fallback);
        },
        saveSingleton(name, value) {
            return fallbackStore.saveSingleton(name, value);
        },
        _internals: { cache, dirty, state, db, app }
    };
}

module.exports = {
    createCloudBaseStore
};
