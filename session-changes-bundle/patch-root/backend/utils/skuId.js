/**
 * 与 product_skus 外键一致：无规格或非法 ID 必须为 null，禁止写入 0（表中通常不存在 id=0 的行）。
 * 用于 cart_items、orders 等引用 SKU 的可空字段。
 */
function normalizeSkuIdForFk(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    const n = typeof raw === 'number' ? raw : parseInt(String(raw).trim(), 10);
    if (!Number.isInteger(n) || n < 1) return null;
    return n;
}

module.exports = { normalizeSkuIdForFk };
