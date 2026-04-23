function normalizeSkuId(value) {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric < 1) return null;
    return numeric;
}

function getSkuSpecValues(sku) {
    if (!sku || typeof sku !== 'object') return [];
    if (Array.isArray(sku.specs) && sku.specs.length > 0) {
        return sku.specs
            .map((item) => (item && item.value ? String(item.value).trim() : ''))
            .filter(Boolean);
    }

    const fallbackValue = String(sku.spec_value || sku.spec || '').trim();
    return fallbackValue ? [fallbackValue] : [];
}

function buildDefaultSpecText(sku) {
    const values = getSkuSpecValues(sku);
    return values.join(' / ');
}

function findDefaultSku(product, skus = []) {
    const defaultSkuId = normalizeSkuId(product && product.default_sku_id);
    if (!defaultSkuId) return null;
    return (Array.isArray(skus) ? skus : []).find((sku) => normalizeSkuId(sku && (sku.id || sku._id)) === defaultSkuId) || null;
}

function normalizeSkuRetailPrice(sku) {
    const value = Number(sku && sku.retail_price);
    return Number.isFinite(value) && value >= 0 ? value : 0;
}

function pickFallbackDefaultSku(product, skus = []) {
    const list = Array.isArray(skus) ? skus.filter(Boolean) : [];
    if (!list.length) return null;

    const targetPrice = Number(product && product.retail_price);
    return list.slice().sort((left, right) => {
        const leftInStock = Number(left.stock || 0) > 0 ? 1 : 0;
        const rightInStock = Number(right.stock || 0) > 0 ? 1 : 0;
        if (leftInStock !== rightInStock) {
            return rightInStock - leftInStock;
        }

        const leftPrice = normalizeSkuRetailPrice(left);
        const rightPrice = normalizeSkuRetailPrice(right);
        if (Number.isFinite(targetPrice) && targetPrice > 0) {
            const leftDiff = Math.abs(leftPrice - targetPrice);
            const rightDiff = Math.abs(rightPrice - targetPrice);
            if (leftDiff !== rightDiff) {
                return leftDiff - rightDiff;
            }
        }

        if (leftPrice !== rightPrice) {
            return leftPrice - rightPrice;
        }

        const leftId = normalizeSkuId(left.id || left._id) || Number.MAX_SAFE_INTEGER;
        const rightId = normalizeSkuId(right.id || right._id) || Number.MAX_SAFE_INTEGER;
        return leftId - rightId;
    })[0];
}

function resolveDefaultSpecText(product, skus = []) {
    const explicit = String(product && product.default_spec_text || '').trim();
    if (explicit) return explicit;

    const matchedDefaultSku = findDefaultSku(product, skus);
    if (matchedDefaultSku) {
        return buildDefaultSpecText(matchedDefaultSku);
    }

    if (Array.isArray(skus) && skus.length === 1) {
        return buildDefaultSpecText(skus[0]);
    }

    return '';
}

module.exports = {
    normalizeSkuId,
    getSkuSpecValues,
    buildDefaultSpecText,
    findDefaultSku,
    pickFallbackDefaultSku,
    resolveDefaultSpecText
};
