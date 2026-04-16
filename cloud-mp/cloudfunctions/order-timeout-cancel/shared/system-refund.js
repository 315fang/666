'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { createRefund, loadPrivateKey } = require('../wechat-pay-v3');

const SYSTEM_REFUND_REASON = '拼团超时未成团，系统自动退款';
const SYSTEM_REFUND_SCENE = 'group_expired';

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

function normalizePaymentMethodCode(rawValue) {
    const raw = pickString(rawValue).toLowerCase();
    if (!raw) return '';
    if (['wechat', 'wx', 'wxpay', 'jsapi', 'miniapp', 'wechatpay', 'wechat_pay', 'weixin'].includes(raw)) return 'wechat';
    if (['goods_fund', 'goods-fund', 'goodsfund'].includes(raw)) return 'goods_fund';
    if (['wallet', 'wallet_balance', 'account_balance', 'balance', 'credit', 'debt'].includes(raw)) return 'wallet';
    return raw;
}

function resolveOrderPaymentMethod(order = {}) {
    return normalizePaymentMethodCode(
        order.payment_method || order.pay_channel || order.pay_type || order.payment_channel || ''
    );
}

function resolveRefundChannel(paymentMethod) {
    if (paymentMethod === 'goods_fund') return 'goods_fund';
    if (paymentMethod === 'wallet') return 'wallet';
    return 'wechat';
}

function getRefundTargetText(paymentMethod) {
    if (paymentMethod === 'goods_fund') return '退回货款余额';
    if (paymentMethod === 'wallet') return '退回账户余额';
    return '原路退回微信支付';
}

function resolveOrderPayAmount(order = {}, fallback = 0) {
    const values = [order.pay_amount, order.actual_price, order.total_amount];
    for (const value of values) {
        if (value === null || value === undefined || value === '') continue;
        const num = Number(value);
        if (Number.isFinite(num)) return num;
    }
    return fallback;
}

function getOrderTotalQuantity(order = {}) {
    const explicit = Math.max(0, toNumber(order.quantity, 0));
    if (explicit > 0) return explicit;
    return toArray(order.items).reduce((sum, item) => sum + Math.max(1, toNumber(item.qty || item.quantity, 1)), 0);
}

function getOrderRefundProgress(order = {}) {
    const totalQuantity = getOrderTotalQuantity(order);
    const payAmount = roundMoney(resolveOrderPayAmount(order, 0));
    const refundedQuantity = Math.max(0, toNumber(order.refunded_quantity_total, 0));
    const refundedCash = roundMoney(Math.max(0, toNumber(order.refunded_cash_total, 0)));
    return {
        totalQuantity,
        payAmount,
        refundedQuantity,
        refundedCash,
        remainingQuantity: Math.max(0, totalQuantity - refundedQuantity),
        remainingCash: roundMoney(Math.max(0, payAmount - refundedCash)),
    };
}

function allocateProportionalAmounts(items = [], totalAmount = 0, field = 'item_amount') {
    const total = roundMoney(totalAmount);
    if (total <= 0 || !Array.isArray(items) || items.length === 0) return items.map(() => 0);
    const baseValues = items.map((item) => Math.max(0, roundMoney(item && item[field])));
    const baseTotal = roundMoney(baseValues.reduce((sum, value) => sum + value, 0));
    if (baseTotal <= 0) return items.map((_, index) => (index === items.length - 1 ? total : 0));

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
    const couponAllocations = hasSnapshot
        ? rawItems.map((item) => roundMoney(item.coupon_allocated_amount))
        : allocateProportionalAmounts(rawItems, toNumber(order.coupon_discount, 0), 'item_amount');
    const pointsAllocations = hasSnapshot
        ? rawItems.map((item) => roundMoney(item.points_allocated_amount))
        : allocateProportionalAmounts(rawItems, toNumber(order.points_discount, 0), 'item_amount');

    return rawItems.map((item, index) => {
        const quantity = Math.max(1, toNumber(item.qty || item.quantity, 1));
        const itemAmount = roundMoney(item.item_amount != null ? item.item_amount : item.subtotal);
        const couponAllocatedAmount = roundMoney(couponAllocations[index]);
        const pointsAllocatedAmount = roundMoney(pointsAllocations[index]);
        const cashPaidAllocatedAmount = roundMoney(
            item.cash_paid_allocated_amount != null
                ? item.cash_paid_allocated_amount
                : (itemAmount - couponAllocatedAmount - pointsAllocatedAmount)
        );
        const refundedQuantity = Math.max(0, Math.min(quantity, toNumber(item.refunded_quantity, 0)));
        const refundedCashAmount = roundMoney(Math.max(0, Math.min(cashPaidAllocatedAmount, toNumber(item.refunded_cash_amount, 0))));

        return {
            ...item,
            refund_item_key: item.refund_item_key || `${item.product_id || 'product'}::${item.sku_id || 'nosku'}::${index}`,
            quantity,
            qty: quantity,
            item_amount: itemAmount,
            cash_paid_allocated_amount: cashPaidAllocatedAmount,
            refunded_quantity: refundedQuantity,
            refunded_cash_amount: refundedCashAmount,
            refundable_quantity: Math.max(0, quantity - refundedQuantity),
            refundable_cash_amount: roundMoney(Math.max(0, cashPaidAllocatedAmount - refundedCashAmount)),
            refund_basis_version: item.refund_basis_version || (hasSnapshot ? 'snapshot_v1' : 'legacy_estimated'),
        };
    });
}

function normalizeRequestedRefundItems(rawItems = []) {
    return toArray(rawItems)
        .map((item) => ({
            refund_item_key: pickString(item.refund_item_key),
            product_id: pickString(item.product_id),
            sku_id: pickString(item.sku_id),
            quantity: Math.max(0, toNumber(item.quantity ?? item.qty, 0)),
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
                settlement_basis_version: target.refund_basis_version,
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
            settlement_basis_version: fallbackTarget.refund_basis_version,
        }];
    }

    const requestedQuantity = quotedItems.reduce((sum, item) => sum + item.quantity, 0);
    const refundAmount = roundMoney(quotedItems.reduce((sum, item) => sum + item.cash_refund_amount, 0));
    if (refundAmount <= 0) {
        throw new Error('当前退款对应的现金金额为 0，无法继续退款');
    }

    return {
        ...progress,
        quotedItems,
        requestedQuantity,
        refundAmount,
    };
}

function buildFullRefundItems(order = {}) {
    return buildOrderSettlementItems(order)
        .filter((item) => item.refundable_quantity > 0)
        .map((item) => ({
            refund_item_key: item.refund_item_key,
            product_id: item.product_id,
            sku_id: item.sku_id || '',
            quantity: item.refundable_quantity,
        }));
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

function isFullRefundAfterSettlement(progress = {}, refundQuantity = 0, refundAmount = 0) {
    const nextQuantity = Math.max(0, toNumber(progress.refundedQuantity, 0) + Math.max(0, toNumber(refundQuantity, 0)));
    const nextCash = roundMoney(toNumber(progress.refundedCash, 0) + roundMoney(refundAmount));
    return nextQuantity >= Math.max(1, toNumber(progress.totalQuantity, 0))
        || nextCash >= roundMoney(Math.max(0, toNumber(progress.payAmount, 0)));
}

async function getWalletAccountByUser(openid, method) {
    const userRes = await db.collection('users').where({ openid }).limit(1).get().catch(() => ({ data: [] }));
    const user = userRes.data && userRes.data[0] ? userRes.data[0] : null;
    if (!user) return { user: null, account: null };

    const candidates = [user.id, user._id, user._legacy_id].filter((value) => value !== null && value !== undefined && value !== '');
    for (const candidate of candidates) {
        const accountRes = await db.collection('wallet_accounts')
            .where({ user_id: candidate })
            .limit(10)
            .get()
            .catch(() => ({ data: [] }));
        const rows = accountRes.data || [];
        const preferred = rows.find((item) => pickString(item.account_type).toLowerCase() === method)
            || rows.find((item) => !pickString(item.account_type))
            || rows[0]
            || null;
        if (preferred) return { user, account: preferred };
    }
    return { user, account: null };
}

function sanitizeWalletAccountDocId(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function resolveWalletUserField(user = {}, method = 'wallet') {
    if (method === 'goods_fund') return 'agent_wallet_balance';
    if (user.balance !== undefined) return 'balance';
    if (user.wallet_balance !== undefined) return 'wallet_balance';
    return 'balance';
}

function getUserInternalBalance(user = {}, method = 'wallet') {
    const field = resolveWalletUserField(user, method);
    return {
        field,
        balance: toNumber(user[field], 0),
    };
}

async function ensureWalletAccountForUser(user, seedBalance, method) {
    if (!user) return null;
    const candidates = [user.id, user._id, user._legacy_id].filter((value) => value !== null && value !== undefined && value !== '');
    if (!candidates.length) return null;
    const userId = candidates[0];
    const docId = `wallet-${sanitizeWalletAccountDocId(`${method}-${userId}`)}`;
    const balance = Math.max(0, Math.round(toNumber(seedBalance, 0) * 100) / 100);
    const now = db.serverDate();
    await db.collection('wallet_accounts').doc(docId).set({
        data: {
            user_id: userId,
            openid: user.openid || '',
            balance,
            account_type: method,
            status: 'active',
            created_at: now,
            updated_at: now,
        }
    });
    return {
        _id: docId,
        id: docId,
        user_id: userId,
        openid: user.openid || '',
        balance,
        account_type: method,
    };
}

async function writeWalletRefundLogs({ openid, userId, accountId, amount, before, after, orderId, orderNo, method }) {
    await db.collection('wallet_logs').add({
        data: {
            user_id: userId,
            account_id: accountId,
            change_type: 'refund',
            amount,
            balance_before: before,
            balance_after: after,
            ref_type: 'order_refund',
            ref_id: orderId,
            remark: `订单退款 ${orderNo}`,
            account_type: method,
            created_at: db.serverDate(),
            updated_at: db.serverDate(),
        }
    });

    if (method === 'goods_fund') {
        await db.collection('goods_fund_logs').add({
            data: {
                openid,
                type: 'refund',
                amount,
                order_id: orderId,
                order_no: orderNo,
                remark: `订单退款 ${orderNo}`,
                created_at: db.serverDate(),
            }
        }).catch(() => {});
    }
}

async function creditInternalBalance(order = {}, method = 'wallet', amount = 0) {
    const { user, account: existingAccount } = await getWalletAccountByUser(order.openid, method);
    if (!user) throw new Error('买家账户不存在，无法执行内部余额退款');

    const userBalanceInfo = getUserInternalBalance(user, method);
    const account = existingAccount || await ensureWalletAccountForUser(user, userBalanceInfo.balance, method);
    if (!account) throw new Error('无法创建钱包账户');

    const previousAccountBalance = roundMoney(toNumber(account.balance, userBalanceInfo.balance));
    const nextAccountBalance = roundMoney(previousAccountBalance + amount);
    const userId = user.id || user._legacy_id || user._id || '';
    const accountId = String(account._id || account.id || '');

    await db.collection('users').where({ openid: order.openid }).update({
        data: {
            [userBalanceInfo.field]: _.inc(amount),
            updated_at: db.serverDate(),
        }
    });
    await db.collection('wallet_accounts').doc(accountId).update({
        data: {
            balance: _.inc(amount),
            updated_at: db.serverDate(),
        }
    }).catch(async () => {
        await db.collection('wallet_accounts').doc(accountId).set({
            data: {
                user_id: userId,
                openid: order.openid,
                balance: nextAccountBalance,
                account_type: method,
                status: 'active',
                created_at: db.serverDate(),
                updated_at: db.serverDate(),
            }
        });
    });

    await writeWalletRefundLogs({
        openid: order.openid,
        userId,
        accountId,
        amount,
        before: previousAccountBalance,
        after: nextAccountBalance,
        orderId: String(order._id),
        orderNo: order.order_no || '',
        method,
    });

    return async () => {
        await db.collection('users').where({ openid: order.openid }).update({
            data: {
                [userBalanceInfo.field]: userBalanceInfo.balance,
                updated_at: db.serverDate(),
            }
        }).catch(() => {});
        await db.collection('wallet_accounts').doc(accountId).set({
            data: {
                user_id: userId,
                openid: order.openid,
                balance: previousAccountBalance,
                account_type: method,
                status: 'active',
                created_at: account.created_at || db.serverDate(),
                updated_at: db.serverDate(),
            }
        }).catch(() => {});
    };
}

function buildBuyerRefundReversal(order = {}, refund = {}, isFullRefund = false) {
    const refundAmount = roundMoney(toNumber(refund.amount ?? refund.refund_amount, 0));
    const userReversal = { updated_at: db.serverDate() };
    if (refundAmount > 0) userReversal.total_spent = _.inc(-refundAmount);
    const rewardPointsClawback = Math.max(0, toNumber(refund.reward_points_clawback_amount, 0));
    const growthClawback = Math.max(0, toNumber(refund.growth_clawback_amount, 0));
    if (isFullRefund) userReversal.order_count = _.inc(-1);
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
            growthClawback: Math.max(0, toNumber(refund.growth_clawback_amount, 0)),
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
            refunded_cash_amount: Math.min(item.cash_paid_allocated_amount, roundMoney(item.refunded_cash_amount + toNumber(matched.cash_refund_amount, 0))),
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
            status: isFullRefund ? 'refunded' : 'paid',
            refunded_at: isFullRefund ? db.serverDate() : _.remove(),
            prev_status: _.remove(),
            updated_at: db.serverDate(),
        }
    }).catch(() => {});

    await db.collection('refunds').doc(String(refund._id)).update({
        data: {
            reward_points_clawback_amount: rewardPointsClawback,
            growth_clawback_amount: growthClawback,
            order_progress_applied_at: db.serverDate(),
            updated_at: db.serverDate(),
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
                updated_at: db.serverDate(),
            }
        })
        .catch(() => {});
}

async function restoreOrderStock(orderId, order = {}, refund = {}) {
    if (!order.stock_deducted_at || refund.stock_restored_at) return { skipped: true };
    const refundQuantity = resolveRefundQuantityFromRecord(order, refund);
    const allocations = buildRefundItemAllocations(order, refundQuantity, refund);
    for (const { item, qty } of allocations) {
        if (item.product_id) {
            await db.collection('products').doc(String(item.product_id)).update({
                data: { stock: _.inc(qty), sales_count: _.inc(-qty), updated_at: db.serverDate() },
            }).catch(() => {});
        }
        if (item.sku_id) {
            await db.collection('skus').doc(String(item.sku_id)).update({
                data: { stock: _.inc(qty), updated_at: db.serverDate() },
            }).catch(() => {});
        }
    }
    await db.collection('refunds').doc(String(refund._id)).update({
        data: { stock_restored_at: db.serverDate(), updated_at: db.serverDate() },
    }).catch(() => {});
    await db.collection('orders').doc(String(orderId)).update({
        data: { group_expired_stock_restored_at: db.serverDate(), updated_at: db.serverDate() },
    }).catch(() => {});
    return { restored: true };
}

async function findExistingActiveRefund(order = {}) {
    const orderTokens = [order._id, order.id, order.order_no]
        .filter((value) => value !== undefined && value !== null && value !== '')
        .map((value) => String(value));
    if (!orderTokens.length) return null;

    const res = await db.collection('refunds')
        .where({
            order_id: _.in(orderTokens),
            status: _.in(['pending', 'approved', 'processing', 'completed'])
        })
        .limit(5)
        .get()
        .catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

async function createRefundRecord(order = {}, options = {}) {
    const fullRefundItems = buildFullRefundItems(order);
    const refundSnapshot = computeRefundSnapshot(order, { refund_items: fullRefundItems });
    const refundNo = `REF${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const paymentMethod = resolveOrderPaymentMethod(order);
    const refundChannel = resolveRefundChannel(paymentMethod);
    const refundTargetText = getRefundTargetText(paymentMethod);

    const result = await db.collection('refunds').add({
        data: {
            order_id: String(order._id || ''),
            order_no: order.order_no || '',
            openid: order.openid || '',
            refund_no: refundNo,
            amount: refundSnapshot.refundAmount,
            type: 'refund_only',
            reason: options.reason || SYSTEM_REFUND_REASON,
            description: options.description || '',
            refund_quantity: 0,
            refund_quantity_effective: refundSnapshot.requestedQuantity,
            refund_items: refundSnapshot.quotedItems,
            order_total_quantity_snapshot: refundSnapshot.totalQuantity,
            order_pay_amount_snapshot: refundSnapshot.payAmount,
            order_refunded_quantity_before: refundSnapshot.refundedQuantity,
            order_refunded_cash_before: refundSnapshot.refundedCash,
            cash_refund_amount: refundSnapshot.refundAmount,
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
            refund_target_text: refundTargetText,
            status: 'pending',
            images: [],
            system_refund_scene: SYSTEM_REFUND_SCENE,
            skip_order_revert_on_fail: true,
            group_no: options.groupNo || '',
            group_activity_id: options.groupActivityId || '',
            created_at: db.serverDate(),
            updated_at: db.serverDate(),
        }
    });

    return {
        refundId: result._id,
        refundNo,
        paymentMethod,
        refundChannel,
        refundTargetText,
        refundAmount: refundSnapshot.refundAmount,
        refundQuantity: refundSnapshot.requestedQuantity,
        refundRecord: {
            _id: result._id,
            amount: refundSnapshot.refundAmount,
            refund_amount: refundSnapshot.refundAmount,
            refund_quantity_effective: refundSnapshot.requestedQuantity,
            refund_items: refundSnapshot.quotedItems,
            type: 'refund_only',
            payment_method: paymentMethod,
            refund_channel: refundChannel,
            refund_target_text: refundTargetText,
            system_refund_scene: SYSTEM_REFUND_SCENE,
            skip_order_revert_on_fail: true,
        }
    };
}

async function moveOrderIntoRefunding(order = {}, options = {}) {
    const updateRes = await db.collection('orders')
        .where({ _id: String(order._id), status: 'pending_group' })
        .update({
            data: {
                status: 'refunding',
                group_expired_at: db.serverDate(),
                group_expired_group_no: options.groupNo || '',
                group_expired_reason: options.reason || SYSTEM_REFUND_REASON,
                updated_at: db.serverDate(),
            }
        });
    return updateRes && updateRes.stats && updateRes.stats.updated > 0;
}

async function markRefundFailed(refundId, message) {
    await db.collection('refunds').doc(String(refundId)).update({
        data: {
            status: 'failed',
            auto_refund_error: message,
            auto_refund_failed_at: db.serverDate(),
            updated_at: db.serverDate(),
        }
    }).catch(() => {});
}

async function markOrderRefundFailure(orderId, message) {
    await db.collection('orders').doc(String(orderId)).update({
        data: {
            auto_refund_error: message,
            auto_refund_failed_at: db.serverDate(),
            updated_at: db.serverDate(),
        }
    }).catch(() => {});
}

async function processInternalRefund(order, refundContext) {
    const method = refundContext.paymentMethod;
    await db.collection('refunds').doc(String(refundContext.refundId)).update({
        data: {
            status: 'processing',
            processing_at: db.serverDate(),
            payment_method: method,
            refund_channel: refundContext.refundChannel,
            refund_target_text: refundContext.refundTargetText,
            updated_at: db.serverDate(),
        }
    }).catch(() => {});

    let rollbackInternalFunds = null;
    try {
        rollbackInternalFunds = await creditInternalBalance(order, method, refundContext.refundAmount);
        const runtimeRefund = {
            ...refundContext.refundRecord,
            buyer_assets_reversed_at: null,
            order_progress_applied_at: null,
            stock_restored_at: null,
        };
        const { isFullRefund } = await applyRefundProgress(order._id, order, runtimeRefund);
        await reverseBuyerRefundAssetsWithMarker(order.openid, order._id, order, runtimeRefund, isFullRefund);
        await cancelRefundRelatedCommissions(order._id, method === 'goods_fund' ? '货款退款' : '余额退款');
        await restoreOrderStock(order._id, order, runtimeRefund);
        await db.collection('refunds').doc(String(refundContext.refundId)).update({
            data: {
                status: 'completed',
                completed_at: db.serverDate(),
                updated_at: db.serverDate(),
            }
        });
        return { mode: method, refunded: true, refundId: refundContext.refundId };
    } catch (error) {
        if (rollbackInternalFunds) {
            await rollbackInternalFunds().catch(() => {});
        }
        await db.collection('refunds').doc(String(refundContext.refundId)).update({
            data: {
                status: 'processing',
                auto_refund_error: error.message,
                auto_refund_partial: true,
                auto_refund_failed_at: db.serverDate(),
                updated_at: db.serverDate(),
            }
        }).catch(() => {});
        await markOrderRefundFailure(order._id, error.message);
        return { mode: method, refunded: false, refundId: refundContext.refundId, error: error.message };
    }
}

async function processWechatRefund(order, refundContext) {
    try {
        const privateKey = await loadPrivateKey(cloud);
        const totalFen = Math.round(refundContext.refundAmount * 100);
        const wxRefund = await createRefund(
            order.order_no,
            refundContext.refundNo,
            totalFen,
            totalFen,
            SYSTEM_REFUND_REASON,
            privateKey
        );

        await db.collection('refunds').doc(String(refundContext.refundId)).update({
            data: {
                status: 'processing',
                processing_at: db.serverDate(),
                payment_method: refundContext.paymentMethod,
                refund_channel: refundContext.refundChannel,
                refund_target_text: refundContext.refundTargetText,
                wx_refund_id: wxRefund.refund_id || '',
                wx_refund_status: wxRefund.status || 'PROCESSING',
                updated_at: db.serverDate(),
            }
        }).catch(() => {});

        return {
            mode: 'wechat',
            refunded: false,
            refundId: refundContext.refundId,
            wxStatus: wxRefund.status || 'PROCESSING',
        };
    } catch (error) {
        await markRefundFailed(refundContext.refundId, error.message);
        await markOrderRefundFailure(order._id, error.message);
        return { mode: 'wechat', refunded: false, refundId: refundContext.refundId, error: error.message };
    }
}

async function autoRefundGroupOrder(order = {}, options = {}) {
    if (!order || !order._id || order.status !== 'pending_group' || !order.openid) {
        return { skipped: true };
    }

    const existingRefund = await findExistingActiveRefund(order);
    if (existingRefund) {
        if (existingRefund.status !== 'completed') {
            await db.collection('orders').doc(String(order._id)).update({
                data: {
                    status: 'refunding',
                    group_expired_at: db.serverDate(),
                    group_expired_group_no: options.groupNo || '',
                    group_expired_reason: options.reason || SYSTEM_REFUND_REASON,
                    updated_at: db.serverDate(),
                }
            }).catch(() => {});
        }
        return { skipped: true, reason: 'refund_exists', refundId: existingRefund._id || '' };
    }

    const refundContext = await createRefundRecord(order, options);
    const locked = await moveOrderIntoRefunding(order, options);
    if (!locked) {
        await markRefundFailed(refundContext.refundId, '订单状态已变更，自动退款跳过');
        return { skipped: true, reason: 'order_state_changed', refundId: refundContext.refundId };
    }

    if (refundContext.paymentMethod === 'goods_fund' || refundContext.paymentMethod === 'wallet') {
        return processInternalRefund(order, refundContext);
    }
    return processWechatRefund(order, refundContext);
}

module.exports = {
    SYSTEM_REFUND_REASON,
    SYSTEM_REFUND_SCENE,
    autoRefundGroupOrder,
};
