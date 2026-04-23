'use strict';

const { getAllRecords, toArray } = require('./shared/utils');
const {
    hasValue,
    pickString,
    toNumber,
    roundMoney,
    buildStationStockDocId,
    findStationStockRow
} = require('./shared/pickup-station-stock');

function roundQuantity(value) {
    return Math.max(0, Math.floor(toNumber(value, 0)));
}

function nowIso() {
    return new Date().toISOString();
}

async function getDocByIdOrLegacy(db, collectionName, id) {
    if (!hasValue(id)) return null;
    const num = toNumber(id, NaN);
    const [legacy, doc] = await Promise.all([
        Number.isFinite(num)
            ? db.collection(collectionName).where({ id: num }).limit(1).get().catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
        db.collection(collectionName).doc(String(id)).get().catch(() => ({ data: null }))
    ]);
    return legacy.data && legacy.data[0] ? legacy.data[0] : (doc.data || null);
}

async function findUserByAny(db, value) {
    if (!hasValue(value)) return null;
    const num = toNumber(value, NaN);
    const [byOpenid, byLegacyId, byDoc] = await Promise.all([
        db.collection('users').where({ openid: String(value) }).limit(1).get().catch(() => ({ data: [] })),
        Number.isFinite(num)
            ? db.collection('users').where({ id: num }).limit(1).get().catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
        db.collection('users').doc(String(value)).get().then((res) => ({ data: res.data ? [res.data] : [] })).catch(() => ({ data: [] }))
    ]);
    return byOpenid.data[0] || byLegacyId.data[0] || byDoc.data[0] || null;
}

function getUserGoodsFundBalance(user = {}) {
    return roundMoney(toNumber(user.agent_wallet_balance != null ? user.agent_wallet_balance : user.wallet_balance, 0));
}

async function ensureWalletAccountForUser(db, user = {}, seedBalance = 0) {
    const ids = [user.id, user._legacy_id, user._id, user.openid].filter((value) => hasValue(value));
    for (const candidate of ids) {
        const result = await db.collection('wallet_accounts')
            .where({ user_id: candidate })
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        if (result.data && result.data[0]) return result.data[0];
    }

    const docId = `wallet-${String(user._id || user.id || user._legacy_id || user.openid || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const row = {
        _id: docId,
        user_id: user.id || user._legacy_id || user._id || user.openid,
        openid: pickString(user.openid),
        balance: roundMoney(seedBalance),
        account_type: 'goods_fund',
        status: 'active',
        created_at: nowIso(),
        updated_at: nowIso()
    };
    await db.collection('wallet_accounts').doc(docId).set({ data: row }).catch(() => {});
    return row;
}

async function appendGoodsFundLog(db, entry = {}) {
    return db.collection('goods_fund_logs').add({
        data: {
            ...entry,
            created_at: entry.created_at || db.serverDate()
        }
    }).catch(() => null);
}

async function appendStationStockLog(db, entry = {}) {
    return db.collection('station_stock_logs').add({
        data: {
            ...entry,
            created_at: entry.created_at || db.serverDate()
        }
    }).catch(() => null);
}

async function listStationStockRows(db, stationId) {
    const rows = await getAllRecords(db, 'station_sku_stocks').catch(() => []);
    return rows.filter((row) => pickString(row.station_id) === pickString(stationId));
}

function buildOrderReservationLine(item = {}) {
    return {
        itemKey: pickString(item.refund_item_key || `${item.product_id || 'product'}::${item.sku_id || 'nosku'}`),
        product_id: pickString(item.product_id),
        sku_id: pickString(item.sku_id),
        quantity: Math.max(1, roundQuantity(item.qty || item.quantity || item.pickup_stock_reserved_qty || 1)),
        station_stock_id: pickString(item.pickup_station_stock_id),
        unit_cost: roundMoney(item.pickup_locked_supply_cost),
        total_cost: roundMoney(item.pickup_locked_supply_cost_total),
        name: pickString(item.snapshot_name || item.name)
    };
}

function buildRefundAllocations(order = {}, refund = {}) {
    const items = toArray(order.items).map((item) => buildOrderReservationLine(item));
    const keyed = new Map(items.map((item) => [item.itemKey, item]));
    const allocations = [];
    const refundItems = toArray(refund.refund_items);
    if (refundItems.length) {
        refundItems.forEach((item) => {
            const matched = keyed.get(pickString(item.refund_item_key));
            if (!matched) return;
            const quantity = Math.max(0, roundQuantity(item.quantity ?? item.qty));
            if (quantity <= 0) return;
            allocations.push({
                ...matched,
                quantity: Math.min(matched.quantity, quantity)
            });
        });
        return allocations;
    }

    let remaining = Math.max(0, roundQuantity(refund.refund_quantity_effective ?? refund.refund_quantity ?? order.refunded_quantity_total ?? 0));
    for (const item of items) {
        if (remaining <= 0) break;
        const quantity = Math.min(item.quantity, remaining);
        if (quantity <= 0) continue;
        allocations.push({
            ...item,
            quantity
        });
        remaining -= quantity;
    }
    return allocations;
}

async function reservePickupStationInventory(db, { stationId, orderNo, items = [] } = {}) {
    const stationToken = pickString(stationId);
    if (!stationToken) throw new Error('缺少自提门店');
    const stockRows = await listStationStockRows(db, stationToken);
    const reservations = [];
    try {
        for (const rawItem of toArray(items)) {
            const item = buildOrderReservationLine(rawItem);
            const stockRow = findStationStockRow(stockRows, stationToken, item.product_id, item.sku_id);
            if (!stockRow) {
                throw new Error(`${item.name || '当前商品'}在所选门店暂无库存`);
            }
            if (roundQuantity(stockRow.available_qty) < item.quantity) {
                throw new Error(`${item.name || '当前商品'}在所选门店库存不足`);
            }
            const stockId = pickString(stockRow._id || stockRow.id || buildStationStockDocId(stationToken, item.product_id, item.sku_id));
            const updateRes = await db.collection('station_sku_stocks')
                .where({ _id: stockId, available_qty: db.command.gte(item.quantity) })
                .update({
                    data: {
                        available_qty: db.command.inc(-item.quantity),
                        reserved_qty: db.command.inc(item.quantity),
                        updated_at: db.serverDate()
                    }
                })
                .catch(() => ({ stats: { updated: 0 } }));
            if (!updateRes.stats || updateRes.stats.updated === 0) {
                throw new Error(`${item.name || '当前商品'}在所选门店库存不足，请刷新后重试`);
            }
            const reservation = {
                ...item,
                stock_id: stockId,
                station_id: stationToken,
                unit_cost: roundMoney(stockRow.cost_price),
                total_cost: roundMoney(stockRow.cost_price * item.quantity)
            };
            reservations.push(reservation);
            await appendStationStockLog(db, {
                station_id: stationToken,
                stock_id: stockId,
                product_id: item.product_id,
                sku_id: item.sku_id,
                type: 'reserve',
                quantity: item.quantity,
                order_no: pickString(orderNo),
                balance_before: roundQuantity(stockRow.available_qty),
                balance_after: roundQuantity(stockRow.available_qty) - item.quantity,
                reserved_before: roundQuantity(stockRow.reserved_qty),
                reserved_after: roundQuantity(stockRow.reserved_qty) + item.quantity,
                remark: `自提订单预占 ${pickString(orderNo)}`
            });
        }
        return {
            reservations,
            locked_supply_total: roundMoney(reservations.reduce((sum, item) => sum + item.total_cost, 0))
        };
    } catch (error) {
        for (const reservation of reservations) {
            await db.collection('station_sku_stocks').doc(String(reservation.stock_id)).update({
                data: {
                    available_qty: db.command.inc(reservation.quantity),
                    reserved_qty: db.command.inc(-reservation.quantity),
                    updated_at: db.serverDate()
                }
            }).catch(() => {});
            await appendStationStockLog(db, {
                station_id: reservation.station_id,
                stock_id: reservation.stock_id,
                product_id: reservation.product_id,
                sku_id: reservation.sku_id,
                type: 'release',
                quantity: reservation.quantity,
                order_no: pickString(orderNo),
                remark: `预占失败回滚 ${pickString(orderNo)}`
            });
        }
        throw error;
    }
}

async function releasePickupStationInventoryForOrder(db, order = {}, reason = '订单取消') {
    if (pickString(order.pickup_stock_reservation_status) === 'released') {
        return { released: 0, skipped: true };
    }
    const stationId = pickString(order.pickup_station_id);
    if (!stationId) return { released: 0, skipped: true };
    const lines = toArray(order.items)
        .map((item) => buildOrderReservationLine(item))
        .filter((item) => pickString(item.station_stock_id) && item.quantity > 0);
    if (!lines.length) return { released: 0, skipped: true };

    let released = 0;
    for (const line of lines) {
        await db.collection('station_sku_stocks').doc(String(line.station_stock_id)).update({
            data: {
                available_qty: db.command.inc(line.quantity),
                reserved_qty: db.command.inc(-line.quantity),
                updated_at: db.serverDate()
            }
        }).catch(() => {});
        released += line.quantity;
        await appendStationStockLog(db, {
            station_id: stationId,
            stock_id: line.station_stock_id,
            product_id: line.product_id,
            sku_id: line.sku_id,
            type: 'release',
            quantity: line.quantity,
            order_id: pickString(order._id || order.id),
            order_no: pickString(order.order_no),
            remark: reason
        });
    }

    await db.collection('orders').doc(String(order._id || order.id)).update({
        data: {
            pickup_stock_reservation_status: 'released',
            pickup_stock_released_at: db.serverDate(),
            updated_at: db.serverDate()
        }
    }).catch(() => {});
    return { released };
}

async function consumePickupStationInventoryForOrder(db, order = {}, verifierOpenid = '') {
    if (pickString(order.pickup_stock_consumed_at)) return { consumed: 0, skipped: true };
    const stationId = pickString(order.pickup_station_id);
    const lines = toArray(order.items)
        .map((item) => buildOrderReservationLine(item))
        .filter((item) => pickString(item.station_stock_id) && item.quantity > 0);
    if (!stationId || !lines.length) return { consumed: 0, skipped: true };

    let consumed = 0;
    for (const line of lines) {
        await db.collection('station_sku_stocks').doc(String(line.station_stock_id)).update({
            data: {
                reserved_qty: db.command.inc(-line.quantity),
                updated_at: db.serverDate()
            }
        }).catch(() => {});
        consumed += line.quantity;
        await appendStationStockLog(db, {
            station_id: stationId,
            stock_id: line.station_stock_id,
            product_id: line.product_id,
            sku_id: line.sku_id,
            type: 'pickup_consume',
            quantity: line.quantity,
            order_id: pickString(order._id || order.id),
            order_no: pickString(order.order_no),
            pickup_verified_by: pickString(verifierOpenid),
            remark: `订单核销消耗库存 ${pickString(order.order_no)}`
        });
    }
    await db.collection('orders').doc(String(order._id || order.id)).update({
        data: {
            pickup_stock_consumed_at: db.serverDate(),
            pickup_stock_reservation_status: 'consumed',
            updated_at: db.serverDate()
        }
    }).catch(() => {});
    return { consumed };
}

async function adjustPickupClaimantGoodsFund(db, claimantOpenid, amount, options = {}) {
    const claimant = await findUserByAny(db, claimantOpenid);
    if (!claimant || !claimant.openid) throw new Error('自提门店缺少有效结算主体');
    const balanceBefore = getUserGoodsFundBalance(claimant);
    const balanceAfter = roundMoney(balanceBefore + amount);
    const userDocId = pickString(claimant._id || claimant.id);
    if (!userDocId) throw new Error('门店结算用户缺少文档标识');

    await db.collection('users').doc(String(userDocId)).update({
        data: {
            agent_wallet_balance: db.command.inc(amount),
            updated_at: db.serverDate()
        }
    });
    const walletAccount = await ensureWalletAccountForUser(db, claimant, balanceBefore);
    await db.collection('wallet_accounts').doc(String(walletAccount._id || walletAccount.id)).set({
        data: {
            ...walletAccount,
            balance: balanceAfter,
            updated_at: nowIso()
        }
    }).catch(() => {});
    await appendGoodsFundLog(db, {
        openid: claimant.openid,
        user_id: claimant.id || claimant._legacy_id || claimant._id || claimant.openid,
        type: pickString(options.type),
        amount,
        order_id: pickString(options.orderId),
        order_no: pickString(options.orderNo),
        refund_id: pickString(options.refundId),
        transfer_no: pickString(options.transferNo),
        remark: pickString(options.remark),
        description: pickString(options.description || options.remark)
    });
    return {
        claimant,
        balance_before: balanceBefore,
        balance_after: balanceAfter
    };
}

async function settlePickupStationPrincipalForOrder(db, order = {}, options = {}) {
    if (pickString(order.pickup_stock_settlement_status) === 'settled') return { settled: false, skipped: true };
    const claimantOpenid = pickString(order.pickup_station_claimant_openid || options.claimantOpenid);
    const amount = roundMoney(order.pickup_locked_supply_cost_total);
    if (!claimantOpenid || amount <= 0) return { settled: false, skipped: true };
    const transferNo = pickString(order.pickup_stock_settlement_txn_no || `pickup_principal_${pickString(order._id || order.id)}`);
    await adjustPickupClaimantGoodsFund(db, claimantOpenid, amount, {
        type: 'pickup_principal_return',
        transferNo,
        orderId: pickString(order._id || order.id),
        orderNo: pickString(order.order_no),
        remark: `自提订单进货本金返还 ${pickString(order.order_no)}`,
        description: `自提订单进货本金返还 ${pickString(order.order_no)}`
    });
    await db.collection('orders').doc(String(order._id || order.id)).update({
        data: {
            pickup_stock_settlement_status: 'settled',
            pickup_stock_settled_at: db.serverDate(),
            pickup_stock_settlement_txn_no: transferNo,
            updated_at: db.serverDate()
        }
    }).catch(() => {});
    return { settled: true, amount, transfer_no: transferNo };
}

async function rollbackPickupStationPrincipalForOrder(db, order = {}, refund = {}, reason = '退款冲回自提本金') {
    if (pickString(refund.pickup_principal_reversed_at)) return { reversed: false, skipped: true };
    if (pickString(order.pickup_stock_settlement_status) !== 'settled') return { reversed: false, skipped: true };
    const claimantOpenid = pickString(order.pickup_station_claimant_openid);
    if (!claimantOpenid) return { reversed: false, skipped: true };
    const allocations = buildRefundAllocations(order, refund);
    const amount = roundMoney(allocations.reduce((sum, item) => sum + roundMoney(item.unit_cost * item.quantity), 0));
    if (amount <= 0) return { reversed: false, skipped: true };

    const transferNo = `pickup_principal_reversal_${pickString(refund._id || refund.id || Date.now())}`;
    await adjustPickupClaimantGoodsFund(db, claimantOpenid, -amount, {
        type: 'pickup_principal_reversal',
        transferNo,
        orderId: pickString(order._id || order.id),
        orderNo: pickString(order.order_no),
        refundId: pickString(refund._id || refund.id),
        remark: pickString(reason),
        description: pickString(reason)
    });
    await db.collection('refunds').doc(String(refund._id)).update({
        data: {
            pickup_principal_reversal_amount: amount,
            pickup_principal_reversed_at: db.serverDate(),
            updated_at: db.serverDate()
        }
    }).catch(() => {});
    return { reversed: true, amount, transfer_no: transferNo };
}

async function restorePickupStationInventoryForRefund(db, order = {}, refund = {}) {
    if (pickString(refund.type) !== 'return_refund') return { restored: 0, skipped: true };
    if (pickString(refund.pickup_stock_restored_at)) return { restored: 0, skipped: true };
    if (pickString(order.pickup_stock_reservation_mode) !== 'station') return { restored: 0, skipped: true };

    const stationId = pickString(order.pickup_station_id);
    const allocations = buildRefundAllocations(order, refund);
    if (!stationId || !allocations.length) return { restored: 0, skipped: true };

    let restored = 0;
    for (const line of allocations) {
        if (!pickString(line.station_stock_id) || line.quantity <= 0) continue;
        await db.collection('station_sku_stocks').doc(String(line.station_stock_id)).update({
            data: {
                available_qty: db.command.inc(line.quantity),
                updated_at: db.serverDate()
            }
        }).catch(() => {});
        restored += line.quantity;
        await appendStationStockLog(db, {
            station_id: stationId,
            stock_id: line.station_stock_id,
            product_id: line.product_id,
            sku_id: line.sku_id,
            type: 'refund_restore',
            quantity: line.quantity,
            order_id: pickString(order._id || order.id),
            order_no: pickString(order.order_no),
            refund_id: pickString(refund._id || refund.id),
            remark: `退货退款恢复库存 ${pickString(order.order_no)}`
        });
    }
    await db.collection('refunds').doc(String(refund._id)).update({
        data: {
            pickup_stock_restored_at: db.serverDate(),
            updated_at: db.serverDate()
        }
    }).catch(() => {});
    return { restored };
}

module.exports = {
    reservePickupStationInventory,
    releasePickupStationInventoryForOrder,
    consumePickupStationInventoryForOrder,
    settlePickupStationPrincipalForOrder,
    rollbackPickupStationPrincipalForOrder,
    restorePickupStationInventoryForRefund,
    getDocByIdOrLegacy,
    findUserByAny
};
