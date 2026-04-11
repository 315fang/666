'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { toNumber } = require('./shared/utils');
const orderCreate = require('./order-create');

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function refundDeadlineDate() {
    const days = Math.max(0, toNumber(process.env.REFUND_MAX_DAYS || process.env.COMMISSION_FREEZE_DAYS, 7));
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function parseConfigValue(row, fallback) {
    if (!row) return fallback;
    const value = row.config_value !== undefined ? row.config_value : row.value;
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch (_) { return fallback; }
    }
    return value;
}

async function getConfigByKey(key) {
    const res = await db.collection('configs')
        .where(_.or([{ config_key: key }, { key }]))
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    if (res.data && res.data[0]) return res.data[0];
    const legacyRes = await db.collection('app_configs')
        .where({ config_key: key, status: _.in([true, 1, '1']) })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return legacyRes.data && legacyRes.data[0] ? legacyRes.data[0] : null;
}

async function ensurePickupSubsidyCommission(order, verifierOpenid) {
    if (!order?.pickup_station_id) return null;
    const [policyRow, station] = await Promise.all([
        getConfigByKey('branch-agent-policy'),
        findOneByAnyId('branch_agent_stations', order.pickup_station_id)
    ]);
    const policy = {
        enabled: false,
        pickup_station_subsidy_enabled: false,
        pickup_station_subsidy_amount: 0,
        pickup_tiers: {},
        ...parseConfigValue(policyRow, {})
    };
    if (!policy.enabled || !policy.pickup_station_subsidy_enabled || !station) return null;

    const claimantId = station.claimant_id || station.user_id || station.openid;
    const claimant = claimantId ? await findOneByAnyId('users', claimantId) : null;
    if (!claimant?.openid) return null;

    const existing = await db.collection('commissions')
        .where({
            order_id: order._id,
            openid: claimant.openid,
            type: 'pickup_subsidy'
        })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    if (existing.data && existing.data[0]) return existing.data[0];

    const tierKey = String(station.pickup_commission_tier || 'A').trim() || 'A';
    const tier = policy.pickup_tiers?.[tierKey] || {};
    const payAmount = toNumber(order.actual_price ?? order.pay_amount ?? order.total_amount, 0);
    let amount = payAmount * toNumber(tier.rate, 0) + toNumber(tier.fixed_yuan, 0);
    if (amount <= 0) amount = toNumber(policy.pickup_station_subsidy_amount, 0);
    amount = Number(amount.toFixed(2));
    if (amount <= 0) return null;

    const result = await db.collection('commissions').add({
        data: {
            openid: claimant.openid,
            user_id: claimant.id || claimant._id || claimant.openid,
            from_openid: order.openid || '',
            order_id: order._id,
            order_no: order.order_no || '',
            amount,
            level: toNumber(claimant.role_level ?? claimant.distributor_level, 0),
            type: 'pickup_subsidy',
            status: 'pending_approval',
            branch_station_id: station.id || station._id || order.pickup_station_id,
            pickup_verified_by: verifierOpenid || '',
            created_at: db.serverDate(),
            updated_at: db.serverDate(),
            description: `自提核销补贴：${station.name || station.region_name || '站点'}`
        }
    });
    return { _id: result._id, amount };
}

async function findOneByAnyId(collectionName, rawId) {
    if (!hasValue(rawId)) return null;

    const id = String(rawId);
    const byDocId = await db.collection(collectionName).doc(id).get().catch(() => ({ data: null }));
    if (byDocId.data) return byDocId.data;

    const candidates = [id];
    const numericId = Number(id);
    if (Number.isFinite(numericId)) candidates.push(numericId);

    const res = await db.collection(collectionName)
        .where(_.or([
            { id: _.in(candidates) },
            { _legacy_id: _.in(candidates) }
        ]))
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));

    return res.data && res.data[0] ? res.data[0] : null;
}

function isActivityOpen(activity) {
    return activity && (
        activity.status === true
        || activity.status === 'active'
        || activity.is_active === true
        || activity.active === true
    );
}

function productSummary(product) {
    if (!product) return null;
    const images = Array.isArray(product.images) ? product.images : (product.image || product.cover ? [product.image || product.cover] : []);
    return {
        id: product.id || product._legacy_id || product._id,
        _id: product._id,
        name: product.name || product.title || '商品',
        images,
        image: images[0] || '',
        retail_price: product.retail_price || product.price || product.min_price || 0
    };
}

async function loadProductSummary(productId) {
    const product = await findOneByAnyId('products', productId);
    return productSummary(product);
}

function groupStatusForClient(status) {
    if (status === 'pending') return 'open';
    if (status === 'completed') return 'success';
    return status || 'failed';
}

// ==================== 拼团 ====================

/**
 * 加入拼团
 * @param {string} openid - 用户 openid
 * @param {object} params - { group_id, product_id, sku_id, qty, address_id }
 */
async function joinGroup(openid, params) {
    const groupActivityId = params.group_id || params.activity_id || params.id;
    if (!groupActivityId) throw new Error('缺少拼团活动 ID');

    const activity = await findOneByAnyId('group_activities', groupActivityId);
    if (!activity) throw new Error('拼团活动不存在');
    if (!isActivityOpen(activity)) throw new Error('拼团活动已结束');
    const now = new Date();
    if (activity.end_time && new Date(activity.end_time) < now) throw new Error('拼团活动已过期');

    const productId = params.product_id || activity.product_id;
    const order = await orderCreate.createOrder(openid, {
        items: [{
            product_id: productId,
            sku_id: params.sku_id || '',
            quantity: params.qty || params.quantity || 1
        }],
        address_id: params.address_id || '',
        delivery_type: params.delivery_type || 'express',
        pickup_station_id: params.pickup_station_id || '',
        memo: params.memo || '',
        type: 'group',
        group_activity_id: activity._id || String(groupActivityId),
        group_no: params.group_no || ''
    });

    return {
        success: true,
        order_id: order._id,
        id: order._id,
        order_no: order.order_no,
        group_no: params.group_no || '',
        total_amount: order.total_amount,
        pay_amount: order.pay_amount,
        need_pay: true
    };
}

/**
 * 我的拼团列表
 */
async function myGroups(openid, params = {}) {
    const page = toNumber(params.page, 1);
    const pageSize = toNumber(params.pageSize || params.size, 20);

    const res = await db.collection('group_orders')
        .where({
            'members.openid': openid,
        })
        .orderBy('created_at', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get().catch(() => ({ data: [] }));

    const totalRes = await db.collection('group_orders')
        .where({ 'members.openid': openid })
        .count().catch(() => ({ total: 0 }));

    const groups = res.data || [];
    const activityPairs = await Promise.all(groups.map(async (g) => {
        const activity = await findOneByAnyId('group_activities', g.activity_id || g.legacy_activity_id);
        const product = activity ? await loadProductSummary(activity.product_id) : null;
        return [g.group_no, { activity, product }];
    }));
    const activityMap = activityPairs.reduce((map, [groupNo, value]) => {
        map[groupNo] = value;
        return map;
    }, {});

    return {
        list: groups.map(g => {
            const related = activityMap[g.group_no] || {};
            const memberCount = (g.members || []).length;
            const groupOrder = {
                group_no: g.group_no,
                status: groupStatusForClient(g.status),
                current_members: memberCount,
                min_members: g.group_size || related.activity?.min_members || related.activity?.group_size || 2,
                product: related.product
            };
            return {
            _id: g._id,
            id: g._id || g.group_no,
            group_no: g.group_no,
            activity_id: g.activity_id,
            status: g.status,
            member_count: memberCount,
            group_size: g.group_size,
            is_leader: g.leader_openid === openid,
            groupOrder,
            created_at: g.created_at,
        };
        }),
        total: totalRes.total || 0,
        page,
        pageSize,
    };
}

/**
 * 拼团订单详情
 */
async function groupOrderDetail(openid, params) {
    const groupNo = params.group_no || params.id;
    if (!groupNo) throw new Error('缺少拼团编号');

    const groupRes = await db.collection('group_orders')
        .where({ group_no: groupNo })
        .limit(1).get().catch(() => ({ data: [] }));

    if (!groupRes.data || groupRes.data.length === 0) {
        throw new Error('拼团不存在');
    }

    const group = groupRes.data[0];

    // 查关联订单
    const ordersRes = await db.collection('orders')
        .where({ group_no: groupNo })
        .orderBy('created_at', 'asc')
        .get().catch(() => ({ data: [] }));

    // 查活动信息
    let activityInfo = null;
    let product = null;
    if (group.activity_id) {
        activityInfo = await findOneByAnyId('group_activities', group.activity_id || group.legacy_activity_id);
        if (activityInfo) {
            product = await loadProductSummary(activityInfo.product_id);
        }
    }
    const memberCount = (group.members || []).length;

    return {
        _id: group._id,
        group_no: group.group_no,
        status: groupStatusForClient(group.status),
        raw_status: group.status,
        member_count: memberCount,
        current_members: memberCount,
        min_members: group.group_size || activityInfo?.min_members || activityInfo?.group_size || 2,
        group_size: group.group_size,
        is_leader: group.leader_openid === openid,
        is_member: (group.members || []).some(m => m.openid === openid),
        members: (group.members || []).map(m => ({
            openid: m.openid,
            joined_at: m.joined_at,
            is_leader: m.openid === group.leader_openid,
        })),
        orders: (ordersRes.data || []).map(o => ({
            _id: o._id,
            order_no: o.order_no,
            openid: o.openid,
            status: o.status,
            total_amount: o.total_amount,
            pay_amount: o.pay_amount,
            created_at: o.created_at,
        })),
        activity: activityInfo ? {
            _id: activityInfo._id,
            name: activityInfo.name || '',
            group_price: activityInfo.group_price || activityInfo.price,
            original_price: activityInfo.original_price || 0,
            min_members: activityInfo.min_members || activityInfo.group_size || group.group_size || 2,
            max_members: activityInfo.max_members || activityInfo.group_size || group.group_size || 10,
            stock_limit: activityInfo.stock_limit || 0,
            sold_count: activityInfo.sold_count || 0,
            expire_hours: activityInfo.expire_hours || 24,
            image: activityInfo.image || (activityInfo.images || [])[0] || '',
        } : null,
        product,
        group_price: activityInfo?.group_price || activityInfo?.price || 0,
        max_members: activityInfo?.max_members || group.group_size || 10,
        created_at: group.created_at,
    };
}

// ==================== 砍价 ====================

/**
 * 发起砍价
 * @param {string} openid - 用户 openid
 * @param {object} params - { slash_id (活动ID), product_id }
 */
async function slashStart(openid, params) {
    const slashActivityId = params.slash_id || params.activity_id || params.id;
    if (!slashActivityId) throw new Error('缺少砍价活动 ID');

    // 1. 查砍价活动
    const activity = await findOneByAnyId('slash_activities', slashActivityId);
    if (!activity) throw new Error('砍价活动不存在');
    const activityId = activity._id || String(slashActivityId);

    if (!isActivityOpen(activity)) throw new Error('砍价活动已结束');

    // 2. 检查是否已发起
    const existingRes = await db.collection('slash_records')
        .where({
            openid,
            status: 'active',
            activity_id: _.in([activityId, String(slashActivityId)].filter(Boolean))
        })
        .limit(1).get().catch(() => ({ data: [] }));
    if (existingRes.data && existingRes.data.length > 0) {
        const existingRecord = existingRes.data[0];
        return {
            success: true,
            existing: true,
            slash_id: existingRecord._id,
            slash_no: existingRecord.slash_no,
            current_price: existingRecord.current_price,
            target_price: existingRecord.target_price,
            message: '已为你找到进行中的砍价，继续查看即可'
        };
    }


    // 3. 创建砍价记录
    const originalPrice = toNumber(activity.original_price || activity.price, 0);
    const targetPrice = toNumber(activity.target_price || activity.slash_price, 0);
    const maxSlash = toNumber(activity.max_slash || activity.max_cut, originalPrice - targetPrice);
    const currentPrice = originalPrice;
    const slashNo = 'SLH' + Date.now() + Math.floor(Math.random() * 1000);

    const record = {
        slash_no: slashNo,
        activity_id: activityId,
        legacy_activity_id: activity.id || activity._legacy_id || slashActivityId,
        openid,
        product_id: activity.product_id || params.product_id || '',
        original_price: originalPrice,
        target_price: targetPrice,
        current_price: currentPrice,
        total_slashed: 0,
        max_slash: maxSlash,
        slash_count: 0,
        helpers: [],
        status: 'active',
        created_at: db.serverDate(),
        updated_at: db.serverDate(),
    };

    const result = await db.collection('slash_records').add({ data: record });

    return {
        success: true,
        slash_id: result._id,
        slash_no: slashNo,
        original_price: originalPrice,
        target_price: targetPrice,
        current_price: currentPrice,
    };
}

/**
 * 帮砍一刀
 * @param {string} openid - 帮砍者 openid
 * @param {object} params - { slash_id (砍价记录ID), slash_no }
 */
async function slashHelp(openid, params) {
    const slashId = params.slash_id || params.slash_no || params.id;
    if (!slashId) throw new Error('缺少砍价记录 ID');

    // 1. 查砍价记录
    const recordRes = await db.collection('slash_records')
        .where(_.or([
            { slash_no: String(slashId) },
            { _id: String(slashId) }
        ]))
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    const record = recordRes.data && recordRes.data[0] ? recordRes.data[0] : null;
    if (!record) throw new Error('砍价记录不存在');

    if (record.status !== 'active') throw new Error('砍价已结束');

    // 2. 不能帮自己砍
    if (record.openid === openid) throw new Error('不能帮自己砍价');

    // 3. 检查是否已帮砍
    const helpers = record.helpers || [];
    if (helpers.some(h => h.openid === openid)) {
        throw new Error('您已帮砍过了');
    }

    // 4. 计算砍价金额（随机，但不超过剩余可砍金额）
    const remaining = record.current_price - record.target_price;
    if (remaining <= 0) throw new Error('已砍到目标价');

    const minCut = Math.max(0.01, remaining * 0.05);
    const maxCut = Math.min(remaining * 0.3, record.max_slash / (record.slash_count + 5 + 1));
    const cutAmount = Math.round((minCut + Math.random() * (maxCut - minCut)) * 100) / 100;
    const newPrice = Math.max(record.target_price, Math.round((record.current_price - cutAmount) * 100) / 100);
    const actualCut = Math.round((record.current_price - newPrice) * 100) / 100;

    // 5. 更新记录
    await db.collection('slash_records').doc(record._id).update({
        data: {
            current_price: newPrice,
            total_slashed: _.inc(actualCut),
            slash_count: _.inc(1),
            helpers: _.push({
                openid,
                cut_amount: actualCut,
                helped_at: db.serverDate(),
            }),
            status: newPrice <= record.target_price ? 'completed' : 'active',
            updated_at: db.serverDate(),
        },
    });

    return {
        success: true,
        cut_amount: actualCut,
        current_price: newPrice,
        target_price: record.target_price,
        is_completed: newPrice <= record.target_price,
    };
}

/**
 * 砍价记录详情
 */
async function slashDetail(openid, params) {
    const slashNo = params.slash_no || params.slash_id || params.id;
    if (!slashNo) throw new Error('缺少砍价编号');

    const recordRes = await db.collection('slash_records')
        .where(_.or([
            { slash_no: String(slashNo) },
            { _id: String(slashNo) }
        ]))
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));

    if (!recordRes.data || recordRes.data.length === 0) {
        throw new Error('砍价记录不存在');
    }

    const record = recordRes.data[0];
    const activity = await findOneByAnyId('slash_activities', record.activity_id || record.legacy_activity_id);
    const product = await loadProductSummary(record.product_id || activity?.product_id);
    const originalPrice = toNumber(record.original_price || activity?.original_price, 0);
    const floorPrice = toNumber(record.target_price || activity?.floor_price || activity?.target_price, 0);
    const currentPrice = toNumber(record.current_price, originalPrice);
    let status = record.status || 'active';
    if (status === 'completed') status = 'success';
    if (currentPrice <= floorPrice && floorPrice > 0) status = 'success';

    return {
        _id: record._id,
        id: record._id,
        slash_no: record.slash_no,
        status,
        raw_status: record.status,
        original_price: originalPrice,
        floor_price: floorPrice,
        target_price: floorPrice,
        current_price: currentPrice,
        total_slashed: record.total_slashed || Math.max(0, originalPrice - currentPrice),
        helper_count: record.slash_count || (Array.isArray(record.helpers) ? record.helpers.length : 0),
        helpers: record.helpers || [],
        product,
        activity: activity ? {
            _id: activity._id,
            id: activity.id || activity._legacy_id || activity._id,
            max_helpers: activity.max_helpers,
            min_slash_per_helper: activity.min_slash_per_helper,
            max_slash_per_helper: activity.max_slash_per_helper,
            stock_limit: activity.stock_limit || 0,
            sold_count: activity.sold_count || 0
        } : {},
        created_at: record.created_at,
        updated_at: record.updated_at
    };
}

/**
 * 我的砍价列表
 */
async function mySlashList(openid, params = {}) {
    const page = toNumber(params.page, 1);
    const pageSize = toNumber(params.pageSize || params.size, 20);
    const status = params.status;

    let query = db.collection('slash_records').where({ openid });
    if (status) {
        query = query.where({ status });
    }

    const [res, totalRes] = await Promise.all([
        query.orderBy('created_at', 'desc')
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .get().catch(() => ({ data: [] })),
        db.collection('slash_records').where({ openid, ...(status ? { status } : {}) })
            .count().catch(() => ({ total: 0 })),
    ]);

    const records = res.data || [];
    const activityPairs = await Promise.all(records.map(async (r) => {
        const activity = await findOneByAnyId('slash_activities', r.activity_id || r.legacy_activity_id);
        const product = activity ? await loadProductSummary(activity.product_id || r.product_id) : await loadProductSummary(r.product_id);
        return [r.slash_no, { activity, product }];
    }));
    const activityMap = activityPairs.reduce((map, [slashNo, value]) => {
        map[slashNo] = value;
        return map;
    }, {});

    return {
        list: records.map(r => {
            const related = activityMap[r.slash_no] || {};
            const activity = related.activity || {};
            return {
            _id: r._id,
            id: r._id || r.slash_no,
            slash_no: r.slash_no,
            activity_id: r.activity_id,
            product_id: r.product_id,
            original_price: r.original_price,
            target_price: r.target_price,
            floor_price: r.target_price || activity.floor_price || activity.target_price || 0,
            current_price: r.current_price,
            total_slashed: r.total_slashed,
            slash_count: r.slash_count,
            helper_count: r.slash_count || (Array.isArray(r.helpers) ? r.helpers.length : 0),
            product: related.product,
            status: r.status,
            created_at: r.created_at,
        };
        }),
        total: totalRes.total || 0,
        page,
        pageSize,
    };
}

// ==================== 抽奖 ====================

/**
 * 抽奖
 * @param {string} openid - 用户 openid
 * @param {object} params - { lottery_id }
 */
async function lotteryDraw(openid, params) {
    const lotteryId = params.lottery_id || 'default';

    // 1. 查抽奖配置
    const configRes = await db.collection('configs')
        .where(_.or([
            { type: 'lottery', active: true },
            { config_group: 'lottery' },
            { config_key: 'lottery_config' }
        ]))
        .limit(1).get().catch(() => ({ data: [] }));

    const configRow = configRes.data && configRes.data[0] ? configRes.data[0] : null;
    const config = configRow ? (configRow.config_value || configRow.value || {}) : {};

    // 2. 检查抽奖次数
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const todayRecords = await db.collection('lottery_records')
        .where({
            openid,
            created_at: _.gte(today),
        })
        .count().catch(() => ({ total: 0 }));

    const maxDaily = toNumber(config.max_daily_draws, 3);
    if (todayRecords.total >= maxDaily) {
        throw new Error(`今日抽奖次数已用完（${maxDaily}次）`);
    }

    // 3. 查奖品池
    const prizesRes = await db.collection('lottery_prizes')
        .where(_.or([
            { is_active: true },
            { active: true },
            { status: true }
        ]))
        .orderBy('sort_order', 'asc')
        .get().catch(() => ({ data: [] }));

    const prizes = prizesRes.data || [];
    if (prizes.length === 0) throw new Error('暂无奖品');

    // 4. 按概率抽奖（加权随机）
    const totalWeight = prizes.reduce((sum, p) => sum + toNumber(p.probability || p.weight, 1), 0);
    let random = Math.random() * totalWeight;
    let selectedPrize = prizes[prizes.length - 1]; // 默认最后一个（通常是谢谢参与）

    for (const prize of prizes) {
        random -= toNumber(prize.probability || prize.weight, 1);
        if (random <= 0) {
            selectedPrize = prize;
            break;
        }
    }

    // 5. 检查库存
    if (selectedPrize.stock !== undefined && selectedPrize.stock !== null && selectedPrize.stock !== -1 && selectedPrize.stock <= 0) {
        // 库存不足，给个安慰奖
        const consolation = prizes.find(p => p.type === 'consolation' || p.is_consolation);
        selectedPrize = consolation || prizes[prizes.length - 1];
    }

    // 6. 创建抽奖记录
    const record = {
        openid,
        prize_id: selectedPrize._id,
        prize_name: selectedPrize.name || '',
        prize_type: selectedPrize.type || 'point',
        prize_value: selectedPrize.prize_value != null ? selectedPrize.prize_value : (selectedPrize.value || 0),
        lottery_id: lotteryId,
        created_at: db.serverDate(),
    };

    const result = await db.collection('lottery_records').add({ data: record });

    // 7. 发放奖品
    if (selectedPrize.type === 'point' || selectedPrize.type === 'points') {
        const points = toNumber(selectedPrize.prize_value != null ? selectedPrize.prize_value : selectedPrize.value, 0);
        if (points > 0) {
            await db.collection('users').where({ openid }).update({
                data: {
                    points: _.inc(points),
                    growth_value: _.inc(points),
                    updated_at: db.serverDate(),
                },
            });
            await db.collection('point_logs').add({
                data: {
                    openid, type: 'earn', amount: points,
                    source: 'lottery', description: `抽奖获得${points}积分`,
                    created_at: db.serverDate(),
                },
            });
        }
    } else if (selectedPrize.type === 'coupon') {
        // 发放优惠券
        if (selectedPrize.coupon_id) {
            await db.collection('user_coupons').add({
                data: {
                    openid,
                    coupon_id: selectedPrize.coupon_id,
                    status: 'unused',
                    source: 'lottery',
                    created_at: db.serverDate(),
                },
            });
        }
    }

    // 8. 扣减库存
    if (selectedPrize.stock !== undefined && selectedPrize.stock !== null && selectedPrize.stock > 0) {
        await db.collection('lottery_prizes').doc(selectedPrize._id).update({
            data: { stock: _.inc(-1) },
        }).catch(() => {});
    }

    return {
        success: true,
        record_id: result._id,
        prize: {
            _id: selectedPrize._id,
            name: selectedPrize.name,
            type: selectedPrize.type || 'point',
            value: selectedPrize.prize_value != null ? selectedPrize.prize_value : (selectedPrize.value || 0),
            prize_value: selectedPrize.prize_value != null ? selectedPrize.prize_value : (selectedPrize.value || 0),
            image: selectedPrize.image || '',
        },
    };
}

// ==================== 自提核销 ====================

/**
 * 待核销订单列表（门店管理员查看）
 */
async function pickupPendingOrders(openid, params = {}) {
    const stationId = params.station_id || params.pickup_station_id;
    const page = toNumber(params.page, 1);
    const pageSize = toNumber(params.pageSize || params.size, 20);

    let query = db.collection('orders').where({
        delivery_type: 'pickup',
        status: _.in(['paid', 'pickup_pending']),
    });

    if (stationId) {
        query = query.where({ pickup_station_id: stationId });
    }

    const [res, totalRes] = await Promise.all([
        query.orderBy('paid_at', 'desc')
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .get().catch(() => ({ data: [] })),
        query.count().catch(() => ({ total: 0 })),
    ]);

    return {
        list: (res.data || []).map(o => ({
            _id: o._id,
            order_no: o.order_no,
            openid: o.openid,
            items: o.items || [],
            pay_amount: o.pay_amount,
            pickup_station_id: o.pickup_station_id,
            pickup_code: o.pickup_code || '',
            status: o.status,
            paid_at: o.paid_at,
        })),
        total: totalRes.total || 0,
        page,
        pageSize,
    };
}

/**
 * 我的自提订单
 */
async function pickupMyOrder(openid, params) {
    const orderId = params.order_id || params.id;
    if (!orderId) throw new Error('缺少订单 ID');

    const orderRes = await db.collection('orders').doc(orderId).get().catch(() => ({ data: null }));
    if (!orderRes.data || orderRes.data.openid !== openid) {
        throw new Error('订单不存在');
    }

    const order = orderRes.data;
    if (order.delivery_type !== 'pickup') {
        throw new Error('该订单不是自提订单');
    }

    // 如果订单已支付但没有核销码，生成一个
    if ((order.status === 'paid' || order.status === 'pickup_pending') && !order.pickup_code) {
        const pickupCode = String(Math.floor(100000 + Math.random() * 900000));
        await db.collection('orders').doc(orderId).update({
            data: {
                pickup_code: pickupCode,
                status: 'pickup_pending',
                updated_at: db.serverDate(),
            },
        });
        order.pickup_code = pickupCode;
        order.status = 'pickup_pending';
    }

    // 查自提站信息
    let stationInfo = null;
    if (order.pickup_station_id) {
        const stationRes = await db.collection('stations').doc(order.pickup_station_id).get().catch(() => ({ data: null }));
        stationInfo = stationRes.data || null;
    }

    return {
        _id: order._id,
        order_no: order.order_no,
        status: order.status,
        items: order.items || [],
        pay_amount: order.pay_amount,
        pickup_code: order.pickup_code || '',
        pickup_qr_code: order.pickup_qr_code || '',
        station: stationInfo ? {
            _id: stationInfo._id,
            name: stationInfo.name || '',
            address: stationInfo.address || '',
            phone: stationInfo.phone || '',
            business_hours: stationInfo.business_hours || '',
        } : null,
        paid_at: order.paid_at,
        picked_up_at: order.picked_up_at || null,
    };
}

/**
 * 核销码验证（门店管理员用）
 */
async function pickupVerifyCode(openid, params) {
    const code = params.pickup_code || params.code;
    if (!code) throw new Error('缺少核销码');

    // 1. 查找对应订单
    const orderRes = await db.collection('orders')
        .where({ pickup_code: code, delivery_type: 'pickup' })
        .limit(1).get().catch(() => ({ data: [] }));

    if (!orderRes.data || orderRes.data.length === 0) {
        throw new Error('核销码无效');
    }

    const order = orderRes.data[0];

    if (order.status !== 'paid' && order.status !== 'pickup_pending') {
        throw new Error(`订单状态不允许核销: ${order.status}`);
    }

    // 2. 核销
    await db.collection('orders').doc(order._id).update({
        data: {
            status: 'completed',
            picked_up_at: db.serverDate(),
            pickup_verified_by: openid,
            updated_at: db.serverDate(),
        },
    });

    // 3. 自提核销后进入售后冻结期，保持和普通确认收货一致
    await db.collection('commissions')
        .where({ order_id: order._id, status: _.in(['pending', 'pending_approval']) })
        .update({
            data: {
                status: 'frozen',
                frozen_at: db.serverDate(),
                refund_deadline: refundDeadlineDate(),
                updated_at: db.serverDate()
            }
        })
        .catch(() => {});

    await ensurePickupSubsidyCommission(order, openid).catch(() => null);

    return {
        success: true,
        order_id: order._id,
        order_no: order.order_no,
        message: '核销成功',
    };
}

/**
 * 二维码核销（门店管理员用）
 */
async function pickupVerifyQr(openid, params) {
    // 二维码内容和核销码逻辑一样，只是参数来源不同
    const qrData = params.qr_data || params.qr_code || params.pickup_code;
    if (!qrData) throw new Error('缺少二维码数据');

    // 尝试从二维码数据中提取核销码
    let code = qrData;
    try {
        const parsed = JSON.parse(qrData);
        code = parsed.pickup_code || parsed.code || qrData;
    } catch (_) {
        // 非JSON格式，直接使用
    }

    return pickupVerifyCode(openid, { pickup_code: code });
}

module.exports = {
    joinGroup,
    myGroups,
    groupOrderDetail,
    slashStart,
    slashHelp,
    slashDetail,
    mySlashList,
    lotteryDraw,
    pickupPendingOrders,
    pickupMyOrder,
    pickupVerifyCode,
    pickupVerifyQr,
};
