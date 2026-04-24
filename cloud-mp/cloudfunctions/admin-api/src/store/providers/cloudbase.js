const crypto = require('crypto');
const cloudbaseSdk = require('@cloudbase/node-sdk');
const { createFilesystemStore } = require('./filesystem');

function normalizeSourceName(name) {
    return String(name || '').trim();
}

function nowIso() {
    return new Date().toISOString();
}

function isMissingCollectionError(error) {
    const message = String((error && error.message) || '').toLowerCase();
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
        lastReloadAt: null,
        error: null,
        warnings: []
    };
    const cache = new Map();
    const collectionSnapshots = new Map();
    const singletonCache = new Map();
    const dirty = new Set();
    const pendingFlush = new Map();
    const dirtySingletons = new Set();
    const pendingSingletonFlush = new Map();
    const lazyLoadPromises = new Map();
    const collectionLoadState = new Map();
    const pageSize = 100;
    const singletonCollectionName = `${cloudbase.collectionPrefix || ''}admin_singletons`;
    const basePreloadCollections = [
        'admin_singletons',
        'admins',
        'admin_roles',
        'configs',
        'app_configs'
    ];
    const allKnownCollections = new Set([
        ...basePreloadCollections,
        'admin_audit_logs', 'addresses', 'banners',
        'branch_agent_claims', 'branch_agent_stations', 'cart_items',
        'categories', 'commissions', 'content_boards', 'content_board_products',
        'coupon_claim_tickets',
        'contents', 'coupon_auto_rules', 'coupons', 'directed_invites', 'dividend_executions',
        'deposit_orders', 'deposit_refunds',
        'fund_pool_logs',
        'goods_fund_transfer_applications',
        'goods_fund_logs',
        'station_procurement_orders',
        'station_sku_stocks',
        'station_stock_logs',
        'group_activities', 'group_members', 'group_orders',
        'agent_exit_applications', 'lottery_prizes', 'lottery_claims', 'lottery_records',
        'limited_sale_slots', 'limited_sale_items',
        'mass_messages', 'material_groups', 'materials', 'notifications',
        'orders', 'page_layouts', 'pickup_stations', 'point_accounts',
        'point_logs', 'portal_accounts', 'product_bundles', 'products', 'refunds', 'reviews',
        'skus', 'slash_activities', 'slash_helpers', 'slash_records',
        'splash_screens', 'stations', 'station_staff', 'user_coupons',
        'user_favorites', 'user_mass_messages', 'users', 'upgrade_applications',
        'wallet_accounts', 'wallet_logs', 'wallet_recharge_orders', 'withdrawals'
    ]);
    // Cold start should only load login/permission/config essentials.
    // Route handlers call reloadCollections before touching their own data sets.
    const preloadCollections = Array.from(basePreloadCollections);

    function setCollectionState(name, meta = {}) {
        const key = normalizeSourceName(name);
        collectionLoadState.set(key, {
            collection: key,
            status: meta.status || 'not_loaded',
            loaded_at: meta.loaded_at || null,
            last_error: meta.last_error || null,
            message: meta.message || ''
        });
    }

    function getCollectionState(name) {
        const key = normalizeSourceName(name);
        return collectionLoadState.get(key) || {
            collection: key,
            status: 'not_loaded',
            loaded_at: null,
            last_error: null,
            message: ''
        };
    }

    function buildCollectionAccessError(name, meta = {}) {
        const stateMeta = getCollectionState(name);
        const status = meta.status || stateMeta.status || 'not_loaded';
        const error = new Error(
            status === 'load_failed'
                ? `CloudBase 集合 ${name} 加载失败：${meta.last_error || stateMeta.last_error || '未知错误'}`
                : `CloudBase 集合 ${name} 尚未完成加载，当前状态：${status}`
        );
        error.code = status === 'load_failed' ? 'LOAD_FAILED' : 'NOT_LOADED';
        error.collection = normalizeSourceName(name);
        error.collection_state = status;
        return error;
    }

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

    function cloneRows(rows = []) {
        return (Array.isArray(rows) ? rows : []).map((row) => {
            if (!row || typeof row !== 'object') return row;
            return JSON.parse(JSON.stringify(row));
        });
    }

    function normalizeComparableRow(row) {
        if (!row || typeof row !== 'object') return row;
        const { _id, ...safeRow } = row;
        return safeRow;
    }

    function rowsEqual(left, right) {
        return JSON.stringify(normalizeComparableRow(left)) === JSON.stringify(normalizeComparableRow(right));
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

    async function syncCollectionDiff(name, previousRows, rows) {
        const collection = db.collection(getCollectionName(name));
        const existingRows = Array.isArray(previousRows) ? previousRows : [];
        const existingMap = new Map(existingRows.map((item) => [toDocumentId(item), item]));
        const nextRows = Array.isArray(rows) ? rows : [];
        const nextMap = new Map(nextRows.map((item) => [toDocumentId(item), item]));

        for (const [docId, row] of nextMap.entries()) {
            const previous = existingMap.get(docId);
            if (previous && rowsEqual(previous, row)) continue;
            const { _id, ...safeRow } = row || {};
            await collection.doc(docId).set({
                data: {
                    ...safeRow
                }
            });
        }

        for (const docId of existingMap.keys()) {
            if (!nextMap.has(docId)) {
                await collection.doc(docId).remove();
            }
        }
    }

    async function loadCollection(name) {
        const key = normalizeSourceName(name);
        setCollectionState(key, { status: 'loading', loaded_at: null, last_error: null });
        if (key === 'admin_singletons') {
            try {
                singletonCache.clear();
                const rows = await fetchSingletonRows();
                for (const row of rows) {
                    const singletonKey = String(row.key || row.name || row._id || '').trim();
                    if (!singletonKey) continue;
                    singletonCache.set(singletonKey, row.value);
                }
                setCollectionState(key, { status: 'loaded', loaded_at: nowIso(), last_error: null });
            } catch (error) {
                if (isMissingCollectionError(error)) {
                    state.warnings.push({ collection: key, message: error.message });
                    setCollectionState(key, { status: 'missing', loaded_at: nowIso(), last_error: null, message: error.message });
                    return;
                }
                state.error = error;
                setCollectionState(key, { status: 'load_failed', loaded_at: nowIso(), last_error: error.message });
                throw error;
            }
            return;
        }
        try {
            const rows = await fetchCollection(key);
            cache.set(key, rows);
            collectionSnapshots.set(key, cloneRows(rows));
            setCollectionState(key, { status: 'loaded', loaded_at: nowIso(), last_error: null });
        } catch (error) {
            if (isMissingCollectionError(error)) {
                state.warnings.push({ collection: key, message: error.message });
                cache.set(key, []);
                collectionSnapshots.set(key, []);
                setCollectionState(key, { status: 'missing', loaded_at: nowIso(), last_error: null, message: error.message });
                return;
            }
            state.error = error;
            setCollectionState(key, { status: 'load_failed', loaded_at: nowIso(), last_error: error.message });
            throw error;
        }
    }

    function ensureCollectionLoaded(name) {
        const key = normalizeSourceName(name);
        if (cache.has(key) || getCollectionState(key).status === 'missing') {
            return Promise.resolve();
        }
        if (lazyLoadPromises.has(key)) return lazyLoadPromises.get(key);
        const loadPromise = loadCollection(key)
            .finally(() => {
                lazyLoadPromises.delete(key);
            });
        lazyLoadPromises.set(key, loadPromise);
        return loadPromise;
    }

    async function waitForCollection(name, timeoutMs = 8000) {
        const key = normalizeSourceName(name);
        const loadPromise = ensureCollectionLoaded(key);
        await Promise.race([
            loadPromise,
            new Promise((_, reject) => setTimeout(() => reject(buildCollectionAccessError(key, { status: 'not_loaded' })), timeoutMs))
        ]);
        if (cache.has(key)) return cache.get(key);
        const meta = getCollectionState(key);
        if (meta.status === 'missing') return [];
        throw buildCollectionAccessError(key, meta);
    }

    async function initialize() {
        await Promise.all(preloadCollections.map((name) => ensureCollectionLoaded(name)));
        state.ready = true;
        state.loadedAt = nowIso();
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
                const snapshot = collectionSnapshots.get(key) || [];
                try {
                    await syncCollectionDiff(key, snapshot, rows);
                    collectionSnapshots.set(key, cloneRows(rows));
                } catch (error) {
                    dirty.add(key);
                    throw error;
                }
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
                        key,
                        value: singletonCache.get(key),
                        updated_at: nowIso()
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
            const collectionNames = new Set([
                ...Array.from(dirty),
                ...Array.from(pendingFlush.keys())
            ]);
            const singletonNames = new Set([
                ...Array.from(dirtySingletons),
                ...Array.from(pendingSingletonFlush.keys())
            ]);
            const tasks = [
                ...Array.from(collectionNames).map((name) => flushCollection(name)),
                ...Array.from(singletonNames).map((name) => flushSingleton(name))
            ];
            return Promise.allSettled(tasks);
        },
        health() {
            const states = Array.from(collectionLoadState.values()).reduce((acc, item) => {
                acc[item.collection] = {
                    status: item.status,
                    loaded_at: item.loaded_at,
                    last_error: item.last_error,
                    message: item.message
                };
                return acc;
            }, {});
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
                not_loaded_collections: Array.from(collectionLoadState.values()).filter((item) => item.status === 'not_loaded' || item.status === 'loading').map((item) => item.collection),
                load_failed_collections: Array.from(collectionLoadState.values()).filter((item) => item.status === 'load_failed').map((item) => item.collection),
                collection_states: states,
                last_error: state.error ? state.error.message : null,
                warnings: state.warnings,
                loaded_at: state.loadedAt,
                last_reload_at: state.lastReloadAt
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
                preload_mode: 'base_collections_lazy_route_load',
                known_collections: allKnownCollections.size,
                preloaded_collections: preloadCollections.length,
                ready: state.ready
            };
        },
        getCollectionName,
        getCollection(name) {
            const key = normalizeSourceName(name);
            if (cache.has(key)) return cache.get(key);
            const meta = getCollectionState(key);
            if (meta.status === 'missing') return [];
            throw buildCollectionAccessError(key, meta);
        },
        async reloadCollection(name) {
            const key = normalizeSourceName(name);
            if (key === 'admin_singletons') {
                if (dirtySingletons.has(key) || pendingSingletonFlush.has(key)) {
                    await flushSingleton(key);
                }
                await loadCollection(key);
                state.lastReloadAt = nowIso();
                return singletonCache;
            }
            if (dirty.has(key) || pendingFlush.has(key)) {
                await flushCollection(key);
            }
            await loadCollection(key);
            state.lastReloadAt = nowIso();
            if (cache.has(key)) return cache.get(key);
            const meta = getCollectionState(key);
            if (meta.status === 'missing') return [];
            throw buildCollectionAccessError(key, meta);
        },
        async reloadCollections(names = []) {
            const source = Array.isArray(names) ? names : [];
            const results = [];
            for (const name of source) {
                results.push(await this.reloadCollection(name));
            }
            state.lastReloadAt = nowIso();
            return results;
        },
        saveCollection(name, rows) {
            const key = normalizeSourceName(name);
            cache.set(key, Array.isArray(rows) ? rows : []);
            setCollectionState(key, {
                status: 'loaded',
                loaded_at: nowIso(),
                last_error: null
            });
            dirty.add(key);
            void flushCollection(key).catch((error) => {
                state.error = error;
                setCollectionState(key, { status: 'load_failed', loaded_at: nowIso(), last_error: error.message });
            });
        },
        async patchCollectionDocument(name, docId, updateData) {
            const key = normalizeSourceName(name);
            const collection = db.collection(getCollectionName(key));
            const { _id, ...safeUpdateData } = (updateData && typeof updateData === 'object') ? updateData : {};
            await collection.doc(String(docId)).update({
                data: {
                    ...safeUpdateData,
                    updated_at: nowIso()
                }
            });
            if (cache.has(key)) {
                const rows = cache.get(key) || [];
                const index = rows.findIndex((item) => String(item._id || item.id || item._legacy_id) === String(docId));
                if (index !== -1) {
                    rows[index] = { ...rows[index], ...safeUpdateData, updated_at: nowIso() };
                    cache.set(key, rows);
                    collectionSnapshots.set(key, cloneRows(rows));
                }
            }
            return true;
        },
        waitForCollection,
        getCollectionState,
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
        _internals: {
            app,
            db,
            cache,
            singletonCache,
            collectionSnapshots,
            dirty,
            dirtySingletons,
            pendingFlush,
            pendingSingletonFlush,
            lazyLoadPromises,
            collectionLoadState,
            state,
            getCollectionName
        }
    };
}

module.exports = {
    createCloudBaseStore
};
