'use strict';

function registerProductBundleRoutes(app, deps) {
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
        flush = async () => {},
        resolveManagedFileUrl = async (value) => value
    } = deps;

    function primaryId(row = {}) {
        return row && (row._id || row.id || row._legacy_id) ? String(row._id || row.id || row._legacy_id) : '';
    }

    function lookupId(row = {}) {
        return row && (row.id || row._legacy_id || row._id) ? String(row.id || row._legacy_id || row._id) : '';
    }

    function isCloudFileId(value) {
        return /^cloud:\/\//i.test(String(value || '').trim());
    }

    function normalizeKey(value, fallback = '') {
        const raw = String(value || '').trim().toLowerCase();
        const normalized = raw
            .replace(/[\s/]+/g, '_')
            .replace(/[^\w-]/g, '')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');
        return normalized || fallback;
    }

    function normalizeImageRef(value = '') {
        const raw = pickString(value);
        return raw;
    }

    const FLEX_BUNDLE_COMMISSION_ROLE_LEVELS = [0, 1, 2, 3, 4, 5, 6];

    function normalizeFixedCommissionMap(raw = {}) {
        const source = raw && typeof raw === 'object' ? raw : {};
        return FLEX_BUNDLE_COMMISSION_ROLE_LEVELS.reduce((result, level) => {
            const directValue = source[level] ?? source[String(level)] ?? 0;
            result[String(level)] = Math.round(Math.max(0, toNumber(directValue, 0)) * 100) / 100;
            return result;
        }, {});
    }

    function maxFixedCommissionAmount(roleMap = {}) {
        const source = normalizeFixedCommissionMap(roleMap);
        return FLEX_BUNDLE_COMMISSION_ROLE_LEVELS.reduce((max, level) => Math.max(max, toNumber(source[String(level)], 0)), 0);
    }

    function normalizeCommissionPoolAmount(raw = {}, maps = {}) {
        const explicit = raw.commission_pool_amount ?? raw.commissionPoolAmount ?? raw.commission_pool ?? raw.total_commission_pool;
        const explicitAmount = Math.round(Math.max(0, toNumber(explicit, 0)) * 100) / 100;
        if (explicitAmount > 0) return explicitAmount;
        const soloMax = maxFixedCommissionAmount(maps.solo);
        const directMax = maxFixedCommissionAmount(maps.direct);
        const indirectMax = maxFixedCommissionAmount(maps.indirect);
        return Math.round(Math.max(soloMax, directMax + indirectMax) * 100) / 100;
    }

    function pickProduct(productLookup) {
        const products = getCollection('products');
        return findByLookup(products, productLookup, (item) => [item.id, item._id, item._legacy_id]);
    }

    function pickSku(skuLookup) {
        const skus = getCollection('skus');
        return findByLookup(skus, skuLookup, (item) => [item.id, item._id, item._legacy_id]);
    }

    function resolveProductImage(product = {}) {
        const images = Array.isArray(product.images) ? product.images : [];
        return pickString(images[0] || product.image || product.image_url || product.cover_image || '');
    }

    function buildSkuSpecText(sku = {}) {
        if (!sku || typeof sku !== 'object') return '';
        if (pickString(sku.spec_value)) return pickString(sku.spec_value);
        if (pickString(sku.spec)) return pickString(sku.spec);
        if (Array.isArray(sku.specs)) {
            return sku.specs
                .map((item) => pickString(item?.value || item?.spec_value || item?.name || ''))
                .filter(Boolean)
                .join(' / ');
        }
        return '';
    }

    function productOwnsSku(product = {}, sku = {}) {
        const productIds = [product.id, product._id, product._legacy_id].filter((value) => value !== undefined && value !== null && value !== '').map(String);
        const skuProductIds = [sku.product_id, sku.productId].filter((value) => value !== undefined && value !== null && value !== '').map(String);
        return skuProductIds.some((value) => productIds.includes(value));
    }

    function normalizeBundleOption(raw = {}, index = 0) {
        const product = pickProduct(raw.product_id || raw.productId);
        if (!product) {
            throw new Error(`第 ${index + 1} 个候选商品不存在`);
        }
        const skuLookup = raw.sku_id || raw.skuId;
        const sku = skuLookup ? pickSku(skuLookup) : null;
        if (skuLookup && !sku) {
            throw new Error(`第 ${index + 1} 个候选规格不存在`);
        }
        if (sku && !productOwnsSku(product, sku)) {
            throw new Error(`第 ${index + 1} 个候选规格不属于所选商品`);
        }
        const directCommissionMap = normalizeFixedCommissionMap(raw.direct_commission_fixed_by_role);
        const indirectCommissionMap = normalizeFixedCommissionMap(raw.indirect_commission_fixed_by_role);
        const soloCommissionMap = normalizeFixedCommissionMap(
            raw.solo_commission_fixed_by_role
            || raw.solo_commission_by_role
            || raw.solo_commission_fixed
            || raw.solo_commission
        );
        const commissionPoolAmount = normalizeCommissionPoolAmount(raw, {
            solo: soloCommissionMap,
            direct: directCommissionMap,
            indirect: indirectCommissionMap
        });
        return {
            option_key: normalizeKey(raw.option_key || raw.optionKey, `option_${index + 1}`),
            product_id: lookupId(product),
            sku_id: sku ? lookupId(sku) : '',
            default_qty: Math.max(1, Math.floor(toNumber(raw.default_qty ?? raw.quantity, 1))),
            sort_order: toNumber(raw.sort_order, index),
            enabled: toBoolean(raw.enabled ?? raw.status ?? raw.is_active, true) ? 1 : 0,
            commission_pool_amount: commissionPoolAmount,
            solo_commission_fixed_by_role: soloCommissionMap,
            direct_commission_fixed_by_role: directCommissionMap,
            indirect_commission_fixed_by_role: indirectCommissionMap
        };
    }

    function normalizeBundleGroup(raw = {}, index = 0) {
        const groupTitle = pickString(raw.group_title || raw.title || raw.name);
        if (!groupTitle) {
            throw new Error(`第 ${index + 1} 个组合分组缺少名称`);
        }
        const options = (Array.isArray(raw.options) ? raw.options : [])
            .map((item, optionIndex) => normalizeBundleOption(item, optionIndex))
            .sort((left, right) => toNumber(left.sort_order, 0) - toNumber(right.sort_order, 0));
        if (!options.length) {
            throw new Error(`组合分组「${groupTitle}」至少需要 1 个候选商品`);
        }
        const minSelect = Math.max(0, Math.floor(toNumber(raw.min_select, 1)));
        const maxSelect = Math.max(minSelect || 1, Math.floor(toNumber(raw.max_select, minSelect || 1)));
        if (maxSelect > options.length) {
            throw new Error(`组合分组「${groupTitle}」最多选择数不能超过候选商品数`);
        }
        return {
            group_key: normalizeKey(raw.group_key || raw.groupKey || groupTitle, `group_${index + 1}`),
            group_title: groupTitle,
            min_select: minSelect,
            max_select: maxSelect,
            sort_order: toNumber(raw.sort_order, index),
            options
        };
    }

    function normalizeBundlePayload(raw = {}, existingRow = null) {
        const title = pickString(raw.title);
        if (!title) {
            throw new Error('组合标题不能为空');
        }
        const bundlePrice = Math.round(Math.max(0, toNumber(raw.bundle_price, 0)) * 100) / 100;
        if (bundlePrice <= 0) {
            throw new Error('组合价必须大于 0');
        }
        const groups = (Array.isArray(raw.groups) ? raw.groups : [])
            .map((item, index) => normalizeBundleGroup(item, index))
            .sort((left, right) => toNumber(left.sort_order, 0) - toNumber(right.sort_order, 0));
        if (!groups.length) {
            throw new Error('组合至少需要 1 个分组');
        }
        const coverImage = normalizeImageRef(raw.cover_image || raw.coverImage || raw.cover_url || raw.coverUrl || raw.cover_file_id || raw.coverFileId);
        const publishStatus = pickString(raw.publish_status || existingRow?.publish_status || 'published', 'published');
        const channelTags = Array.isArray(raw.channel_tags)
            ? raw.channel_tags.map((item) => pickString(item)).filter(Boolean)
            : pickString(raw.channel_tags)
                .split(/[，,]/)
                .map((item) => pickString(item))
                .filter(Boolean);
        return {
            ...(existingRow || {}),
            title,
            subtitle: pickString(raw.subtitle),
            scene_type: pickString(raw.scene_type || existingRow?.scene_type || 'explosive_bundle', 'explosive_bundle'),
            hero_title: pickString(raw.hero_title || raw.heroTitle || title),
            hero_subtitle: pickString(raw.hero_subtitle || raw.heroSubtitle || raw.subtitle || existingRow?.hero_subtitle || ''),
            channel_tags: channelTags,
            cover_image: coverImage,
            cover_file_id: isCloudFileId(coverImage) ? coverImage : pickString(raw.cover_file_id || raw.coverFileId || existingRow?.cover_file_id || ''),
            status: toBoolean(raw.status ?? raw.enabled ?? raw.is_active, existingRow ? existingRow.status !== 0 : true) ? 1 : 0,
            sort_order: toNumber(raw.sort_order, existingRow?.sort_order || 0),
            sort_weight: toNumber(raw.sort_weight, existingRow?.sort_weight ?? raw.sort_order ?? 0),
            publish_status: ['draft', 'published', 'archived'].includes(publishStatus) ? publishStatus : 'published',
            bundle_price: bundlePrice,
            stack_policy: 'exclusive',
            display_mode: 'bundle_with_children',
            groups,
            updated_at: nowIso()
        };
    }

    async function flushProductBundleWrites() {
        try {
            await flush();
            return true;
        } catch (error) {
            console.error('[product-bundles] persist failed:', error.message);
            return false;
        }
    }

    async function decorateBundle(row = {}) {
        const coverSource = pickString(row.cover_file_id || row.cover_image);
        const coverPreviewUrl = coverSource ? await resolveManagedFileUrl(coverSource) : '';
        const groups = (Array.isArray(row.groups) ? row.groups : []).map((group) => ({
            ...group,
            options: (Array.isArray(group.options) ? group.options : []).map((option) => {
                const product = pickProduct(option.product_id);
                const sku = option.sku_id ? pickSku(option.sku_id) : null;
                return {
                    ...option,
                    product_name: pickString(product?.name || product?.title || '商品已删除'),
                    product_image: resolveProductImage(product),
                    sku_name: pickString(sku?.name || ''),
                    sku_spec: buildSkuSpecText(sku),
                    product_snapshot: product ? {
                        id: lookupId(product),
                        name: pickString(product.name || product.title || ''),
                        image: resolveProductImage(product)
                    } : null,
                    sku_snapshot: sku ? {
                        id: lookupId(sku),
                        name: pickString(sku.name || ''),
                        spec: buildSkuSpecText(sku)
                    } : null,
                    commission_pool_amount: Math.round(Math.max(0, toNumber(option.commission_pool_amount, 0)) * 100) / 100,
                    solo_commission_fixed_by_role: normalizeFixedCommissionMap(option.solo_commission_fixed_by_role),
                    direct_commission_fixed_by_role: normalizeFixedCommissionMap(option.direct_commission_fixed_by_role),
                    indirect_commission_fixed_by_role: normalizeFixedCommissionMap(option.indirect_commission_fixed_by_role)
                };
            })
        }));
        const optionCount = groups.reduce((sum, group) => sum + (Array.isArray(group.options) ? group.options.length : 0), 0);
        return {
            ...row,
            id: primaryId(row),
            scene_type: pickString(row.scene_type || 'explosive_bundle', 'explosive_bundle'),
            hero_title: pickString(row.hero_title || row.title),
            hero_subtitle: pickString(row.hero_subtitle || row.subtitle),
            channel_tags: Array.isArray(row.channel_tags) ? row.channel_tags : [],
            sort_weight: toNumber(row.sort_weight, row.sort_order || 0),
            publish_status: pickString(row.publish_status || 'published', 'published'),
            cover_preview_url: coverPreviewUrl || coverSource,
            group_count: groups.length,
            option_count: optionCount,
            groups
        };
    }

    app.get('/admin/api/product-bundles', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['product_bundles', 'products', 'skus']);
        const keyword = pickString(req.query.keyword).toLowerCase();
        const status = req.query.status !== undefined && req.query.status !== '' ? Number(req.query.status) : null;
        const publishStatus = pickString(req.query.publish_status).toLowerCase();
        const sceneType = pickString(req.query.scene_type).toLowerCase();
        let rows = await Promise.all(sortByUpdatedDesc(getCollection('product_bundles')).map((item) => decorateBundle(item)));
        if (keyword) {
            rows = rows.filter((item) => `${item.title} ${item.subtitle || ''}`.toLowerCase().includes(keyword));
        }
        if (status !== null && Number.isFinite(status)) {
            rows = rows.filter((item) => Number(item.status) === status);
        }
        if (publishStatus) {
            rows = rows.filter((item) => pickString(item.publish_status).toLowerCase() === publishStatus);
        }
        if (sceneType) {
            rows = rows.filter((item) => pickString(item.scene_type).toLowerCase() === sceneType);
        }
        ok(res, paginate(rows, req));
    });

    app.get('/admin/api/product-bundles/:id', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['product_bundles', 'products', 'skus']);
        const row = findByLookup(getCollection('product_bundles'), req.params.id);
        if (!row) return fail(res, '产品组合不存在', 404);
        ok(res, await decorateBundle(row));
    });

    app.post('/admin/api/product-bundles', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['product_bundles', 'products', 'skus']);
        const rows = getCollection('product_bundles');
        let row;
        try {
            row = normalizeBundlePayload(req.body, {
                id: nextId(rows),
                created_at: nowIso()
            });
        } catch (error) {
            return fail(res, error.message || '产品组合配置不合法', 400);
        }
        rows.push(row);
        saveCollection('product_bundles', rows);
        if (!(await flushProductBundleWrites())) {
            return fail(res, '产品组合保存失败，请稍后重试', 500);
        }
        createAuditLog(req.admin, 'product_bundle.create', 'product_bundles', { bundle_id: primaryId(row), title: row.title });
        ok(res, await decorateBundle(row));
    });

    app.put('/admin/api/product-bundles/:id', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['product_bundles', 'products', 'skus']);
        const rows = getCollection('product_bundles');
        const index = rows.findIndex((item) => primaryId(item) === String(req.params.id) || String(item.id) === String(req.params.id));
        if (index === -1) return fail(res, '产品组合不存在', 404);
        let row;
        try {
            row = normalizeBundlePayload(req.body, rows[index]);
        } catch (error) {
            return fail(res, error.message || '产品组合配置不合法', 400);
        }
        rows[index] = row;
        saveCollection('product_bundles', rows);
        if (!(await flushProductBundleWrites())) {
            return fail(res, '产品组合保存失败，请稍后重试', 500);
        }
        createAuditLog(req.admin, 'product_bundle.update', 'product_bundles', { bundle_id: primaryId(row), title: row.title });
        ok(res, await decorateBundle(row));
    });

    app.delete('/admin/api/product-bundles/:id', auth, requirePermission('products'), async (req, res) => {
        await ensureFreshCollections(['product_bundles']);
        const rows = getCollection('product_bundles');
        const target = findByLookup(rows, req.params.id);
        if (!target) return fail(res, '产品组合不存在', 404);
        const nextRows = rows.filter((item) => primaryId(item) !== String(req.params.id) && String(item.id) !== String(req.params.id));
        saveCollection('product_bundles', nextRows);
        if (!(await flushProductBundleWrites())) {
            return fail(res, '产品组合删除失败，请稍后重试', 500);
        }
        createAuditLog(req.admin, 'product_bundle.delete', 'product_bundles', { bundle_id: primaryId(target), title: target.title });
        ok(res, { success: true });
    });

    return {
        decorateBundle
    };
}

module.exports = {
    registerProductBundleRoutes
};
