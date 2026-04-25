'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { getOrderByIdOrNo, listRefunds, getRefundDetail } = require('./order-query');
const { restoreUsedCoupon } = require('./order-coupon');
const {
    getRefundTargetText,
    resolveOrderPayAmount,
    resolveOrderPaymentMethod,
    resolveRefundChannel
} = require('./order-contract');
const {
    releasePickupStationInventoryForOrder,
    restorePickupStationInventoryForRefund,
    rollbackPickupStationPrincipalForOrder
} = require('./pickup-station-stock');

const DEFAULT_POINT_RULES = {
    review: {
        points: 10,
        remark: '评价订单奖励'
    }
};

function toNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined || value === '') return [];
    return [value];
}

function pickString(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function roundMoney(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
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

async function loadPointRules() {
    const row = await getConfigByKey('point_rule_config');
    const raw = parseConfigValue(row, {}) || {};
    const review = raw.review && typeof raw.review === 'object' ? raw.review : {};
    const reviewImage = raw.review_image && typeof raw.review_image === 'object' ? raw.review_image : {};
    return {
        review: {
            points: Math.max(0, toNumber(review.points, DEFAULT_POINT_RULES.review.points)),
            remark: pickString(review.remark, DEFAULT_POINT_RULES.review.remark)
        },
        review_image: {
            points: Math.max(0, toNumber(reviewImage.points, Math.max(0, toNumber(review.points, DEFAULT_POINT_RULES.review.points)))),
            remark: pickString(reviewImage.remark, pickString(review.remark, DEFAULT_POINT_RULES.review.remark))
        }
    };
}

function getOrderTotalQuantity(order = {}) {
    const explicit = Math.max(0, toNumber(order.quantity, 0));
    if (explicit > 0) return explicit;
    return toArray(order.items).reduce((sum, item) => {
        return sum + Math.max(1, toNumber(item.qty || item.quantity, 1));
    }, 0);
}

function getOrderRefundProgress(order = {}) {
    const totalQuantity = getOrderTotalQuantity(order);
    const payAmount = roundMoney(resolveOrderPayAmount(order, 0));
    const refundedQuantity = Math.max(0, toNumber(order.refunded_quantity_total, 0));
    const refundedCash = roundMoney(Math.max(0, toNumber(order.refunded_cash_total, 0)));
    const remainingQuantity = Math.max(0, totalQuantity - refundedQuantity);
    const remainingCash = roundMoney(Math.max(0, payAmount - refundedCash));
    return {
        totalQuantity,
        payAmount,
        refundedQuantity,
        refundedCash,
        remainingQuantity,
        remainingCash
    };
}

function allocateProportionalAmounts(items = [], totalAmount = 0, field = 'item_amount') {
    const total = roundMoney(totalAmount);
    if (total <= 0 || !Array.isArray(items) || items.length === 0) return items.map(() => 0);
    const baseValues = items.map((item) => Math.max(0, roundMoney(item && item[field])));
    const baseTotal = roundMoney(baseValues.reduce((sum, value) => sum + value, 0));
    if (baseTotal <= 0) return items.map((_, index) => index === items.length - 1 ? total : 0);

    let allocatedSum = 0;
    return items.map((item, index) => {
        if (index === items.length - 1) return roundMoney(total - allocatedSum);
        const allocated = roundMoney(total * (baseValues[index] / baseTotal));
        allocatedSum = roundMoney(allocatedSum + allocated);
        return allocated;
    });
}

function buildOrderSettlementItems(order = {}) {
    const rawItems = toArray(order.items);
    const hasSnapshot = rawItems.some((item) => item && item.refund_basis_version === 'snapshot_v1');
    const bundleAllocations = hasSnapshot
        ? rawItems.map((item) => roundMoney(item.bundle_discount_allocated_amount))
        : allocateProportionalAmounts(rawItems, toNumber(order.bundle_discount, 0), 'item_amount');
    const couponAllocations = hasSnapshot
        ? rawItems.map((item) => roundMoney(item.coupon_allocated_amount))
        : allocateProportionalAmounts(rawItems, toNumber(order.coupon_discount, 0), 'item_amount');
    const pointsAllocations = hasSnapshot
        ? rawItems.map((item) => roundMoney(item.points_allocated_amount))
        : allocateProportionalAmounts(rawItems, toNumber(order.points_discount, 0), 'item_amount');

    return rawItems.map((item, index) => {
        const quantity = Math.max(1, toNumber(item.qty || item.quantity, 1));
        const itemAmount = roundMoney(item.item_amount != null ? item.item_amount : item.subtotal);
        const bundleDiscountAllocatedAmount = roundMoney(bundleAllocations[index]);
        const couponAllocatedAmount = roundMoney(couponAllocations[index]);
        const pointsAllocatedAmount = roundMoney(pointsAllocations[index]);
        const cashPaidAllocatedAmount = roundMoney(
            item.cash_paid_allocated_amount != null
                ? item.cash_paid_allocated_amount
                : (itemAmount - bundleDiscountAllocatedAmount - couponAllocatedAmount - pointsAllocatedAmount)
        );
        const refundedQuantity = Math.max(0, Math.min(quantity, toNumber(item.refunded_quantity, 0)));
        const refundedCashAmount = roundMoney(Math.max(0, Math.min(cashPaidAllocatedAmount, toNumber(item.refunded_cash_amount, 0))));
        return {
            ...item,
            refund_item_key: item.refund_item_key || `${item.product_id || 'product'}::${item.sku_id || 'nosku'}::${index}`,
            quantity,
            qty: quantity,
            item_amount: itemAmount,
            bundle_discount_allocated_amount: bundleDiscountAllocatedAmount,
            cash_paid_allocated_amount: cashPaidAllocatedAmount,
            refunded_quantity: refundedQuantity,
            refunded_cash_amount: refundedCashAmount,
            refundable_quantity: Math.max(0, quantity - refundedQuantity),
            refundable_cash_amount: roundMoney(Math.max(0, cashPaidAllocatedAmount - refundedCashAmount)),
            refund_basis_version: item.refund_basis_version || (hasSnapshot ? 'snapshot_v1' : 'legacy_estimated')
        };
    });
}

function normalizeRequestedRefundItems(rawItems = []) {
    return toArray(rawItems)
        .map((item) => ({
            refund_item_key: pickString(item.refund_item_key),
            product_id: pickString(item.product_id),
            sku_id: pickString(item.sku_id),
            quantity: Math.max(0, toNumber(item.quantity ?? item.qty, 0))
        }))
        .filter((item) => item.quantity > 0);
}

function computeRefundSnapshot(order = {}, params = {}) {
    const progress = getOrderRefundProgress(order);
    if (progress.remainingQuantity <= 0 || progress.remainingCash <= 0) {
        throw new Error('订单已无可退现金');
    }

    const settlementItems = buildOrderSettlementItems(order);
    const requestedItems = normalizeRequestedRefundItems(params.refund_items);
    let quotedItems = [];

    if (requestedItems.length > 0) {
        requestedItems.forEach((selection) => {
            const target = settlementItems.find((item) => {
                if (selection.refund_item_key && item.refund_item_key === selection.refund_item_key) return true;
                return item.product_id === selection.product_id && String(item.sku_id || '') === String(selection.sku_id || '');
            });
            if (!target) {
                throw new Error('退款商品不存在或无法匹配');
            }
            if (selection.quantity > target.refundable_quantity) {
                throw new Error(`退款数量不能超过可退数量：${target.snapshot_name || target.name || '商品'}`);
            }
            const refundCashAmount = selection.quantity >= target.refundable_quantity
                ? roundMoney(target.refundable_cash_amount)
                : roundMoney(target.cash_paid_allocated_amount * (selection.quantity / target.quantity));
            quotedItems.push({
                refund_item_key: target.refund_item_key,
                product_id: target.product_id,
                sku_id: target.sku_id || '',
                name: target.snapshot_name || target.name || '',
                spec: target.snapshot_spec || target.spec || '',
                image: target.snapshot_image || target.image || '',
                quantity: selection.quantity,
                original_quantity: target.quantity,
                refundable_quantity_before: target.refundable_quantity,
                refundable_cash_before: roundMoney(target.refundable_cash_amount),
                cash_refund_amount: Math.min(roundMoney(target.refundable_cash_amount), refundCashAmount),
                coupon_refund_amount: 0,
                points_refund_amount: 0,
                settlement_basis_version: target.refund_basis_version
            });
        });
    } else {
        const fallbackTarget = settlementItems[0];
        if (!fallbackTarget) throw new Error('订单缺少可退款商品');
        let requestedQuantity = Math.max(1, toNumber(params.refund_quantity, fallbackTarget.refundable_quantity || progress.remainingQuantity));
        requestedQuantity = Math.min(requestedQuantity, fallbackTarget.refundable_quantity || progress.remainingQuantity);
        quotedItems = [{
            refund_item_key: fallbackTarget.refund_item_key,
            product_id: fallbackTarget.product_id,
            sku_id: fallbackTarget.sku_id || '',
            name: fallbackTarget.snapshot_name || fallbackTarget.name || '',
            spec: fallbackTarget.snapshot_spec || fallbackTarget.spec || '',
            image: fallbackTarget.snapshot_image || fallbackTarget.image || '',
            quantity: requestedQuantity,
            original_quantity: fallbackTarget.quantity,
            refundable_quantity_before: fallbackTarget.refundable_quantity,
            refundable_cash_before: roundMoney(fallbackTarget.refundable_cash_amount),
            cash_refund_amount: requestedQuantity >= fallbackTarget.refundable_quantity
                ? roundMoney(fallbackTarget.refundable_cash_amount)
                : roundMoney(fallbackTarget.cash_paid_allocated_amount * (requestedQuantity / fallbackTarget.quantity)),
            coupon_refund_amount: 0,
            points_refund_amount: 0,
            settlement_basis_version: fallbackTarget.refund_basis_version
        }];
    }

    const requestedQuantity = quotedItems.reduce((sum, item) => sum + item.quantity, 0);
    const refundAmount = roundMoney(quotedItems.reduce((sum, item) => sum + item.cash_refund_amount, 0));

    if (refundAmount <= 0) {
        throw new Error('当前退款对应的现金金额为 0，无法继续退款');
    }

    if (order.bundle_id || order.bundle_meta) {
        const remainingItems = settlementItems
            .filter((item) => item.refundable_quantity > 0)
            .map((item) => `${item.refund_item_key}:${item.refundable_quantity}`);
        const quotedKeys = quotedItems
            .map((item) => `${item.refund_item_key}:${item.quantity}`);
        const fullQuantity = requestedQuantity >= Math.max(1, progress.remainingQuantity);
        const fullCash = refundAmount >= roundMoney(progress.remainingCash);
        const sameItems = remainingItems.length === quotedKeys.length && remainingItems.every((key) => quotedKeys.includes(key));
        if (!(fullQuantity && fullCash && sameItems)) {
            throw new Error('组合订单仅支持整套退款');
        }
    }

    return {
        ...progress,
        quotedItems,
        requestedQuantity,
        refundAmount
    };
}

function isFullRefundAfterSettlement(progress = {}, refundQuantity = 0, refundAmount = 0) {
    const nextQuantity = Math.max(0, toNumber(progress.refundedQuantity, 0) + Math.max(0, toNumber(refundQuantity, 0)));
    const nextCash = roundMoney(toNumber(progress.refundedCash, 0) + roundMoney(refundAmount));
    return nextQuantity >= Math.max(1, toNumber(progress.totalQuantity, 0))
        || nextCash >= roundMoney(Math.max(0, toNumber(progress.payAmount, 0)));
}

function resolveRefundQuantityFromRecord(order = {}, refund = {}) {
    const refundItems = normalizeRequestedRefundItems(refund.refund_items);
    if (refundItems.length > 0) {
        return refundItems.reduce((sum, item) => sum + Math.max(0, toNumber(item.quantity, 0)), 0);
    }
    const progress = getOrderRefundProgress(order);
    const explicit = Math.max(
        0,
        toNumber(
            refund.refund_quantity_effective != null ? refund.refund_quantity_effective : refund.refund_quantity,
            0
        )
    );
    if (explicit > 0) return explicit;
    return Math.max(1, progress.remainingQuantity || progress.totalQuantity || 1);
}

function buildRefundItemAllocations(order = {}, refundQuantity = 0, refund = {}) {
    const refundItems = normalizeRequestedRefundItems(refund.refund_items);
    if (refundItems.length > 0) {
        const settlementItems = buildOrderSettlementItems(order);
        return refundItems.map((selection) => {
            const target = settlementItems.find((item) => {
                if (selection.refund_item_key && item.refund_item_key === selection.refund_item_key) return true;
                return item.product_id === selection.product_id && String(item.sku_id || '') === String(selection.sku_id || '');
            });
            return target ? { item: target, qty: selection.quantity } : null;
        }).filter(Boolean);
    }

    let remaining = Math.max(0, toNumber(refundQuantity, 0));
    const allocations = [];

    for (const item of buildOrderSettlementItems(order)) {
        if (remaining <= 0) break;
        const itemQty = Math.max(1, toNumber(item.qty || item.quantity, 1));
        const restoredQty = Math.min(itemQty, remaining);
        if (restoredQty > 0) {
            allocations.push({ item, qty: restoredQty });
            remaining -= restoredQty;
        }
    }

    return allocations;
}

function refundDeadlineDate() {
    const days = Math.max(0, toNumber(process.env.REFUND_MAX_DAYS || process.env.COMMISSION_FREEZE_DAYS, 7));
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function getWalletAccountByUser(openid) {
    const userRes = await db.collection('users').where({ openid }).limit(1).get().catch(() => ({ data: [] }));
    const user = userRes.data && userRes.data[0] ? userRes.data[0] : null;
    if (!user) return { user: null, account: null };

    const candidates = [user.id, user._id, user._legacy_id].filter((value) => value !== null && value !== undefined && value !== '');
    for (const candidate of candidates) {
        const accountRes = await db.collection('wallet_accounts')
            .where({ user_id: candidate })
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        if (accountRes.data && accountRes.data[0]) {
            return { user, account: accountRes.data[0] };
        }
    }
    return { user, account: null };
}

function getUserGoodsFundBalance(user = {}) {
    return toNumber(user.agent_wallet_balance != null ? user.agent_wallet_balance : user.wallet_balance, 0);
}

function sanitizeWalletAccountDocId(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function ensureWalletAccountForUser(user, seedBalance) {
    if (!user) return null;
    const candidates = [user.id, user._id, user._legacy_id].filter((value) => value !== null && value !== undefined && value !== '');
    if (!candidates.length) return null;
    const userId = candidates[0];
    const docId = `wallet-${sanitizeWalletAccountDocId(userId)}`;
    const balance = Math.max(0, Math.round(toNumber(seedBalance, 0) * 100) / 100);
    const now = db.serverDate();
    await db.collection('wallet_accounts').doc(docId).set({
        data: {
            user_id: userId,
            openid: user.openid || '',
            balance,
            account_type: 'goods_fund',
            status: 'active',
            created_at: now,
            updated_at: now
        }
    });
    return {
        _id: docId,
        id: docId,
        user_id: userId,
        openid: user.openid || '',
        balance
    };
}

async function increaseGoodsFundLedger(openid, amount, refId, remark) {
    const { user, account: existingAccount } = await getWalletAccountByUser(openid);
    if (!user) throw new Error('货款账本同步失败：用户不存在');
    const account = existingAccount || await ensureWalletAccountForUser(user, getUserGoodsFundBalance(user) - amount);
    if (!account) throw new Error('货款账本同步失败：无法创建钱包账户');
    const before = toNumber(account.balance, 0);
    const after = before + amount;

    await db.collection('wallet_accounts').doc(String(account._id)).update({
        data: {
            balance: _.inc(amount),
            updated_at: db.serverDate()
        }
    });

    await db.collection('wallet_logs').add({
        data: {
            user_id: user.id || user._legacy_id || user._id || '',
            account_id: account.id || account._id || '',
            change_type: 'refund',
            amount,
            balance_before: before,
            balance_after: after,
            ref_type: 'order_refund',
            ref_id: refId,
            remark,
            created_at: db.serverDate(),
            updated_at: db.serverDate()
        }
    });

    return true;
}

async function getGoodsFundRefundLedgerMarkers(openid, order = {}, refund = {}) {
    const refundId = pickString(refund._id || refund.id);
    const refundNo = pickString(refund.refund_no);
    const orderId = pickString(order._id || order.id || refund.order_id);
    const orderNo = pickString(order.order_no || refund.order_no);

    const [walletLogsRes, goodsFundLogsRes] = await Promise.all([
        db.collection('wallet_logs')
            .where({ openid, change_type: 'refund' })
            .limit(50)
            .get()
            .catch(() => ({ data: [] })),
        db.collection('goods_fund_logs')
            .where({ openid, type: 'refund' })
            .limit(50)
            .get()
            .catch(() => ({ data: [] }))
    ]);

    const walletLog = (walletLogsRes.data || []).find((item) => {
        const refId = pickString(item.ref_id);
        return pickString(item.refund_id) === refundId
            || pickString(item.refund_no) === refundNo
            || refId === refundId
            || refId === refundNo
            || refId === orderNo;
    }) || null;

    const goodsFundLog = (goodsFundLogsRes.data || []).find((item) => {
        return pickString(item.refund_id) === refundId
            || pickString(item.refund_no) === refundNo
            || (orderId && pickString(item.order_id) === orderId)
            || (orderNo && pickString(item.order_no) === orderNo);
    }) || null;

    return {
        walletLog,
        goodsFundLog
    };
}

async function markGoodsFundRefundCredited(refundId, patch = {}) {
    await db.collection('refunds').doc(String(refundId)).update({
        data: {
            goods_fund_credited_at: db.serverDate(),
            updated_at: db.serverDate(),
            ...patch
        }
    }).catch(() => {});
}

async function ensureGoodsFundRefundCredited(openid, order = {}, refund = {}, amount = 0) {
    const refundId = pickString(refund._id || refund.id);
    if (!refundId) throw new Error('退款记录缺少 ID，无法处理货款退款');
    if (pickString(refund.goods_fund_credited_at)) return { credited: true, skipped: true };

    const { walletLog, goodsFundLog } = await getGoodsFundRefundLedgerMarkers(openid, order, refund);
    if (walletLog && goodsFundLog) {
        await markGoodsFundRefundCredited(refundId, {
            goods_fund_wallet_log_id: pickString(walletLog._id || walletLog.id),
            goods_fund_log_id: pickString(goodsFundLog._id || goodsFundLog.id),
            goods_fund_credit_amount: roundMoney(amount)
        });
        return {
            credited: true,
            inferred: true,
            wallet_log_id: pickString(walletLog._id || walletLog.id),
            goods_fund_log_id: pickString(goodsFundLog._id || goodsFundLog.id)
        };
    }

    const { user, account: existingAccount } = await getWalletAccountByUser(openid);
    if (!user) throw new Error('货款退款失败：找不到用户');

    const previousGoodsFund = roundMoney(getUserGoodsFundBalance(user));
    const nextGoodsFund = roundMoney(previousGoodsFund + amount);
    const account = existingAccount || await ensureWalletAccountForUser(user, previousGoodsFund);
    if (!account) throw new Error('货款退款失败：无法初始化钱包账户');

    const walletAccountId = pickString(account._id || account.id);
    if (!walletAccountId) throw new Error('货款退款失败：钱包账户标识缺失');

    let walletLogId = '';
    let goodsFundLogId = '';
    try {
        await db.collection('users').where({ openid }).update({
            data: {
                agent_wallet_balance: _.inc(amount),
                updated_at: db.serverDate()
            }
        });

        await db.collection('wallet_accounts').doc(String(walletAccountId)).update({
            data: {
                balance: nextGoodsFund,
                updated_at: db.serverDate()
            }
        });

        const walletLogRes = await db.collection('wallet_logs').add({
            data: {
                user_id: user.id || user._legacy_id || user._id || '',
                openid,
                account_id: walletAccountId,
                change_type: 'refund',
                amount,
                balance_before: previousGoodsFund,
                balance_after: nextGoodsFund,
                ref_type: 'order_refund',
                ref_id: refundId,
                refund_id: refundId,
                refund_no: pickString(refund.refund_no),
                order_id: pickString(order._id || order.id || refund.order_id),
                order_no: pickString(order.order_no || refund.order_no),
                remark: `订单退款 ${pickString(order.order_no || refund.order_no)}`,
                created_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        });
        walletLogId = pickString(walletLogRes && walletLogRes._id);

        const goodsFundLogRes = await db.collection('goods_fund_logs').add({
            data: {
                openid,
                user_id: user.id || user._legacy_id || user._id || '',
                type: 'refund',
                amount,
                refund_id: refundId,
                refund_no: pickString(refund.refund_no),
                order_id: pickString(order._id || order.id || refund.order_id),
                order_no: pickString(order.order_no || refund.order_no),
                remark: `订单退款 ${pickString(order.order_no || refund.order_no)}`,
                created_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        });
        goodsFundLogId = pickString(goodsFundLogRes && goodsFundLogRes._id);

        await markGoodsFundRefundCredited(refundId, {
            goods_fund_wallet_log_id: walletLogId,
            goods_fund_log_id: goodsFundLogId,
            goods_fund_credit_amount: roundMoney(amount)
        });

        return {
            credited: true,
            wallet_log_id: walletLogId,
            goods_fund_log_id: goodsFundLogId
        };
    } catch (error) {
        await db.collection('users').where({ openid }).update({
            data: {
                agent_wallet_balance: previousGoodsFund,
                updated_at: db.serverDate()
            }
        }).catch(() => {});
        await db.collection('wallet_accounts').doc(String(walletAccountId)).update({
            data: {
                balance: previousGoodsFund,
                updated_at: db.serverDate()
            }
        }).catch(() => {});
        if (walletLogId) {
            await db.collection('wallet_logs').doc(String(walletLogId)).remove().catch(() => {});
        }
        if (goodsFundLogId) {
            await db.collection('goods_fund_logs').doc(String(goodsFundLogId)).remove().catch(() => {});
        }
        throw error;
    }
}

async function completeGoodsFundRefundSettlement(orderId, order = {}, refund = {}) {
    const canonicalOrderId = orderId || order._id || order.id || refund.order_id;
    const buyerOpenid = pickString(order.openid || refund.openid);
    if (!canonicalOrderId) throw new Error('货款退款缺少订单 ID');
    if (!buyerOpenid) throw new Error('货款退款缺少买家 openid');

    const refundAmount = roundMoney(toNumber(refund.amount ?? refund.refund_amount, 0));
    const refundQuantity = resolveRefundQuantityFromRecord(order, refund);
    if (refundAmount <= 0) throw new Error('货款退款金额无效');

    const processingPatch = {
        status: 'processing',
        payment_method: 'goods_fund',
        refund_channel: 'goods_fund',
        refund_target_text: getRefundTargetText('goods_fund'),
        processing_at: refund.processing_at || db.serverDate(),
        updated_at: db.serverDate()
    };
    await db.collection('refunds').doc(String(refund._id)).update({ data: processingPatch }).catch(() => {});

    await ensureGoodsFundRefundCredited(buyerOpenid, order, refund, refundAmount);

    const latestRefundRes = await db.collection('refunds').doc(String(refund._id)).get().catch(() => ({ data: refund }));
    const latestRefund = latestRefundRes.data || refund;
    const refundRecord = {
        ...latestRefund,
        _id: refund._id,
        amount: refundAmount,
        refund_amount: refundAmount,
        type: refund.type,
        refund_quantity_effective: refundQuantity
    };

    const { isFullRefund } = await applyRefundProgress(canonicalOrderId, order, refundRecord);
    refundRecord.order_progress_applied_at = refundRecord.order_progress_applied_at || '1';
    await reverseBuyerRefundAssetsWithMarker(buyerOpenid, canonicalOrderId, order, refundRecord, isFullRefund);
    refundRecord.buyer_assets_reversed_at = refundRecord.buyer_assets_reversed_at || '1';

    await cancelRefundRelatedCommissions(canonicalOrderId, '货款退款');
    await restoreRefundOrderStock(canonicalOrderId, order, refundRecord);
    refundRecord.stock_restored_at = refundRecord.stock_restored_at || '1';
    await rollbackPickupStationPrincipalForOrder(db, order, refundRecord, '退款冲回自提门店进货本金');
    refundRecord.pickup_principal_reversed_at = refundRecord.pickup_principal_reversed_at || '1';

    await db.collection('refunds').doc(String(refund._id)).update({
        data: {
            status: 'completed',
            completed_at: db.serverDate(),
            auto_refund_error: _.remove(),
            auto_refund_partial: _.remove(),
            auto_refund_failed_at: _.remove(),
            updated_at: db.serverDate()
        }
    }).catch(() => {});

    await db.collection('orders').doc(String(canonicalOrderId)).update({
        data: {
            auto_refund_error: _.remove(),
            auto_refund_failed_at: _.remove(),
            auto_refund_partial: _.remove(),
            updated_at: db.serverDate()
        }
    }).catch(() => {});

    return {
        completed: true,
        refund_id: pickString(refund._id),
        order_id: pickString(canonicalOrderId)
    };
}

async function recoverPendingGoodsFundRefunds(limit = 20) {
    const res = await db.collection('refunds')
        .where({
            status: 'processing',
            payment_method: _.in(['goods_fund', 'wallet', 'goods-fund', 'goodsfund'])
        })
        .limit(Math.max(1, Math.min(100, toNumber(limit, 20))))
        .get()
        .catch(() => ({ data: [] }));

    const refunds = (res.data || []).filter((item) => resolveRefundChannel(resolveOrderPaymentMethod({ payment_method: item.payment_method })) === 'goods_fund');
    let completed = 0;
    const errors = [];

    for (const refund of refunds) {
        try {
            const order = await getOrderByIdOrNo(refund.order_id || refund.order_no);
            if (!order) {
                errors.push({ refund_id: refund._id, error: '关联订单不存在' });
                continue;
            }
            await completeGoodsFundRefundSettlement(order._id || refund.order_id, order, refund);
            completed += 1;
        } catch (error) {
            await db.collection('refunds').doc(String(refund._id)).update({
                data: {
                    auto_refund_error: error.message,
                    auto_refund_partial: true,
                    auto_refund_failed_at: db.serverDate(),
                    updated_at: db.serverDate()
                }
            }).catch(() => {});
            errors.push({ refund_id: refund._id, error: error.message });
        }
    }

    return {
        scanned: refunds.length,
        completed,
        errors
    };
}

async function getDocByIdOrLegacy(collectionName, id) {
    if (id === null || id === undefined || id === '') return null;
    const num = toNumber(id, NaN);
    const [legacy, doc] = await Promise.all([
        Number.isFinite(num)
            ? db.collection(collectionName).where({ id: num }).limit(1).get().catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
        db.collection(collectionName).doc(String(id)).get().catch(() => ({ data: null }))
    ]);
    return legacy.data[0] || doc.data || null;
}

async function restoreOrderStock(orderId, order, markerField = 'stock_restored_at') {
    if (pickString(order.pickup_stock_reservation_mode) === 'station') {
        return { skipped: true, reason: 'pickup_station_stock' };
    }
    if (!order.stock_deducted_at || order[markerField]) return { skipped: true };
    for (const item of toArray(order.items)) {
        const qty = Math.max(1, toNumber(item.qty || item.quantity, 1));
        if (item.product_id) {
            const product = await getDocByIdOrLegacy('products', item.product_id);
            if (product && product._id) {
                await db.collection('products').doc(String(product._id)).update({
                    data: { stock: _.inc(qty), sales_count: _.inc(-qty), updated_at: db.serverDate() },
                }).catch(() => {});
            }
        }
        if (item.sku_id) {
            const sku = await getDocByIdOrLegacy('skus', item.sku_id);
            if (sku && sku._id) {
                await db.collection('skus').doc(String(sku._id)).update({
                    data: { stock: _.inc(qty), updated_at: db.serverDate() },
                }).catch(() => {});
            }
        }
    }
    await db.collection('orders').doc(orderId).update({
        data: { [markerField]: db.serverDate(), updated_at: db.serverDate() },
    });
    return { restored: true };
}

async function restoreRefundOrderStock(orderId, order = {}, refund = {}) {
    if (pickString(order.pickup_stock_reservation_mode) === 'station') {
        return restorePickupStationInventoryForRefund(db, order, refund);
    }
    if (pickString(refund.type) !== 'return_refund') return { skipped: true, reason: 'not_return_refund' };
    if (refund.stock_restored_at) return { skipped: true, reason: 'already_restored' };
    if (!order.stock_deducted_at) return { skipped: true, reason: 'stock_not_deducted' };

    const refundQuantity = resolveRefundQuantityFromRecord(order, refund);
    const allocations = buildRefundItemAllocations(order, refundQuantity, refund);
    if (!allocations.length) return { skipped: true, reason: 'no_allocations' };

    for (const { item, qty } of allocations) {
        if (item.product_id) {
            const product = await getDocByIdOrLegacy('products', item.product_id);
            if (product && product._id) {
                await db.collection('products').doc(String(product._id)).update({
                    data: { stock: _.inc(qty), sales_count: _.inc(-qty), updated_at: db.serverDate() },
                }).catch(() => {});
            }
        }
        if (item.sku_id) {
            const sku = await getDocByIdOrLegacy('skus', item.sku_id);
            if (sku && sku._id) {
                await db.collection('skus').doc(String(sku._id)).update({
                    data: { stock: _.inc(qty), updated_at: db.serverDate() },
                }).catch(() => {});
            }
        }
    }

    await db.collection('refunds').doc(String(refund._id)).update({
        data: { stock_restored_at: db.serverDate(), updated_at: db.serverDate() }
    }).catch(() => {});

    return { restored: true, quantity: refundQuantity };
}

async function freezeCommissionsForOrder(orderId, extraData = {}) {
    const res = await db.collection('commissions')
        .where({ order_id: orderId, status: _.in(['pending', 'pending_approval']) })
        .get()
        .catch(() => ({ data: [] }));
    for (const row of (res.data || [])) {
        await db.collection('commissions').doc(String(row._id)).update({
            data: {
                status: 'frozen',
                pre_freeze_status: row.status,
                commission_freeze_reason: extraData.commission_freeze_reason || 'order_confirm',
                frozen_at: db.serverDate(),
                updated_at: db.serverDate(),
                ...extraData
            }
        })
        .catch(() => {});
    }
}

async function restoreFrozenCommissions(orderId) {
    const approvalTypes = new Set(['agent_fulfillment', 'pickup_service_fee', 'pickup_subsidy', 'region_agent', 'region_b3_virtual']);
    const res = await db.collection('commissions')
        .where({ order_id: orderId, status: 'frozen' })
        .get()
        .catch(() => ({ data: [] }));
    for (const row of (res.data || [])) {
        const isRefundFreeze = row.commission_freeze_reason === 'refund'
            || row.pre_freeze_status
            || (!row.refund_deadline && !row.peer_bonus_release_at);
        if (!isRefundFreeze) continue;
        const previousStatus = String(row.pre_freeze_status || '').trim().toLowerCase();
        const restoredStatus = ['pending', 'pending_approval'].includes(previousStatus)
            ? previousStatus
            : (approvalTypes.has(String(row.type || '').trim().toLowerCase()) ? 'pending_approval' : 'pending');
        await db.collection('commissions').doc(String(row._id)).update({
            data: {
                status: restoredStatus,
                frozen_at: _.remove(),
                pre_freeze_status: _.remove(),
                commission_freeze_reason: _.remove(),
                refund_deadline: _.remove(),
                updated_at: db.serverDate()
            }
        })
        .catch(() => {});
    }
}

function deriveRefundRevertStatus(order = {}) {
    return order.prev_status
        || (order.confirmed_at || order.auto_confirmed_at ? 'completed'
            : (order.shipped_at ? 'shipped'
                : (order.paid_at ? 'paid' : 'pending_payment')));
}

function buildBuyerRefundReversal(order = {}, refund = {}, isFullRefund = false) {
    const refundAmount = roundMoney(toNumber(refund.amount ?? refund.refund_amount, 0));
    const userReversal = { updated_at: db.serverDate() };
    if (refundAmount > 0) userReversal.total_spent = _.inc(-refundAmount);
    const rewardPointsClawback = Math.max(0, toNumber(refund.reward_points_clawback_amount, 0));
    const growthClawback = Math.max(0, toNumber(refund.growth_clawback_amount, 0));
    if (isFullRefund) {
        userReversal.order_count = _.inc(-1);
    }
    if (rewardPointsClawback > 0) userReversal.points = _.inc(-rewardPointsClawback);
    if (growthClawback > 0) userReversal.growth_value = _.inc(-growthClawback);
    return userReversal;
}

async function reverseBuyerRefundAssets(openid, order = {}, refund = {}, isFullRefund = false) {
    await db.collection('users').where({ openid }).update({
        data: buildBuyerRefundReversal(order, refund, isFullRefund)
    }).catch(() => {});
}

async function reverseBuyerRefundAssetsWithMarker(openid, orderId, order = {}, refund = {}, isFullRefund = false) {
    if (refund.buyer_assets_reversed_at) return;
    await reverseBuyerRefundAssets(openid, order, refund, isFullRefund);
    await db.collection('refunds').doc(String(refund._id)).update({
        data: { buyer_assets_reversed_at: db.serverDate(), updated_at: db.serverDate() }
    }).catch(() => {});
}

async function applyRefundProgress(orderId, order = {}, refund = {}) {
    if (refund.order_progress_applied_at) {
        return {
            isFullRefund: pickString(order.status) === 'refunded',
            refundQuantity: resolveRefundQuantityFromRecord(order, refund),
            refundAmount: roundMoney(toNumber(refund.amount ?? refund.refund_amount, 0)),
            rewardPointsClawback: Math.max(0, toNumber(refund.reward_points_clawback_amount, 0)),
            growthClawback: Math.max(0, toNumber(refund.growth_clawback_amount, 0))
        };
    }

    const progress = getOrderRefundProgress(order);
    const refundQuantity = resolveRefundQuantityFromRecord(order, refund);
    const refundAmount = roundMoney(toNumber(refund.amount ?? refund.refund_amount, 0));
    const nextRefundedQuantity = Math.min(progress.totalQuantity, progress.refundedQuantity + refundQuantity);
    const nextRefundedCash = Math.min(progress.payAmount, roundMoney(progress.refundedCash + refundAmount));
    const isFullRefund = isFullRefundAfterSettlement(progress, refundQuantity, refundAmount);
    const refundItems = toArray(refund.refund_items);
    const keyedRefundItems = new Map(refundItems.map((item) => [pickString(item.refund_item_key), item]));
    const nextOrderItems = buildOrderSettlementItems(order).map((item) => {
        const matched = keyedRefundItems.get(pickString(item.refund_item_key));
        if (!matched) return item;
        return {
            ...item,
            refunded_quantity: Math.min(item.quantity, item.refunded_quantity + Math.max(0, toNumber(matched.quantity, 0))),
            refunded_cash_amount: Math.min(item.cash_paid_allocated_amount, roundMoney(item.refunded_cash_amount + toNumber(matched.cash_refund_amount, 0)))
        };
    });
    const totalPointsEarned = Math.max(0, toNumber(order.points_earned, 0));
    const totalGrowthEarned = Math.max(0, Math.floor(resolveOrderPayAmount(order, 0)));
    const rewardPointsClawedBefore = Math.max(0, toNumber(order.reward_points_clawback_total, 0));
    const growthClawedBefore = Math.max(0, toNumber(order.growth_clawback_total, 0));
    const rewardPointsClawback = isFullRefund
        ? Math.max(0, totalPointsEarned - rewardPointsClawedBefore)
        : Math.max(0, Math.min(totalPointsEarned - rewardPointsClawedBefore, Math.round(totalPointsEarned * (refundAmount / Math.max(progress.payAmount, 0.01)))));
    const growthClawback = isFullRefund
        ? Math.max(0, totalGrowthEarned - growthClawedBefore)
        : Math.max(0, Math.min(totalGrowthEarned - growthClawedBefore, Math.round(totalGrowthEarned * (refundAmount / Math.max(progress.payAmount, 0.01)))));

    await db.collection('orders').doc(String(orderId)).update({
        data: {
            items: nextOrderItems,
            refunded_quantity_total: nextRefundedQuantity,
            refunded_cash_total: nextRefundedCash,
            reward_points_clawback_total: rewardPointsClawedBefore + rewardPointsClawback,
            growth_clawback_total: growthClawedBefore + growthClawback,
            has_partial_refund: !isFullRefund && nextRefundedCash > 0,
            last_refunded_at: db.serverDate(),
            partially_refunded_at: isFullRefund ? _.remove() : db.serverDate(),
            status: isFullRefund ? 'refunded' : deriveRefundRevertStatus(order),
            refunded_at: isFullRefund ? db.serverDate() : _.remove(),
            prev_status: _.remove(),
            updated_at: db.serverDate()
        }
    }).catch(() => {});

    await db.collection('refunds').doc(String(refund._id)).update({
        data: {
            reward_points_clawback_amount: rewardPointsClawback,
            growth_clawback_amount: growthClawback,
            order_progress_applied_at: db.serverDate(),
            updated_at: db.serverDate()
        }
    }).catch(() => {});

    return { isFullRefund, refundQuantity, refundAmount, rewardPointsClawback, growthClawback };
}

async function cancelRefundRelatedCommissions(orderId, reason) {
    await db.collection('commissions')
        .where({ order_id: orderId, status: _.in(['pending', 'frozen', 'pending_approval']) })
        .update({
            data: {
                status: 'cancelled',
                cancel_reason: reason,
                cancelled_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        })
        .catch(() => {});
}

/**
 * 取消订单（仅 pending_payment 状态可取消）
 */
async function cancelOrder(openid, orderId) {
    const orderRes = await db.collection('orders').doc(orderId).get().catch(() => ({ data: null }));
    if (!orderRes.data) throw new Error('订单不存在');
    if (orderRes.data.openid !== openid) throw new Error('无权操作此订单');

    const order = orderRes.data;
    if (order.status !== 'pending_payment') {
        throw new Error(`订单状态不允许取消: ${order.status}`);
    }

    // 先原子更新状态，防止与支付回调竞态
    const updateRes = await db.collection('orders')
        .where({ _id: orderId, status: 'pending_payment' })
        .update({
            data: {
                status: 'cancelled',
                cancelled_at: db.serverDate(),
                cancel_reason: '用户取消',
                updated_at: db.serverDate(),
            },
        })
        .catch(() => ({ stats: { updated: 0 } }));

    // 如果状态已被其他流程修改（如支付成功），不再退还资产
    if (!updateRes.stats || updateRes.stats.updated === 0) {
        throw new Error('订单状态已变更，无法取消');
    }

    // 状态已锁定为 cancelled，安全退还资产
    const pointsUsed = toNumber(order.points_used, 0);
    if (pointsUsed > 0) {
        await db.collection('users').where({ openid }).update({
            data: {
                points: _.inc(pointsUsed),
                growth_value: _.inc(pointsUsed),
                updated_at: db.serverDate(),
            },
        }).catch((e) => console.error('[OrderLifecycle] 退积分失败:', e.message));
    }

    await restoreUsedCoupon(order).catch(() => {});

    await db.collection('commissions')
        .where({ order_id: orderId, status: _.in(['pending', 'frozen', 'pending_approval']) })
        .update({ data: { status: 'cancelled', cancelled_at: db.serverDate() } })
        .catch(() => {});

    await releasePickupStationInventoryForOrder(db, order, '用户取消订单，释放自提门店预占库存').catch((stockErr) => {
        console.error('[OrderLifecycle] 取消订单释放门店库存失败:', stockErr.message);
    });

    await restoreOrderStock(orderId, order).catch((stockErr) => {
        console.error('[OrderLifecycle] 取消订单恢复库存失败:', stockErr.message);
    });

    return { success: true, order_id: orderId, status: 'cancelled' };
}

/**
 * 确认收货（仅 shipped 状态可确认）
 */
async function confirmOrder(openid, orderId) {
    const orderRes = await db.collection('orders').doc(orderId).get().catch(() => ({ data: null }));
    if (!orderRes.data) throw new Error('订单不存在');
    if (orderRes.data.openid !== openid) throw new Error('无权操作此订单');

    if (orderRes.data.status !== 'shipped') {
        throw new Error(`订单状态不允许确认收货: ${orderRes.data.status}`);
    }

    await db.collection('orders').doc(orderId).update({
        data: {
            status: 'completed',
            confirmed_at: db.serverDate(),
            updated_at: db.serverDate(),
        },
    });

    // 确认收货后进入售后期：佣金先冻结，待售后期结束后转人工审批。
    try {
        await freezeCommissionsForOrder(orderId, { refund_deadline: refundDeadlineDate() });
    } catch (commErr) {
        console.error('[OrderLifecycle] 佣金冻结失败:', commErr.message);
    }

    return { success: true, order_id: orderId, status: 'completed' };
}

/**
 * 评价订单（仅 completed 状态可评价）
 */
async function reviewOrder(openid, orderId, reviewData) {
    const orderRes = await db.collection('orders').doc(orderId).get().catch(() => ({ data: null }));
    if (!orderRes.data) throw new Error('订单不存在');
    if (orderRes.data.openid !== openid) throw new Error('无权操作此订单');

    if (orderRes.data.status !== 'completed') {
        throw new Error(`订单状态不允许评价: ${orderRes.data.status}`);
    }

    // 检查是否已评价
    const existingReview = await db.collection('reviews')
        .where({ order_id: orderId, openid })
        .limit(1).get().catch(() => ({ data: [] }));
    if (existingReview.data && existingReview.data.length > 0) {
        throw new Error('该订单已评价');
    }

    const { rating, content, images } = reviewData;
    if (!rating || rating < 1 || rating > 5) {
        throw new Error('评分必须为1-5');
    }

    // 为每个商品创建评价
    const items = orderRes.data.items || [];
    const reviewItems = items.length > 0 ? items : [{ product_id: orderRes.data.product_id || '', name: '' }];

    const reviewResults = [];
    for (const item of reviewItems) {
        const result = await db.collection('reviews').add({
            data: {
                order_id: orderId,
                openid,
                product_id: item.product_id || '',
                product_name: item.name || item.snapshot_name || '',
                rating,
                content: content || '',
                images: images || [],
                status: 'visible',
                created_at: db.serverDate(),
            },
        });
        reviewResults.push(result._id);
    }

    // 标记订单已评价
    await db.collection('orders').doc(orderId).update({
        data: {
            reviewed: true,
            reviewed_at: db.serverDate(),
            updated_at: db.serverDate(),
        },
    });

    if (String(orderRes.data.type || '').trim().toLowerCase() === 'exchange') {
        return { success: true, order_id: orderId, review_ids: reviewResults, bonus_points: 0 };
    }

    // 评价奖励积分
    const pointRules = await loadPointRules();
    const hasImages = Array.isArray(images) && images.length > 0;
    const bonusPoints = hasImages
        ? Math.max(0, toNumber(pointRules.review_image.points, pointRules.review.points))
        : Math.max(0, toNumber(pointRules.review.points, DEFAULT_POINT_RULES.review.points));
    await db.collection('users').where({ openid }).update({
        data: { points: _.inc(bonusPoints), updated_at: db.serverDate() },
    });
    await db.collection('point_logs').add({
        data: {
            openid, type: 'earn', amount: bonusPoints,
            source: hasImages ? 'review_image' : 'review', order_id: orderId,
            description: hasImages
                ? pickString(pointRules.review_image.remark, '图文评价奖励')
                : pickString(pointRules.review.remark, DEFAULT_POINT_RULES.review.remark),
            created_at: db.serverDate(),
        },
    });

    return { success: true, review_ids: reviewResults, bonus_points: bonusPoints };
}

/**
 * 申请退款
 */
async function applyRefund(openid, params) {
    const orderId = params.order_id || params.id;
    if (!orderId) throw new Error('缺少订单 ID');

    const order = await getOrderByIdOrNo(openid, orderId);
    if (!order) throw new Error('订单不存在');
    if (order.openid !== openid) throw new Error('无权操作此订单');

    const refundableStatuses = ['paid', 'pending_group', 'pickup_pending', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed'];
    if (!refundableStatuses.includes(order.status)) {
        throw new Error(`订单状态不允许退款: ${order.status}`);
    }
    const canonicalOrderId = order._id || String(orderId);
    if (order.bundle_id || order.bundle_meta) {
        const requestedQuantity = Math.max(0, toNumber(params.refund_quantity, 0));
        const progress = getOrderRefundProgress(order);
        if (requestedQuantity > 0 && requestedQuantity < progress.remainingQuantity) {
            throw new Error('组合订单仅支持整套退款');
        }
    }

    // 检查是否已有待处理退款
    const existingRefund = await db.collection('refunds')
        .where({
            order_id: _.in([canonicalOrderId, order.id, order.order_no].filter((value) => value !== undefined && value !== null && value !== '')),
            status: _.in(['pending', 'approved', 'processing'])
        })
        .limit(1).get().catch(() => ({ data: [] }));
    if (existingRefund.data && existingRefund.data.length > 0) {
        throw new Error('该订单已有待处理的退款申请');
    }

    const type = params.type || 'refund_only';
    const refundSnapshot = computeRefundSnapshot(order, params);
    const refundNo = 'REF' + Date.now() + Math.floor(Math.random() * 1000);
    const refundAmount = refundSnapshot.refundAmount;
    const refundQuantity = refundSnapshot.requestedQuantity;
    const paymentMethod = resolveOrderPaymentMethod(order);
    const refundChannel = resolveRefundChannel(paymentMethod);

    if (refundAmount <= 0) {
        throw new Error('退款金额必须大于 0');
    }

    const result = await db.collection('refunds').add({
        data: {
            order_id: canonicalOrderId,
            order_no: order.order_no,
            openid,
            refund_no: refundNo,
            amount: refundAmount,
            type,
            reason: params.reason || '用户申请退款',
            description: params.description || '',
            refund_quantity: type === 'return_refund' ? refundQuantity : 0,
            refund_quantity_effective: refundQuantity,
            refund_items: refundSnapshot.quotedItems,
            order_total_quantity_snapshot: refundSnapshot.totalQuantity,
            order_pay_amount_snapshot: refundSnapshot.payAmount,
            order_refunded_quantity_before: refundSnapshot.refundedQuantity,
            order_refunded_cash_before: refundSnapshot.refundedCash,
            cash_refund_amount: refundAmount,
            coupon_refund_amount: 0,
            points_refund_amount: 0,
            reward_points_clawback_amount: 0,
            growth_clawback_amount: 0,
            refund_amount_kind: 'cash_only',
            settlement_basis_version: refundSnapshot.quotedItems.every((item) => item.settlement_basis_version === 'snapshot_v1')
                ? 'snapshot_v1'
                : 'legacy_estimated',
            payment_method: paymentMethod,
            refund_channel: refundChannel,
            refund_target_text: getRefundTargetText(paymentMethod),
            status: 'pending',
            images: params.images || [],
            created_at: db.serverDate(),
            updated_at: db.serverDate(),
        },
    });

    // 更新订单状态，记录 prev_status 供取消退款时恢复
    const currentOrderRes = await db.collection('orders').doc(canonicalOrderId).get().catch(() => ({ data: null }));
    await db.collection('orders').doc(canonicalOrderId).update({
        data: {
            status: 'refunding',
            prev_status: currentOrderRes.data?.status || 'paid',
            updated_at: db.serverDate()
        },
    });

    // 退款申请时，冻结佣金（防止提现）
    try {
        await freezeCommissionsForOrder(canonicalOrderId, { commission_freeze_reason: 'refund' });
    } catch (freezeErr) {
        console.error('[OrderLifecycle] 佣金冻结失败:', freezeErr.message);
    }

    // 货款支付订单：自动退款（不需要后台审批，直接退回余额）
    if (paymentMethod === 'goods_fund') {
        await db.collection('refunds').doc(result._id).update({
            data: {
                status: 'processing',
                payment_method: paymentMethod,
                refund_channel: refundChannel,
                refund_target_text: getRefundTargetText(paymentMethod),
                processing_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        }).catch(() => {});
        try {
            await completeGoodsFundRefundSettlement(canonicalOrderId, order, {
                _id: result._id,
                refund_no: refundNo,
                amount: refundAmount,
                refund_amount: refundAmount,
                type,
                refund_quantity_effective: refundQuantity,
                payment_method: paymentMethod,
                refund_channel: refundChannel,
                refund_target_text: getRefundTargetText(paymentMethod),
                processing_at: new Date().toISOString()
            });
            return { success: true, id: result._id, refund_id: result._id, refund_no: refundNo, auto_refunded: true };
        } catch (autoRefundErr) {
            console.error('[OrderLifecycle] 货款自动退款失败，转人工处理:', autoRefundErr.message);
            await db.collection('refunds').doc(result._id).update({
                data: {
                    status: 'processing',
                    auto_refund_error: autoRefundErr.message,
                    auto_refund_partial: true,
                    auto_refund_failed_at: db.serverDate(),
                    updated_at: db.serverDate()
                }
            }).catch(() => {});
            return { success: true, id: result._id, refund_id: result._id, refund_no: refundNo, auto_refund_failed: true, error: autoRefundErr.message };
        }
    }

    return { success: true, id: result._id, refund_id: result._id, refund_no: refundNo };
}

/**
 * 查询退款列表
 */
async function queryRefundList(openid, params = {}) {
    return listRefunds(openid, params);
}

/**
 * 查询退款详情
 */
async function queryRefundDetail(openid, refundId) {
    return getRefundDetail(openid, refundId);
}

/**
 * 取消退款申请
 */
async function cancelRefund(openid, refundId) {
    const refundRes = await db.collection('refunds').doc(refundId).get().catch(() => ({ data: null }));
    if (!refundRes.data || refundRes.data.openid !== openid) {
        throw new Error('退款记录不存在');
    }

    if (refundRes.data.status !== 'pending') {
        throw new Error(`退款状态不允许取消: ${refundRes.data.status}`);
    }

    await db.collection('refunds').doc(refundId).update({
        data: { status: 'cancelled', cancelled_at: db.serverDate(), updated_at: db.serverDate() },
    });

    // 取消退款时，仅恢复由退款申请临时冻结的佣金，不能释放确认收货后的售后期冻结。
    try {
        const order = await getOrderByIdOrNo(openid, refundRes.data.order_id || refundRes.data.order_no);
        if (order && order._id) {
            await restoreFrozenCommissions(order._id);
        }
    } catch (unfreezeErr) {
        console.error('[OrderLifecycle] 佣金解冻失败:', unfreezeErr.message);
    }

    // 恢复订单状态
    const orderId = refundRes.data.order_id;
    if (orderId || refundRes.data.order_no) {
        const order = await getOrderByIdOrNo(openid, orderId || refundRes.data.order_no);
        if (order && order._id && order.status === 'refunding') {
            const orderTokens = [order._id, order.id, order.order_no]
                .filter((value) => value !== undefined && value !== null && value !== '');
            // 检查是否还有其他待处理退款
            const otherRefunds = await db.collection('refunds')
                .where(_.and([
                    _.or([
                        { order_id: _.in(orderTokens) },
                        { order_no: _.in(orderTokens) }
                    ]),
                    { status: _.in(['pending', 'processing']) }
                ]))
                .limit(1).get().catch(() => ({ data: [] }));
            if (!otherRefunds.data || otherRefunds.data.length === 0) {
                // 恢复为退款前的状态：优先使用 prev_status 字段，否则按实际字段推断
                const prevStatus = deriveRefundRevertStatus(order);
                await db.collection('orders').doc(order._id).update({
                    data: { status: prevStatus, prev_status: _.remove(), updated_at: db.serverDate() },
                });
            }
        }
    }

    return { success: true };
}

/**
 * 填写退货物流信息
 */
async function returnShipping(openid, refundId, shippingData) {
    const refundRes = await db.collection('refunds').doc(refundId).get().catch(() => ({ data: null }));
    if (!refundRes.data || refundRes.data.openid !== openid) {
        throw new Error('退款记录不存在');
    }

    if (!['approved', 'processing'].includes(refundRes.data.status)) {
        throw new Error(`退款状态不允许填写物流: ${refundRes.data.status}`);
    }

    await db.collection('refunds').doc(refundId).update({
        data: {
            status: 'processing',
            return_company: shippingData.company || '',
            return_tracking_no: shippingData.tracking_no || '',
            return_shipping: {
                company: shippingData.company || '',
                tracking_no: shippingData.tracking_no || '',
                sent_at: db.serverDate(),
            },
            updated_at: db.serverDate(),
        },
    });

    return { success: true };
}

/**
 * 物流追踪（返回订单物流信息）
 */
async function trackLogistics(openid, params) {
    const orderId = params.order_id;
    const trackingNo = params.tracking_no;

    if (orderId) {
        const orderRes = await db.collection('orders').doc(orderId).get().catch(() => ({ data: null }));
        if (!orderRes.data || orderRes.data.openid !== openid) {
            throw new Error('订单不存在');
        }
        return {
            order_id: orderId,
            order_no: orderRes.data.order_no,
            status: orderRes.data.status,
            tracking_no: orderRes.data.tracking_no || '',
            shipping_company: orderRes.data.shipping_company || orderRes.data.logistics_company || '',
            logistics_company: orderRes.data.logistics_company || orderRes.data.shipping_company || '',
            shipped_at: orderRes.data.shipped_at || null,
            estimated_delivery: orderRes.data.estimated_delivery || null,
            // 简易物流轨迹
            traces: orderRes.data.shipping_traces || generateDefaultTraces(orderRes.data),
        };
    }

    if (trackingNo) {
        // 按物流单号查询
        const orderRes = await db.collection('orders')
            .where({ tracking_no: trackingNo, openid })
            .limit(1).get().catch(() => ({ data: [] }));
        if (!orderRes.data || orderRes.data.length === 0) {
            throw new Error('未找到对应订单');
        }
        const order = orderRes.data[0];
        return {
            order_id: order._id,
            order_no: order.order_no,
            status: order.status,
            tracking_no: order.tracking_no || trackingNo,
            shipping_company: order.shipping_company || order.logistics_company || '',
            logistics_company: order.logistics_company || order.shipping_company || '',
            shipped_at: order.shipped_at || null,
            traces: order.shipping_traces || generateDefaultTraces(order),
        };
    }

    throw new Error('缺少订单 ID 或物流单号');
}

/**
 * 生成默认物流轨迹（基于订单状态推断）
 */
function generateDefaultTraces(order) {
    const traces = [];
    if (order.created_at) {
        traces.push({ time: order.created_at, desc: '订单已创建', status: 'created' });
    }
    if (order.paid_at) {
        traces.push({ time: order.paid_at, desc: '支付成功', status: 'paid' });
    }
    if (order.shipped_at || order.status === 'shipped' || order.status === 'completed') {
        traces.push({ time: order.shipped_at || order.updated_at, desc: '商家已发货', status: 'shipped' });
    }
    if (order.confirmed_at || order.status === 'completed') {
        traces.push({ time: order.confirmed_at || order.updated_at, desc: '已签收', status: 'completed' });
    }
    return traces;
}

module.exports = {
    cancelOrder,
    confirmOrder,
    completeGoodsFundRefundSettlement,
    freezeCommissionsForOrder,
    reviewOrder,
    applyRefund,
    queryRefundList,
    queryRefundDetail,
    recoverPendingGoodsFundRefunds,
    cancelRefund,
    returnShipping,
    trackLogistics,
};
