'use strict';
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// ==================== 共享模块导入 ====================
const {
    validateAction, validateAmount, validateInteger, validateString,
    validateArray, validateRequiredFields
} = require('./shared/validators');
const {
    CloudBaseError, ERROR_CODES, errorHandler, cloudFunctionWrapper
} = require('./shared/errors');
const {
    success, error, paginated, list, created, updated, deleted,
    badRequest, unauthorized, forbidden, notFound, conflict, serverError
} = require('./shared/response');
const {
    DEFAULT_GROWTH_TIERS, calculateTier, buildGrowthProgress, loadTierConfig
} = require('./shared/growth');
const {
    toNumber, toArray, toString, toBoolean, getDeep, setDeep, deepClone, merge, pick, omit, generateId, delay, getAllRecords
} = require('./shared/utils');

// ==================== 云初始化 ====================


async function queryCartRows(openid) {
    try {
        const [newRows, legacyRows] = await Promise.all([
            getAllRecords(db, 'cart_items', { openid }).catch(() => []),
            getAllRecords(db, 'cart_items', { user_id: openid }).catch(() => [])
        ]);
        const map = new Map();
        [...newRows, ...legacyRows].forEach((item) => map.set(item._id, item));
        return Array.from(map.values()).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    } catch (err) {
        console.error('[cart] queryCartRows 失败:', err.message);
        return [];
    }
}

async function getProductByCandidate(productId) {
    if (productId == null || productId === '') return null;
    const numericId = toNumber(productId, NaN);
    const [byLegacyId, byDocId] = await Promise.all([
        Number.isFinite(numericId) ? db.collection('products').where({ id: numericId }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('products').doc(String(productId)).get().catch(() => ({ data: null }))
    ]);
    if (byLegacyId.data && byLegacyId.data.length) return byLegacyId.data[0];
    return byDocId.data || null;
}

async function getSkuByCandidate(skuId) {
    if (skuId == null || skuId === '') return null;
    const numericId = toNumber(skuId, NaN);
    const [byLegacyId, byDocId] = await Promise.all([
        Number.isFinite(numericId) ? db.collection('skus').where({ id: numericId }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        db.collection('skus').doc(String(skuId)).get().catch(() => ({ data: null }))
    ]);
    if (byLegacyId.data && byLegacyId.data.length) return byLegacyId.data[0];
    return byDocId.data || null;
}

async function getProductSkuList(product) {
    if (!product) return [];
    const candidates = [product._id, product.id]
        .filter((value) => value != null && value !== '')
        .map((value) => String(value));
    const numericCandidates = candidates
        .map((value) => toNumber(value, NaN))
        .filter((value) => Number.isFinite(value))
        .map((value) => String(value));
    const allCandidates = Array.from(new Set([...candidates, ...numericCandidates]));
    if (!allCandidates.length) return [];

    const tasks = allCandidates.map((value) => {
        const numericValue = toNumber(value, NaN);
        if (Number.isFinite(numericValue) && String(numericValue) === value) {
            return db.collection('skus').where({ product_id: numericValue }).get().catch(() => ({ data: [] }));
        }
        return db.collection('skus').where({ product_id: value }).get().catch(() => ({ data: [] }));
    });

    const groups = await Promise.all(tasks);
    const map = new Map();
    groups.forEach((group) => {
        (group.data || []).forEach((sku) => {
            const key = sku._id || sku.id;
            map.set(String(key), sku);
        });
    });
    return Array.from(map.values());
}

function normalizeCartRow(row, product, sku) {
    const snapshotPrice = toNumber(
        row.snapshot_price != null ? row.snapshot_price : (sku?.price != null ? sku.price : product?.retail_price),
        0
    );
    return {
        ...row,
        id: row.id || row._id,  // ★ 确保前端可用 item.id
        openid: row.openid || row.user_id || '',
        qty: toNumber(row.qty != null ? row.qty : row.quantity, 1),
        quantity: toNumber(row.qty != null ? row.qty : row.quantity, 1),
        selected: row.selected !== false,
        snapshot_name: row.snapshot_name || sku?.name || product?.name || '',
        snapshot_spec: row.snapshot_spec || sku?.spec || sku?.specs || '',
        snapshot_image: row.snapshot_image || sku?.image || toArray(sku?.images)[0] || toArray(product?.images)[0] || '',
        snapshot_price: snapshotPrice,
        price: snapshotPrice,
        stock: toNumber(sku?.stock != null ? sku.stock : product?.stock, 0),
        product: product || null,
        sku: sku || null
    };
}

exports.main = cloudFunctionWrapper(async (event) => {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const { action, ...params } = event;

    // 验证 action
    if (!action || typeof action !== 'string') {
        throw badRequest('缺少有效的 action 参数');
    }

    if (action === 'list') {
        try {
            const rows = await queryCartRows(openid);
            const items = await Promise.all(rows.map(async (row) => {
                try {
                    const [product, sku] = await Promise.all([
                        getProductByCandidate(row.product_id),
                        getSkuByCandidate(row.sku_id)
                    ]);
                    return normalizeCartRow(row, product, sku);
                } catch (err) {
                    console.error('Error normalizing cart row:', row._id, err);
                    throw serverError(`处理购物车项目 ${row._id} 失败`);
                }
            }));
            return success({ list: items });
        } catch (err) {
            if (err instanceof CloudBaseError) throw err;
            console.error('Cart list error:', err);
            throw serverError('获取购物车列表失败');
        }
    }

    if (action === 'add') {
        try {
            const productId = params.product_id;
            const skuId = params.sku_id;
            
            if (!productId) {
                throw badRequest('缺少必要参数: product_id');
            }

            const qty = Math.max(1, toNumber(params.qty != null ? params.qty : params.quantity, 1));
            if (qty > 99999) {
                throw badRequest('购买数量不能超过 99999');
            }

            const [product, sku, existingRows] = await Promise.all([
                getProductByCandidate(productId),
                getSkuByCandidate(skuId),
                queryCartRows(openid)
            ]);

            if (!product) {
                throw notFound('商品不存在');
            }

            const productSkus = await getProductSkuList(product);
            if (productSkus.length > 1 && !skuId) {
                throw badRequest('请选择商品规格');
            }
            if (skuId && !sku) {
                throw notFound('规格不存在');
            }

            const effectiveSkuId = sku ? (sku._id || sku.id) : null;
            const existing = existingRows.find((item) => {
                if (effectiveSkuId) {
                    return String(item.sku_id) === String(effectiveSkuId) && String(item.product_id) === String(productId);
                }
                return String(item.product_id) === String(productId) && (!item.sku_id || item.sku_id === '');
            });

            if (existing) {
                await db.collection('cart_items').doc(existing._id).update({
                    data: {
                        qty: _.inc(qty),
                        quantity: _.inc(qty),
                        openid,
                        updated_at: db.serverDate()
                    }
                });
                return success({ _id: existing._id });
            }

            const payload = {
                openid,
                user_id: openid,
                product_id: product._id || product.id,
                sku_id: effectiveSkuId,
                qty,
                quantity: qty,
                selected: true,
                snapshot_price: toNumber(sku ? sku.price : product.retail_price, 0),
                snapshot_name: sku ? (sku.name || product.name || '') : (product.name || ''),
                snapshot_spec: sku ? (sku.spec || sku.specs || '') : '',
                snapshot_image: sku ? (sku.image || toArray(sku.images)[0]) : (toArray(product.images)[0] || ''),
                created_at: db.serverDate(),
                updated_at: db.serverDate()
            };

            const res = await db.collection('cart_items').add({ data: payload });
            return success({ _id: res._id });
        } catch (err) {
            if (err instanceof CloudBaseError) throw err;
            console.error('Cart add error:', err);
            throw serverError('添加购物车失败');
        }
    }

    if (action === 'update') {
        try {
            const cartId = params.cart_id;
            const qty = toNumber(params.qty, 0);

            if (!cartId) {
                throw badRequest('缺少必要参数: cart_id');
            }
            if (qty < 0) {
                throw badRequest('购买数量不能为负数');
            }

            if (qty <= 0) {
                await db.collection('cart_items').doc(cartId).remove();
                return success(null);
            }

            await db.collection('cart_items').doc(cartId).update({
                data: {
                    qty,
                    quantity: qty,
                    updated_at: db.serverDate()
                }
            });
            return success(null);
        } catch (err) {
            if (err instanceof CloudBaseError) throw err;
            console.error('Cart update error:', err);
            throw serverError('更新购物车失败');
        }
    }

    if (action === 'remove') {
        try {
            const cartId = params.cart_id;
            if (!cartId) {
                throw badRequest('缺少必要参数: cart_id');
            }
            await db.collection('cart_items').doc(cartId).remove();
            return success(null);
        } catch (err) {
            if (err instanceof CloudBaseError) throw err;
            console.error('Cart remove error:', err);
            throw serverError('删除购物车项失败');
        }
    }

    if (action === 'clear') {
        try {
            const rows = await queryCartRows(openid);
            await Promise.all(rows.map((item) => db.collection('cart_items').doc(item._id).remove()));
            return success(null);
        } catch (err) {
            if (err instanceof CloudBaseError) throw err;
            console.error('Cart clear error:', err);
            throw serverError('清空购物车失败');
        }
    }

    if (action === 'check') {
        try {
            const rows = await queryCartRows(openid);
            const cartIds = toArray(params.cart_ids);
            const selectedRows = cartIds.length
                ? rows.filter((item) => cartIds.includes(item._id))
                : rows.filter((item) => item.selected !== false);

            const errors = [];
            const normalized = [];
            let total = 0;

            for (const row of selectedRows) {
                try {
                    const [product, sku] = await Promise.all([
                        getProductByCandidate(row.product_id),
                        getSkuByCandidate(row.sku_id)
                    ]);

                    if (!product) {
                        errors.push({ cart_id: row._id, sku_id: row.sku_id, msg: '商品不存在' });
                        continue;
                    }

                    const productSkus = await getProductSkuList(product);
                    if (!row.sku_id && productSkus.length > 0) {
                        errors.push({ cart_id: row._id, sku_id: row.sku_id, msg: '请选择商品规格' });
                        continue;
                    }

                    if (row.sku_id && !sku) {
                        errors.push({ cart_id: row._id, sku_id: row.sku_id, msg: '规格不存在' });
                        continue;
                    }

                    const qty = toNumber(row.qty != null ? row.qty : row.quantity, 1);
                    const availableStock = sku ? toNumber(sku.stock, 0) : toNumber(product.stock, 0);
                    if (availableStock < qty) {
                        errors.push({ cart_id: row._id, sku_id: row.sku_id, msg: `库存不足（剩余${availableStock}）` });
                        continue;
                    }

                    const item = normalizeCartRow(row, product, sku);
                    total += item.snapshot_price * qty;
                    normalized.push(item);
                } catch (err) {
                    console.error('Error checking row:', row._id, err);
                    errors.push({ cart_id: row._id, sku_id: row.sku_id, msg: '检查失败' });
                }
            }

            return success({
                valid: errors.length === 0,
                errors,
                items: normalized,
                total
            });
        } catch (err) {
            if (err instanceof CloudBaseError) throw err;
            console.error('Cart check error:', err);
            throw serverError('检查购物车失败');
        }
    }

    throw badRequest(`未知 action: ${action}`);
});
