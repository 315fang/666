'use strict';

function registerSystemRoutes(app, deps) {
    const {
        auth,
        requirePermission,
        rejectUnknownBodyFields,
        failWithFieldErrors,
        ensureFreshCollections,
        getCollection,
        saveCollection,
        getSingleton,
        saveSingleton,
        getSettingsSnapshot,
        getMiniProgramConfigSnapshot,
        getMemberTierConfigSnapshot,
        normalizeAlertConfigPayload,
        normalizeFeatureTogglePayload,
        buildConfigSourceReport,
        buildCronRuntimeStatus,
        buildDataSourceRuntimeStatus,
        resolveOperationalStatus,
        probeDataStore,
        getPaymentHealthSnapshot,
        upsertConfigRow,
        normalizePeerBonusConfig,
        buildExchangeMetaFromPeerBonus,
        getConfigRowValue,
        freshReadMeta,
        STRONG_CONSISTENCY_COLLECTIONS,
        okStrongRead,
        configContract,
        createAuditLog,
        pickString,
        toObject,
        toArray,
        toNumber,
        nowIso,
        dataRoot,
        runtimeRoot,
        uploadsRoot,
        dataStore,
        formatUptimeHuman,
        SUPER_ADMIN_ROLE,
        os,
        process,
        ok,
        fail
    } = deps;

    app.get('/admin/api/system/status', auth, requirePermission('settings_manage'), async (req, res) => {
        const probe = await probeDataStore({ collection: pickString(req.query.collection, 'admins') || 'admins', forceReload: true });
        const memory = process.memoryUsage();
        const heapPercent = memory.heapTotal > 0 ? Math.round((memory.heapUsed / memory.heapTotal) * 100) : 0;
        const freeMemMb = Math.round(os.freemem() / 1024 / 1024);
        const totalMemMb = Math.round(os.totalmem() / 1024 / 1024);
        const cacheHealth = typeof dataStore.cacheHealth === 'function' ? dataStore.cacheHealth() : dataStore.health();
        ok(res, {
            status: resolveOperationalStatus(probe),
            runtime: 'cloudrun-admin-service',
            services: {
                database: buildDataSourceRuntimeStatus(probe)
            },
            process: {
                pid: process.pid,
                node_version: process.version,
                uptime_seconds: Math.floor(process.uptime()),
                uptime_human: formatUptimeHuman(process.uptime())
            },
            memory: {
                rss_mb: Math.round(memory.rss / 1024 / 1024),
                heap_used_mb: Math.round(memory.heapUsed / 1024 / 1024),
                heap_total_mb: Math.round(memory.heapTotal / 1024 / 1024),
                heap_percent: heapPercent
            },
            os: {
                platform: `${os.platform()} ${os.release()}`,
                free_mem_mb: freeMemMb,
                total_mem_mb: totalMemMb,
                load_avg: os.loadavg().map((item) => Number(item.toFixed(2)))
            },
            data_source: buildDataSourceRuntimeStatus(probe),
            cron: buildCronRuntimeStatus(probe),
            data_root: dataRoot,
            runtime_root: runtimeRoot,
            upload_root: uploadsRoot,
            cache_health: cacheHealth,
            checked_at: probe.checked_at || nowIso()
        });
    });

    app.get('/admin/api/payment-health', auth, requirePermission('settings_manage'), (_req, res) => {
        ok(res, getPaymentHealthSnapshot());
    });

    app.get('/admin/api/settings', auth, requirePermission('settings_manage'), (_req, res) => ok(res, getSettingsSnapshot()));

    app.put('/admin/api/settings', auth, requirePermission('settings_manage'), (req, res) => {
        const current = getSettingsSnapshot();
        const next = { ...current };
        const category = req.body?.category;
        if (category && req.body?.settings && typeof req.body.settings === 'object') {
            next[category] = { ...(next[category] || {}), ...req.body.settings };
            Object.entries(req.body.settings).forEach(([key, value]) => {
                upsertConfigRow(key, value, {
                    category,
                    group: category,
                    description: `${category} 配置：${key}`
                });
            });
        } else {
            Object.assign(next, toObject(req.body, {}));
        }
        saveSingleton('settings', next);
        ok(res, next);
    });

    app.get('/admin/api/mini-program-config', auth, requirePermission('settings_manage'), (_req, res) => ok(res, getMiniProgramConfigSnapshot()));

    app.put('/admin/api/mini-program-config', auth, requirePermission('settings_manage'), (req, res) => {
        const nextConfig = configContract.normalizeMiniProgramConfig({ ...getMiniProgramConfigSnapshot(), ...toObject(req.body, {}) });
        saveSingleton('mini-program-config', nextConfig);
        upsertConfigRow('mini_program_config', nextConfig, {
            category: 'MINIPROGRAM',
            group: 'MINIPROGRAM',
            description: '小程序运行时配置',
            is_public: true
        });
        ok(res, nextConfig);
    });

    app.get('/admin/api/member-tier-config', auth, requirePermission('settings_manage'), (_req, res) => ok(res, getMemberTierConfigSnapshot()));

    app.put('/admin/api/member-tier-config', auth, requirePermission('settings_manage'), (req, res) => {
        const nextConfig = toObject(req.body, {});
        const normalizedMemberLevels = toArray(nextConfig.member_levels).map((item) => ({
            ...toObject(item, {}),
            discount_rate: 1
        }));
        saveSingleton('member-tier-config', {
            member_levels: normalizedMemberLevels,
            growth_rules: toObject(nextConfig.growth_rules, {}),
            growth_tiers: toArray(nextConfig.growth_tiers),
            upgrade_rules: toObject(nextConfig.upgrade_rules, {}),
            peer_bonus: normalizePeerBonusConfig(nextConfig.peer_bonus),
            point_levels: toArray(nextConfig.point_levels),
            point_rules: toObject(nextConfig.point_rules, {})
        });
        upsertConfigRow('member_level_config', normalizedMemberLevels, {
            description: '会员/代理等级配置',
            is_public: true
        });
        upsertConfigRow('growth_rule_config', toObject(nextConfig.growth_rules, {}), {
            description: '成长值来源规则配置'
        });
        upsertConfigRow('growth_tier_config', toArray(nextConfig.growth_tiers), {
            description: '成长值等级阶梯配置',
            is_public: true
        });
        upsertConfigRow('member_upgrade_rule_config', toObject(nextConfig.upgrade_rules, {}), {
            description: '会员升级门槛配置',
            is_public: true
        });
        upsertConfigRow('agent_system_peer_bonus', normalizePeerBonusConfig(nextConfig.peer_bonus), {
            description: '平级奖励与兑换券配置',
            is_public: true
        });
        upsertConfigRow('point_level_config', toArray(nextConfig.point_levels), {
            category: 'POINTS',
            group: 'POINTS',
            description: '积分中心等级特权配置',
            is_public: true
        });
        upsertConfigRow('point_rule_config', toObject(nextConfig.point_rules, {}), {
            category: 'POINTS',
            group: 'POINTS',
            description: '积分行为奖励规则'
        });
        createAuditLog(req.admin, 'member-tier-config.update', 'configs', {
            member_levels: normalizedMemberLevels.length,
            growth_tiers: toArray(nextConfig.growth_tiers).length
        });
        ok(res, getMemberTierConfigSnapshot());
    });

    app.post('/admin/api/member-tier-config/exchange-coupons/backfill', auth, requirePermission('settings_manage'), async (req, res) => {
        await ensureFreshCollections(['user_coupons']);
        const peerBonus = normalizePeerBonusConfig(getConfigRowValue('agent_system_peer_bonus', getConfigRowValue('agent_system_peer-bonus', {})));
        const rows = getCollection('user_coupons');
        let updated = 0;
        let pendingBind = 0;
        const nextRows = rows.map((row) => {
            if (pickString(row.coupon_type).toLowerCase() !== 'exchange') return row;
            if (pickString(row.source).toLowerCase() !== 'peer_bonus') return row;
            if (row.exchange_meta && typeof row.exchange_meta === 'object' && Object.keys(row.exchange_meta).length > 0) return row;
            const bonusLevel = Math.max(0, toNumber(row.bonus_role_level, 0));
            if (!bonusLevel) return row;
            const exchangeMeta = buildExchangeMetaFromPeerBonus(peerBonus, bonusLevel);
            if (exchangeMeta.bind_status !== 'ready') pendingBind += 1;
            updated += 1;
            return {
                ...row,
                exchange_meta: exchangeMeta,
                updated_at: nowIso()
            };
        });
        if (updated > 0) {
            saveCollection('user_coupons', nextRows);
            await Promise.resolve(dataStore.flush?.());
        }
        createAuditLog(req.admin, 'member-tier-config.exchange-coupons.backfill', 'user_coupons', { updated, pending_bind: pendingBind });
        ok(res, { updated, pending_bind: pendingBind });
    });

    app.get('/admin/api/alert-config', auth, requirePermission('settings_manage'), (_req, res) => ok(res, getSingleton('alert-config', {
        dingtalk: { enabled: false, webhook: '', secret: '' },
        wecom: { enabled: false, webhook: '' },
        email: { enabled: false, recipients: [] }
    })));

    app.put('/admin/api/alert-config', auth, requirePermission('settings_manage'), (req, res) => {
        if (rejectUnknownBodyFields(res, req.body, ['dingtalk', 'wecom', 'email'], '告警配置参数不合法')) return;
        const normalized = normalizeAlertConfigPayload(req.body, getSingleton('alert-config', {}));
        if (normalized.fieldErrors.length) return failWithFieldErrors(res, normalized.fieldErrors, '告警配置参数不合法');
        saveSingleton('alert-config', normalized.value);
        ok(res, normalized.value);
    });

    app.post('/admin/api/alert-config/test', auth, requirePermission('settings_manage'), (req, res) => {
        if (rejectUnknownBodyFields(res, req.body, ['provider'], '告警测试参数不合法')) return;
        ok(res, {
            success: true,
            provider: req.body?.provider || 'unknown',
            tested_at: nowIso()
        });
    });

    app.get('/admin/api/feature-toggles', auth, requirePermission('settings_manage'), (_req, res) => ok(res, getSingleton('feature-toggles', getMiniProgramConfigSnapshot().feature_flags || {})));

    app.post('/admin/api/feature-toggles', auth, requirePermission('settings_manage'), (req, res) => {
        const normalized = normalizeFeatureTogglePayload(req.body, getSingleton('feature-toggles', {}));
        if (normalized.fieldErrors.length) return failWithFieldErrors(res, normalized.fieldErrors, '功能开关参数不合法');
        saveSingleton('feature-toggles', normalized.value);
        ok(res, normalized.value);
    });

    app.get('/admin/api/debug/process', auth, requirePermission(SUPER_ADMIN_ROLE), (_req, res) => ok(res, {
        pid: process.pid,
        uptime: process.uptime(),
        uptime_human: formatUptimeHuman(process.uptime()),
        node_version: process.version,
        memory: process.memoryUsage()
    }));

    app.get('/admin/api/debug/anomalies', auth, requirePermission(SUPER_ADMIN_ROLE), async (_req, res) => {
        await ensureFreshCollections(['orders']);
        const orders = getCollection('orders');
        const longPendingOrders = orders.filter((item) => pickString(item.status) === 'pending_payment').length;
        const recentPayments = orders.filter((item) => deps.isPaidLikeOrder(item)).length;
        const issues = [];
        if (longPendingOrders > 10) issues.push(`存在 ${longPendingOrders} 单超时未支付订单`);
        ok(res, {
            status: issues.length ? 'warning' : 'normal',
            issues,
            stats: {
                long_pending_orders: longPendingOrders,
                recent_payments: recentPayments,
                recent_pay_rate_percent: recentPayments > 0 ? 100 : 0
            }
        });
    });

    app.get('/admin/api/debug/db-ping', auth, requirePermission(SUPER_ADMIN_ROLE), async (req, res) => {
        const probe = await probeDataStore({ collection: pickString(req.query.collection, 'admins') || 'admins', forceReload: true });
        ok(res, {
            status: resolveOperationalStatus(probe),
            mode: probe.mode,
            latency_ms: probe.latency_ms,
            probe_error: probe.error || '',
            checked_at: probe.checked_at
        });
    });

    app.get('/admin/api/debug/data-source', auth, requirePermission(SUPER_ADMIN_ROLE), async (req, res) => {
        const probe = await probeDataStore({ collection: pickString(req.query.collection, 'admins') || 'admins', forceReload: false });
        ok(res, { descriptor: dataStore.describe(), health: dataStore.health(), probe, checked_at: nowIso() });
    });

    app.get('/admin/api/debug/order-chain', auth, requirePermission(SUPER_ADMIN_ROLE), async (req, res) => {
        const lookup = pickString(req.query.order_id || req.query.id || req.query.order_no).trim();
        if (!lookup) return fail(res, '请提供订单 ID 或订单号');
        const readMeta = await freshReadMeta(req, STRONG_CONSISTENCY_COLLECTIONS.orders, true);
        const users = getCollection('users');
        const products = getCollection('products');
        const commissions = getCollection('commissions');
        const refunds = getCollection('refunds');
        const order = deps.findByLookup(getCollection('orders'), lookup, (row) => [row.order_no]);
        if (!order) return fail(res, '订单不存在', 404);
        okStrongRead(res, deps.buildOrderAuditSnapshot(order, users, products, commissions, refunds), readMeta.freshness);
    });

    app.get('/admin/api/debug/user-chain', auth, requirePermission(SUPER_ADMIN_ROLE), async (req, res) => {
        const lookup = pickString(req.query.user_id || req.query.id || req.query.openid || req.query.member_no).trim();
        if (!lookup) return fail(res, '请提供用户 ID / OPENID / 会员码');
        const readMeta = await freshReadMeta(req, STRONG_CONSISTENCY_COLLECTIONS.users, true);
        const users = getCollection('users');
        const orders = getCollection('orders');
        const commissions = getCollection('commissions');
        const user = deps.findUserByAnyId(users, lookup);
        if (!user) return fail(res, '用户不存在', 404);
        okStrongRead(res, deps.buildUserAuditSnapshot(user, users, orders, commissions), readMeta.freshness);
    });

    app.get('/admin/api/debug/config-source', auth, requirePermission(SUPER_ADMIN_ROLE), async (req, res) => {
        const key = pickString(req.query.key).trim();
        if (!key) return fail(res, '请提供配置 key');
        const readMeta = await freshReadMeta(req, ['configs', 'app_configs', 'admin_singletons'], true);
        okStrongRead(res, buildConfigSourceReport(key), readMeta.freshness);
    });

    app.get('/admin/api/debug/cron-status', auth, requirePermission(SUPER_ADMIN_ROLE), async (req, res) => {
        const probe = await probeDataStore({ collection: pickString(req.query.collection, 'admins') || 'admins', forceReload: false });
        ok(res, buildCronRuntimeStatus(probe));
    });

    app.get('/admin/api/debug/logs', auth, requirePermission(SUPER_ADMIN_ROLE), async (req, res) => {
        await ensureFreshCollections(['admin_audit_logs']);
        const lines = deps.sortByUpdatedDesc(getCollection('admin_audit_logs'))
            .slice(0, toNumber(req.query.lines, 100))
            .map((item) => `[${item.created_at || nowIso()}] ${item.admin_name || 'system'} ${item.action} ${item.target}`);
        ok(res, {
            lines,
            note: '当前日志来源为管理端操作审计，尚未接入外部日志服务'
        });
    });
}

module.exports = {
    registerSystemRoutes
};
