'use strict';

const {
    pickString,
    toNumber,
    roundMoney,
    buildStationStockDocId,
    findStationStockRow,
    summarizeStationStockForItems
} = require('./shared/pickup-station-stock');

function registerPickupStockRoutes(app, deps) {
    const {
        auth,
        requirePermission,
        ensureFreshCollections,
        getCollection,
        saveCollection,
        nextId,
        nowIso,
        findByLookup,
        rowMatchesLookup,
        paginate,
        sortByUpdatedDesc,
        createAuditLog,
        appendGoodsFundLogEntry,
        ok,
        fail,
        flush
    } = deps;

    function primaryId(row = {}) {
        return row._id || row.id || row._legacy_id || '';
    }

    function toBoolean(value, fallback = false) {
        if (value === undefined || value === null || value === '') return fallback;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        const normalized = String(value).trim().toLowerCase();
        if (!normalized) return fallback;
        if (['false', '0', 'no', 'off', 'disabled', 'inactive'].includes(normalized)) return false;
        return true;
    }

    function getUserGoodsFundBalance(user = {}) {
        return roundMoney(toNumber(user.agent_wallet_balance != null ? user.agent_wallet_balance : user.wallet_balance, 0));
    }

    function findWalletAccountByUser(walletAccounts = [], user = {}) {
        const ids = [user.id, user._legacy_id, user._id, user.openid].filter((value) => value !== null && value !== undefined && value !== '');
        return walletAccounts.find((row) => {
            if (pickString(row.openid) && pickString(row.openid) === pickString(user.openid)) return true;
            return ids.some((id) => String(row.user_id) === String(id));
        }) || null;
    }

    function ensureWalletAccount(walletAccounts = [], user = {}) {
        const existing = findWalletAccountByUser(walletAccounts, user);
        if (existing) return existing;
        const accountId = `wallet-${String(primaryId(user) || user.openid || nextId(walletAccounts)).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        const account = {
            _id: accountId,
            id: accountId,
            user_id: primaryId(user) || user.openid,
            openid: pickString(user.openid),
            balance: getUserGoodsFundBalance(user),
            account_type: 'goods_fund',
            status: 'active',
            created_at: nowIso(),
            updated_at: nowIso()
        };
        walletAccounts.push(account);
        return account;
    }

    function normalizeAgentRoleLevel(roleLevel) {
        const normalized = Math.floor(toNumber(roleLevel, 0));
        if (normalized >= 5) return 5;
        if (normalized === 4) return 4;
        if (normalized === 3) return 3;
        return 0;
    }

    function productOwnsSku(product = {}, sku = {}) {
        const productIds = [product.id, product._legacy_id, product._id].filter((value) => value !== null && value !== undefined && value !== '').map(String);
        const skuProductIds = [sku.product_id, sku.productId].filter((value) => value !== null && value !== undefined && value !== '').map(String);
        return skuProductIds.some((value) => productIds.includes(value));
    }

    function resolveSupplyPriceByRole(product = {}, sku = {}, roleLevel = 0) {
        const normalizedRole = normalizeAgentRoleLevel(roleLevel);
        if (!normalizedRole) return null;
        const fieldName = `supply_price_b${normalizedRole === 5 ? 3 : normalizedRole}`;
        const amount = toNumber(sku?.[fieldName] ?? product?.[fieldName], NaN);
        return Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : null;
    }

    function buildProcurementNo(rows = []) {
        return `PROC${Date.now()}${String(nextId(rows)).padStart(3, '0')}`;
    }

    function buildStationClaimant(station = {}, users = [], staffRows = []) {
        const stationId = primaryId(station);
        const manager = staffRows.find((row) => rowMatchesLookup(row, stationId, [row.station_id]) && pickString(row.role) === 'manager' && pickString(row.status || 'active') === 'active');
        const claimantLookup = station.pickup_claimant_openid
            || station.pickup_claimant_id
            || manager?.openid
            || manager?.user_id
            || station.claimant_id
            || station.openid;
        return claimantLookup ? findByLookup(users, claimantLookup, (user) => [user.openid, user.id, user._legacy_id]) : null;
    }

    function buildInventoryRecord(stockRow = {}, context = {}) {
        const stations = context.stations || [];
        const products = context.products || [];
        const skus = context.skus || [];
        const station = findByLookup(stations, stockRow.station_id);
        const product = findByLookup(products, stockRow.product_id);
        const sku = stockRow.sku_id ? findByLookup(skus, stockRow.sku_id) : null;
        return {
            ...stockRow,
            id: primaryId(stockRow),
            station: station ? { id: primaryId(station), name: station.name, city: station.city, district: station.district } : null,
            product: product ? { id: primaryId(product), name: product.name } : null,
            sku: sku ? { id: primaryId(sku), name: sku.name, spec: sku.spec || sku.spec_value || '' } : null,
            available_qty: Math.max(0, Math.floor(toNumber(stockRow.available_qty, 0))),
            reserved_qty: Math.max(0, Math.floor(toNumber(stockRow.reserved_qty, 0))),
            cost_price: roundMoney(stockRow.cost_price),
            stock_status: summarizeStationStockForItems([stockRow], stockRow.station_id, [{
                product_id: stockRow.product_id,
                sku_id: stockRow.sku_id,
                quantity: 1
            }]).stock_status
        };
    }

    function buildWarehouseOverview(stockRows = [], stations = [], products = []) {
        const activeStations = stations.filter((row) => pickString(row.status || 'active') === 'active');
        const totalAvailable = stockRows.reduce((sum, row) => sum + Math.max(0, Math.floor(toNumber(row.available_qty, 0))), 0);
        const totalReserved = stockRows.reduce((sum, row) => sum + Math.max(0, Math.floor(toNumber(row.reserved_qty, 0))), 0);
        const lowStockRows = stockRows.filter((row) => Math.max(0, Math.floor(toNumber(row.available_qty, 0))) <= 2);
        const lowStockStations = new Set(lowStockRows.map((row) => pickString(row.station_id))).size;
        return {
            summary: {
                station_count: activeStations.length,
                station_sku_count: stockRows.length,
                available_qty: totalAvailable,
                reserved_qty: totalReserved,
                low_stock_count: lowStockRows.length,
                low_stock_station_count: lowStockStations,
                hq_product_count: products.length
            },
            low_stock: lowStockRows.slice(0, 10).map((row) => buildInventoryRecord(row, { stations, products, skus: getCollection('skus') }))
        };
    }

    function appendStationStockLog(stockLogs = [], entry = {}) {
        stockLogs.push({
            id: nextId(stockLogs),
            created_at: nowIso(),
            ...entry
        });
    }

    function computeWeightedCost(existing = {}, qty, costPrice) {
        const currentAvailable = Math.max(0, Math.floor(toNumber(existing.available_qty, 0)));
        const currentReserved = Math.max(0, Math.floor(toNumber(existing.reserved_qty, 0)));
        const currentOnHand = currentAvailable + currentReserved;
        const currentCost = roundMoney(existing.cost_price);
        const incomingQty = Math.max(0, Math.floor(toNumber(qty, 0)));
        const incomingCost = roundMoney(costPrice);
        if (currentOnHand <= 0) return incomingCost;
        return roundMoney(((currentCost * currentOnHand) + (incomingCost * incomingQty)) / (currentOnHand + incomingQty));
    }

    function getRefundAllocations(order = {}, refund = {}) {
        const items = Array.isArray(order.items) ? order.items : [];
        const keyed = new Map(items.map((item, index) => [
            pickString(item.refund_item_key || `${item.product_id || 'product'}::${item.sku_id || 'nosku'}::${index}`),
            item
        ]));
        const refundItems = Array.isArray(refund.refund_items) ? refund.refund_items : [];
        if (refundItems.length) {
            return refundItems
                .map((item) => {
                    const matched = keyed.get(pickString(item.refund_item_key));
                    if (!matched) return null;
                    return {
                        item: matched,
                        qty: Math.max(0, Math.floor(toNumber(item.quantity ?? item.qty, 0)))
                    };
                })
                .filter(Boolean)
                .filter((entry) => entry.qty > 0);
        }
        let remaining = Math.max(0, Math.floor(toNumber(refund.refund_quantity_effective ?? refund.refund_quantity, 0)));
        const allocations = [];
        for (const item of items) {
            if (remaining <= 0) break;
            const qty = Math.min(Math.max(1, Math.floor(toNumber(item.qty || item.quantity, 1))), remaining);
            allocations.push({ item, qty });
            remaining -= qty;
        }
        return allocations;
    }

    function restorePickupStockForRefund(order = {}, refund = {}, helpers = {}) {
        const {
            getCollection: getRows,
            saveCollection: persist,
            nowIso: currentIso
        } = helpers;
        if (pickString(order.pickup_stock_reservation_mode) !== 'station') return { restored: 0, skipped: true };
        if (pickString(refund.type) !== 'return_refund') return { restored: 0, skipped: true };
        if (refund.pickup_stock_restored_at) return { restored: 0, skipped: true };

        const stationStocks = getRows('station_sku_stocks');
        const stockLogs = getRows('station_stock_logs');
        let restored = 0;
        getRefundAllocations(order, refund).forEach(({ item, qty }) => {
            const stockId = pickString(item.pickup_station_stock_id);
            if (!stockId || qty <= 0) return;
            const index = stationStocks.findIndex((row) => rowMatchesLookup(row, stockId, [row.station_id, row.sku_id, row.product_id]));
            if (index === -1) return;
            stationStocks[index] = {
                ...stationStocks[index],
                available_qty: Math.max(0, Math.floor(toNumber(stationStocks[index].available_qty, 0))) + qty,
                updated_at: currentIso()
            };
            appendStationStockLog(stockLogs, {
                station_id: order.pickup_station_id,
                stock_id: stockId,
                product_id: item.product_id || '',
                sku_id: item.sku_id || '',
                type: 'refund_restore',
                quantity: qty,
                order_id: primaryId(order),
                order_no: pickString(order.order_no),
                refund_id: primaryId(refund),
                remark: `退款恢复门店库存 ${pickString(order.order_no)}`
            });
            restored += qty;
        });
        if (restored > 0) {
            persist('station_sku_stocks', stationStocks);
            persist('station_stock_logs', stockLogs);
        }
        return { restored };
    }

    async function rollbackPickupPrincipalForRefund(order = {}, refund = {}, helpers = {}) {
        const {
            getCollection: getRows,
            saveCollection: persist,
            nowIso: currentIso,
            appendGoodsFundLogEntry: appendGoodsFundLog
        } = helpers;
        if (pickString(order.pickup_stock_settlement_status) !== 'settled') return { reversed: false, skipped: true };
        if (refund.pickup_principal_reversed_at) return { reversed: false, skipped: true };
        const claimantLookup = order.pickup_station_claimant_openid || order.pickup_station_claimant_id;
        if (!claimantLookup) return { reversed: false, skipped: true };

        const users = getRows('users');
        const walletAccounts = getRows('wallet_accounts');
        const claimant = findByLookup(users, claimantLookup, (user) => [user.openid, user.id, user._legacy_id]);
        if (!claimant) return { reversed: false, skipped: true };

        const allocations = getRefundAllocations(order, refund);
        const amount = roundMoney(allocations.reduce((sum, entry) => {
            return sum + roundMoney(toNumber(entry.item.pickup_locked_supply_cost, 0) * entry.qty);
        }, 0));
        if (amount <= 0) return { reversed: false, skipped: true };

        const userIndex = users.findIndex((row) => rowMatchesLookup(row, primaryId(claimant), [claimant.openid]));
        const previousBalance = getUserGoodsFundBalance(claimant);
        const nextBalance = roundMoney(previousBalance - amount);
        users[userIndex] = {
            ...users[userIndex],
            agent_wallet_balance: nextBalance,
            wallet_balance: nextBalance,
            updated_at: currentIso()
        };
        const walletAccount = ensureWalletAccount(walletAccounts, users[userIndex]);
        const walletIndex = walletAccounts.findIndex((row) => rowMatchesLookup(row, primaryId(walletAccount), [walletAccount.user_id]));
        walletAccounts[walletIndex] = {
            ...walletAccount,
            balance: nextBalance,
            updated_at: currentIso()
        };
        persist('users', users);
        persist('wallet_accounts', walletAccounts);
        if (appendGoodsFundLog) {
            await appendGoodsFundLog({
                openid: pickString(users[userIndex].openid),
                user_id: primaryId(users[userIndex]),
                type: 'pickup_principal_reversal',
                amount: -amount,
                order_id: primaryId(order),
                order_no: pickString(order.order_no),
                refund_id: primaryId(refund),
                description: `退款冲回门店进货本金 ${pickString(order.order_no)}`
            }).catch(() => {});
        }
        return { reversed: true, amount };
    }

    app.get('/admin/api/pickup-stations/warehouse-overview', auth, requirePermission('pickup_stations'), async (_req, res) => {
        await ensureFreshCollections(['stations', 'products', 'station_sku_stocks']);
        ok(res, buildWarehouseOverview(getCollection('station_sku_stocks'), getCollection('stations'), getCollection('products')));
    });

    app.get('/admin/api/pickup-stations/inventory', auth, requirePermission('pickup_stations'), async (req, res) => {
        await ensureFreshCollections(['station_sku_stocks', 'stations', 'products', 'skus']);
        const stations = getCollection('stations');
        const products = getCollection('products');
        const skus = getCollection('skus');
        let rows = sortByUpdatedDesc(getCollection('station_sku_stocks')).map((row) => buildInventoryRecord(row, { stations, products, skus }));
        const keyword = pickString(req.query.keyword).toLowerCase();
        if (req.query.station_id) rows = rows.filter((row) => rowMatchesLookup(row, req.query.station_id, [row.station_id]));
        if (keyword) {
            rows = rows.filter((row) => {
                const text = [
                    row.station?.name,
                    row.product?.name,
                    row.sku?.name,
                    row.sku?.spec
                ].join(' ').toLowerCase();
                return text.includes(keyword);
            });
        }
        ok(res, paginate(rows, req));
    });

    app.post('/admin/api/pickup-stations/inventory/:id/adjust', auth, requirePermission('pickup_stations'), async (req, res) => {
        await ensureFreshCollections(['station_sku_stocks']);
        const rows = getCollection('station_sku_stocks');
        const index = rows.findIndex((row) => rowMatchesLookup(row, req.params.id));
        if (index === -1) return fail(res, '门店库存不存在', 404);
        const quantity = Math.max(0, Math.floor(toNumber(req.body?.quantity, 0)));
        const adjustType = pickString(req.body?.type || 'add').toLowerCase();
        const reason = pickString(req.body?.reason);
        if (!quantity) return fail(res, '调整数量必须大于 0', 400);
        if (!['add', 'subtract'].includes(adjustType)) return fail(res, '调整类型不合法', 400);
        const availableBefore = Math.max(0, Math.floor(toNumber(rows[index].available_qty, 0)));
        if (adjustType === 'subtract' && availableBefore < quantity) return fail(res, '门店可用库存不足', 400);
        rows[index] = {
            ...rows[index],
            available_qty: adjustType === 'add' ? availableBefore + quantity : availableBefore - quantity,
            updated_at: nowIso()
        };
        saveCollection('station_sku_stocks', rows);
        const logs = getCollection('station_stock_logs');
        appendStationStockLog(logs, {
            station_id: rows[index].station_id,
            stock_id: primaryId(rows[index]),
            product_id: rows[index].product_id,
            sku_id: rows[index].sku_id,
            type: 'manual_adjust',
            quantity: adjustType === 'add' ? quantity : -quantity,
            remark: reason || `后台手工${adjustType === 'add' ? '增加' : '扣减'}门店库存`
        });
        saveCollection('station_stock_logs', logs);
        await flush();
        ok(res, rows[index]);
    });

    app.get('/admin/api/pickup-stations/procurements', auth, requirePermission('pickup_stations'), async (req, res) => {
        await ensureFreshCollections(['station_procurement_orders', 'stations', 'products', 'skus', 'users']);
        const stations = getCollection('stations');
        const products = getCollection('products');
        const skus = getCollection('skus');
        const users = getCollection('users');
        let rows = sortByUpdatedDesc(getCollection('station_procurement_orders')).map((row) => ({
            ...row,
            id: primaryId(row),
            station: findByLookup(stations, row.station_id) || null,
            product: findByLookup(products, row.product_id) || null,
            sku: row.sku_id ? findByLookup(skus, row.sku_id) || null : null,
            claimant: findByLookup(users, row.claimant_openid || row.claimant_id, (user) => [user.openid, user.id, user._legacy_id]) || null,
            supplier_name: pickString(row.supplier_name),
            operator_name: pickString(row.operator_name),
            expected_arrival_date: pickString(row.expected_arrival_date),
            remark: pickString(row.remark)
        }));
        if (req.query.station_id) rows = rows.filter((row) => rowMatchesLookup(row, req.query.station_id, [row.station_id]));
        if (req.query.status) rows = rows.filter((row) => pickString(row.status) === pickString(req.query.status));
        ok(res, paginate(rows, req));
    });

    app.post('/admin/api/pickup-stations/procurements', auth, requirePermission('pickup_stations'), async (req, res) => {
        await ensureFreshCollections(['station_procurement_orders', 'stations', 'station_staff', 'users', 'wallet_accounts', 'products', 'skus']);
        const procurements = getCollection('station_procurement_orders');
        const stations = getCollection('stations');
        const staffRows = getCollection('station_staff');
        const users = getCollection('users');
        const walletAccounts = getCollection('wallet_accounts');
        const products = getCollection('products');
        const skus = getCollection('skus');
        const station = findByLookup(stations, req.body?.station_id);
        if (!station) return fail(res, '自提门店不存在', 404);
        const product = findByLookup(products, req.body?.product_id);
        if (!product) return fail(res, '商品不存在', 404);
        const sku = req.body?.sku_id ? findByLookup(skus, req.body?.sku_id) : null;
        if (req.body?.sku_id && !sku) return fail(res, '规格不存在', 404);
        if (sku && !productOwnsSku(product, sku)) return fail(res, '规格不属于当前商品', 400);
        const quantity = Math.max(0, Math.floor(toNumber(req.body?.quantity, 0)));
        const supplierName = pickString(req.body?.supplier_name, '未填写');
        const operatorName = pickString(req.body?.operator_name, pickString(req.admin?.username, '后台创建'));
        const expectedArrivalDate = pickString(req.body?.expected_arrival_date);
        const remark = pickString(req.body?.remark);
        if (!quantity) return fail(res, '采购数量必须大于 0', 400);
        const claimant = buildStationClaimant(station, users, staffRows);
        if (!claimant || !claimant.openid) return fail(res, '门店缺少有效认领人/店长，不能采购备货', 400);
        const roleLevel = toNumber(claimant.role_level ?? claimant.distributor_level, 0);
        const defaultCostPrice = resolveSupplyPriceByRole(product, sku || {}, roleLevel) || roundMoney(toNumber(sku?.cost_price ?? product.cost_price, 0));
        const costPrice = roundMoney(toNumber(req.body?.cost_price, defaultCostPrice));
        if (!(costPrice > 0)) return fail(res, '进货成本价必须大于 0', 400);
        const totalCost = roundMoney(costPrice * quantity);
        const balanceBefore = getUserGoodsFundBalance(claimant);
        if (balanceBefore < totalCost) return fail(res, '门店货款余额不足，不能创建采购单', 400);

        const userSnapshot = JSON.parse(JSON.stringify(users));
        const walletSnapshot = JSON.parse(JSON.stringify(walletAccounts));
        const procurementSnapshot = JSON.parse(JSON.stringify(procurements));
        try {
            const userIndex = users.findIndex((row) => rowMatchesLookup(row, primaryId(claimant), [claimant.openid]));
            const nextBalance = roundMoney(balanceBefore - totalCost);
            users[userIndex] = {
                ...users[userIndex],
                agent_wallet_balance: nextBalance,
                wallet_balance: nextBalance,
                updated_at: nowIso()
            };
            const walletAccount = ensureWalletAccount(walletAccounts, users[userIndex]);
            const walletIndex = walletAccounts.findIndex((row) => rowMatchesLookup(row, primaryId(walletAccount), [walletAccount.user_id]));
            walletAccounts[walletIndex] = {
                ...walletAccount,
                balance: nextBalance,
                updated_at: nowIso()
            };
            const procurement = {
                id: nextId(procurements),
                procurement_no: buildProcurementNo(procurements),
                station_id: primaryId(station),
                claimant_id: primaryId(users[userIndex]),
                claimant_openid: pickString(users[userIndex].openid),
                product_id: primaryId(product),
                sku_id: sku ? primaryId(sku) : '',
                quantity,
                cost_price: costPrice,
                total_cost: totalCost,
                status: 'pending_receive',
                supplier_name: supplierName,
                operator_name: operatorName,
                expected_arrival_date: expectedArrivalDate,
                remark,
                station_snapshot: {
                    id: primaryId(station),
                    name: station.name,
                    city: station.city,
                    district: station.district
                },
                product_snapshot: {
                    id: primaryId(product),
                    name: product.name,
                    sku_name: sku?.name || '',
                    sku_spec: sku?.spec || sku?.spec_value || ''
                },
                created_at: nowIso(),
                updated_at: nowIso()
            };
            procurements.push(procurement);
            saveCollection('users', users);
            saveCollection('wallet_accounts', walletAccounts);
            saveCollection('station_procurement_orders', procurements);
            await appendGoodsFundLogEntry({
                openid: pickString(users[userIndex].openid),
                user_id: primaryId(users[userIndex]),
                type: 'station_procurement',
                amount: -totalCost,
                order_no: procurement.procurement_no,
                description: `门店备货采购 ${procurement.procurement_no}`
            }).catch(() => {});
            await flush();
            createAuditLog(req.admin, 'pickup.procurement.create', 'station_procurement_orders', {
                procurement_no: procurement.procurement_no,
                station_id: procurement.station_id,
                total_cost: procurement.total_cost
            });
            ok(res, procurement);
        } catch (error) {
            saveCollection('users', userSnapshot);
            saveCollection('wallet_accounts', walletSnapshot);
            saveCollection('station_procurement_orders', procurementSnapshot);
            fail(res, `创建门店采购单失败：${error.message || '未知错误'}`, 500);
        }
    });

    app.post('/admin/api/pickup-stations/procurements/:id/receive', auth, requirePermission('pickup_stations'), async (req, res) => {
        await ensureFreshCollections(['station_procurement_orders', 'station_sku_stocks', 'station_stock_logs', 'products', 'skus']);
        const procurements = getCollection('station_procurement_orders');
        const stocks = getCollection('station_sku_stocks');
        const logs = getCollection('station_stock_logs');
        const products = getCollection('products');
        const skus = getCollection('skus');
        const index = procurements.findIndex((row) => rowMatchesLookup(row, req.params.id, [row.procurement_no]));
        if (index === -1) return fail(res, '采购单不存在', 404);
        const procurement = procurements[index];
        if (pickString(procurement.status) !== 'pending_receive') return fail(res, '当前采购单状态不允许入库', 400);

        const productIndex = products.findIndex((row) => rowMatchesLookup(row, procurement.product_id));
        if (productIndex === -1) return fail(res, '采购商品不存在', 404);
        const skuIndex = procurement.sku_id ? skus.findIndex((row) => rowMatchesLookup(row, procurement.sku_id)) : -1;
        if (procurement.sku_id && skuIndex === -1) return fail(res, '采购规格不存在', 404);

        const hqAvailable = procurement.sku_id
            ? Math.max(0, Math.floor(toNumber(skus[skuIndex].stock, 0)))
            : Math.max(0, Math.floor(toNumber(products[productIndex].stock, 0)));
        if (hqAvailable < procurement.quantity) return fail(res, '总部库存不足，不能完成门店入库', 400);

        const stockId = buildStationStockDocId(procurement.station_id, procurement.product_id, procurement.sku_id);
        const existingStock = findStationStockRow(stocks, procurement.station_id, procurement.product_id, procurement.sku_id);
        const weightedCost = computeWeightedCost(existingStock || {}, procurement.quantity, procurement.cost_price);
        const stockIndex = existingStock
            ? stocks.findIndex((row) => rowMatchesLookup(row, primaryId(existingStock), [existingStock.station_id, existingStock.product_id, existingStock.sku_id]))
            : -1;
        const nextStock = {
            ...(existingStock || {
                _id: stockId,
                id: stockId,
                station_id: procurement.station_id,
                product_id: procurement.product_id,
                sku_id: procurement.sku_id,
                reserved_qty: 0,
                created_at: nowIso()
            }),
            available_qty: Math.max(0, Math.floor(toNumber(existingStock?.available_qty, 0))) + procurement.quantity,
            cost_price: weightedCost,
            updated_at: nowIso(),
            last_procurement_id: primaryId(procurement),
            last_procurement_no: procurement.procurement_no
        };

        if (procurement.sku_id) {
            skus[skuIndex] = {
                ...skus[skuIndex],
                stock: Math.max(0, Math.floor(toNumber(skus[skuIndex].stock, 0)) - procurement.quantity),
                updated_at: nowIso()
            };
        }
        products[productIndex] = {
            ...products[productIndex],
            stock: Math.max(0, Math.floor(toNumber(products[productIndex].stock, 0)) - procurement.quantity),
            updated_at: nowIso()
        };
        if (stockIndex === -1) stocks.push(nextStock);
        else stocks[stockIndex] = nextStock;
        appendStationStockLog(logs, {
            station_id: procurement.station_id,
            stock_id: primaryId(nextStock),
            product_id: procurement.product_id,
            sku_id: procurement.sku_id,
            type: 'procure_in',
            quantity: procurement.quantity,
            procurement_id: primaryId(procurement),
            procurement_no: procurement.procurement_no,
            remark: `采购单入库 ${procurement.procurement_no}`
        });
        procurements[index] = {
            ...procurements[index],
            status: 'received',
            received_at: nowIso(),
            updated_at: nowIso()
        };
        saveCollection('products', products);
        saveCollection('skus', skus);
        saveCollection('station_sku_stocks', stocks);
        saveCollection('station_stock_logs', logs);
        saveCollection('station_procurement_orders', procurements);
        await flush();
        createAuditLog(req.admin, 'pickup.procurement.receive', 'station_procurement_orders', {
            procurement_no: procurements[index].procurement_no,
            stock_id: primaryId(nextStock)
        });
        ok(res, procurements[index]);
    });

    return {
        restorePickupStockForRefund: (order, refund) => restorePickupStockForRefund(order, refund, {
            getCollection,
            saveCollection,
            nowIso
        }),
        rollbackPickupPrincipalForRefund: (order, refund) => rollbackPickupPrincipalForRefund(order, refund, {
            getCollection,
            saveCollection,
            nowIso,
            appendGoodsFundLogEntry
        })
    };
}

module.exports = {
    registerPickupStockRoutes
};
