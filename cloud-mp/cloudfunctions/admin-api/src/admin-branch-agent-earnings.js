'use strict';

const userContract = require('./user-contract');
const {
    normalizeAdministrativeRegionText,
    normalizeCityText
} = require('./shared/region-scope');

const REGION_REWARD_TYPES = new Set(['region_agent', 'region_b3_virtual']);
const STORE_REWARD_TYPES = new Set(['pickup_service_fee', 'pickup_subsidy']);
const STORE_PEER_REWARD_TYPES = new Set(['same_level']);
const REFUND_DEV_FEE_TYPES = new Set(['refund_dev_fee']);
const EARNING_ORDER_STATUSES = new Set([
    'pending_group',
    'paid',
    'pickup_pending',
    'agent_confirmed',
    'shipping_requested',
    'shipped',
    'completed'
]);

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function roundMoney(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
}

function primaryId(row = {}) {
    return row?.id ?? row?._legacy_id ?? row?._id ?? null;
}

function valueTokens(value) {
    if (value == null || value === '') return [];
    const raw = String(value).trim();
    if (!raw) return [];
    const tokens = new Set([raw]);
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) tokens.add(String(numeric));
    return [...tokens];
}

function rowLookupTokens(row = {}, extraValues = []) {
    const values = [
        primaryId(row),
        row._id,
        row.openid,
        row.user_id,
        row.buyer_id,
        row.order_id,
        row.order_no,
        ...extraValues
    ];
    return [...new Set(values.flatMap((item) => valueTokens(item)))];
}

function rowMatchesLookup(row = {}, value, extraValues = []) {
    const targets = valueTokens(value);
    if (!targets.length) return false;
    const tokens = rowLookupTokens(row, extraValues);
    return targets.some((token) => tokens.includes(token));
}

function rowMatchesAnyLookup(row = {}, values = []) {
    return values.some((value) => rowMatchesLookup(row, value));
}

function findByLookup(rows = [], value, extraFactory = null) {
    return rows.find((row) => rowMatchesLookup(row, value, typeof extraFactory === 'function' ? extraFactory(row) : [])) || null;
}

function buildUserLookupExtras(user = {}) {
    return [
        user._legacy_id,
        user.openid,
        user.phone,
        user.member_no,
        user.my_invite_code,
        user.invite_code
    ];
}

function findUserByAnyId(users = [], value) {
    return findByLookup(users, value, buildUserLookupExtras);
}

function buildUserTiny(user) {
    if (!user) return null;
    const canonical = userContract.buildCanonicalUser(user);
    return {
        id: canonical.id,
        nickname: canonical.nickname,
        avatar_url: canonical.avatar_url,
        openid: canonical.openid,
        role_level: canonical.role_level,
        role_name: canonical.role_name,
        member_no: canonical.member_no,
        invite_code: canonical.invite_code,
        is_virtual_settlement: canonical.is_virtual_settlement === true,
        virtual_settlement_type: canonical.virtual_settlement_type,
        virtual_display_name: canonical.virtual_display_name
    };
}

function normalizeBranchScopeLevel(value) {
    const raw = pickString(value).trim().toLowerCase();
    if (raw === 'area') return 'district';
    if (['province', 'city', 'district', 'school'].includes(raw)) return raw;
    return 'district';
}

function normalizeScopeText(value) {
    return normalizeAdministrativeRegionText(value);
}

function branchScopePriority(scopeLevel) {
    return ({
        district: 3,
        city: 2,
        province: 1
    }[normalizeBranchScopeLevel(scopeLevel)] || 0);
}

function buildBranchScopeLabel(station = {}) {
    const scopeLevel = normalizeBranchScopeLevel(station.branch_type);
    if (scopeLevel === 'province') return pickString(station.province);
    if (scopeLevel === 'city') {
        return [pickString(station.province), pickString(station.city)].filter(Boolean).join(' / ');
    }
    return [pickString(station.province), pickString(station.city), pickString(station.district)].filter(Boolean).join(' / ');
}

function buildStationScopeLabel(station = {}) {
    return [pickString(station.province), pickString(station.city), pickString(station.district)].filter(Boolean).join(' / ');
}

function getOrderRegionParts(order = {}) {
    const addr = order.address_snapshot || order.address || {};
    const province = normalizeScopeText(addr.province);
    return {
        province,
        city: normalizeCityText(addr.city, addr.province),
        district: normalizeScopeText(addr.district)
    };
}

function branchAssignmentMatchesOrder(station = {}, order = {}) {
    const scopeLevel = normalizeBranchScopeLevel(station.branch_type);
    if (!['province', 'city', 'district'].includes(scopeLevel)) return false;
    const orderRegion = getOrderRegionParts(order);
    if (!orderRegion.province) return false;
    const stationProvince = normalizeScopeText(station.province);
    const stationCity = normalizeCityText(station.city, station.province);
    const stationDistrict = normalizeScopeText(station.district);
    if (scopeLevel === 'province') return !!stationProvince && stationProvince === orderRegion.province;
    if (scopeLevel === 'city') {
        return !!stationProvince && !!stationCity
            && stationProvince === orderRegion.province
            && stationCity === orderRegion.city;
    }
    return !!stationProvince && !!stationCity && !!stationDistrict
        && stationProvince === orderRegion.province
        && stationCity === orderRegion.city
        && stationDistrict === orderRegion.district;
}

function getEffectiveOrderStatus(order = {}) {
    return pickString(order.status);
}

function isEarningOrder(order = {}) {
    if (pickString(order.type).toLowerCase() === 'exchange') return false;
    return EARNING_ORDER_STATUSES.has(getEffectiveOrderStatus(order));
}

function getOrderAmount(order = {}) {
    return roundMoney(order.pay_amount ?? order.actual_price ?? order.total_amount);
}

function sortBranchAssignments(rows = []) {
    return [...rows].sort((left, right) => {
        const scopeDiff = branchScopePriority(right.branch_type) - branchScopePriority(left.branch_type);
        if (scopeDiff !== 0) return scopeDiff;
        return String(right.updated_at || right.created_at || '').localeCompare(String(left.updated_at || left.created_at || ''));
    });
}

function activeBranchStations(rows = []) {
    return sortBranchAssignments(rows
        .map((row) => ({ ...row, branch_type: normalizeBranchScopeLevel(row.branch_type || row.type || 'district') }))
        .filter((row) => pickString(row.status || 'active') === 'active'));
}

function findBranchStationForOrder(order = {}, stations = []) {
    return stations.find((station) => branchAssignmentMatchesOrder(station, order)) || null;
}

function resolveRegionRewardRate(policy = {}, cumulativeAmount = 0) {
    return (Array.isArray(policy.region_reward_tiers) ? policy.region_reward_tiers : [])
        .reduce((current, tier) => (
            cumulativeAmount >= toNumber(tier.threshold, 0) ? toNumber(tier.rate, current) : current
        ), 0);
}

function createAmountSummary() {
    return {
        total: 0,
        pending: 0,
        frozen: 0,
        pending_approval: 0,
        settled: 0,
        cancelled: 0,
        count: 0
    };
}

function addCommissionToSummary(summary, commission = {}) {
    const amount = roundMoney(commission.amount);
    const status = pickString(commission.status || 'unknown').toLowerCase();
    summary.total = roundMoney(summary.total + amount);
    summary.count += 1;
    if (status === 'pending') summary.pending = roundMoney(summary.pending + amount);
    else if (status === 'frozen') summary.frozen = roundMoney(summary.frozen + amount);
    else if (status === 'pending_approval') summary.pending_approval = roundMoney(summary.pending_approval + amount);
    else if (['approved', 'settled', 'completed'].includes(status)) summary.settled = roundMoney(summary.settled + amount);
    else if (status === 'cancelled') summary.cancelled = roundMoney(summary.cancelled + amount);
}

function summarizeCommissions(rows = []) {
    const summary = createAmountSummary();
    rows.forEach((row) => addCommissionToSummary(summary, row));
    return summary;
}

function buildStoreManagerSummary(station = {}, staffRows = [], users = []) {
    const managerRows = staffRows.filter((row) => (
        pickString(row.station_id)
        && rowMatchesLookup(station, row.station_id)
        && pickString(row.status || 'active') === 'active'
    ));
    const managers = managerRows
        .filter((row) => pickString(row.role || 'staff') === 'manager')
        .map((row) => buildUserTiny(findUserByAnyId(users, row.openid || row.user_id)))
        .filter(Boolean);
    const claimant = findUserByAnyId(users, station.pickup_claimant_id || station.pickup_claimant_openid || station.claimant_id || station.user_id || station.openid);
    return {
        claimant: buildUserTiny(claimant),
        managers,
        staff_count: managerRows.length
    };
}

function orderMatchesPickupStation(order = {}, station = {}) {
    return rowMatchesAnyLookup(station, [
        order.pickup_station_id,
        order.pickup_verified_station_id,
        order.station_id,
        order.branch_station_id
    ]);
}

function commissionMatchesStore(commission = {}, station = {}, orders = []) {
    if (!STORE_REWARD_TYPES.has(pickString(commission.type).toLowerCase())) return false;
    if (rowMatchesAnyLookup(station, [
        commission.branch_station_id,
        commission.station_id,
        commission.pickup_station_id,
        commission.pickup_verified_station_id
    ])) return true;
    const order = findByLookup(orders, commission.order_id || commission.order_no, (row) => [row.order_no]);
    return !!order && orderMatchesPickupStation(order, station);
}

function commissionMatchesRegion(commission = {}, station = {}) {
    return REGION_REWARD_TYPES.has(pickString(commission.type).toLowerCase())
        && rowMatchesAnyLookup(station, [commission.branch_station_id, commission.station_id]);
}

function buildRegionRows({ branchStations, orders, commissions, users, policy }) {
    const activeStations = activeBranchStations(branchStations);
    return activeStations.map((station) => {
        const matchedOrders = orders.filter((order) => isEarningOrder(order) && findBranchStationForOrder(order, activeStations) === station);
        const orderAmount = roundMoney(matchedOrders.reduce((sum, order) => sum + getOrderAmount(order), 0));
        const rewardRate = resolveRegionRewardRate(policy, orderAmount);
        const stationCommissions = commissions.filter((commission) => commissionMatchesRegion(commission, station));
        const claimant = findUserByAnyId(users, station.claimant_id || station.openid || station.user_id);
        return {
            id: primaryId(station),
            name: pickString(station.name || station.region_name || buildBranchScopeLabel(station)),
            branch_type: normalizeBranchScopeLevel(station.branch_type),
            scope_label: buildBranchScopeLabel(station),
            province: pickString(station.province),
            city: pickString(station.city),
            district: pickString(station.district),
            claimant_id: primaryId(claimant) || station.claimant_id || null,
            claimant: buildUserTiny(claimant),
            order_count: matchedOrders.length,
            order_amount: orderAmount,
            reward_rate: rewardRate,
            expected_reward_amount: roundMoney(orderAmount * rewardRate),
            rewards: summarizeCommissions(stationCommissions),
            last_reward_at: stationCommissions
                .map((row) => pickString(row.settled_at || row.unfrozen_at || row.updated_at || row.created_at))
                .filter(Boolean)
                .sort()
                .pop() || ''
        };
    });
}

function buildStoreRows({ stations, staffRows, orders, commissions, users, annualGoodsRewards = [] }) {
    return stations
        .filter((station) => pickString(station.status || 'active') !== 'deleted')
        .map((station) => {
            const matchedOrders = orders.filter((order) => isEarningOrder(order) && orderMatchesPickupStation(order, station));
            const verifiedOrders = matchedOrders.filter((order) => pickString(order.pickup_verified_at || order.verified_at || order.confirmed_at));
            const orderAmount = roundMoney(matchedOrders.reduce((sum, order) => sum + getOrderAmount(order), 0));
            const stationCommissions = commissions.filter((commission) => commissionMatchesStore(commission, station, orders));
            const managerSummary = buildStoreManagerSummary(station, staffRows, users);
            const recipientOpenids = new Set([
                managerSummary.claimant?.openid,
                ...(managerSummary.managers || []).map((user) => user.openid)
            ].filter(Boolean).map((value) => pickString(value)));
            const peerBonusCommissions = commissions.filter((commission) => (
                STORE_PEER_REWARD_TYPES.has(pickString(commission.type).toLowerCase())
                && toNumber(commission.bonus_role_level || commission.level, 0) === 6
                && recipientOpenids.has(pickString(commission.openid))
            ));
            const refundDevFees = commissions.filter((commission) => (
                REFUND_DEV_FEE_TYPES.has(pickString(commission.type).toLowerCase())
                && recipientOpenids.has(pickString(commission.openid))
            ));
            const annualGoods = annualGoodsRewards.filter((row) => rowMatchesAnyLookup(station, [row.store_id, row.station_id]));
            return {
                id: primaryId(station),
                name: pickString(station.name || station.station_name || station.title || '未命名门店'),
                scope_label: buildStationScopeLabel(station),
                province: pickString(station.province),
                city: pickString(station.city),
                district: pickString(station.district),
                status: pickString(station.status || 'active'),
                is_pickup_point: station.is_pickup_point === undefined ? true : station.is_pickup_point,
                pickup_commission_tier: pickString(station.pickup_commission_tier || 'A'),
                order_count: matchedOrders.length,
                verified_order_count: verifiedOrders.length,
                order_amount: orderAmount,
                rewards: summarizeCommissions(stationCommissions),
                service_fee_rewards: summarizeCommissions(stationCommissions),
                peer_bonus_rewards: summarizeCommissions(peerBonusCommissions),
                refund_dev_fees: summarizeCommissions(refundDevFees),
                annual_goods_rewards: {
                    total: roundMoney(annualGoods.reduce((sum, row) => sum + toNumber(row.reward_goods_amount, 0), 0)),
                    pending_approval: roundMoney(annualGoods
                        .filter((row) => pickString(row.status || 'pending_approval') === 'pending_approval')
                        .reduce((sum, row) => sum + toNumber(row.reward_goods_amount, 0), 0)),
                    settled: roundMoney(annualGoods
                        .filter((row) => ['settled', 'completed'].includes(pickString(row.status).toLowerCase()))
                        .reduce((sum, row) => sum + toNumber(row.reward_goods_amount, 0), 0)),
                    count: annualGoods.length
                },
                ...managerSummary,
                last_reward_at: stationCommissions
                    .map((row) => pickString(row.settled_at || row.unfrozen_at || row.updated_at || row.created_at))
                    .filter(Boolean)
                    .sort()
                    .pop() || ''
            };
        });
}

function summarizeRows(rows = []) {
    return rows.reduce((summary, row) => ({
        order_count: summary.order_count + toNumber(row.order_count, 0),
        order_amount: roundMoney(summary.order_amount + toNumber(row.order_amount, 0)),
        reward_total: roundMoney(summary.reward_total + toNumber(row.rewards?.total, 0)),
        peer_bonus_total: roundMoney(summary.peer_bonus_total + toNumber(row.peer_bonus_rewards?.total, 0)),
        annual_goods_total: roundMoney(summary.annual_goods_total + toNumber(row.annual_goods_rewards?.total, 0)),
        refund_dev_fee_total: roundMoney(summary.refund_dev_fee_total + toNumber(row.refund_dev_fees?.total, 0)),
        pending_approval: roundMoney(summary.pending_approval + toNumber(row.rewards?.pending_approval, 0)),
        settled: roundMoney(summary.settled + toNumber(row.rewards?.settled, 0)),
        frozen: roundMoney(summary.frozen + toNumber(row.rewards?.frozen, 0))
    }), {
        order_count: 0,
        order_amount: 0,
        reward_total: 0,
        peer_bonus_total: 0,
        annual_goods_total: 0,
        refund_dev_fee_total: 0,
        pending_approval: 0,
        settled: 0,
        frozen: 0
    });
}

function registerBranchAgentEarningsRoutes(app, deps) {
    const {
        auth,
        requirePermission,
        ensureFreshCollections,
        getCollection,
        ok,
        getBranchAgentPolicySnapshot
    } = deps;

    app.get('/admin/api/branch-agents/earnings', auth, requirePermission('dealers'), async (_req, res) => {
        await ensureFreshCollections(['users', 'orders', 'commissions', 'stations', 'station_staff', 'branch_agent_stations', 'store_annual_goods_rewards', 'configs']);
        const users = getCollection('users');
        const orders = getCollection('orders');
        const commissions = getCollection('commissions');
        const stations = getCollection('stations');
        const staffRows = getCollection('station_staff');
        const branchStations = getCollection('branch_agent_stations');
        const annualGoodsRewards = getCollection('store_annual_goods_rewards');
        const policy = typeof getBranchAgentPolicySnapshot === 'function' ? getBranchAgentPolicySnapshot() : {};

        const regions = buildRegionRows({ branchStations, orders, commissions, users, policy });
        const stores = buildStoreRows({ stations, staffRows, orders, commissions, users, annualGoodsRewards });

        ok(res, {
            summary: {
                regions: summarizeRows(regions),
                stores: summarizeRows(stores)
            },
            regions,
            stores
        });
    });
}

module.exports = {
    registerBranchAgentEarningsRoutes,
    buildRegionRows,
    buildStoreRows
};
