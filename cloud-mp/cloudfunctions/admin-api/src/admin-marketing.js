'use strict';

const https = require('https');
const {
    buildCouponWxacodeFallback,
    generateCouponWxacode: defaultGenerateCouponWxacode,
    normalizeEnvVersion
} = require('./coupon-wxacode');

function registerMarketingRoutes(app, deps) {
    const {
        auth,
        requirePermission,
        ensureFreshCollections = async () => {},
        getCollection,
        saveCollection,
        nextId,
        nowIso,
        toNumber,
        toArray,
        toBoolean,
        pickString,
        findByLookup,
        rowMatchesLookup,
        paginate,
        sortByUpdatedDesc,
        assetUrl,
        createAuditLog,
        directPatchDocument,
        appendWalletLogEntry,
        requireManualAdjustmentReason,
        generateCouponWxacode = defaultGenerateCouponWxacode,
        ok,
        fail
    } = deps;

    function getConfigValue(key, fallback) {
        const rows = getCollection('configs');
        const row = rows.find((item) => item.config_key === key || item.key === key || item._id === key);
        if (!row) return fallback;
        if (row.config_value !== undefined) {
            if (typeof row.config_value === 'string') {
                try { return JSON.parse(row.config_value); } catch (_) { return row.config_value; }
            }
            return row.config_value;
        }
        return row.value !== undefined ? row.value : fallback;
    }

    function setConfigValue(key, value, group = 'admin') {
        const rows = getCollection('configs');
        const index = rows.findIndex((item) => item.config_key === key || item.key === key || item._id === key);
        const row = {
            ...(index === -1 ? { id: nextId(rows), created_at: nowIso() } : rows[index]),
            config_key: key,
            key,
            config_value: value,
            value,
            config_group: group,
            updated_at: nowIso()
        };
        if (index === -1) rows.push(row);
        else rows[index] = row;
        saveCollection('configs', rows);
        return value;
    }

    function parseConfigRowValue(row, fallback) {
        if (!row) return fallback;
        if (row.config_value !== undefined) {
            if (typeof row.config_value === 'string') {
                try { return JSON.parse(row.config_value); } catch (_) { return row.config_value; }
            }
            return row.config_value;
        }
        return row.value !== undefined ? row.value : fallback;
    }

    function requireAnyPermission(requiredPermissions = []) {
        const normalized = toArray(requiredPermissions)
            .map((item) => pickString(item).trim())
            .filter(Boolean);

        return (req, res, next) => {
            const current = Array.isArray(req.permissions) ? req.permissions : [];
            if (
                normalized.length === 0
                || current.includes('*')
                || normalized.some((permission) => current.includes(permission))
            ) {
                next();
                return;
            }
            fail(res, '没有权限访问该资源', 403);
        };
    }

    function getExitRulesSnapshot() {
        return {
            enabled: true,
            under_1_year_min_days: 60,
            under_1_year_max_days: 90,
            over_1_year_min_days: 45,
            over_1_year_max_days: 60,
            refund_scope: '仅退本人后台账户余额（货款余额+佣金余额），不含利息及其他费用',
            auto_revoke_identity: true,
            ...getConfigValue('agent_system_exit-rules', {})
        };
    }

    function getExitRefundPreview(user, commissions = []) {
        const walletRaw = Math.max(0, toNumber(user?.agent_wallet_balance ?? user?.wallet_balance, 0));
        const hasSeparateCommissionBalance = user?.commission_balance != null || (
            user?.balance != null
            && user?.wallet_balance != null
            && toNumber(user.balance, 0) !== toNumber(user.wallet_balance, 0)
        );
        const balanceRaw = hasSeparateCommissionBalance
            ? Math.max(0, toNumber(user?.commission_balance ?? user?.balance, 0))
            : 0;
        const pendingCommission = commissions
            .filter((row) => ['pending', 'frozen', 'pending_approval', 'approved'].includes(pickString(row.status)))
            .reduce((sum, row) => sum + toNumber(row.amount, 0), 0);

        return {
            walletRefund: Number(walletRaw.toFixed(2)),
            balanceRefund: Number(balanceRaw.toFixed(2)),
            pendingCommission: Number(pendingCommission.toFixed(2)),
            refundAmount: Number((walletRaw + balanceRaw).toFixed(2))
        };
    }

    function getUserRef(user = {}) {
        return user?.openid || user?.id || user?._id || user?._legacy_id || null;
    }

    function buildExitApplicationResponse(row, users, commissions) {
        const user = findByLookup(users, row.user_id, (item) => [item.openid, item.member_no]);
        const userRef = getUserRef(user) || row.user_id;
        const ownedCommissions = commissions.filter((item) => rowMatchesLookup(item, userRef, [item.openid, item.user_id, item.receiver_openid, item.beneficiary_openid]));
        return {
            ...row,
            ...getExitRefundPreview(user, ownedCommissions),
            user: user ? {
                id: user.id || user._id || user._legacy_id || '',
                openid: user.openid || '',
                nickname: pickString(user.nickname || user.nickName || user.nick_name || ''),
                role_level: toNumber(user.role_level ?? user.distributor_level, 0)
            } : null
        };
    }

    function applyExitSettlement(row, deps) {
        const { users, commissions, walletLogs } = deps;
        const userIndex = users.findIndex((item) => rowMatchesLookup(item, row.user_id, [item.openid, item.member_no]));
        if (userIndex === -1) throw new Error('用户不存在');

        const user = users[userIndex];
        const exitRules = getExitRulesSnapshot();
        const userRef = getUserRef(user);
        const ownedCommissions = commissions.filter((item) => rowMatchesLookup(item, userRef, [item.openid, item.user_id, item.receiver_openid, item.beneficiary_openid]));
        const preview = getExitRefundPreview(user, ownedCommissions);

        users[userIndex] = {
            ...user,
            agent_wallet_balance: 0,
            wallet_balance: 0,
            commission_balance: 0,
            balance: 0,
            role_level: exitRules.auto_revoke_identity === false ? user.role_level : 0,
            role_name: exitRules.auto_revoke_identity === false ? user.role_name : '普通用户',
            distributor_level: exitRules.auto_revoke_identity === false ? user.distributor_level : 0,
            agent_level: exitRules.auto_revoke_identity === false ? user.agent_level : 0,
            participate_distribution: exitRules.auto_revoke_identity === false ? user.participate_distribution : 0,
            discount_rate: exitRules.auto_revoke_identity === false ? user.discount_rate : 1,
            updated_at: nowIso()
        };

        commissions.forEach((item, index) => {
            if (!rowMatchesLookup(item, userRef, [item.openid, item.user_id, item.receiver_openid, item.beneficiary_openid])) return;
            if (!['pending', 'frozen', 'pending_approval', 'approved'].includes(pickString(item.status))) return;
            commissions[index] = {
                ...item,
                status: 'cancelled',
                cancelled_at: nowIso(),
                cancel_reason: '合伙人退出，未结佣金作废',
                updated_at: nowIso()
            };
        });

        if (preview.walletRefund > 0) {
            walletLogs.push({
                id: nextId(walletLogs),
                openid: user.openid || '',
                user_id: user.id || user._id || row.user_id,
                type: 'exit_wallet_refund',
                amount: -preview.walletRefund,
                description: `合伙人退出退款（货款）`,
                created_at: nowIso()
            });
        }
        if (preview.balanceRefund > 0) {
            walletLogs.push({
                id: nextId(walletLogs),
                openid: user.openid || '',
                user_id: user.id || user._id || row.user_id,
                type: 'exit_commission_refund',
                amount: -preview.balanceRefund,
                description: `合伙人退出退款（佣金）`,
                created_at: nowIso()
            });
        }

        return preview;
    }

    function normalizeActivityLinksConfig(rawValue) {
        const value = rawValue && typeof rawValue === 'object' ? rawValue : {};
        const banners = Array.isArray(value.banners)
            ? value.banners
            : (Array.isArray(value.carousel) ? value.carousel : []);
        const permanent = Array.isArray(value.permanent)
            ? value.permanent
            : (Array.isArray(value.primary) ? value.primary : []);
        const limited = Array.isArray(value.limited)
            ? value.limited
            : (Array.isArray(value.secondary) ? value.secondary : []);
        const brandNews = Array.isArray(value.brand_news)
            ? value.brand_news
            : (Array.isArray(value.posters) ? value.posters : []);
        return {
            permanent_section_enabled: value.permanent_section_enabled !== false,
            activity_sections_order: value.activity_sections_order === 'limited_first' ? 'limited_first' : 'permanent_first',
            brand_news_section_title: pickString(value.brand_news_section_title || '品牌动态'),
            banners,
            permanent,
            limited,
            brand_news: brandNews
        };
    }

    function parseCoordinate(value) {
        if (value === '' || value == null) return null;
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
    }

    function stationFullAddress(station = {}) {
        return [
            pickString(station.province),
            pickString(station.city),
            pickString(station.district),
            pickString(station.address)
        ].filter(Boolean).join('');
    }

    function getUserReferrer(user = {}) {
        return user.referrer_openid
            || user.parent_openid
            || user.parent_id
            || user.referrer_id
            || user.inviter_openid
            || user.inviter_id
            || null;
    }

    function getDirectMembers(user, users) {
        if (!user) return [];
        return users.filter((item) => rowMatchesLookup(item, getUserReferrer(item), [user.openid, user.id, user._id, user._legacy_id]));
    }

    function getAllDescendants(user, users) {
        const result = [];
        const queue = getDirectMembers(user, users);
        const seen = new Set();
        while (queue.length) {
            const current = queue.shift();
            const key = String(current.openid || current.id || current._id || '');
            if (!key || seen.has(key)) continue;
            seen.add(key);
            result.push(current);
            queue.push(...getDirectMembers(current, users));
        }
        return result;
    }

    function sortDividendCandidates(list = [], metricKey = 'teamSales') {
        return [...list].sort((a, b) => {
            const diff = toNumber(b?.[metricKey], 0) - toNumber(a?.[metricKey], 0);
            if (diff !== 0) return diff;
            return String(a?.openid || a?.id || '').localeCompare(String(b?.openid || b?.id || ''));
        });
    }

    function buildDividendPreviewRows(users, rules, totalPool) {
        const rows = [];
        let displayRank = 1;
        const now = Date.now();

        // min_months：代理人在该等级上存续满 N 个月才有资格参与分红
        const minMonths = toNumber(rules?.min_months, 0);
        function meetsMinMonths(user) {
            if (minMonths <= 0) return true;
            const upgradedAt = user.role_upgraded_at || user.created_at;
            if (!upgradedAt) return false;
            const ts = typeof upgradedAt === 'object' && upgradedAt._seconds
                ? upgradedAt._seconds * 1000
                : new Date(upgradedAt).getTime();
            if (!ts || isNaN(ts)) return false;
            const monthsPassed = (now - ts) / (1000 * 60 * 60 * 24 * 30.44);
            return monthsPassed >= minMonths;
        }

        const teamCandidates = sortDividendCandidates(
            users
                .filter((user) => toNumber(user.role_level ?? user.distributor_level, 0) >= 4)
                .filter(meetsMinMonths)
                .map((user) => ({
                    ...user,
                    teamSales: getAllDescendants(user, users).reduce((sum, item) => sum + toNumber(item.total_spent, 0), 0)
                }))
                .filter((user) => user.teamSales > 0),
            'teamSales'
        );
        const personalCandidates = sortDividendCandidates(
            users
                .filter((user) => toNumber(user.role_level ?? user.distributor_level, 0) === 3)
                .filter(meetsMinMonths)
                .map((user) => ({
                    ...user,
                    teamSales: toNumber(user.total_spent, 0)
                }))
                .filter((user) => user.teamSales > 0),
            'teamSales'
        );

        const buildRowsForAward = (awardKey, awardLabel, candidates, ranks = []) => {
            let offset = 0;
            for (const rank of ranks) {
                const count = Math.max(1, Math.floor(toNumber(rank.count, 1)));
                const pct = Math.max(0, toNumber(rank.pct, 0));
                if (!count || pct <= 0) continue;
                const bucket = candidates.slice(offset, offset + count);
                offset += count;
                // pct 是本名次组占总分红池的百分比，每人平分
                const perPersonAmount = Number((totalPool * pct / 100 / count).toFixed(2));
                bucket.forEach((user) => {
                    rows.push({
                        awardKey,
                        awardLabel,
                        rank: displayRank++,
                        userId: user.id || user._id || user._legacy_id,
                        openid: user.openid,
                        nick_name: user.nickName || user.nickname || user.nick_name || '',
                        nickname: user.nickname || user.nickName || user.nick_name || '',
                        roleLevel: toNumber(user.role_level ?? user.distributor_level, 0),
                        teamSales: Number(toNumber(user.teamSales, 0).toFixed(2)),
                        sharePercent: Number((pct / count).toFixed(4)),
                        dividendAmount: perPersonAmount,
                        rankLabel: pickString(rank.label || `${awardLabel}${displayRank}`)
                    });
                });
            }
        };

        if (rules?.b_team_award?.enabled) {
            buildRowsForAward('b_team_award', 'B团队奖', teamCandidates, toArray(rules.b_team_award.ranks));
        }
        if (rules?.b1_personal_award?.enabled) {
            buildRowsForAward('b1_personal_award', 'B1个人奖', personalCandidates, toArray(rules.b1_personal_award.ranks));
        }

        return rows;
    }

    function geocodeAddress(fullAddress) {
        const address = pickString(fullAddress).trim();
        if (!address) {
            return Promise.resolve({ location: null, configured: !!pickString(process.env.TENCENT_MAP_KEY).trim(), error: '' });
        }
        return requestTencentMapService('/ws/geocoder/v1/', { address })
            .then((result) => {
                if (!result.configured) return { location: null, configured: false, error: '' };
                const location = result.payload?.result?.location;
                const lat = Number(location?.lat);
                const lng = Number(location?.lng);
                if (result.payload?.status === 0 && Number.isFinite(lat) && Number.isFinite(lng)) {
                    return { location: { latitude: lat, longitude: lng }, configured: true, error: '' };
                }
                return {
                    location: null,
                    configured: true,
                    error: pickString(result.payload?.message || result.error || '地址解析失败')
                };
            });
    }

    function requestTencentMapService(pathname, params = {}) {
        const key = pickString(process.env.TENCENT_MAP_KEY).trim();
        if (!key) {
            return Promise.resolve({ configured: false, payload: null, error: '' });
        }

        const searchParams = new URLSearchParams();
        Object.entries({ ...params, key }).forEach(([paramKey, value]) => {
            if (value === undefined || value === null) return;
            const text = String(value).trim();
            if (!text) return;
            searchParams.append(paramKey, text);
        });

        const path = `${pathname}?${searchParams.toString()}`;
        return new Promise((resolve) => {
            const req = https.request({
                hostname: 'apis.map.qq.com',
                path,
                method: 'GET',
                timeout: 10000,
                headers: { 'User-Agent': 'cloud-mp-admin-api/1.0' }
            }, (resp) => {
                let body = '';
                resp.on('data', (chunk) => { body += chunk; });
                resp.on('end', () => {
                    try {
                        const parsed = JSON.parse(body);
                        resolve({ configured: true, payload: parsed, error: '' });
                        return;
                    } catch (_) {
                        // Ignore upstream parse errors and let callers decide the UX fallback.
                    }
                    resolve({ configured: true, payload: null, error: '地图接口返回异常' });
                });
            });
            req.on('error', () => resolve({ configured: true, payload: null, error: '地图接口请求失败' }));
            req.on('timeout', () => {
                req.destroy();
                resolve({ configured: true, payload: null, error: '地图接口请求超时' });
            });
            req.end();
        });
    }

    async function reverseGeocodeCoordinate(latitude, longitude) {
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return { detail: null, configured: !!pickString(process.env.TENCENT_MAP_KEY).trim(), error: '' };
        }
        const result = await requestTencentMapService('/ws/geocoder/v1/', {
            location: `${latitude},${longitude}`
        });
        if (!result.configured) return { detail: null, configured: false, error: '' };
        const payload = result.payload;
        const addressComponent = payload?.result?.address_component || {};
        const formattedAddress = payload?.result?.formatted_addresses?.recommend || payload?.result?.address || '';
        if (payload?.status === 0 && payload?.result) {
            return {
                detail: {
                    province: pickString(addressComponent.province),
                    city: pickString(addressComponent.city),
                    district: pickString(addressComponent.district),
                    address: pickString(formattedAddress)
                },
                configured: true,
                error: ''
            };
        }
        return {
            detail: null,
            configured: true,
            error: pickString(payload?.message || result.error || '逆地理解析失败')
        };
    }

    async function placeSearch(keyword, options = {}) {
        const normalizedKeyword = pickString(keyword).trim();
        if (!normalizedKeyword) {
            return { place: null, configured: !!pickString(process.env.TENCENT_MAP_KEY).trim(), error: '' };
        }

        let boundary = 'nearby(31.29834,120.58531,500000)';
        const latitude = Number(options.latitude);
        const longitude = Number(options.longitude);
        const region = [options.province, options.city]
            .map((item) => pickString(item).trim())
            .filter(Boolean)
            .join('');
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
            boundary = `nearby(${latitude},${longitude},80000)`;
        } else if (region) {
            boundary = `region(${region},0)`;
        }

        const result = await requestTencentMapService('/ws/place/v1/search', {
            keyword: normalizedKeyword,
            boundary,
            page_size: 10,
            page_index: 1
        });
        if (!result.configured) return { place: null, configured: false, error: '' };
        const payload = result.payload;
        const first = Array.isArray(payload?.data) ? payload.data[0] : null;
        const latitudeValue = Number(first?.location?.lat);
        const longitudeValue = Number(first?.location?.lng);
        if (payload?.status === 0 && first && Number.isFinite(latitudeValue) && Number.isFinite(longitudeValue)) {
            return {
                place: {
                    latitude: latitudeValue,
                    longitude: longitudeValue,
                    title: pickString(first.title || normalizedKeyword),
                    address: pickString(first.address)
                },
                configured: true,
                error: ''
            };
        }
        if (payload?.status === 0) {
            return { place: null, configured: true, error: '' };
        }
        return {
            place: null,
            configured: true,
            error: pickString(payload?.message || result.error || '地点搜索失败')
        };
    }

    async function normalizeStationPayload(body = {}, existing = {}) {
        const payload = {
            ...existing,
            ...body,
            status: body.status || existing.status || 'active',
            is_pickup_point: toBoolean(body.is_pickup_point ?? existing.is_pickup_point ?? 1) ? 1 : 0,
            longitude: parseCoordinate(body.longitude ?? existing.longitude),
            latitude: parseCoordinate(body.latitude ?? existing.latitude),
            updated_at: nowIso()
        };

        if (payload.latitude != null && payload.longitude != null) {
            return { payload, geocodeNote: '' };
        }

        const fullAddress = stationFullAddress(payload);
        if (!fullAddress) {
            return { payload, geocodeNote: '未填写完整地址，已保存但未生成地图坐标' };
        }

        const result = await geocodeAddress(fullAddress);
        if (result.location) {
            return {
                payload: {
                    ...payload,
                    latitude: result.location.latitude,
                    longitude: result.location.longitude
                },
                geocodeNote: '已按地址自动解析经纬度'
            };
        }

        return {
            payload,
            geocodeNote: result.configured
                ? `地址解析失败${result.error ? `：${result.error}` : ''}，已保存地址；请在地图选点中手动选择坐标`
                : '未配置地图密钥，已保存地址但未生成经纬度'
        };
    }

    const mapPickerPermission = requireAnyPermission(['pickup_stations', 'dealers']);

    app.get('/admin/api/map/geocode', auth, mapPickerPermission, async (req, res) => {
        const address = pickString(req.query.address).trim();
        if (!address) return fail(res, '缺少 address 参数');

        const result = await geocodeAddress(address);
        if (result.location) {
            ok(res, result.location);
            return;
        }
        if (!result.configured) return fail(res, '服务端未配置 TENCENT_MAP_KEY，无法进行地址解析', 503);
        if (result.error) return fail(res, `地址解析失败：${result.error}`, 502);
        ok(res, null);
    });

    app.get('/admin/api/map/reverse-geocode', auth, mapPickerPermission, async (req, res) => {
        const latitude = Number(req.query.latitude);
        const longitude = Number(req.query.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return fail(res, '缺少有效的 latitude / longitude 参数');
        }

        const result = await reverseGeocodeCoordinate(latitude, longitude);
        if (result.detail) {
            ok(res, result.detail);
            return;
        }
        if (!result.configured) return fail(res, '服务端未配置 TENCENT_MAP_KEY，无法进行逆地理解析', 503);
        if (result.error) return fail(res, `逆地理解析失败：${result.error}`, 502);
        ok(res, null);
    });

    app.get('/admin/api/map/place-search', auth, mapPickerPermission, async (req, res) => {
        const keyword = pickString(req.query.keyword).trim();
        if (!keyword) return fail(res, '缺少 keyword 参数');

        const result = await placeSearch(keyword, req.query || {});
        if (result.place) {
            ok(res, result.place);
            return;
        }
        if (!result.configured) return fail(res, '服务端未配置 TENCENT_MAP_KEY，无法进行地点搜索', 503);
        if (result.error) return fail(res, `地点搜索失败：${result.error}`, 502);
        ok(res, null);
    });

    function crudCollection(options) {
        const {
            basePath,
            collection,
            permission,
            label,
            normalize = row => row,
            payload = (body, existing) => ({ ...existing, ...body, updated_at: nowIso() }),
            refreshCollections = [collection]
        } = options;

        app.get(`/admin/api/${basePath}`, auth, requirePermission(permission), async (req, res) => {
            await ensureFreshCollections(refreshCollections);
            let rows = sortByUpdatedDesc(getCollection(collection)).map(normalize);
            const keyword = pickString(req.query.keyword).trim().toLowerCase();
            if (keyword) rows = rows.filter((item) => `${item.name || item.title || item.description || ''}`.toLowerCase().includes(keyword));
            if (req.query.status !== undefined && req.query.status !== '') rows = rows.filter((item) => String(item.status ?? item.is_active) === String(req.query.status));
            ok(res, paginate(rows, req));
        });

        app.get(`/admin/api/${basePath}/:id`, auth, requirePermission(permission), async (req, res) => {
            await ensureFreshCollections(refreshCollections);
            const row = findByLookup(getCollection(collection), req.params.id);
            if (!row) return fail(res, `${label}不存在`, 404);
            ok(res, normalize(row));
        });

        app.post(`/admin/api/${basePath}`, auth, requirePermission(permission), async (req, res) => {
            await ensureFreshCollections(refreshCollections);
            const rows = getCollection(collection);
            const row = payload(req.body || {}, { id: nextId(rows), created_at: nowIso() });
            rows.push(row);
            saveCollection(collection, rows);
            createAuditLog(req.admin, `${collection}.create`, collection, { id: row.id || row._id });
            ok(res, normalize(row));
        });

        app.put(`/admin/api/${basePath}/:id`, auth, requirePermission(permission), async (req, res) => {
            await ensureFreshCollections(refreshCollections);
            const rows = getCollection(collection);
            const index = rows.findIndex((item) => rowMatchesLookup(item, req.params.id));
            if (index === -1) return fail(res, `${label}不存在`, 404);
            rows[index] = payload(req.body || {}, rows[index]);
            saveCollection(collection, rows);
            createAuditLog(req.admin, `${collection}.update`, collection, { id: req.params.id });
            ok(res, normalize(rows[index]));
        });

        app.delete(`/admin/api/${basePath}/:id`, auth, requirePermission(permission), async (req, res) => {
            await ensureFreshCollections(refreshCollections);
            const rows = getCollection(collection);
            const nextRows = rows.filter((item) => !rowMatchesLookup(item, req.params.id));
            if (rows.length === nextRows.length) return fail(res, `${label}不存在`, 404);
            saveCollection(collection, nextRows);
            createAuditLog(req.admin, `${collection}.delete`, collection, { id: req.params.id });
            ok(res, { success: true });
        });
    }

    function normalizeCoupon(row) {
        const type = pickString(row.type || row.coupon_type || 'fixed');
        const isActive = row.is_active != null ? row.is_active : row.status;
        return {
            ...row,
            id: row.id || row._legacy_id || row._id,
            name: pickString(row.name || row.title),
            type,
            coupon_type: type,
            value: toNumber(row.value ?? row.coupon_value ?? row.amount, 0),
            coupon_value: toNumber(row.coupon_value ?? row.value ?? row.amount, 0),
            min_purchase: toNumber(row.min_purchase ?? row.min_amount, 0),
            valid_days: Math.max(1, toNumber(row.valid_days, 30)),
            stock: row.stock == null ? -1 : toNumber(row.stock, -1),
            issued_count: toNumber(row.issued_count, 0),
            used_count: toNumber(row.used_count, 0),
            scope: pickString(row.scope || 'all'),
            scope_ids: toArray(row.scope_ids),
            is_active: toBoolean(isActive == null ? 1 : isActive) ? 1 : 0,
            status: toBoolean(isActive == null ? 1 : isActive) ? 1 : 0
        };
    }

    function normalizeCouponPayload(body = {}, existing = {}) {
        const type = pickString(body.type ?? body.coupon_type ?? existing.type ?? 'fixed');
        const value = toNumber(body.value ?? body.coupon_value ?? existing.value, 0);
        const minPurchase = type === 'no_threshold' ? 0 : toNumber(body.min_purchase ?? existing.min_purchase, 0);
        return {
            ...existing,
            ...body,
            type,
            coupon_type: type,
            value,
            coupon_value: value,
            min_purchase: minPurchase,
            valid_days: Math.max(1, toNumber(body.valid_days ?? existing.valid_days, 30)),
            stock: body.stock == null ? (existing.stock == null ? -1 : toNumber(existing.stock, -1)) : toNumber(body.stock, -1),
            scope: pickString(body.scope ?? existing.scope ?? 'all'),
            scope_ids: toArray(body.scope_ids ?? existing.scope_ids),
            is_active: toBoolean(body.is_active ?? existing.is_active ?? existing.status ?? 1) ? 1 : 0,
            status: toBoolean(body.is_active ?? existing.is_active ?? existing.status ?? 1) ? 1 : 0,
            updated_at: nowIso()
        };
    }

    function normalizeLinkedProduct(product) {
        if (!product) return null;
        return {
            ...product,
            id: product.id || product._legacy_id || product._id,
            images: toArray(product.images).map(assetUrl),
            image_url: assetUrl(product.image_url || product.cover_image || product.image || toArray(product.images)[0] || ''),
            retail_price: toNumber(product.retail_price ?? product.price, 0)
        };
    }

    function buildActivityName(row, product, fallbackLabel) {
        const explicitName = pickString(row.name || row.title).trim();
        if (explicitName) return explicitName;
        const productName = pickString(product?.name).trim();
        if (productName) return `${productName}${fallbackLabel}`;
        return fallbackLabel;
    }

    function normalizeMarketingActivity(row, products, options = {}) {
        const {
            fallbackLabel,
            priceKeys = [],
            defaultPrice = 0,
            countKey = 'sold_count',
            stockKey = 'stock_limit'
        } = options;
        const product = normalizeLinkedProduct(findByLookup(products, row.product_id));
        const resolvedPrice = priceKeys
            .map((key) => row[key])
            .find((value) => value !== undefined && value !== null && value !== '');
        return {
            ...row,
            id: row.id || row._legacy_id || row._id,
            name: buildActivityName(row, product, fallbackLabel),
            title: buildActivityName(row, product, fallbackLabel),
            product_id: row.product_id,
            product,
            product_name: pickString(product?.name || ''),
            product_image: pickString(product?.image_url || product?.images?.[0] || ''),
            status: toBoolean(row.status) ? 1 : 0,
            sold_count: toNumber(row[countKey], 0),
            stock_limit: Math.max(0, toNumber(row[stockKey], 0)),
            display_price: toNumber(resolvedPrice, defaultPrice)
        };
    }

    function defaultPrizeVisual(row = {}) {
        const type = pickString(row.type || 'miss').trim() || 'miss';
        const presets = {
            miss: {
                emoji: '🍀',
                badge: '好运签',
                theme: '#6B7280',
                accent: '#D1D5DB'
            },
            points: {
                emoji: '⭐',
                badge: '积分奖',
                theme: '#2563EB',
                accent: '#93C5FD'
            },
            coupon: {
                emoji: '🎫',
                badge: '优惠券',
                theme: '#10B981',
                accent: '#6EE7B7'
            },
            physical: {
                emoji: '🎁',
                badge: '实物奖',
                theme: '#F59E0B',
                accent: '#FDE68A'
            }
        };
        return presets[type] || presets.miss;
    }

    function buildPrizeImageDataUri(row = {}) {
        const visual = defaultPrizeVisual(row);
        const title = pickString(row.name || visual.badge || '奖品').slice(0, 10);
        const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${visual.theme}"/>
      <stop offset="100%" stop-color="${visual.accent}"/>
    </linearGradient>
  </defs>
  <rect width="160" height="160" rx="28" fill="url(#g)"/>
  <circle cx="80" cy="58" r="34" fill="rgba(255,255,255,0.18)"/>
  <text x="80" y="72" text-anchor="middle" font-size="34" font-family="Apple Color Emoji, Segoe UI Emoji, sans-serif">${visual.emoji}</text>
  <text x="80" y="118" text-anchor="middle" font-size="16" font-family="PingFang SC, Microsoft YaHei, sans-serif" fill="#ffffff">${title}</text>
</svg>`;
        return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    }

    function patchCollectionFlag(collection, id, patch) {
        const rows = getCollection(collection);
        const index = rows.findIndex((item) => rowMatchesLookup(item, id));
        if (index === -1) return null;
        rows[index] = {
            ...rows[index],
            ...patch,
            updated_at: nowIso()
        };
        saveCollection(collection, rows);
        return rows[index];
    }

    app.get('/admin/api/coupons', auth, requirePermission('products'), (req, res) => {
        const rawRows = getCollection('coupons');
        // 自愈：对 CloudBase 直接创建（无数字 id 只有 UUID _id）的优惠券，补写自增数字 id
        const maxNumericId = rawRows.reduce((max, r) => {
            const n = Number(r.id);
            return Number.isFinite(n) ? Math.max(max, n) : max;
        }, 0);
        let patchCounter = maxNumericId;
        for (const r of rawRows) {
            const hasNumericId = Number.isFinite(Number(r.id)) && r.id != null && r.id !== '';
            if (!hasNumericId) {
                patchCounter += 1;
                r.id = patchCounter;
                // 异步回写到 CloudBase（不阻塞响应）
                if (r._id) {
                    directPatchDocument('coupons', String(r._id), { id: patchCounter }).catch(() => {});
                }
            }
        }
        let rows = sortByUpdatedDesc(rawRows).map(normalizeCoupon);
        const keyword = pickString(req.query.keyword).trim().toLowerCase();
        const status = pickString(req.query.status).trim();
        if (keyword) rows = rows.filter((item) => `${item.name} ${item.description || ''}`.toLowerCase().includes(keyword));
        if (status !== '') rows = rows.filter((item) => String(item.is_active) === status || String(item.status) === status);
        ok(res, paginate(rows, req));
    });

    app.get('/admin/api/coupons/:id', auth, requirePermission('products'), (req, res) => {
        const row = findByLookup(getCollection('coupons'), req.params.id);
        if (!row) return fail(res, '优惠券不存在', 404);
        ok(res, normalizeCoupon(row));
    });

    app.get('/admin/api/coupons/:id/wxacode', auth, requirePermission('products'), async (req, res) => {
        const coupon = findByLookup(getCollection('coupons'), req.params.id);
        if (!coupon) return fail(res, '优惠券不存在', 404);

        const couponId = coupon.id || coupon._legacy_id || coupon._id || req.params.id;
        const envVersion = normalizeEnvVersion(req.query.env || req.query.env_version);

        let payload;
        try {
            payload = await generateCouponWxacode({ couponId, envVersion });
        } catch (error) {
            payload = buildCouponWxacodeFallback({
                couponId,
                envVersion,
                error: error?.message || 'wxacode_failed'
            });
        }

        if (payload?.error) {
            console.warn('[coupon.wxacode] 生成失败:', payload.error);
        }

        ok(res, payload);
    });

    app.post('/admin/api/coupons', auth, requirePermission('products'), (req, res) => {
        const rows = getCollection('coupons');
        const row = normalizeCouponPayload(req.body, {
            id: nextId(rows),
            issued_count: 0,
            used_count: 0,
            created_at: nowIso()
        });
        if (!pickString(row.name).trim()) return fail(res, '优惠券名称不能为空');
        rows.push(row);
        saveCollection('coupons', rows);
        createAuditLog(req.admin, 'coupon.create', 'coupons', { coupon_id: row.id, name: row.name });
        ok(res, normalizeCoupon(row));
    });

    app.put('/admin/api/coupons/:id', auth, requirePermission('products'), (req, res) => {
        const rows = getCollection('coupons');
        const index = rows.findIndex((item) => rowMatchesLookup(item, req.params.id));
        if (index === -1) return fail(res, '优惠券不存在', 404);
        rows[index] = normalizeCouponPayload(req.body, rows[index]);
        saveCollection('coupons', rows);
        createAuditLog(req.admin, 'coupon.update', 'coupons', { coupon_id: rows[index].id || rows[index]._id });
        ok(res, normalizeCoupon(rows[index]));
    });

    app.delete('/admin/api/coupons/:id', auth, requirePermission('products'), (req, res) => {
        const rows = getCollection('coupons');
        const nextRows = rows.filter((item) => !rowMatchesLookup(item, req.params.id));
        if (rows.length === nextRows.length) return fail(res, '优惠券不存在', 404);
        saveCollection('coupons', nextRows);
        createAuditLog(req.admin, 'coupon.delete', 'coupons', { coupon_id: req.params.id });
        ok(res, { success: true });
    });

    function updateCouponStatus(req, res) {
        const row = patchCollectionFlag('coupons', req.params.id, {
            is_active: toBoolean(req.body?.status ?? req.body?.is_active ?? req.body?.enabled ?? req.body?.value ?? 1) ? 1 : 0,
            status: toBoolean(req.body?.status ?? req.body?.is_active ?? req.body?.enabled ?? req.body?.value ?? 1) ? 1 : 0
        });
        if (!row) return fail(res, '优惠券不存在', 404);
        createAuditLog(req.admin, 'coupon.status', 'coupons', { coupon_id: req.params.id, status: row.status });
        ok(res, normalizeCoupon(row));
    }

    app.put('/admin/api/coupons/:id/status', auth, requirePermission('products'), updateCouponStatus);
    app.post('/admin/api/coupons/:id/status', auth, requirePermission('products'), updateCouponStatus);
    app.put('/admin/api/coupons/:id/toggle', auth, requirePermission('products'), updateCouponStatus);
    app.post('/admin/api/coupons/:id/toggle', auth, requirePermission('products'), updateCouponStatus);

    // 通用：解析发券目标用户列表（dry_run=true 时不实际发放，只返回目标用户摘要）
    function resolveIssueTargets(body, users) {
        const userIds = toArray(body?.user_ids).map(String);
        const roleLevels = toArray(body?.role_levels ?? body?.roleLevels).map((item) => Number(item));
        return users.filter((user) => {
            const userIdMatch = userIds.length > 0 && userIds.some((id) => rowMatchesLookup(user, id, [user.openid, user.member_no]));
            const level = toNumber(user.role_level ?? user.distributor_level ?? user.level, 0);
            const levelMatch = roleLevels.length > 0 && roleLevels.includes(level);
            return userIdMatch || levelMatch;
        });
    }

    function formatUserPreview(user) {
        return {
            id: user.id || user._legacy_id || user._id,
            nickname: pickString(user.nickname || user.nickName || user.name || '未知用户'),
            member_no: pickString(user.member_no || ''),
            role_level: toNumber(user.role_level ?? user.distributor_level ?? user.level, 0),
            phone: pickString(user.phone || user.mobile || '').replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
        };
    }

    app.post('/admin/api/coupons/:id/issue', auth, requirePermission('products'), (req, res) => {
        const coupons = getCollection('coupons');
        const coupon = findByLookup(coupons, req.params.id);
        if (!coupon) return fail(res, '优惠券不存在', 404);

        const users = getCollection('users');
        const targets = resolveIssueTargets(req.body, users);

        // dry_run=true：仅返回目标用户预览，不实际发放
        const isDryRun = req.query.dry_run === 'true' || req.body?.dry_run === true;
        if (isDryRun) {
            const PREVIEW_LIMIT = 100;
            return ok(res, {
                count: targets.length,
                preview: targets.slice(0, PREVIEW_LIMIT).map(formatUserPreview),
                truncated: targets.length > PREVIEW_LIMIT
            });
        }

        const userCoupons = getCollection('user_coupons');
        let issued = 0;
        const couponId = coupon.id || coupon._legacy_id || coupon._id;
        const expiresAt = new Date(Date.now() + Math.max(1, toNumber(coupon.valid_days, 30)) * 24 * 60 * 60 * 1000).toISOString();
        for (const user of targets) {
            const openid = user.openid;
            if (!openid) continue;
            const exists = userCoupons.some((item) => String(item.openid) === String(openid)
                && String(item.coupon_id) === String(couponId)
                && ['unused', 'pending'].includes(pickString(item.status || 'unused')));
            if (exists) continue;
            userCoupons.push({
                id: nextId(userCoupons),
                openid,
                user_id: user.id || user._legacy_id || user._id || openid,
                coupon_id: couponId,
                coupon_name: coupon.name,
                coupon_type: coupon.type || coupon.coupon_type || 'fixed',
                coupon_value: toNumber(coupon.value ?? coupon.coupon_value, 0),
                min_purchase: toNumber(coupon.min_purchase, 0),
                status: 'unused',
                issued_at: nowIso(),
                expires_at: expiresAt,
                created_at: nowIso(),
                updated_at: nowIso()
            });
            issued += 1;
        }
        saveCollection('user_coupons', userCoupons);
        saveCollection('coupons', coupons.map((item) => rowMatchesLookup(item, req.params.id)
            ? { ...item, issued_count: toNumber(item.issued_count, 0) + issued, updated_at: nowIso() }
            : item));
        createAuditLog(req.admin, 'coupon.issue', 'coupons', { coupon_id: couponId, issued });
        ok(res, { success: true, issued, skipped: targets.length - issued, message: `已发放 ${issued} 张优惠券` });
    });

    app.get('/admin/api/coupon-auto-rules', auth, requirePermission('products'), (_req, res) => {
        ok(res, getCollection('coupon_auto_rules'));
    });

    app.put('/admin/api/coupon-auto-rules', auth, requirePermission('products'), (req, res) => {
        const rules = toArray(req.body?.rules).map((item, index) => ({
            id: item.id || index + 1,
            trigger_event: pickString(item.trigger_event || 'register'),
            enabled: toBoolean(item.enabled),
            coupon_id: item.coupon_id || null,
            target_levels: toArray(item.target_levels).map((level) => Number(level)),
            updated_at: nowIso()
        }));
        saveCollection('coupon_auto_rules', rules);
        createAuditLog(req.admin, 'coupon.auto_rules.update', 'coupon_auto_rules', { count: rules.length });
        ok(res, rules);
    });

    function normalizeGroup(row, products) {
        const normalized = normalizeMarketingActivity(row, products, {
            fallbackLabel: '拼团活动',
            priceKeys: ['group_price', 'price'],
            defaultPrice: 0
        });
        const requiredMembers = toNumber(row.required_members ?? row.min_members ?? row.group_size, 2);
        return {
            ...normalized,
            group_price: toNumber(row.group_price ?? row.price, 0),
            required_members: requiredMembers,
            min_members: requiredMembers,
            expire_hours: Math.max(1, toNumber(row.expire_hours, 24)),
            stock_limit: Math.max(0, toNumber(row.stock_limit ?? row.stock, normalized.stock_limit)),
            sold_count: toNumber(row.sold_count, normalized.sold_count)
        };
    }

    function normalizeGroupPayload(body = {}, existing = {}) {
        const requiredMembers = toNumber(body.required_members ?? body.min_members ?? existing.required_members ?? existing.min_members, 2);
        return {
            ...existing,
            ...body,
            name: pickString(body.name ?? existing.name),
            product_id: body.product_id ?? existing.product_id,
            group_price: toNumber(body.group_price ?? existing.group_price, 0),
            required_members: Math.max(2, requiredMembers),
            min_members: Math.max(2, requiredMembers),
            expire_hours: Math.max(1, toNumber(body.expire_hours ?? existing.expire_hours, 24)),
            stock_limit: Math.max(0, toNumber(body.stock_limit ?? existing.stock_limit, 0)),
            status: toBoolean(body.status ?? existing.status ?? 1) ? 1 : 0,
            updated_at: nowIso()
        };
    }

    app.get('/admin/api/group-buys', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['group_activities', 'products']);
        const products = getCollection('products');
        let rows = sortByUpdatedDesc(getCollection('group_activities')).map((item) => normalizeGroup(item, products));
        const keyword = pickString(req.query.keyword).trim().toLowerCase();
        const status = pickString(req.query.status).trim();
        if (keyword) rows = rows.filter((item) => `${item.name} ${item.product?.name || ''}`.toLowerCase().includes(keyword));
        if (status !== '') rows = rows.filter((item) => String(item.status) === status);
        ok(res, paginate(rows, req));
    });

    app.get('/admin/api/group-buys/:id', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['group_activities', 'products']);
        const row = findByLookup(getCollection('group_activities'), req.params.id);
        if (!row) return fail(res, '拼团活动不存在', 404);
        ok(res, normalizeGroup(row, getCollection('products')));
    });

    app.post('/admin/api/group-buys', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['group_activities', 'products']);
        const products = getCollection('products');
        if (!findByLookup(products, req.body?.product_id)) return fail(res, '关联商品不存在或未同步', 404);
        const rows = getCollection('group_activities');
        const row = normalizeGroupPayload(req.body, {
            id: nextId(rows),
            sold_count: 0,
            created_at: nowIso()
        });
        if (!pickString(row.name).trim()) return fail(res, '活动名称不能为空');
        rows.push(row);
        saveCollection('group_activities', rows);
        createAuditLog(req.admin, 'group_buy.create', 'group_activities', { group_id: row.id, name: row.name });
        ok(res, normalizeGroup(row, products));
    });

    app.put('/admin/api/group-buys/:id', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['group_activities', 'products']);
        const rows = getCollection('group_activities');
        const index = rows.findIndex((item) => rowMatchesLookup(item, req.params.id));
        if (index === -1) return fail(res, '拼团活动不存在', 404);
        if (req.body?.product_id && !findByLookup(getCollection('products'), req.body.product_id)) {
            return fail(res, '关联商品不存在或未同步', 404);
        }
        rows[index] = normalizeGroupPayload(req.body, rows[index]);
        saveCollection('group_activities', rows);
        createAuditLog(req.admin, 'group_buy.update', 'group_activities', { group_id: rows[index].id || rows[index]._id });
        ok(res, normalizeGroup(rows[index], getCollection('products')));
    });

    app.delete('/admin/api/group-buys/:id', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['group_activities']);
        const rows = getCollection('group_activities');
        const nextRows = rows.filter((item) => !rowMatchesLookup(item, req.params.id));
        if (rows.length === nextRows.length) return fail(res, '拼团活动不存在', 404);
        saveCollection('group_activities', nextRows);
        createAuditLog(req.admin, 'group_buy.delete', 'group_activities', { group_id: req.params.id });
        ok(res, { success: true });
    });

    crudCollection({
        basePath: 'slash-activities',
        collection: 'slash_activities',
        permission: 'products',
        label: '砍价活动',
        refreshCollections: ['slash_activities', 'products'],
        normalize: row => ({
            ...normalizeMarketingActivity(row, getCollection('products'), {
                fallbackLabel: '砍价活动',
                priceKeys: ['floor_price', 'initial_price'],
                defaultPrice: 0
            }),
            initial_price: toNumber(row.initial_price, 0),
            floor_price: toNumber(row.floor_price, 0),
            min_slash_per_helper: toNumber(row.min_slash_per_helper, 0.1),
            max_slash_per_helper: toNumber(row.max_slash_per_helper, 5),
            max_helpers: Math.max(1, toNumber(row.max_helpers, 10)),
            expire_hours: Math.max(1, toNumber(row.expire_hours, 24)),
            stock_limit: Math.max(0, toNumber(row.stock_limit, 0))
        }),
        payload: (body, existing) => ({
            ...existing,
            ...body,
            status: toBoolean(body.status ?? existing.status ?? 1) ? 1 : 0,
            updated_at: nowIso()
        })
    });

    crudCollection({
        basePath: 'lottery-prizes',
        collection: 'lottery_prizes',
        permission: 'products',
        label: '抽奖奖品',
        refreshCollections: ['lottery_prizes'],
        normalize: row => {
            const visual = defaultPrizeVisual(row);
            const imageUrl = assetUrl(row.file_id || row.image_url || row.image || row.cover_image || '') || buildPrizeImageDataUri(row);
            const isActive = toBoolean(row.is_active ?? row.status ?? 1) ? 1 : 0;
            return {
                ...row,
                id: row.id || row._legacy_id || row._id,
                name: pickString(row.name || visual.badge || '未命名奖品'),
                file_id: pickString(row.file_id),
                image_url: imageUrl,
                image: imageUrl,
                cover_image: imageUrl,
                prize_value: toNumber(row.prize_value ?? row.value, 0),
                cost_points: Math.max(0, toNumber(row.cost_points, 1)),
                probability: toNumber(row.probability, 0),
                stock: row.stock == null ? -1 : toNumber(row.stock, -1),
                sort_order: toNumber(row.sort_order, 0),
                display_emoji: pickString(row.display_emoji || visual.emoji),
                badge_text: pickString(row.badge_text || visual.badge),
                theme_color: pickString(row.theme_color || visual.theme),
                accent_color: pickString(row.accent_color || visual.accent),
                is_active: isActive,
                status: isActive
            };
        },
        payload: (body, existing) => ({
            ...existing,
            ...body,
            is_active: toBoolean(body.is_active ?? body.status ?? existing.is_active ?? 1) ? 1 : 0,
            status: toBoolean(body.is_active ?? body.status ?? existing.status ?? 1) ? 1 : 0,
            updated_at: nowIso()
        })
    });

    function updateLotteryPrizeStatus(req, res) {
        const row = patchCollectionFlag('lottery_prizes', req.params.id, {
            is_active: toBoolean(req.body?.status ?? req.body?.is_active ?? req.body?.enabled ?? req.body?.value ?? 1) ? 1 : 0,
            status: toBoolean(req.body?.status ?? req.body?.is_active ?? req.body?.enabled ?? req.body?.value ?? 1) ? 1 : 0
        });
        if (!row) return fail(res, '抽奖奖品不存在', 404);
        createAuditLog(req.admin, 'lottery_prize.status', 'lottery_prizes', { prize_id: req.params.id, status: row.status });
        const imageUrl = assetUrl(row.file_id || row.image_url || row.image || row.cover_image || '');
        ok(res, {
            ...row,
            id: row.id || row._legacy_id || row._id,
            file_id: pickString(row.file_id),
            image_url: imageUrl,
            image: imageUrl,
            cover_image: imageUrl,
            is_active: toBoolean(row.is_active ?? row.status ?? 1) ? 1 : 0,
            status: toBoolean(row.is_active ?? row.status ?? 1) ? 1 : 0
        });
    }

    app.put('/admin/api/lottery-prizes/:id/status', auth, requirePermission('products'), updateLotteryPrizeStatus);
    app.post('/admin/api/lottery-prizes/:id/status', auth, requirePermission('products'), updateLotteryPrizeStatus);
    app.put('/admin/api/lottery-prizes/:id/toggle', auth, requirePermission('products'), updateLotteryPrizeStatus);
    app.post('/admin/api/lottery-prizes/:id/toggle', auth, requirePermission('products'), updateLotteryPrizeStatus);

    app.get('/admin/api/activity-options', auth, requirePermission('products'), async (_req, res) => {
        await ensureFreshCollections(['group_activities', 'slash_activities', 'lottery_prizes', 'products']);
        const products = getCollection('products');
        const groups = getCollection('group_activities')
            .map((item) => normalizeGroup(item, products))
            .map((item) => ({ key: `group:${item.id || item._id}`, type: 'group', value: item.id || item._id, title: item.name }));
        const slash = getCollection('slash_activities')
            .map((item) => normalizeMarketingActivity(item, products, {
                fallbackLabel: '砍价活动',
                priceKeys: ['floor_price', 'initial_price'],
                defaultPrice: 0
            }))
            .map((item) => ({ key: `slash:${item.id || item._id}`, type: 'slash', value: item.id || item._id, title: item.name }));
        const lottery = getCollection('lottery_prizes').map((item) => ({ key: `lottery:${item.id || item._id}`, type: 'lottery', value: item.id || item._id, title: item.name || '抽奖奖品' }));
        ok(res, [...groups, ...slash, ...lottery]);
    });

    app.get('/admin/api/festival-config', auth, requirePermission('products'), async (_req, res) => {
        await ensureFreshCollections(['configs']);
        ok(res, getConfigValue('festival_config', { active: false, name: '', theme: '', theme_colors: {}, tags: [], card_posters: [] }));
    });

    app.put('/admin/api/festival-config', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['configs']);
        ok(res, setConfigValue('festival_config', req.body || {}, 'marketing'));
    });

    app.get('/admin/api/global-ui-config', auth, requirePermission('products'), async (_req, res) => {
        await ensureFreshCollections(['configs']);
        ok(res, getConfigValue('global_ui_config', { enabled: false, theme: 'default' }));
    });

    app.put('/admin/api/global-ui-config', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['configs']);
        ok(res, setConfigValue('global_ui_config', req.body || {}, 'marketing'));
    });

    app.get('/admin/api/activity-links', auth, requirePermission('products'), async (_req, res) => {
        await ensureFreshCollections(['configs']);
        ok(res, normalizeActivityLinksConfig(getConfigValue('activity_links', null)));
    });

    app.put('/admin/api/activity-links', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['configs']);
        ok(res, setConfigValue('activity_links', normalizeActivityLinksConfig(req.body || {}), 'marketing'));
    });

    app.get('/admin/api/splash', auth, requirePermission('content'), (_req, res) => {
        ok(res, getConfigValue('splash_config', getCollection('splash_screens')[0] || { enabled: false }));
    });

    app.put('/admin/api/splash', auth, requirePermission('content'), (req, res) => {
        ok(res, setConfigValue('splash_config', req.body || {}, 'content'));
    });

    app.get('/admin/api/pickup-stations', auth, requirePermission('pickup_stations'), async (req, res) => {
        await ensureFreshCollections(['stations', 'station_staff', 'users']);
        const users = getCollection('users');
        const staffRows = getCollection('station_staff');
        let rows = sortByUpdatedDesc(getCollection('stations')).map((row) => ({
            ...row,
            id: row.id || row._legacy_id || row._id,
            is_pickup_point: toBoolean(row.is_pickup_point ?? row.pickup_enabled ?? 1) ? 1 : 0,
            status: row.status || 'active',
            claimant: findByLookup(users, row.claimant_id || row.claimant_openid) || null,
            staffMembers: staffRows.filter((staff) => rowMatchesLookup(row, staff.station_id))
        }));
        const keyword = pickString(req.query.keyword).trim().toLowerCase();
        if (keyword) rows = rows.filter((item) => `${item.name} ${item.address} ${item.city} ${item.contact_name}`.toLowerCase().includes(keyword));
        if (req.query.status) rows = rows.filter((item) => item.status === req.query.status);
        if (req.query.is_pickup_point !== undefined && req.query.is_pickup_point !== '') rows = rows.filter((item) => Number(item.is_pickup_point) === Number(req.query.is_pickup_point));
        ok(res, paginate(rows, req));
    });

    app.get('/admin/api/pickup-stations/:id', auth, requirePermission('pickup_stations'), async (req, res) => {
        await ensureFreshCollections(['stations', 'users']);
        const row = findByLookup(getCollection('stations'), req.params.id);
        if (!row) return fail(res, '自提门店不存在', 404);
        ok(res, {
            ...row,
            id: row.id || row._legacy_id || row._id,
            claimant: findByLookup(getCollection('users'), row.claimant_id || row.claimant_openid) || null
        });
    });

    app.post('/admin/api/pickup-stations', auth, requirePermission('pickup_stations'), async (req, res) => {
        await ensureFreshCollections(['stations']);
        const rows = getCollection('stations');
        const baseRow = {
            id: nextId(rows),
            created_at: nowIso(),
            ...req.body
        };
        const { payload: row, geocodeNote } = await normalizeStationPayload(req.body || {}, baseRow);
        rows.push(row);
        saveCollection('stations', rows);
        ok(res, { ...row, geocode_note: geocodeNote });
    });

    app.put('/admin/api/pickup-stations/:id', auth, requirePermission('pickup_stations'), async (req, res) => {
        await ensureFreshCollections(['stations']);
        const rows = getCollection('stations');
        const index = rows.findIndex((item) => rowMatchesLookup(item, req.params.id));
        if (index === -1) return fail(res, '自提门店不存在', 404);
        const { payload, geocodeNote } = await normalizeStationPayload(req.body || {}, rows[index]);
        rows[index] = payload;
        saveCollection('stations', rows);
        ok(res, { ...rows[index], geocode_note: geocodeNote });
    });

    app.get('/admin/api/pickup-stations/:id/staff', auth, requirePermission('pickup_stations'), async (req, res) => {
        await ensureFreshCollections(['stations', 'station_staff', 'users']);
        const station = findByLookup(getCollection('stations'), req.params.id);
        if (!station) return fail(res, '自提门店不存在', 404);
        const users = getCollection('users');
        const list = getCollection('station_staff')
            .filter((row) => rowMatchesLookup(row, req.params.id, [row.station_id]))
            .map((row) => ({
                ...row,
                id: row.id || row._id,
                user: findByLookup(users, row.user_id || row.openid, (user) => [user.openid, row.openid]) || null
            }));
        ok(res, { station_id: req.params.id, station_name: station.name, list });
    });

    app.post('/admin/api/pickup-stations/:id/staff', auth, requirePermission('pickup_stations'), async (req, res) => {
        await ensureFreshCollections(['stations', 'station_staff', 'users']);
        if (!findByLookup(getCollection('stations'), req.params.id)) return fail(res, '自提门店不存在', 404);
        const rows = getCollection('station_staff');
        const users = getCollection('users');
        const requestOpenid = pickString(req.body?.openid);
        const requestUserId = req.body?.user_id;
        const matchedUser = requestOpenid
            ? findByLookup(users, requestOpenid, (user) => [user.openid, user.member_no])
            : findByLookup(users, requestUserId, (user) => [user.openid, user.member_no]);
        const normalizedOpenid = pickString(requestOpenid || matchedUser?.openid);
        const normalizedUserId = requestUserId != null && requestUserId !== ''
            ? requestUserId
            : (matchedUser?.id || matchedUser?._legacy_id || matchedUser?._id || normalizedOpenid);
        const existingIndex = rows.findIndex((row) => {
            if (!rowMatchesLookup(row, req.params.id, [row.station_id])) return false;
            if (rowMatchesLookup(row, req.body?.id)) return true;
            if (normalizedOpenid && rowMatchesLookup(row, normalizedOpenid, [row.user_id, row.openid])) return true;
            return normalizedUserId != null && normalizedUserId !== ''
                ? rowMatchesLookup(row, normalizedUserId, [row.user_id, row.openid])
                : false;
        });
        const row = {
            ...(existingIndex === -1 ? { id: nextId(rows), created_at: nowIso() } : rows[existingIndex]),
            station_id: req.params.id,
            user_id: normalizedUserId,
            openid: pickString(normalizedOpenid || (existingIndex === -1 ? '' : rows[existingIndex].openid)),
            role: req.body?.role || 'staff',
            can_verify: toBoolean(req.body?.can_verify ?? 1) ? 1 : 0,
            status: req.body?.status || 'active',
            remark: req.body?.remark || '',
            updated_at: nowIso()
        };
        if (existingIndex === -1) rows.push(row);
        else rows[existingIndex] = row;
        saveCollection('station_staff', rows);
        ok(res, row);
    });

    app.delete('/admin/api/pickup-stations/:id/staff/:staffId', auth, requirePermission('pickup_stations'), async (req, res) => {
        await ensureFreshCollections(['station_staff']);
        const rows = getCollection('station_staff');
        const nextRows = rows.filter((row) => !(String(row.station_id) === String(req.params.id) && rowMatchesLookup(row, req.params.staffId)));
        if (rows.length === nextRows.length) return fail(res, '门店成员不存在', 404);
        saveCollection('station_staff', nextRows);
        ok(res, { success: true });
    });

    app.get('/admin/api/boards', auth, requirePermission('content'), (req, res) => {
        let rows = getCollection('content_boards');
        if (!rows.length) {
            rows = [{ id: 1, board_key: 'home.featuredProducts', name: '首页精选商品榜', created_at: nowIso(), updated_at: nowIso() }];
            saveCollection('content_boards', rows);
        }
        if (req.query.board_key) rows = rows.filter((row) => row.board_key === req.query.board_key);
        ok(res, rows.map((row) => ({ ...row, id: row.id || row._id })));
    });

    app.get('/admin/api/boards/:id/products', auth, requirePermission('content'), (req, res) => {
        const products = getCollection('products');
        const list = sortByUpdatedDesc(getCollection('content_board_products')
            .filter((row) => String(row.board_id) === String(req.params.id)))
            .sort((a, b) => toNumber(b.sort_order, 0) - toNumber(a.sort_order, 0))
            .map((row) => {
                const product = findByLookup(products, row.product_id);
                return {
                    ...row,
                    id: row.id || row._id,
                    is_active: row.is_active !== false,
                    product: product ? { ...product, cover_image: assetUrl(toArray(product.images)[0] || product.image || '') } : null
                };
            });
        ok(res, { list, total: list.length });
    });

    app.post('/admin/api/boards/:id/products', auth, requirePermission('content'), (req, res) => {
        const rows = getCollection('content_board_products');
        const productIds = toArray(req.body?.product_ids);
        let added = 0;
        productIds.forEach((productId) => {
            const exists = rows.some((row) => String(row.board_id) === String(req.params.id) && String(row.product_id) === String(productId));
            if (exists) return;
            rows.push({ id: nextId(rows), board_id: req.params.id, product_id: productId, is_active: true, sort_order: rows.length + 1, created_at: nowIso(), updated_at: nowIso() });
            added += 1;
        });
        saveCollection('content_board_products', rows);
        ok(res, { success: true, added });
    });

    app.post('/admin/api/boards/:id/products/sort', auth, requirePermission('content'), (req, res) => {
        const orders = toArray(req.body?.orders);
        const rows = getCollection('content_board_products').map((row) => {
            const order = orders.find((item) => rowMatchesLookup(row, item.id));
            return order ? { ...row, sort_order: toNumber(order.sort_order, row.sort_order), updated_at: nowIso() } : row;
        });
        saveCollection('content_board_products', rows);
        ok(res, { success: true });
    });

    app.put('/admin/api/boards/:id/products/:relationId', auth, requirePermission('content'), (req, res) => {
        const rows = getCollection('content_board_products');
        const index = rows.findIndex((row) => String(row.board_id) === String(req.params.id) && rowMatchesLookup(row, req.params.relationId));
        if (index === -1) return fail(res, '榜单商品不存在', 404);
        rows[index] = { ...rows[index], ...req.body, updated_at: nowIso() };
        saveCollection('content_board_products', rows);
        ok(res, rows[index]);
    });

    app.delete('/admin/api/boards/:id/products/:relationId', auth, requirePermission('content'), (req, res) => {
        const rows = getCollection('content_board_products');
        const nextRows = rows.filter((row) => !(String(row.board_id) === String(req.params.id) && rowMatchesLookup(row, req.params.relationId)));
        if (rows.length === nextRows.length) return fail(res, '榜单商品不存在', 404);
        saveCollection('content_board_products', nextRows);
        ok(res, { success: true });
    });

    const agentConfigDefaults = {
        'upgrade-rules': { enabled: true },
        'commission-config': { enabled: true },
        'commission-matrix': {},
        'peer-bonus': { enabled: false },
        'assist-bonus': { enabled: false },
        'fund-pool': { enabled: false },
        'dividend-rules': { enabled: false, source_pct: 0, b_team_award: { enabled: false, pool_pct: 0, ranks: [] }, b1_personal_award: { enabled: false, pool_pct: 0, ranks: [] } },
        'exit-rules': { enabled: false },
        'recharge-config': { enabled: false, options: [] }
    };

    Object.keys(agentConfigDefaults).forEach((key) => {
        app.get(`/admin/api/agent-system/${key}`, auth, requirePermission('settings_manage'), (_req, res) => {
            ok(res, getConfigValue(`agent_system_${key}`, agentConfigDefaults[key]));
        });
        app.put(`/admin/api/agent-system/${key}`, auth, requirePermission('settings_manage'), (req, res) => {
            ok(res, setConfigValue(`agent_system_${key}`, req.body || {}, 'agent_system'));
        });
    });

    app.get('/admin/api/agent-system/dividend/preview', auth, requirePermission('settings_manage'), (req, res) => {
        const users = getCollection('users');
        const amount = toNumber(req.query.amount || req.query.pool_amount || req.query.pool, 0);
        const rules = {
            enabled: false,
            source_pct: 0,
            b_team_award: { enabled: false, pool_pct: 0, ranks: [] },
            b1_personal_award: { enabled: false, pool_pct: 0, ranks: [] },
            ...getConfigValue('agent_system_dividend-rules', {})
        };
        const list = rules.enabled ? buildDividendPreviewRows(users, rules, amount) : [];
        ok(res, { pool_amount: amount, eligible_count: list.length, list });
    });

    app.post('/admin/api/agent-system/dividend/execute', auth, requirePermission('settings_manage'), async (req, res) => {
        const executions = getCollection('dividend_executions');
        const users = getCollection('users');
        const commissions = getCollection('commissions');
        const amount = toNumber(req.body?.pool || req.body?.pool_amount || req.body?.amount, 0);
        const reasonCheck = requireManualAdjustmentReason(req.body?.remark || req.body?.reason, '分红说明');
        if (!reasonCheck.ok) return fail(res, reasonCheck.message);
        if (amount <= 0) return fail(res, '分红金额必须大于 0');
        const year = Math.max(2000, Math.floor(toNumber(req.body?.year, new Date().getFullYear() - 1)));
        const rules = {
            enabled: false,
            source_pct: 0,
            b_team_award: { enabled: false, pool_pct: 0, ranks: [] },
            b1_personal_award: { enabled: false, pool_pct: 0, ranks: [] },
            ...getConfigValue('agent_system_dividend-rules', {})
        };
        const previewRows = rules.enabled ? buildDividendPreviewRows(users, rules, amount) : [];
        let totalDistributed = 0;
        for (const item of previewRows) {
            const userIndex = users.findIndex((row) => rowMatchesLookup(row, item.userId, [row.openid, row.member_no]));
            if (userIndex === -1) continue;
            const exists = commissions.find((row) =>
                pickString(row.type).toLowerCase() === 'year_end_dividend'
                && row.dividend_year === year
                && rowMatchesLookup(row, item.userId, [row.openid, row.user_id])
                && pickString(row.dividend_award_key) === pickString(item.awardKey)
            );
            if (exists) continue;

            const amountValue = Math.max(0, toNumber(item.dividendAmount, 0));
            if (amountValue <= 0) continue;
            totalDistributed += amountValue;
            users[userIndex] = {
                ...users[userIndex],
                commission_balance: toNumber(users[userIndex].commission_balance, 0) + amountValue,
                wallet_balance: toNumber(users[userIndex].wallet_balance ?? users[userIndex].balance, 0) + amountValue,
                balance: toNumber(users[userIndex].balance ?? users[userIndex].wallet_balance, 0) + amountValue,
                total_earned: toNumber(users[userIndex].total_earned, 0) + amountValue,
                updated_at: nowIso()
            };
            commissions.push({
                id: nextId(commissions),
                openid: users[userIndex].openid,
                user_id: users[userIndex].id || users[userIndex]._id || item.userId,
                amount: amountValue,
                level: toNumber(users[userIndex].role_level ?? users[userIndex].distributor_level, 0),
                type: 'year_end_dividend',
                status: 'settled',
                dividend_year: year,
                dividend_award_key: item.awardKey,
                approved_at: nowIso(),
                settled_at: nowIso(),
                created_at: nowIso(),
                updated_at: nowIso(),
                description: `${year} 年终分红 · ${item.awardLabel}`
            });
            // 记录钱包流水
            appendWalletLogEntry({
                openid: users[userIndex].openid,
                type: 'year_end_dividend',
                amount: amountValue,
                description: `${year} 年终分红 · ${item.awardLabel} ¥${amountValue}`,
                remark: reasonCheck.reason,
                created_at: nowIso()
            });
        }
        saveCollection('users', users);
        saveCollection('commissions', commissions);
        const row = {
            id: nextId(executions),
            ...req.body,
            year,
            remark: reasonCheck.reason,
            totalDistributed: Number(totalDistributed.toFixed(2)),
            distributedCount: previewRows.length,
            status: 'completed',
            created_at: nowIso(),
            updated_at: nowIso()
        };
        executions.push(row);
        saveCollection('dividend_executions', executions);
        createAuditLog(req.admin, 'agent-system.dividend.execute', 'dividend_executions', {
            year,
            total_distributed: row.totalDistributed,
            distributed_count: row.distributedCount,
            remark: reasonCheck.reason
        });
        ok(res, row);
    });

    app.get('/admin/api/agent-system/exit-applications', auth, requirePermission('users'), (req, res) => {
        let rows = sortByUpdatedDesc(getCollection('agent_exit_applications'));
        if (req.query.status) rows = rows.filter((row) => row.status === req.query.status);
        ok(res, paginate(rows, req));
    });

    app.post('/admin/api/agent-system/exit-applications/:userId', auth, requirePermission('users'), (req, res) => {
        const rows = getCollection('agent_exit_applications');
        const users = getCollection('users');
        const commissions = getCollection('commissions');
        const row = { id: nextId(rows), user_id: req.params.userId, ...req.body, status: 'pending', created_at: nowIso(), updated_at: nowIso() };
        rows.push(row);
        saveCollection('agent_exit_applications', rows);
        ok(res, buildExitApplicationResponse(row, users, commissions));
    });

    app.put('/admin/api/agent-system/exit-applications/:id/review', auth, requirePermission('users'), async (req, res) => {
        const rows = getCollection('agent_exit_applications');
        const index = rows.findIndex((row) => rowMatchesLookup(row, req.params.id));
        if (index === -1) return fail(res, '退出申请不存在', 404);
        const users = getCollection('users');
        const commissions = getCollection('commissions');
        const status = req.body?.status || req.body?.result || 'approved';
        const reasonCheck = requireManualAdjustmentReason(req.body?.remark, status === 'approved' ? '审批备注' : '拒绝原因');
        if (!reasonCheck.ok) return fail(res, reasonCheck.message);
        rows[index] = { ...rows[index], status, review_remark: reasonCheck.reason, reviewed_at: nowIso(), updated_at: nowIso() };
        let settlement = null;
        if (status === 'approved' && !rows[index].settled_at) {
            const walletLogs = getCollection('wallet_logs');
            settlement = applyExitSettlement(rows[index], { users, commissions, walletLogs });
            rows[index] = { ...rows[index], ...settlement, settled_at: nowIso() };
            saveCollection('users', users);
            saveCollection('commissions', commissions);
            saveCollection('wallet_logs', walletLogs);
        }
        saveCollection('agent_exit_applications', rows);
        createAuditLog(req.admin, 'agent-system.exit.review', 'agent_exit_applications', {
            application_id: rows[index].id || rows[index]._id,
            status,
            refund_amount: settlement?.refundAmount || 0,
            remark: reasonCheck.reason
        });
        ok(res, buildExitApplicationResponse(rows[index], users, commissions));
    });
}

module.exports = {
    registerMarketingRoutes
};
