'use strict';
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function isOnSaleStatus(status) {
    return status === true || status === 1 || status === '1' || status === 'active' || status === 'on_sale';
}

function normalizeSku(sku) {
    const price = toNumber(sku.price != null ? sku.price : sku.retail_price, 0);
    const originalPrice = toNumber(sku.original_price != null ? sku.original_price : sku.market_price, price);
    const image = sku.image || toArray(sku.images)[0] || '';
    const memberPrice = toNumber(sku.member_price != null ? sku.member_price : sku.price_member, price);
    const wholesalePrice = toNumber(sku.wholesale_price != null ? sku.wholesale_price : sku.price_leader, price);
    const agentPrice = toNumber(sku.agent_price != null ? sku.agent_price : sku.price_agent, price);
    return {
        ...sku,
        id: sku.id || sku._id,  // ★ 确保前端可用 sku.id
        price,
        original_price: originalPrice,
        member_price: memberPrice,
        price_member: memberPrice,
        wholesale_price: wholesalePrice,
        price_leader: wholesalePrice,
        agent_price: agentPrice,
        price_agent: agentPrice,
        image,
        images: sku.images ? toArray(sku.images) : (image ? [image] : []),
        spec: sku.spec || sku.specs || '',
        stock: toNumber(sku.stock, 0)
    };
}

function formatProduct(product) {
    const retailPrice = toNumber(product.retail_price != null ? product.retail_price : product.min_price, 0);
    const originalPrice = toNumber(product.market_price != null ? product.market_price : product.original_price, retailPrice);
    const images = toArray(product.images);
    const detailImages = toArray(product.detail_images);
    return {
        ...product,
        id: product.id || product._id,  // ★ 确保前端可用 product.id
        price: retailPrice,
        retail_price: retailPrice,
        min_price: retailPrice,
        original_price: originalPrice,
        market_price: originalPrice,
        image: images[0] || '',
        images,
        detail_images: detailImages,
        is_on_sale: isOnSaleStatus(product.status),
        stock: toNumber(product.stock, 0),
        sales_count: toNumber(product.sales_count != null ? product.sales_count : product.purchase_count, 0),
        skus: toArray(product.skus).map(normalizeSku)
    };
}

async function queryActiveProducts() {
    const candidates = [
        { status: true },
        { status: 1 },
        { status: '1' },
        { status: 'active' },
        { status: 'on_sale' }
    ];
    const groups = await Promise.all(candidates.map((where) => db.collection('products').where(where).get()));
    const map = new Map();
    groups.forEach((group) => {
        group.data.forEach((item) => {
            map.set(item._id, item);
        });
    });
    return Array.from(map.values());
}

async function getProductById(productId) {
    const numericId = toNumber(productId, NaN);
    const [byLegacyId, byDocId] = await Promise.all([
        Number.isFinite(numericId) ? db.collection('products').where({ id: numericId }).limit(1).get() : Promise.resolve({ data: [] }),
        db.collection('products').doc(String(productId)).get().catch(() => ({ data: null }))
    ]);
    if (byLegacyId.data && byLegacyId.data.length) return byLegacyId.data[0];
    if (byDocId.data) return byDocId.data;
    return null;
}

async function getSkusByProduct(product) {
    const candidates = [];
    if (product && product._id) {
        candidates.push(db.collection('skus').where({ product_id: product._id }).get().catch(() => ({ data: [] })));
    }
    if (product && product.id != null) {
        candidates.push(db.collection('skus').where({ product_id: Number(product.id) }).get().catch(() => ({ data: [] })));
    }
    if (!candidates.length) return [];
    const groups = await Promise.all(candidates);
    const map = new Map();
    groups.forEach((group) => {
        group.data.forEach((item) => map.set(item._id || item.id, item));
    });
    return Array.from(map.values()).sort((a, b) => toNumber(a.sort_order, 0) - toNumber(b.sort_order, 0));
}

exports.main = async (event) => {
    const { action, page = 1, size = 20, limit, category_id, keyword, product_id } = event;
    const pageSize = Math.max(1, toNumber(limit != null ? limit : size, 20));

    if (action === 'list') {
        let list = await queryActiveProducts();
        if (category_id) {
            list = list.filter((item) => String(item.category_id) === String(category_id));
        }
        list = list
            .sort((a, b) => toNumber(b.manual_weight, 0) - toNumber(a.manual_weight, 0))
            .map(formatProduct);

        const currentPage = Math.max(1, toNumber(page, 1));
        const start = (currentPage - 1) * pageSize;
        const pageList = list.slice(start, start + pageSize);
        return {
            code: 0,
            success: true,
            data: { list: pageList, total: list.length, page: currentPage, size: pageSize }
        };
    }

    if (action === 'detail') {
        const product = await getProductById(product_id);
        if (!product) return { code: 404, success: false, message: '商品不存在' };
        const skus = await getSkusByProduct(product);
        return {
            code: 0,
            success: true,
            data: formatProduct({ ...product, skus })
        };
    }

    if (action === 'categories') {
        const res = await db.collection('categories')
            .where({ status: _.in([true, 1, '1']) })
            .orderBy('sort_order', 'asc')
            .get();
        return {
            code: 0,
            success: true,
            data: res.data.map((item) => ({
                ...item,
                id: item.id || item._id,  // ★ 确保前端可用 category.id
                image: item.image || item.icon || ''
            }))
        };
    }

    if (action === 'search') {
        let list = await queryActiveProducts();
        const searchText = String(keyword || '').trim().toLowerCase();
        if (searchText) {
            list = list.filter((item) => `${item.name || ''} ${item.description || ''}`.toLowerCase().includes(searchText));
        }
        list = list.map(formatProduct);
        const currentPage = Math.max(1, toNumber(page, 1));
        const start = (currentPage - 1) * pageSize;
        return {
            code: 0,
            success: true,
            data: {
                list: list.slice(start, start + pageSize),
                total: list.length,
                page: currentPage,
                size: pageSize
            }
        };
    }

    // ── 商品评价列表 ────────────────────────────
    if (action === 'reviews') {
        const productId = event.product_id;
        if (!productId) return { code: 400, success: false, message: '缺少商品ID' };
        const currentPage = Math.max(1, toNumber(event.page, 1));
        const pageSizeVal = Math.max(1, toNumber(event.limit || event.size, 10));
        const rows = await db.collection('reviews')
            .where({ product_id: productId })
            .orderBy('created_at', 'desc')
            .limit(100)
            .get()
            .catch(() => ({ data: [] }));
        // 补充评价者用户信息
        const reviewerOpenids = [...new Set(rows.data.map((item) => item.openid).filter(Boolean))];
        const reviewerMap = {};
        if (reviewerOpenids.length) {
            const userRes = await db.collection('users').where({ openid: _.in(reviewerOpenids) }).limit(100).get().catch(() => ({ data: [] }));
            userRes.data.forEach((u) => { reviewerMap[u.openid] = u; });
        }
        const list = rows.data.map((item) => {
            const reviewer = reviewerMap[item.openid] || null;
            return {
                ...item,
                id: item.id || item._id,
                rating: toNumber(item.rating, 5),
                created_at: item.created_at,
                reviewer_nickname: reviewer?.nickName || reviewer?.nickname || '用户',
                reviewer_avatar: reviewer?.avatarUrl || reviewer?.avatar_url || ''
            };
        });
        const start = (currentPage - 1) * pageSizeVal;
        return {
            code: 0,
            success: true,
            data: {
                list: list.slice(start, start + pageSizeVal),
                total: list.length,
                page: currentPage,
                size: pageSizeVal,
                pagination: { page: currentPage, limit: pageSizeVal, total: list.length }
            }
        };
    }

    return { code: 400, success: false, message: `未知 action: ${action}` };
};
