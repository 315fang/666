const path = require('path');
const { createFilesystemStore } = require('./filesystem');

function loadBackendModels() {
    return require(path.resolve(__dirname, '../../../../models'));
}

function normalizeSourceName(name) {
    return String(name || '').trim();
}

function stripUndefined(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}

function collectionToModelName(name) {
    const mapping = {
        users: 'User',
        products: 'Product',
        orders: 'Order',
        addresses: 'Address',
        commissions: 'CommissionLog',
        categories: 'Category',
        skus: 'SKU',
        cart_items: 'Cart',
        carts: 'Cart',
        user_favorites: 'UserFavorite',
        banners: 'Banner',
        contents: 'Content',
        materials: 'Material',
        material_groups: 'MaterialGroup',
        reviews: 'Review',
        withdrawals: 'Withdrawal',
        admins: 'Admin',
        refunds: 'Refund',
        dealers: 'Dealer',
        notifications: 'Notification',
        app_configs: 'AppConfig',
        quick_entries: 'QuickEntry',
        home_sections: 'HomeSection',
        themes: 'Theme',
        activity_logs: 'ActivityLog',
        admin_audit_logs: 'AdminLog',
        system_configs: 'SystemConfig',
        system_config_histories: 'SystemConfigHistory',
        configs: 'SystemConfig',
        mass_messages: 'MassMessage',
        user_mass_messages: 'UserMassMessage',
        user_tags: 'UserTag',
        user_tag_relations: 'UserTagRelation',
        point_accounts: 'PointAccount',
        point_logs: 'PointLog',
        group_activities: 'GroupActivity',
        group_orders: 'GroupOrder',
        group_members: 'GroupMember',
        lottery_prizes: 'LotteryPrize',
        lottery_records: 'LotteryRecord',
        coupons: 'Coupon',
        user_coupons: 'UserCoupon',
        slash_activities: 'SlashActivity',
        slash_records: 'SlashRecord',
        slash_helpers: 'SlashHelper',
        service_stations: 'ServiceStation',
        station_claims: 'StationClaim',
        station_staff: 'StationStaff',
        splash_screens: 'SplashScreen',
        portal_accounts: 'PortalAccount',
        agent_wallet_accounts: 'AgentWalletAccount',
        agent_wallet_logs: 'AgentWalletLog',
        content_boards: 'ContentBoard',
        content_board_items: 'ContentBoardItem',
        content_board_products: 'ContentBoardProduct',
        page_layouts: 'PageLayout',
        stock_transactions: 'StockTransaction',
        stock_reservations: 'StockReservation',
        commission_settlements: 'CommissionSettlement',
        admin_logs: 'AdminLog',
        activity_spot_stocks: 'ActivitySpotStock',
        upgrade_applications: 'UpgradeApplication',
        partner_exit_applications: 'PartnerExitApplication',
        n_fund_requests: 'NFundRequest'
    };
    return mapping[normalizeSourceName(name)] || null;
}

function createMysqlStore(options) {
    const { mysql, dataRoot, normalizedDataRoot, runtimeRoot, preferNormalizedData } = options;
    const models = loadBackendModels();
    const sequelize = models.sequelize;
    const filesystemStore = createFilesystemStore({
        dataRoot,
        normalizedDataRoot,
        runtimeRoot,
        preferNormalizedData,
        singletonRoot: runtimeRoot
    });
    const cache = new Map();
    const dirty = new Set();
    const pendingFlush = new Map();
    const destructiveSyncAllowed = process.env.ADMIN_MYSQL_ALLOW_DESTRUCTIVE_SYNC === 'true';
    const state = {
        ready: false,
        error: null,
        loadedAt: null,
        lastReloadAt: null,
        warnings: []
    };

    const modelCollections = new Set([
        'users',
        'products',
        'orders',
        'addresses',
        'commissions',
        'categories',
        'skus',
        'cart_items',
        'carts',
        'user_favorites',
        'banners',
        'contents',
        'materials',
        'material_groups',
        'reviews',
        'withdrawals',
        'admins',
        'refunds',
        'dealers',
        'notifications',
        'app_configs',
        'quick_entries',
        'home_sections',
        'themes',
        'activity_logs',
        'admin_audit_logs',
        'system_configs',
        'system_config_histories',
        'configs',
        'mass_messages',
        'user_mass_messages',
        'user_tags',
        'user_tag_relations',
        'point_accounts',
        'point_logs',
        'group_activities',
        'group_orders',
        'group_members',
        'lottery_prizes',
        'lottery_records',
        'coupons',
        'user_coupons',
        'slash_activities',
        'slash_records',
        'slash_helpers',
        'service_stations',
        'station_claims',
        'station_staff',
        'splash_screens',
        'portal_accounts',
        'agent_wallet_accounts',
        'agent_wallet_logs',
        'content_boards',
        'content_board_items',
        'content_board_products',
        'page_layouts',
        'stock_transactions',
        'stock_reservations',
        'commission_settlements',
        'admin_logs',
        'activity_spot_stocks',
        'upgrade_applications',
        'partner_exit_applications',
        'n_fund_requests'
    ]);

    function getModel(name) {
        const modelName = collectionToModelName(name);
        return modelName ? models[modelName] || null : null;
    }

    async function loadCollection(name) {
        const Model = getModel(name);
        if (!Model) return [];
        const rows = await Model.findAll({ order: [['id', 'ASC']] });
        return rows.map((item) => item.get({ plain: true }));
    }

    async function initialize() {
        await sequelize.authenticate();
        for (const name of modelCollections) {
            const rows = await loadCollection(name);
            cache.set(name, rows);
        }
        state.ready = true;
        state.loadedAt = new Date().toISOString();
        return {
            ready: true,
            loadedAt: state.loadedAt,
            collections: cache.size,
            warnings: state.warnings.length
        };
    }

    async function flushCollection(name) {
        const key = normalizeSourceName(name);
        const Model = getModel(key);
        if (!Model) return { skipped: true, reason: 'unmapped-collection' };
        if (!destructiveSyncAllowed) {
            const error = new Error('MySQL 数据源已禁用 destructive full-table sync，请改用精确写入策略或显式开启 ADMIN_MYSQL_ALLOW_DESTRUCTIVE_SYNC=true');
            error.code = 'MYSQL_DESTRUCTIVE_SYNC_DISABLED';
            state.error = error;
            throw error;
        }
        const existing = pendingFlush.get(key);
        if (existing) return existing;
        const rows = cache.get(key) || [];
        const flushPromise = (async () => {
            await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
            try {
                await Model.destroy({ where: {}, force: true });
                if (rows.length) {
                    const payload = rows.map((row) => stripUndefined(row));
                    await Model.bulkCreate(payload, {
                        validate: false,
                        hooks: false,
                        individualHooks: false
                    });
                }
            } finally {
                await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
            }
            dirty.delete(key);
            return { success: true, rows: rows.length };
        })();
        pendingFlush.set(key, flushPromise);
        try {
            return await flushPromise;
        } finally {
            pendingFlush.delete(key);
        }
    }

    function getCollection(name) {
        const key = normalizeSourceName(name);
        if (!modelCollections.has(key)) return filesystemStore.getCollection(key);
        if (!cache.has(key)) {
            const error = new Error(`MySQL 集合 ${key} 尚未加载，请等待初始化完成后再读取`);
            error.code = 'NOT_LOADED';
            error.collection = key;
            throw error;
        }
        return cache.get(key);
    }

    async function reloadCollection(name) {
        const key = normalizeSourceName(name);
        if (!modelCollections.has(key)) return filesystemStore.getCollection(key);
        const rows = await loadCollection(key);
        cache.set(key, rows);
        state.lastReloadAt = new Date().toISOString();
        return rows;
    }

    async function reloadCollections(names = []) {
        const source = Array.isArray(names) ? names : [];
        const results = await Promise.all(source.map((name) => reloadCollection(name)));
        state.lastReloadAt = new Date().toISOString();
        return results;
    }

    function saveCollection(name, rows) {
        const key = normalizeSourceName(name);
        if (!modelCollections.has(key)) {
            filesystemStore.saveCollection(key, rows);
            return;
        }
        if (!destructiveSyncAllowed) {
            const error = new Error('MySQL 数据源已禁用 destructive full-table sync，请改用精确写入策略或显式开启 ADMIN_MYSQL_ALLOW_DESTRUCTIVE_SYNC=true');
            error.code = 'MYSQL_DESTRUCTIVE_SYNC_DISABLED';
            state.error = error;
            throw error;
        }
        cache.set(key, Array.isArray(rows) ? rows : []);
        dirty.add(key);
        void flushCollection(key).catch((error) => {
            state.error = error;
        });
    }

    function getSingleton(name, fallback) {
        return filesystemStore.getSingleton(name, fallback);
    }

    function saveSingleton(name, value) {
        filesystemStore.saveSingleton(name, value);
    }

    const readyPromise = initialize().catch((error) => {
        state.error = error;
        throw error;
    });

    return {
        kind: 'mysql',
        description: 'MySQL + Sequelize 真实数据源',
        readyPromise,
        async flush() {
            const tasks = Array.from(dirty).map((name) => flushCollection(name));
            return Promise.allSettled(tasks);
        },
        health() {
            return {
                status: state.error ? 'error' : (state.warnings.length ? 'degraded' : (state.ready ? 'ok' : 'starting')),
                mode: 'mysql',
                ready: state.ready,
                data_source: 'mysql',
                host: mysql.host,
                port: mysql.port,
                database: mysql.database,
                mapped_collections: modelCollections.size,
                cached_collections: cache.size,
                dirty_collections: Array.from(dirty),
                pending_flush_collections: Array.from(pendingFlush.keys()),
                write_protected: !destructiveSyncAllowed,
                write_strategy: destructiveSyncAllowed ? 'destructive_full_table_sync' : 'disabled',
                fail_closed: true,
                last_error: state.error ? state.error.message : null,
                warnings: state.warnings,
                loaded_at: state.loadedAt,
                last_reload_at: state.lastReloadAt
            };
        },
        describe() {
            return {
                source: 'mysql',
                collection_source: 'mysql',
                singleton_source: 'filesystem',
                host: mysql.host,
                port: mysql.port,
                database: mysql.database,
                mapped_collections: modelCollections.size,
                write_protected: !destructiveSyncAllowed,
                write_strategy: destructiveSyncAllowed ? 'destructive_full_table_sync' : 'disabled',
                fail_closed: true
            };
        },
        getCollection,
        reloadCollection,
        reloadCollections,
        saveCollection,
        getSingleton,
        saveSingleton,
        _internals: { models, sequelize, cache, dirty, pendingFlush, modelCollections, state }
    };
}

module.exports = {
    createMysqlStore
};
