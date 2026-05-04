'use strict';

const crypto = require('crypto');

const DEFAULT_GOODS_FUND_ROLE_LEVELS = [3, 4, 5, 6];

function createLotteryAdminSupport(deps = {}) {
    const {
        app,
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
        resolveManagedFileUrl = async (value) => assetUrl(value),
        createAuditLog,
        ok,
        fail
    } = deps;

    function roundMoney(value) {
        return Math.round(toNumber(value, 0) * 100) / 100;
    }

    function generateId() {
        return crypto.randomBytes(12).toString('hex');
    }

    function normalizePrizeType(value) {
        const raw = pickString(value || 'miss').toLowerCase();
        if (raw === 'point') return 'points';
        if (['miss', 'points', 'coupon', 'goods_fund', 'physical', 'mystery'].includes(raw)) return raw;
        return 'miss';
    }

    function getPrizeVisual(type = 'miss') {
        return {
            miss: { emoji: '🍀', badge: '好运签', theme: '#6B7280', accent: '#D1D5DB' },
            points: { emoji: '⭐', badge: '积分奖', theme: '#2563EB', accent: '#93C5FD' },
            coupon: { emoji: '🎫', badge: '优惠券', theme: '#10B981', accent: '#6EE7B7' },
            goods_fund: { emoji: '💰', badge: '货款奖', theme: '#0F766E', accent: '#5EEAD4' },
            physical: { emoji: '🎁', badge: '实物奖', theme: '#F59E0B', accent: '#FDE68A' },
            mystery: { emoji: '✨', badge: '神秘大奖', theme: '#7C3AED', accent: '#C4B5FD' }
        }[type] || { emoji: '🎁', badge: '奖品', theme: '#6B7280', accent: '#D1D5DB' };
    }

    function normalizeStringArray(value) {
        if (Array.isArray(value)) return [...new Set(value.map((item) => pickString(item)).filter(Boolean))];
        const raw = pickString(value);
        if (!raw) return [];
        if (raw.startsWith('[') && raw.endsWith(']')) {
            try {
                return normalizeStringArray(JSON.parse(raw));
            } catch (_) {
                return [];
            }
        }
        return [...new Set(raw.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
    }

    function normalizeRoleLevelList(value) {
        const source = Array.isArray(value) ? value : (pickString(value) ? normalizeStringArray(value) : DEFAULT_GOODS_FUND_ROLE_LEVELS);
        return [...new Set(source.map((item) => Math.floor(toNumber(item, 0))).filter((item) => item > 0))];
    }

    function resolveCouponFallback(row = {}) {
        if (normalizePrizeType(row.type) !== 'coupon') return null;
        if (row.coupon_amount != null) return null;
        const couponId = pickString(row.coupon_id);
        if (!couponId) return null;
        return findByLookup(getCollection('coupons'), couponId) || null;
    }

    async function normalizePrizeRow(row = {}) {
        const type = normalizePrizeType(row.type);
        const visual = getPrizeVisual(type);
        const couponTemplate = resolveCouponFallback(row);
        const fileId = pickString(row.file_id);
        const imageUrl = fileId
            ? await resolveManagedFileUrl(fileId).catch(() => '')
            : assetUrl(row.image_url || row.image || row.cover_image || '');
        const prizeValue = roundMoney(row.prize_value != null ? row.prize_value : row.value);
        const couponAmount = roundMoney(row.coupon_amount != null ? row.coupon_amount : (couponTemplate ? (couponTemplate.value != null ? couponTemplate.value : couponTemplate.coupon_value) : (type === 'coupon' ? prizeValue : 0)));
        return {
            ...row,
            id: row.id || row._legacy_id || row._id,
            type,
            name: pickString(row.name || visual.badge || '未命名奖品'),
            file_id: fileId,
            image_url: imageUrl,
            image: imageUrl,
            cover_image: imageUrl,
            prize_value: prizeValue,
            coupon_amount: couponAmount,
            coupon_min_purchase: roundMoney(row.coupon_min_purchase != null ? row.coupon_min_purchase : (couponTemplate ? couponTemplate.min_purchase : 0)),
            coupon_valid_days: Math.max(1, Math.floor(toNumber(row.coupon_valid_days != null ? row.coupon_valid_days : (couponTemplate ? couponTemplate.valid_days : 30), 30))),
            coupon_scope: pickString(row.coupon_scope || (couponTemplate ? couponTemplate.scope : 'all'), 'all'),
            coupon_scope_ids: normalizeStringArray(row.coupon_scope_ids != null ? row.coupon_scope_ids : (couponTemplate ? couponTemplate.scope_ids : [])),
            eligible_role_levels: normalizeRoleLevelList(row.eligible_role_levels),
            fallback_reward_type: normalizePrizeType(row.fallback_reward_type || 'points') === 'miss' ? 'points' : normalizePrizeType(row.fallback_reward_type || 'points'),
            claim_required: row.claim_required == null ? (type === 'physical' || type === 'mystery') : !!toBoolean(row.claim_required),
            claim_instruction: pickString(row.claim_instruction),
            claim_deadline_days: Math.max(0, Math.floor(toNumber(row.claim_deadline_days, 7))),
            shipping_required: row.shipping_required == null ? type === 'physical' : !!toBoolean(row.shipping_required),
            display_emoji: pickString(row.display_emoji || visual.emoji),
            badge_text: pickString(row.badge_text || visual.badge),
            theme_color: pickString(row.theme_color || visual.theme),
            accent_color: pickString(row.accent_color || visual.accent),
            cost_points: Math.max(0, Math.floor(toNumber(row.cost_points, 1))),
            probability: toNumber(row.probability, 0),
            stock: row.stock == null ? -1 : Math.floor(toNumber(row.stock, -1)),
            is_active: toBoolean(row.is_active ?? row.status ?? 1) ? 1 : 0,
            status: toBoolean(row.is_active ?? row.status ?? 1) ? 1 : 0,
            needs_coupon_migration: type === 'coupon' && !!couponTemplate && row.coupon_amount == null
        };
    }

    function buildPrizePayload(body = {}, existing = {}) {
        const type = normalizePrizeType(body.type ?? existing.type ?? 'miss');
        const visual = getPrizeVisual(type);
        const prizeValue = roundMoney(body.prize_value != null ? body.prize_value : existing.prize_value);
        return {
            ...existing,
            ...body,
            type,
            name: pickString(body.name ?? existing.name ?? ''),
            file_id: pickString(body.file_id ?? existing.file_id),
            image_url: pickString(body.image_url ?? existing.image_url),
            prize_value: ['points', 'goods_fund'].includes(type) ? prizeValue : (type === 'coupon' ? roundMoney(body.coupon_amount != null ? body.coupon_amount : (body.prize_value != null ? body.prize_value : existing.coupon_amount)) : 0),
            coupon_amount: type === 'coupon'
                ? roundMoney(body.coupon_amount != null ? body.coupon_amount : (body.prize_value != null ? body.prize_value : existing.coupon_amount))
                : 0,
            coupon_min_purchase: type === 'coupon' ? roundMoney(body.coupon_min_purchase != null ? body.coupon_min_purchase : existing.coupon_min_purchase) : 0,
            coupon_valid_days: type === 'coupon'
                ? Math.max(1, Math.floor(toNumber(body.coupon_valid_days != null ? body.coupon_valid_days : existing.coupon_valid_days, 30)))
                : Math.max(1, Math.floor(toNumber(existing.coupon_valid_days, 30))),
            coupon_scope: type === 'coupon' ? pickString(body.coupon_scope ?? existing.coupon_scope, 'all') : pickString(existing.coupon_scope, 'all'),
            coupon_scope_ids: type === 'coupon' ? normalizeStringArray(body.coupon_scope_ids != null ? body.coupon_scope_ids : existing.coupon_scope_ids) : [],
            eligible_role_levels: type === 'goods_fund'
                ? normalizeRoleLevelList(body.eligible_role_levels != null ? body.eligible_role_levels : existing.eligible_role_levels)
                : normalizeRoleLevelList(existing.eligible_role_levels),
            fallback_reward_type: type === 'goods_fund' ? 'points' : pickString(existing.fallback_reward_type || 'points'),
            claim_required: type === 'physical' || type === 'mystery'
                ? (body.claim_required == null ? true : !!toBoolean(body.claim_required))
                : false,
            claim_instruction: type === 'physical' || type === 'mystery' ? pickString(body.claim_instruction ?? existing.claim_instruction) : '',
            claim_deadline_days: type === 'physical' || type === 'mystery'
                ? Math.max(0, Math.floor(toNumber(body.claim_deadline_days != null ? body.claim_deadline_days : existing.claim_deadline_days, 7)))
                : 0,
            shipping_required: type === 'physical'
                ? (body.shipping_required == null ? true : !!toBoolean(body.shipping_required))
                : false,
            display_emoji: pickString(body.display_emoji ?? existing.display_emoji ?? visual.emoji),
            badge_text: pickString(body.badge_text ?? existing.badge_text ?? visual.badge),
            theme_color: pickString(body.theme_color ?? existing.theme_color ?? visual.theme),
            accent_color: pickString(body.accent_color ?? existing.accent_color ?? visual.accent),
            cost_points: Math.max(0, Math.floor(toNumber(body.cost_points != null ? body.cost_points : existing.cost_points, 1))),
            probability: toNumber(body.probability != null ? body.probability : existing.probability, 0),
            stock: body.stock == null ? (existing.stock == null ? -1 : Math.floor(toNumber(existing.stock, -1))) : Math.floor(toNumber(body.stock, -1)),
            is_active: toBoolean(body.is_active ?? body.status ?? existing.is_active ?? existing.status ?? 1) ? 1 : 0,
            status: toBoolean(body.is_active ?? body.status ?? existing.is_active ?? existing.status ?? 1) ? 1 : 0,
            updated_at: nowIso()
        };
    }

    function normalizeRecordType(value) {
        return normalizePrizeType(value);
    }

    function recordStatusText(status = '') {
        return {
            pending: '待发放',
            issued: '已发放',
            claim_required: '待领取',
            claim_submitted: '已提交',
            approved: '待发货',
            shipped: '已发货',
            completed: '已完成',
            failed: '发放失败',
            cancelled: '已取消'
        }[pickString(status)] || '处理中';
    }

    function claimStatusText(status = '') {
        return {
            submitted: '待审核',
            approved: '待发货',
            rejected: '已驳回',
            shipped: '已发货',
            completed: '已完成',
            cancelled: '已取消'
        }[pickString(status)] || '处理中';
    }

    function normalizeLegacyRecord(row = {}) {
        const rewardType = normalizeRecordType(row.reward_actual_type || row.prize_type || row.reward_snapshot?.type || row.type || 'miss');
        const drawStatus = pickString(row.draw_status || (rewardType === 'miss' ? 'miss' : 'won'), rewardType === 'miss' ? 'miss' : 'won');
        let fulfillmentStatus = pickString(row.fulfillment_status);
        if (!fulfillmentStatus) {
            if (rewardType === 'physical' || rewardType === 'mystery') fulfillmentStatus = 'claim_required';
            else if (rewardType === 'miss') fulfillmentStatus = 'completed';
            else fulfillmentStatus = 'issued';
        }
        return {
            ...row,
            id: row.id || row._id || row._legacy_id,
            reward_actual_type: normalizeRecordType(row.reward_actual_type || rewardType),
            prize_type: rewardType,
            draw_status: drawStatus,
            fulfillment_status: fulfillmentStatus,
            reward_snapshot: row.reward_snapshot && typeof row.reward_snapshot === 'object' ? row.reward_snapshot : {}
        };
    }

    function buildRecordValue(row = {}) {
        const snapshot = row.reward_snapshot || {};
        const type = normalizeRecordType(row.reward_actual_type || row.prize_type);
        if (type === 'points') return `${Math.max(0, Math.floor(toNumber(snapshot.prize_value ?? row.prize_value, 0)))} 积分`;
        if (type === 'coupon') return `${roundMoney(snapshot.coupon_amount != null ? snapshot.coupon_amount : (snapshot.prize_value ?? row.prize_value))} 元券`;
        if (type === 'goods_fund') return `¥${roundMoney(snapshot.prize_value ?? row.prize_value)} 货款`;
        if (type === 'physical') return '实物礼品';
        if (type === 'mystery') return '人工兑奖';
        return '谢谢参与';
    }

    function buildUserBrief(user = {}) {
        if (!user || typeof user !== 'object') return null;
        return {
            id: user.id || user._id || user._legacy_id || '',
            openid: pickString(user.openid),
            nickname: pickString(user.nickName || user.nickname || user.phone || user.member_no || '用户'),
            phone: pickString(user.phone),
            member_no: pickString(user.member_no || user.my_invite_code || user.invite_code),
            role_level: Math.floor(toNumber(user.role_level ?? user.distributor_level ?? user.level, 0))
        };
    }

    function normalizeRecordRow(row = {}, users = [], claimMap = new Map()) {
        const normalized = normalizeLegacyRecord(row);
        const snapshot = normalized.reward_snapshot || {};
        const user = users.find((item) => pickString(item.openid) === pickString(normalized.openid))
            || findByLookup(users, normalized.user_id || normalized.openid);
        const claim = claimMap.get(pickString(normalized.claim_id))
            || claimMap.get(`record:${pickString(normalized.id)}`)
            || null;
        return {
            ...normalized,
            buyer: buildUserBrief(user),
            prize_name: pickString(normalized.prize_name || snapshot.name),
            prize_type_label: normalizeRecordType(normalized.reward_actual_type || normalized.prize_type),
            display_value: buildRecordValue(normalized),
            status_text: recordStatusText(normalized.fulfillment_status),
            claim_status_text: claim ? claimStatusText(claim.status) : '',
            claim,
            created_at: normalized.created_at,
            updated_at: normalized.updated_at
        };
    }

    function normalizeClaimRow(row = {}, recordMap = new Map(), users = []) {
        const record = recordMap.get(pickString(row.lottery_record_id)) || null;
        const user = users.find((item) => pickString(item.openid) === pickString(row.openid))
            || findByLookup(users, row.user_id || row.openid);
        return {
            ...row,
            id: row.id || row._id || row._legacy_id,
            buyer: buildUserBrief(user),
            record,
            status_text: claimStatusText(row.status),
            prize_name: pickString(row.prize_name || record?.prize_name),
            prize_type: normalizeRecordType(row.prize_type || record?.reward_actual_type || record?.prize_type),
            receiver_name: pickString(row.receiver_name || row.address_snapshot?.receiver_name || row.address_snapshot?.name),
            phone: pickString(row.phone || row.address_snapshot?.phone),
            address_text: [
                pickString(row.province || row.address_snapshot?.province),
                pickString(row.city || row.address_snapshot?.city),
                pickString(row.district || row.address_snapshot?.district),
                pickString(row.detail || row.detail_address || row.address_snapshot?.detail || row.address_snapshot?.detail_address)
            ].filter(Boolean).join('')
        };
    }

    function ensureWalletAccount(users = [], walletAccounts = [], user = {}, seedBalance = 0) {
        const userId = pickString(user.id || user._id || user._legacy_id || user.openid);
        if (!userId) return null;
        let row = walletAccounts.find((item) => pickString(item.user_id) === userId || pickString(item.openid) === pickString(user.openid));
        if (row) return row;
        row = {
            _id: `wallet-${userId}`,
            id: `wallet-${userId}`,
            user_id: userId,
            openid: pickString(user.openid),
            balance: roundMoney(seedBalance),
            account_type: 'goods_fund',
            status: 'active',
            created_at: nowIso(),
            updated_at: nowIso()
        };
        walletAccounts.push(row);
        return row;
    }

    function appendPointReward(users = [], pointLogs = [], record = {}, amount = 0, reason = '') {
        const openid = pickString(record.openid);
        const userIndex = users.findIndex((item) => pickString(item.openid) === openid);
        if (userIndex === -1) throw new Error('积分奖励发放失败：用户不存在');
        const points = Math.max(0, Math.floor(toNumber(amount, 0)));
        if (points <= 0) throw new Error('积分奖励配置异常');
        const before = toNumber(users[userIndex].points, 0);
        users[userIndex] = {
            ...users[userIndex],
            points: before + points,
            updated_at: nowIso()
        };
        const log = {
            id: nextId(pointLogs),
            openid,
            type: 'earn',
            amount: points,
            source: 'lottery',
            lottery_record_id: pickString(record.id),
            prize_id: pickString(record.prize_id),
            description: reason || `抽奖获得${points}积分`,
            created_at: nowIso()
        };
        pointLogs.push(log);
        return { reward_actual_type: 'points', reward_ref_type: 'point_log', reward_ref_id: String(log.id) };
    }

    function appendCouponReward(users = [], userCoupons = [], record = {}) {
        const snapshot = record.reward_snapshot || {};
        const couponAmount = roundMoney(snapshot.coupon_amount != null ? snapshot.coupon_amount : snapshot.prize_value);
        if (couponAmount <= 0) throw new Error('优惠券奖励配置异常');
        const user = users.find((item) => pickString(item.openid) === pickString(record.openid));
        const docId = generateId();
        userCoupons.push({
            _id: docId,
            id: docId,
            openid: pickString(record.openid),
            user_id: pickString(user?.id || user?._id || user?._legacy_id || record.openid),
            coupon_id: pickString(record.prize_id || record.id),
            coupon_name: pickString(record.prize_name || snapshot.name || '抽奖优惠券'),
            coupon_type: 'fixed',
            coupon_value: couponAmount,
            min_purchase: roundMoney(snapshot.coupon_min_purchase),
            scope: pickString(snapshot.coupon_scope || 'all'),
            scope_ids: normalizeStringArray(snapshot.coupon_scope_ids),
            status: 'unused',
            source: 'lottery',
            source_lottery_record_id: pickString(record.id),
            source_prize_id: pickString(record.prize_id),
            created_at: nowIso(),
            expire_at: new Date(Date.now() + Math.max(1, Math.floor(toNumber(snapshot.coupon_valid_days, 30))) * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: nowIso()
        });
        return { reward_actual_type: 'coupon', reward_ref_type: 'user_coupon', reward_ref_id: docId };
    }

    function appendGoodsFundReward(users = [], walletAccounts = [], goodsFundLogs = [], pointLogs = [], record = {}) {
        const snapshot = record.reward_snapshot || {};
        const userIndex = users.findIndex((item) => pickString(item.openid) === pickString(record.openid));
        if (userIndex === -1) throw new Error('货款奖励发放失败：用户不存在');
        const user = users[userIndex];
        const roleLevel = Math.floor(toNumber(user.role_level ?? user.distributor_level ?? user.level, 0));
        const eligibleLevels = normalizeRoleLevelList(snapshot.eligible_role_levels);
        const amount = roundMoney(snapshot.prize_value);
        if (amount <= 0) throw new Error('货款奖励配置异常');

        if (!eligibleLevels.includes(roleLevel)) {
            const pointRuleRow = sortByUpdatedDesc(getCollection('configs')
                .filter((item) => pickString(item.config_key || item.key) === 'point_rule_config')
                .filter((item) => item.active !== false && item.status !== false && item.status !== 0 && item.status !== '0'))[0];
            const pointRule = pointRuleRow && typeof pointRuleRow.config_value === 'object' ? pointRuleRow.config_value : (pointRuleRow && typeof pointRuleRow.value === 'object' ? pointRuleRow.value : {});
            const deduction = pointRule.deduction || pointRule.redeem || {};
            const yuanPerPoint = Math.max(0.01, toNumber(deduction.yuan_per_point ?? deduction.value_per_point ?? pointRule.yuan_per_point ?? pointRule.point_value, 0.1));
            const points = Math.max(1, Math.round(amount / yuanPerPoint));
            return appendPointReward(users, pointLogs, record, points, `抽奖货款奖励折算积分 ${points}`);
        }

        const account = ensureWalletAccount(users, walletAccounts, user, toNumber(user.agent_wallet_balance ?? user.wallet_balance, 0));
        account.balance = roundMoney(toNumber(account.balance, 0) + amount);
        account.updated_at = nowIso();
        users[userIndex] = {
            ...user,
            agent_wallet_balance: roundMoney(toNumber(user.agent_wallet_balance ?? user.wallet_balance, 0) + amount),
            wallet_balance: roundMoney(toNumber(user.wallet_balance ?? user.agent_wallet_balance, 0) + amount),
            updated_at: nowIso()
        };
        const log = {
            id: nextId(goodsFundLogs),
            openid: pickString(record.openid),
            user_id: pickString(user.id || user._id || user._legacy_id || user.openid),
            type: 'lottery_reward',
            amount,
            lottery_record_id: pickString(record.id),
            prize_id: pickString(record.prize_id),
            remark: `抽奖获得货款 ¥${amount.toFixed(2)}`,
            created_at: nowIso()
        };
        goodsFundLogs.push(log);
        return { reward_actual_type: 'goods_fund', reward_ref_type: 'goods_fund_log', reward_ref_id: String(log.id) };
    }

    function buildRewardResult(record = {}, collections = {}) {
        const type = normalizeRecordType(record.reward_actual_type || record.prize_type);
        if (type === 'points') {
            return appendPointReward(collections.users, collections.pointLogs, record, record.reward_snapshot?.prize_value ?? record.prize_value);
        }
        if (type === 'coupon') {
            return appendCouponReward(collections.users, collections.userCoupons, record);
        }
        if (type === 'goods_fund') {
            return appendGoodsFundReward(collections.users, collections.walletAccounts, collections.goodsFundLogs, collections.pointLogs, record);
        }
        throw new Error('当前奖品类型不支持自动补发');
    }

    app.get('/admin/api/lottery-prizes', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['lottery_prizes', 'coupons']);
        let rows = sortByUpdatedDesc(getCollection('lottery_prizes'));
        const list = await Promise.all(rows.map((row) => normalizePrizeRow(row)));
        ok(res, paginate(list, req));
    });

    app.get('/admin/api/lottery-prizes/:id', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['lottery_prizes', 'coupons']);
        const row = findByLookup(getCollection('lottery_prizes'), req.params.id);
        if (!row) return fail(res, '抽奖奖品不存在', 404);
        ok(res, await normalizePrizeRow(row));
    });

    app.post('/admin/api/lottery-prizes', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['lottery_prizes']);
        const rows = getCollection('lottery_prizes');
        const row = buildPrizePayload(req.body || {}, { id: nextId(rows), created_at: nowIso() });
        rows.push(row);
        saveCollection('lottery_prizes', rows);
        createAuditLog(req.admin, 'lottery_prize.create', 'lottery_prizes', { prize_id: row.id });
        ok(res, await normalizePrizeRow(row));
    });

    app.put('/admin/api/lottery-prizes/:id', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['lottery_prizes']);
        const rows = getCollection('lottery_prizes');
        const index = rows.findIndex((item) => rowMatchesLookup(item, req.params.id));
        if (index === -1) return fail(res, '抽奖奖品不存在', 404);
        rows[index] = buildPrizePayload(req.body || {}, rows[index]);
        saveCollection('lottery_prizes', rows);
        createAuditLog(req.admin, 'lottery_prize.update', 'lottery_prizes', { prize_id: req.params.id });
        ok(res, await normalizePrizeRow(rows[index]));
    });

    app.delete('/admin/api/lottery-prizes/:id', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['lottery_prizes']);
        const rows = getCollection('lottery_prizes');
        const nextRows = rows.filter((item) => !rowMatchesLookup(item, req.params.id));
        if (nextRows.length === rows.length) return fail(res, '抽奖奖品不存在', 404);
        saveCollection('lottery_prizes', nextRows);
        createAuditLog(req.admin, 'lottery_prize.delete', 'lottery_prizes', { prize_id: req.params.id });
        ok(res, { success: true });
    });

    function updateLotteryPrizeStatus(req, res) {
        const rows = getCollection('lottery_prizes');
        const index = rows.findIndex((item) => rowMatchesLookup(item, req.params.id));
        if (index === -1) return fail(res, '抽奖奖品不存在', 404);
        const enabled = toBoolean(req.body?.status ?? req.body?.is_active ?? req.body?.enabled ?? req.body?.value ?? 1) ? 1 : 0;
        rows[index] = {
            ...rows[index],
            is_active: enabled,
            status: enabled,
            updated_at: nowIso()
        };
        saveCollection('lottery_prizes', rows);
        createAuditLog(req.admin, 'lottery_prize.status', 'lottery_prizes', { prize_id: req.params.id, status: enabled });
        ok(res, { ...rows[index], id: rows[index].id || rows[index]._legacy_id || rows[index]._id });
    }

    app.put('/admin/api/lottery-prizes/:id/status', auth, requirePermission('products'), updateLotteryPrizeStatus);
    app.post('/admin/api/lottery-prizes/:id/status', auth, requirePermission('products'), updateLotteryPrizeStatus);
    app.put('/admin/api/lottery-prizes/:id/toggle', auth, requirePermission('products'), updateLotteryPrizeStatus);
    app.post('/admin/api/lottery-prizes/:id/toggle', auth, requirePermission('products'), updateLotteryPrizeStatus);

    app.get('/admin/api/lottery-records', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['lottery_records', 'lottery_claims', 'users']);
        const users = getCollection('users');
        const claims = getCollection('lottery_claims');
        const claimMap = new Map();
        claims.forEach((item) => {
            claimMap.set(pickString(item.id || item._id), item);
            if (pickString(item.lottery_record_id)) {
                claimMap.set(`record:${pickString(item.lottery_record_id)}`, item);
            }
        });
        let rows = sortByUpdatedDesc(getCollection('lottery_records')).map((row) => normalizeRecordRow(row, users, claimMap));
        const status = pickString(req.query.status).trim();
        const rewardType = normalizePrizeType(req.query.reward_type || req.query.type);
        if (status) rows = rows.filter((item) => pickString(item.fulfillment_status) === status);
        if (pickString(req.query.reward_type || req.query.type)) rows = rows.filter((item) => normalizeRecordType(item.reward_actual_type || item.prize_type) === rewardType);
        ok(res, paginate(rows, req));
    });

    app.get('/admin/api/lottery-claims', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['lottery_claims', 'lottery_records', 'users']);
        const users = getCollection('users');
        const recordMap = new Map(sortByUpdatedDesc(getCollection('lottery_records')).map((row) => [pickString(row.id || row._id), normalizeLegacyRecord(row)]));
        let rows = sortByUpdatedDesc(getCollection('lottery_claims')).map((row) => normalizeClaimRow(row, recordMap, users));
        const status = pickString(req.query.status).trim();
        if (status) rows = rows.filter((item) => pickString(item.status) === status);
        ok(res, paginate(rows, req));
    });

    function findClaimWithRecord(claimId) {
        const claims = getCollection('lottery_claims');
        const claim = findByLookup(claims, claimId);
        if (!claim) return { claims, claim: null, records: getCollection('lottery_records'), record: null };
        const records = getCollection('lottery_records');
        const record = findByLookup(records, claim.lottery_record_id);
        return { claims, claim, records, record };
    }

    app.post('/admin/api/lottery-claims/:id/approve', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['lottery_claims', 'lottery_records']);
        const { claims, claim, records, record } = findClaimWithRecord(req.params.id);
        if (!claim || !record) return fail(res, '领奖记录不存在', 404);
        const nextStatus = claim.shipping_required ? 'approved' : 'approved';
        const claimIndex = claims.findIndex((item) => rowMatchesLookup(item, req.params.id));
        const recordIndex = records.findIndex((item) => rowMatchesLookup(item, claim.lottery_record_id));
        claims[claimIndex] = {
            ...claims[claimIndex],
            status: nextStatus,
            review_remark: pickString(req.body?.review_remark || req.body?.remark),
            resolution_note: pickString(req.body?.resolution_note),
            approved_at: nowIso(),
            updated_at: nowIso()
        };
        records[recordIndex] = {
            ...records[recordIndex],
            fulfillment_status: claim.shipping_required ? 'approved' : 'approved',
            failure_reason: '',
            updated_at: nowIso()
        };
        saveCollection('lottery_claims', claims);
        saveCollection('lottery_records', records);
        ok(res, { success: true });
    });

    app.post('/admin/api/lottery-claims/:id/reject', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['lottery_claims', 'lottery_records']);
        const { claims, claim, records, record } = findClaimWithRecord(req.params.id);
        if (!claim || !record) return fail(res, '领奖记录不存在', 404);
        const reason = pickString(req.body?.review_remark || req.body?.remark, '领奖信息已驳回');
        const claimIndex = claims.findIndex((item) => rowMatchesLookup(item, req.params.id));
        const recordIndex = records.findIndex((item) => rowMatchesLookup(item, claim.lottery_record_id));
        claims[claimIndex] = {
            ...claims[claimIndex],
            status: 'rejected',
            review_remark: reason,
            updated_at: nowIso()
        };
        records[recordIndex] = {
            ...records[recordIndex],
            fulfillment_status: 'claim_required',
            failure_reason: reason,
            updated_at: nowIso()
        };
        saveCollection('lottery_claims', claims);
        saveCollection('lottery_records', records);
        ok(res, { success: true });
    });

    app.post('/admin/api/lottery-claims/:id/ship', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['lottery_claims', 'lottery_records']);
        const { claims, claim, records, record } = findClaimWithRecord(req.params.id);
        if (!claim || !record) return fail(res, '领奖记录不存在', 404);
        const shippingCompany = pickString(req.body?.shipping_company || req.body?.logistics_company);
        const trackingNo = pickString(req.body?.tracking_no);
        if (!shippingCompany || !trackingNo) return fail(res, '请填写物流公司和运单号', 400);
        const claimIndex = claims.findIndex((item) => rowMatchesLookup(item, req.params.id));
        const recordIndex = records.findIndex((item) => rowMatchesLookup(item, claim.lottery_record_id));
        claims[claimIndex] = {
            ...claims[claimIndex],
            status: 'shipped',
            shipping_company: shippingCompany,
            tracking_no: trackingNo,
            shipped_at: nowIso(),
            updated_at: nowIso()
        };
        records[recordIndex] = {
            ...records[recordIndex],
            fulfillment_status: 'shipped',
            updated_at: nowIso()
        };
        saveCollection('lottery_claims', claims);
        saveCollection('lottery_records', records);
        ok(res, { success: true });
    });

    app.post('/admin/api/lottery-claims/:id/complete', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['lottery_claims', 'lottery_records']);
        const { claims, claim, records, record } = findClaimWithRecord(req.params.id);
        if (!claim || !record) return fail(res, '领奖记录不存在', 404);
        const claimIndex = claims.findIndex((item) => rowMatchesLookup(item, req.params.id));
        const recordIndex = records.findIndex((item) => rowMatchesLookup(item, claim.lottery_record_id));
        claims[claimIndex] = {
            ...claims[claimIndex],
            status: 'completed',
            resolution_note: pickString(req.body?.resolution_note || claims[claimIndex].resolution_note),
            completed_at: nowIso(),
            updated_at: nowIso()
        };
        records[recordIndex] = {
            ...records[recordIndex],
            fulfillment_status: 'completed',
            updated_at: nowIso()
        };
        saveCollection('lottery_claims', claims);
        saveCollection('lottery_records', records);
        ok(res, { success: true });
    });

    app.post('/admin/api/lottery-records/:id/retry-fulfillment', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['lottery_records', 'users', 'user_coupons', 'wallet_accounts', 'goods_fund_logs', 'point_logs']);
        const records = getCollection('lottery_records');
        const recordIndex = records.findIndex((item) => rowMatchesLookup(item, req.params.id));
        if (recordIndex === -1) return fail(res, '中奖记录不存在', 404);
        const record = normalizeLegacyRecord(records[recordIndex]);
        const rewardType = normalizeRecordType(record.reward_actual_type || record.prize_type);
        if (!['points', 'coupon', 'goods_fund'].includes(rewardType)) {
            return fail(res, '当前奖品类型不支持自动补发', 400);
        }
        if (pickString(record.reward_ref_id) && record.fulfillment_status === 'issued') {
            return ok(res, { success: true, skipped: true, message: '奖品已发放，无需重试' });
        }

        const users = getCollection('users');
        const userCoupons = getCollection('user_coupons');
        const walletAccounts = getCollection('wallet_accounts');
        const goodsFundLogs = getCollection('goods_fund_logs');
        const pointLogs = getCollection('point_logs');

        const rewardResult = buildRewardResult(record, {
            users,
            userCoupons,
            walletAccounts,
            goodsFundLogs,
            pointLogs
        });

        records[recordIndex] = {
            ...records[recordIndex],
            reward_actual_type: rewardResult.reward_actual_type,
            reward_ref_type: rewardResult.reward_ref_type,
            reward_ref_id: rewardResult.reward_ref_id,
            fulfillment_status: 'issued',
            failure_reason: '',
            updated_at: nowIso()
        };

        saveCollection('users', users);
        saveCollection('user_coupons', userCoupons);
        saveCollection('wallet_accounts', walletAccounts);
        saveCollection('goods_fund_logs', goodsFundLogs);
        saveCollection('point_logs', pointLogs);
        saveCollection('lottery_records', records);
        ok(res, { success: true, reward_actual_type: rewardResult.reward_actual_type });
    });
}

module.exports = {
    createLotteryAdminSupport
};
