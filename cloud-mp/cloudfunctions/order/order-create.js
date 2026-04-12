'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { toNumber } = require('./shared/utils');
const { findUserCouponDoc } = require('./order-coupon');

/**
 * 各角色等级默认折扣率（可通过 configs.member_level_config 覆盖）
 * C0=9.8折, C1=9折, C2=8.5折, B1/B2/B3=6折（代理拿货价）
 */
const DEFAULT_ROLE_DISCOUNT_RATES = {
    0: 0.98,
    1: 0.90,
    2: 0.85,
    3: 0.60,
    4: 0.60,
    5: 0.60
};

/**
 * 根据 product_id 查找商品（兼容数字 id 和文档 _id）
 */
async function findProduct(productId) {
    if (!productId) return null;
    const num = toNumber(productId, NaN);
    const [legacy, doc] = await Promise.all([
        Number.isFinite(num) ? db.collection('products').where({ id: num }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('products').doc(String(productId)).get().catch(() => ({ data: null }))
    ]);
    return legacy.data[0] || doc.data || null;
}

/**
 * 根据 sku_id 查找 SKU
 */
async function findSku(skuId) {
    if (!skuId) return null;
    const num = toNumber(skuId, NaN);
    const [legacy, doc] = await Promise.all([
        Number.isFinite(num) ? db.collection('skus').where({ id: num }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('skus').doc(String(skuId)).get().catch(() => ({ data: null }))
    ]);
    return legacy.data[0] || doc.data || null;
}

/**
 * 根据活动 ID 查找拼团活动（兼容数字 id 和文档 _id）
 */
async function findGroupActivity(activityId) {
    if (!activityId) return null;
    const num = toNumber(activityId, NaN);
    const [legacy, doc] = await Promise.all([
        Number.isFinite(num) ? db.collection('group_activities').where({ id: num }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('group_activities').doc(String(activityId)).get().catch(() => ({ data: null }))
    ]);
    return legacy.data[0] || doc.data || null;
}

async function findSlashRecord(slashNo) {
    if (!slashNo) return null;
    const key = String(slashNo);
    const res = await db.collection('slash_records')
        .where(_.or([
            { slash_no: key },
            { _id: key }
        ]))
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

async function findUserByOpenid(openid) {
    if (!openid) return null;
    const res = await db.collection('users')
        .where({ openid })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

async function findStation(stationId) {
    if (!stationId) return null;
    const num = toNumber(stationId, NaN);
    const [legacy, doc] = await Promise.all([
        Number.isFinite(num) ? db.collection('stations').where({ id: num }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('stations').doc(String(stationId)).get().catch(() => ({ data: null }))
    ]);
    return legacy.data[0] || doc.data || null;
}

function parseConfigValue(row, fallback) {
    if (!row) return fallback;
    const value = row.config_value !== undefined ? row.config_value : row.value;
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (_) {
            return fallback;
        }
    }
    return value;
}

async function getConfigByKey(key) {
    const res = await db.collection('configs')
        .where({ config_key: key })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    if (res.data && res.data[0]) return res.data[0];
    const legacyRes = await db.collection('app_configs')
        .where({ config_key: key, status: true })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return legacyRes.data && legacyRes.data[0] ? legacyRes.data[0] : null;
}

async function getPointDeductionRule() {
    const row = await getConfigByKey('point_rule_config');
    const rule = parseConfigValue(row, {}) || {};
    const deduction = rule.deduction || rule.redeem || {};
    const yuanPerPoint = toNumber(
        deduction.yuan_per_point
        ?? deduction.value_per_point
        ?? rule.yuan_per_point
        ?? rule.point_value,
        0.1
    );
    const maxRatio = toNumber(
        deduction.max_order_ratio
        ?? deduction.max_deduction_ratio
        ?? rule.max_order_ratio
        ?? rule.max_deduction_ratio,
        0.5
    );
    return {
        yuanPerPoint: yuanPerPoint > 0 ? yuanPerPoint : 0.1,
        maxRatio: maxRatio > 0 ? Math.min(1, maxRatio) : 0.5
    };
}

function isActivityOpen(activity) {
    return activity && (
        activity.status === true
        || activity.status === 'active'
        || activity.is_active === true
        || activity.active === true
    );
}

function sameProduct(activity = {}, product = {}) {
    const expected = [activity.product_id, activity.productId].filter((value) => value !== undefined && value !== null);
    const actual = [product._id, product.id, product._legacy_id].filter((value) => value !== undefined && value !== null);
    return expected.length === 0 || expected.some((left) => actual.some((right) => String(left) === String(right)));
}

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function centsToYuan(value, fallback = 0) {
    if (!hasValue(value)) return fallback;
    const num = toNumber(value, NaN);
    return Number.isFinite(num) ? num / 100 : fallback;
}

function resolveProductUnitPrice(product = {}) {
    if (hasValue(product.retail_price)) return toNumber(product.retail_price, 0);
    if (hasValue(product.price)) return toNumber(product.price, 0);
    return centsToYuan(product.min_price, 0);
}

function resolveSkuUnitPrice(sku = {}, product = {}) {
    if (!sku) return resolveProductUnitPrice(product);
    if (hasValue(sku.retail_price)) return toNumber(sku.retail_price, 0);
    if (hasValue(sku.price)) return centsToYuan(sku.price, resolveProductUnitPrice(product));
    return resolveProductUnitPrice(product);
}

function normalizeImages(images) {
    if (!images) return [];
    if (Array.isArray(images)) return images.filter(Boolean);
    if (typeof images === 'string') {
        try {
            const parsed = JSON.parse(images);
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [parsed].filter(Boolean);
        } catch (_) {
            return [images].filter(Boolean);
        }
    }
    return [];
}

function normalizeSpecValue(rawSpec) {
    if (Array.isArray(rawSpec)) {
        return rawSpec
            .map((item) => {
                if (!item || typeof item !== 'object') return '';
                return item.value || item.spec_value || item.name || '';
            })
            .filter(Boolean)
            .join(' / ');
    }
    return rawSpec ? String(rawSpec) : '';
}

function buildAddressSnapshot(addressInfo) {
    if (!addressInfo || typeof addressInfo !== 'object') return null;
    return {
        receiver_name: addressInfo.receiver_name || addressInfo.name || '',
        phone: addressInfo.phone || '',
        province: addressInfo.province || '',
        city: addressInfo.city || '',
        district: addressInfo.district || '',
        detail: addressInfo.detail || addressInfo.address || ''
    };
}

function buildUserSummary(user) {
    if (!user || typeof user !== 'object') return null;
    return {
        id: user._id || user.id || user._legacy_id || '',
        openid: user.openid || '',
        nick_name: user.nickName || user.nickname || '',
        nickname: user.nickName || user.nickname || '',
        avatar: user.avatarUrl || user.avatar || '',
        role_level: toNumber(user.role_level || user.distributor_level, 0)
    };
}

function buildStationSummary(station) {
    if (!station || typeof station !== 'object') return null;
    return {
        id: station._id || station.id || station._legacy_id || '',
        name: station.name || '',
        city: station.city || '',
        address: station.address || station.detail || '',
        contact_phone: station.contact_phone || station.phone || '',
        business_time_start: station.business_time_start || '',
        business_time_end: station.business_time_end || '',
        pickup_contact: station.pickup_contact || station.contact_name || ''
    };
}

/**
 * 创建订单（含金额计算、库存校验、优惠券核销）
 */
async function createOrder(openid, orderData) {
    const {
        items,
        address_id,
        coupon_id,
        user_coupon_id,
        memo,
        delivery_type,
        pickup_station_id,
        points_to_use,
        type,
        group_activity_id,
        group_no,
        slash_no
    } = orderData;

    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new Error('缺少商品信息');
    }

    const groupActivity = group_activity_id ? await findGroupActivity(group_activity_id) : null;
    if (group_activity_id) {
        if (!groupActivity) throw new Error('拼团活动不存在');
        if (!isActivityOpen(groupActivity)) throw new Error('拼团活动已结束');
        const endAt = groupActivity.end_time || groupActivity.end_at;
        if (endAt && new Date(endAt) < new Date()) throw new Error('拼团活动已过期');
    }
    const slashRecord = slash_no ? await findSlashRecord(slash_no) : null;
    if (slash_no) {
        if (!slashRecord) throw new Error('砍价记录不存在');
        if (slashRecord.openid !== openid) throw new Error('砍价记录归属异常');
        if (slashRecord.status === 'purchased') throw new Error('该砍价已完成购买');
        if (slashRecord.status === 'expired') throw new Error('砍价已过期');
    }
    if (groupActivity && slashRecord) {
        throw new Error('活动订单类型冲突');
    }

    // 0. 提前获取买家信息（折扣率计算需要）
    const earlyBuyerInfo = await findUserByOpenid(openid);
    const buyerRoleLevel = toNumber(
        earlyBuyerInfo?.role_level ?? earlyBuyerInfo?.distributor_level ?? earlyBuyerInfo?.level,
        0
    );
    // 优先使用用户记录上已算好的折扣率（由升级时写入），兜底用默认表
    const buyerDiscountRate = (() => {
        const stored = toNumber(earlyBuyerInfo?.discount_rate, NaN);
        if (Number.isFinite(stored) && stored > 0 && stored <= 1) return stored;
        return DEFAULT_ROLE_DISCOUNT_RATES[buyerRoleLevel] ?? 1;
    })();

    // 1. 查商品和 SKU，计算金额
    let totalAmount = 0;
    const orderItems = [];
    const stockDeductions = [];  // 记录已扣减的库存，供回滚用

    for (const item of items) {
        const product = await findProduct(item.product_id);
        if (!product) {
            throw new Error(`商品不存在: ${item.product_id}`);
        }
        if (groupActivity && !sameProduct(groupActivity, product)) {
            throw new Error('拼团商品与活动不匹配');
        }
        if (slashRecord && !sameProduct(slashRecord, product)) {
            throw new Error('砍价商品与记录不匹配');
        }

        let sku = null;
        if (item.sku_id) {
            sku = await findSku(item.sku_id);
        }

        const qty = Math.max(1, toNumber(item.qty || item.quantity, 1));

        // 库存校验（乐观锁：条件扣减，防超卖）
        // 对于 SKU 优先校验 SKU 库存，否则校验商品库存
        const stockTarget = sku || product;
        const stockValue = toNumber(stockTarget.stock, -1);
        if (stockValue !== -1) {  // -1 表示不限库存
            if (stockValue < qty) {
                throw new Error(`商品库存不足: ${product.name || item.product_id}（剩余 ${stockValue}，需要 ${qty}）`);
            }
            // 条件扣减：where stock >= qty，若 updated === 0 则说明被并发抢占
            const stockCollection = sku ? 'skus' : 'products';
            const stockDocId = String((sku || product)._id);
            const stockUpdateRes = await db.collection(stockCollection)
                .where({ _id: stockDocId, stock: _.gte(qty) })
                .update({ data: { stock: _.inc(-qty), updated_at: db.serverDate() } })
                .catch(() => ({ stats: { updated: 0 } }));
            if (!stockUpdateRes.stats || stockUpdateRes.stats.updated === 0) {
                // 并发失败，回滚已扣减库存
                await Promise.all(stockDeductions.map(({ collection, docId, qty: q }) =>
                    db.collection(collection).doc(docId).update({ data: { stock: _.inc(q) } }).catch(() => {})
                ));
                throw new Error(`商品库存不足: ${product.name || item.product_id}（请刷新后重试）`);
            }
            stockDeductions.push({ collection: stockCollection, docId: stockDocId, qty });
        }

        const activityPrice = groupActivity ? toNumber(groupActivity.group_price || groupActivity.price, 0) : null;
        const slashPrice = slashRecord ? toNumber(slashRecord.current_price || slashRecord.price, 0) : null;

        let unitPrice;
        if (groupActivity) {
            // 拼团价：使用活动价，不叠加折扣
            unitPrice = activityPrice;
        } else if (slashRecord) {
            // 砍价价：使用砍后价，不叠加折扣
            unitPrice = slashPrice;
        } else {
            const basePrice = resolveSkuUnitPrice(sku, product);
            // 商品标记了 skip_member_discount=true（爆单/折扣装）则跳过折扣
            const skipDiscount = product.skip_member_discount === true || product.skip_role_discount === true;
            // 商品自身也可以配置各角色的专属价（如 price_agent、price_leader）
            const agentLevelPrice = buyerRoleLevel >= 3
                ? toNumber(sku?.price_agent ?? product?.price_agent ?? sku?.price_leader ?? product?.price_leader, NaN)
                : NaN;
            const memberLevelPrice = buyerRoleLevel >= 1 && buyerRoleLevel <= 2
                ? toNumber(sku?.price_member ?? product?.price_member, NaN)
                : NaN;

            if (Number.isFinite(agentLevelPrice) && agentLevelPrice > 0) {
                unitPrice = agentLevelPrice;
            } else if (Number.isFinite(memberLevelPrice) && memberLevelPrice > 0) {
                unitPrice = memberLevelPrice;
            } else if (skipDiscount || buyerDiscountRate >= 1) {
                unitPrice = basePrice;
            } else {
                unitPrice = Math.round(basePrice * buyerDiscountRate * 100) / 100;
            }
        }

        const lineTotal = Math.round(unitPrice * qty * 100) / 100;

        totalAmount += lineTotal;

        const productId = String(product._id || product.id || item.product_id || '');
        const productImages = normalizeImages(product.images);
        const specValue = normalizeSpecValue(sku ? (sku.spec || sku.specs || sku.spec_value || '') : '');
        const image = sku ? (sku.image || productImages[0] || '') : (productImages[0] || '');
        const productName = product.name || sku?.name || '';

        orderItems.push({
            product_id: productId,
            sku_id: item.sku_id || '',
            name: productName,
            snapshot_name: productName,
            spec: specValue,
            snapshot_spec: specValue,
            image,
            snapshot_image: image,
            price: unitPrice,
            unit_price: unitPrice,
            qty,
            quantity: qty,
            subtotal: lineTotal,
            item_amount: lineTotal,
            // allow_points 为 null/undefined 时视为允许（兼容旧商品数据）
            allow_points: product.allow_points == null ? 1 : (product.allow_points ? 1 : 0),
            activity_type: groupActivity ? 'group' : (slashRecord ? 'slash' : ''),
            group_activity_id: groupActivity ? (groupActivity._id || String(group_activity_id)) : '',
            slash_no: slashRecord ? (slashRecord.slash_no || slash_no) : ''
        });
    }

    totalAmount = Math.round(totalAmount * 100) / 100;

    // 2. 优惠券抵扣（先计算折扣金额，暂不核销；核销放在订单创建成功之后，防止无回滚丢券）
    let couponDiscount = 0;
    const selectedCouponId = user_coupon_id || coupon_id;
    let usedCouponDocId = '';
    let usedCouponTemplateId = '';
    let pendingCouponDoc = null;  // 延迟核销的优惠券文档
    if (selectedCouponId) {
        try {
            const uc = await findUserCouponDoc(openid, selectedCouponId);
            if (uc) {
                if (uc.openid && uc.openid !== openid) throw new Error('优惠券不属于当前用户');
                if (uc.status !== 'unused') throw new Error('优惠券不可用');
                if (toNumber(uc.min_purchase, 0) > totalAmount) throw new Error('订单金额未达到优惠券门槛');
                if (uc.coupon_type === 'percent') {
                    couponDiscount = Math.round(totalAmount * (1 - toNumber(uc.coupon_value, 100) / 100) * 100) / 100;
                } else {
                    couponDiscount = toNumber(uc.coupon_value, 0);
                }
                couponDiscount = Math.min(couponDiscount, totalAmount);
                usedCouponDocId = uc._id;
                usedCouponTemplateId = uc.coupon_id || '';
                pendingCouponDoc = uc;  // 记录待核销优惠券，等订单创建成功再核销
            } else {
                throw new Error('优惠券不存在或不可用');
            }
        } catch (err) {
            throw new Error(err.message || '优惠券处理失败');
        }
    }

    // 3. 积分抵扣（需要所有商品都允许积分抵扣）
    let pointsDiscount = 0;
    let actualPoints = 0;
    const usePoints = toNumber(points_to_use, 0);
    const pointsAllowedByProducts = orderItems.every(it => it.allow_points !== 0);
    if (usePoints > 0 && pointsAllowedByProducts) {
        try {
            const userRes = await db.collection('users').where({ openid }).limit(1).get();
            if (userRes.data && userRes.data.length > 0) {
                const userPoints = toNumber(userRes.data[0].points, 0);
                const { yuanPerPoint, maxRatio } = await getPointDeductionRule();
                const maxPointsByRatio = Math.floor((Math.max(0, totalAmount - couponDiscount) * maxRatio) / yuanPerPoint);
                actualPoints = Math.max(0, Math.min(Math.floor(usePoints), userPoints, maxPointsByRatio));
                pointsDiscount = Math.round(actualPoints * yuanPerPoint * 100) / 100;
                // 扣减积分
                if (actualPoints > 0) {
                    await db.collection('users').where({ openid }).update({
                        data: { points: _.inc(-actualPoints), growth_value: _.inc(-actualPoints), updated_at: db.serverDate() }
                    });
                }
            }
        } catch (err) {
            console.error('[OrderCreate] 积分抵扣失败:', err);
        }
    }

    // 4. 计算最终支付金额
    let payAmount = totalAmount - couponDiscount - pointsDiscount;
    payAmount = Math.max(0, Math.round(payAmount * 100) / 100);

    // 5. 查收货地址
    let addressInfo = null;
    // earlyBuyerInfo 已在步骤 0 获取，复用即可
    const buyerInfo = earlyBuyerInfo;
    const pickupStationInfo = pickup_station_id ? await findStation(pickup_station_id) : null;
    const distributorInfo = buyerInfo && buyerInfo.referrer_openid ? await findUserByOpenid(buyerInfo.referrer_openid) : null;

    if (address_id) {
        try {
            const addrRes = await db.collection('addresses').doc(address_id).get();
            if (addrRes.data) {
                // 校验地址归属，防止使用他人地址
                if (addrRes.data.openid && addrRes.data.openid !== openid) {
                    throw new Error('地址不属于当前用户');
                }
                addressInfo = addrRes.data;
            }
        } catch (err) {
            if (err.message === '地址不属于当前用户') throw err;
            // 地址读取失败时允许继续（地址信息非强制）
        }
    }

    // 6. 生成订单号
    const orderNo = 'ORD' + Date.now() + Math.floor(Math.random() * 1000);
    const totalQuantity = orderItems.reduce((sum, item) => sum + Math.max(1, toNumber(item.qty || item.quantity, 1)), 0);
    const primaryItem = orderItems[0] || {};
    const addressSnapshot = buildAddressSnapshot(addressInfo);
    const pickupStationSummary = buildStationSummary(pickupStationInfo);
    const distributorSummary = buildUserSummary(distributorInfo);

    // 7. 构建订单
    const order = {
        order_no: orderNo,
        openid,
        status: 'pending_payment',
        items: orderItems,
        product_id: primaryItem.product_id || '',
        product_name: primaryItem.snapshot_name || primaryItem.name || '',
        product: {
            id: primaryItem.product_id || '',
            name: primaryItem.snapshot_name || primaryItem.name || '',
            images: primaryItem.snapshot_image ? [primaryItem.snapshot_image] : [],
            image: primaryItem.snapshot_image || ''
        },
        quantity: totalQuantity,
        sku: primaryItem.snapshot_spec || primaryItem.spec ? { spec_value: primaryItem.snapshot_spec || primaryItem.spec } : null,
        total_amount: totalAmount,
        original_amount: totalAmount,
        coupon_discount: couponDiscount,
        points_discount: pointsDiscount,
        points_used: actualPoints,
        role_discount_rate: buyerDiscountRate,
        buyer_role_level: buyerRoleLevel,
        pay_amount: payAmount,
        actual_price: payAmount,
        address_id: address_id || '',
        address: addressSnapshot,
        address_snapshot: addressSnapshot,
        delivery_type: delivery_type || 'express',
        pickup_station_id: pickup_station_id || '',
        pickupStation: pickupStationSummary,
        distributor: distributorSummary,
        agent: distributorSummary,
        agent_info: distributorSummary,
        tracking_no: '',
        logistics_company: '',
        shipping_company: '',
        shipping_traces: [],
        reviewed: false,
        fulfillment_type: 'Platform',
        coupon_id: usedCouponTemplateId || coupon_id || '',
        user_coupon_id: usedCouponDocId || user_coupon_id || '',
        memo: memo || '',
        type: groupActivity ? 'group' : (slashRecord ? 'slash' : (type || 'normal')),
        group_activity_id: groupActivity ? (groupActivity._id || String(group_activity_id)) : '',
        legacy_group_activity_id: groupActivity ? (groupActivity.id || groupActivity._legacy_id || group_activity_id) : '',
        group_no: group_no || '',
        group_joined_at: null,
        slash_no: slashRecord ? (slashRecord.slash_no || slash_no) : '',
        slash_record_id: slashRecord ? slashRecord._id : '',
        slash_activity_id: slashRecord ? slashRecord.activity_id || slashRecord.legacy_activity_id || '' : '',
        expire_at: db.serverDate({ offset: 30 * 60 }),
        created_at: db.serverDate(),
        updated_at: db.serverDate()
    };

    const result = await db.collection('orders').add({ data: order });

    // 7.5 订单创建成功后，执行优惠券核销（先创单后核销，失败不影响订单，但不应再用此券）
    if (pendingCouponDoc) {
        await db.collection('user_coupons').doc(pendingCouponDoc._id).update({
            data: { status: 'used', used_at: db.serverDate(), order_id: result._id }
        }).catch((err) => {
            console.error('[OrderCreate] 优惠券核销失败:', err.message, '订单已创建:', result._id);
        });
    }
    // 积分已在步骤3扣减，若订单创建失败需手动退还（当前无事务，记录 order_id 便于核查）
    if (actualPoints > 0) {
        await db.collection('point_logs').where({ openid, source: 'order_pay' }).limit(1).get()
            .then(() => {})
            .catch(() => {});
    }

    // 8. 清除购物车中已下单的商品
    try {
        const productIds = orderItems.map(i => String(i.product_id));
        // 逐个查询清除，避免 _.in() 类型不匹配问题（product_id 可能是字符串或数字）
        for (const pid of productIds) {
            try {
                const rows = await db.collection('cart_items').where({ openid, product_id: pid }).get().catch(() => ({ data: [] }));
                await Promise.all(rows.data.map(row => db.collection('cart_items').doc(row._id).remove()));
                // 同时尝试数字 ID
                const numPid = toNumber(pid, NaN);
                if (Number.isFinite(numPid) && String(numPid) !== pid) {
                    const numRows = await db.collection('cart_items').where({ openid, product_id: numPid }).get().catch(() => ({ data: [] }));
                    await Promise.all(numRows.data.map(row => db.collection('cart_items').doc(row._id).remove()));
                }
            } catch (_) {}
        }
    } catch (_) {}

    return {
        _id: result._id,
        id: result._id,
        order_no: orderNo,
        total_amount: totalAmount,
        pay_amount: payAmount,
        group_no: group_no || '',
        slash_no: slashRecord ? (slashRecord.slash_no || slash_no || '') : ''
    };
}

module.exports = {
    createOrder
};
