'use strict';

function registerBundleProductRoutes(app, deps) {
    const {
        auth,
        requirePermission,
        ensureFreshCollections,
        getCollection,
        saveCollection,
        nextId,
        nowIso,
        findByLookup,
        paginate,
        sortByUpdatedDesc,
        pickString,
        toNumber,
        toBoolean,
        createAuditLog,
        ok,
        fail,
        flush = async () => {}
    } = deps;

    function primaryId(row = {}) {
        return row && (row._id || row.id || row._legacy_id) ? String(row._id || row.id || row._legacy_id) : '';
    }

    function lookupId(row = {}) {
        return row && (row.id || row._legacy_id || row._id) ? String(row.id || row._legacy_id || row._id) : '';
    }

    function pickProduct(productLookup) {
        const products = getCollection('products');
        return findByLookup(products, productLookup, (item) => [item.id, item._id, item._legacy_id]);
    }

    function pickCategory(categoryLookup) {
        if (categoryLookup === null || categoryLookup === undefined || categoryLookup === '') return null;
        const categories = getCollection('categories');
        return findByLookup(categories, categoryLookup, (item) => [item.id, item._id, item._legacy_id]);
    }

    function resolveProductImage(product = {}) {
        const images = Array.isArray(product.images) ? product.images : [];
        return pickString(images[0] || product.image || product.image_url || product.cover_image || product.file_id || '');
    }

    async function flushBundleProductWrites() {
        try {
            await flush();
            return true;
        } catch (error) {
            console.error('[bundle-products] persist failed:', error.message);
            return false;
        }
    }

    function normalizeBundleProductPayload(raw = {}, existingRow = null) {
        const sourceProductLookup = raw.source_product_id || raw.sourceProductId || raw.product_id || raw.productId || existingRow?.source_product_id || existingRow?.product_id;
        const sourceProduct = pickProduct(sourceProductLookup);
        if (!sourceProduct) {
            throw new Error('请选择要加入组合商品库的商品');
        }

        const sourceProductId = lookupId(sourceProduct);
        const categoryId = raw.bundle_category_id
            ?? raw.bundleCategoryId
            ?? raw.category_id
            ?? raw.categoryId
            ?? existingRow?.category_id
            ?? sourceProduct.category_id
            ?? '';
        const category = pickCategory(categoryId);
        const name = pickString(raw.name || raw.title || raw.display_name || existingRow?.name || sourceProduct.name || sourceProduct.title);
        if (!name) {
            throw new Error('组合商品名称不能为空');
        }

        return {
            ...(existingRow || {}),
            id: existingRow ? existingRow.id : undefined,
            source_product_id: sourceProductId,
            product_id: sourceProductId,
            name,
            display_name: name,
            category_id: categoryId === null || categoryId === undefined ? '' : categoryId,
            category_name: pickString(raw.category_name || raw.bundle_category_name || category?.name || existingRow?.category_name || ''),
            image: pickString(raw.image || raw.image_url || raw.cover_image || existingRow?.image || ''),
            sort_order: toNumber(raw.sort_order, existingRow?.sort_order || 0),
            status: toBoolean(raw.status ?? raw.enabled ?? raw.is_active, existingRow ? existingRow.status !== 0 : true) ? 1 : 0,
            remark: pickString(raw.remark || raw.note || existingRow?.remark || ''),
            updated_at: nowIso()
        };
    }

    function decorateBundleProduct(row = {}) {
        const sourceProduct = pickProduct(row.source_product_id || row.product_id);
        const category = pickCategory(row.category_id || sourceProduct?.category_id);
        const sourceProductId = sourceProduct ? lookupId(sourceProduct) : pickString(row.source_product_id || row.product_id);
        const image = pickString(row.image || row.image_url || row.cover_image) || resolveProductImage(sourceProduct);

        return {
            ...row,
            id: primaryId(row),
            source_product_id: sourceProductId,
            product_id: sourceProductId,
            name: pickString(row.name || row.display_name || sourceProduct?.name || sourceProduct?.title || '组合商品'),
            product_name: pickString(sourceProduct?.name || sourceProduct?.title || ''),
            category_id: row.category_id ?? sourceProduct?.category_id ?? '',
            category_name: pickString(row.category_name || category?.name || ''),
            image,
            retail_price: row.retail_price ?? sourceProduct?.retail_price ?? sourceProduct?.price ?? 0,
            stock: row.stock ?? sourceProduct?.stock ?? 0,
            status: toBoolean(row.status ?? row.enabled ?? row.is_active, true) ? 1 : 0,
            library_source: 'bundle_products',
            library_label: '组合商品库'
        };
    }

    app.get('/admin/api/bundle-products', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['bundle_products', 'products', 'categories']);
        const keyword = pickString(req.query.keyword).toLowerCase();
        const categoryId = pickString(req.query.category_id || req.query.bundle_category_id);
        const status = req.query.status !== undefined && req.query.status !== '' ? Number(req.query.status) : null;

        let rows = sortByUpdatedDesc(getCollection('bundle_products')).map(decorateBundleProduct);
        if (keyword) {
            rows = rows.filter((item) => `${item.name} ${item.product_name} ${item.category_name}`.toLowerCase().includes(keyword));
        }
        if (categoryId) {
            rows = rows.filter((item) => item.category_id != null && String(item.category_id) === String(categoryId));
        }
        if (status !== null && Number.isFinite(status)) {
            rows = rows.filter((item) => Number(item.status) === status);
        }
        ok(res, paginate(rows, req));
    });

    app.get('/admin/api/bundle-products/:id', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['bundle_products', 'products', 'categories']);
        const row = findByLookup(getCollection('bundle_products'), req.params.id);
        if (!row) return fail(res, '组合商品不存在', 404);
        ok(res, decorateBundleProduct(row));
    });

    app.post('/admin/api/bundle-products', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['bundle_products', 'products', 'categories']);
        const rows = getCollection('bundle_products');
        let row;
        try {
            row = {
                ...normalizeBundleProductPayload(req.body, null),
                id: nextId(rows),
                created_at: nowIso()
            };
        } catch (error) {
            return fail(res, error.message || '组合商品配置不合法', 400);
        }
        rows.push(row);
        saveCollection('bundle_products', rows);
        if (!(await flushBundleProductWrites())) {
            return fail(res, '组合商品保存失败，请稍后重试', 500);
        }
        createAuditLog(req.admin, 'bundle_product.create', 'bundle_products', { bundle_product_id: primaryId(row), name: row.name });
        ok(res, decorateBundleProduct(row));
    });

    app.put('/admin/api/bundle-products/:id', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['bundle_products', 'products', 'categories']);
        const rows = getCollection('bundle_products');
        const index = rows.findIndex((item) => primaryId(item) === String(req.params.id) || String(item.id) === String(req.params.id));
        if (index === -1) return fail(res, '组合商品不存在', 404);
        let row;
        try {
            row = normalizeBundleProductPayload(req.body, rows[index]);
        } catch (error) {
            return fail(res, error.message || '组合商品配置不合法', 400);
        }
        rows[index] = row;
        saveCollection('bundle_products', rows);
        if (!(await flushBundleProductWrites())) {
            return fail(res, '组合商品保存失败，请稍后重试', 500);
        }
        createAuditLog(req.admin, 'bundle_product.update', 'bundle_products', { bundle_product_id: primaryId(row), name: row.name });
        ok(res, decorateBundleProduct(row));
    });

    async function updateBundleProductStatus(req, res) {
        await ensureFreshCollections(['bundle_products']);
        const rows = getCollection('bundle_products');
        const index = rows.findIndex((item) => primaryId(item) === String(req.params.id) || String(item.id) === String(req.params.id));
        if (index === -1) return fail(res, '组合商品不存在', 404);
        const status = toBoolean(req.body?.status ?? req.body?.enabled ?? req.body?.is_active ?? req.body?.value, true) ? 1 : 0;
        rows[index] = {
            ...rows[index],
            status,
            updated_at: nowIso()
        };
        saveCollection('bundle_products', rows);
        if (!(await flushBundleProductWrites())) {
            return fail(res, '组合商品状态保存失败，请稍后重试', 500);
        }
        ok(res, decorateBundleProduct(rows[index]));
    }

    app.put('/admin/api/bundle-products/:id/status', auth, requirePermission('products'), updateBundleProductStatus);
    app.post('/admin/api/bundle-products/:id/status', auth, requirePermission('products'), updateBundleProductStatus);

    app.delete('/admin/api/bundle-products/:id', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['bundle_products', 'product_bundles']);
        const rows = getCollection('bundle_products');
        const target = findByLookup(rows, req.params.id);
        if (!target) return fail(res, '组合商品不存在', 404);
        const targetId = primaryId(target);
        const inUse = getCollection('product_bundles').some((bundle) => (
            Array.isArray(bundle.groups)
            && bundle.groups.some((group) => (
                Array.isArray(group.options)
                && group.options.some((option) => String(option.bundle_product_id || '') === String(targetId))
            ))
        ));
        if (inUse) return fail(res, '该组合商品已被自由组合套餐使用，不能删除');
        const nextRows = rows.filter((item) => primaryId(item) !== String(req.params.id) && String(item.id) !== String(req.params.id));
        saveCollection('bundle_products', nextRows);
        if (!(await flushBundleProductWrites())) {
            return fail(res, '组合商品删除失败，请稍后重试', 500);
        }
        createAuditLog(req.admin, 'bundle_product.delete', 'bundle_products', { bundle_product_id: targetId, name: target.name });
        ok(res, { success: true });
    });
}

module.exports = {
    registerBundleProductRoutes
};
