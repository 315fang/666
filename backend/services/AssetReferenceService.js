const { Op } = require('sequelize');
const {
    Product,
    Material,
    Banner,
    Content,
    ContentBoardItem
} = require('../models');
const { deleteFileByUrl } = require('./StorageService');

const normalizeAssetUrl = (url) => {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (!trimmed) return '';

    try {
        const parsed = new URL(trimmed);
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString();
    } catch (_) {
        return trimmed.split('#')[0].split('?')[0];
    }
};

const isSameAssetUrl = (left, right) => {
    const normalizedLeft = normalizeAssetUrl(left);
    const normalizedRight = normalizeAssetUrl(right);
    return !!normalizedLeft && normalizedLeft === normalizedRight;
};

const buildLikePatterns = (url) => {
    const normalized = normalizeAssetUrl(url);
    if (!normalized) return [];

    const patterns = new Set([normalized]);

    try {
        const parsed = new URL(normalized);
        patterns.add(parsed.pathname);
    } catch (_) {
        // ignore invalid URL path extraction
    }

    return Array.from(patterns)
        .filter(Boolean)
        .map((value) => ({ [Op.like]: `%${value}%` }));
};

const collectProductRefs = async (url) => {
    const likePatterns = buildLikePatterns(url);
    if (!likePatterns.length) return [];

    const rows = await Product.findAll({
        attributes: ['id', 'name', 'images', 'detail_images'],
        where: {
            [Op.or]: [
                { images: { [Op.or]: likePatterns } },
                { detail_images: { [Op.or]: likePatterns } }
            ]
        }
    });

    const refs = [];
    for (const row of rows) {
        const images = Array.isArray(row.images) ? row.images : [];
        const detailImages = Array.isArray(row.detail_images) ? row.detail_images : [];

        if (images.some((item) => isSameAssetUrl(item, url))) {
            refs.push({ type: 'product.images', id: row.id, label: row.name || `Product#${row.id}` });
        }
        if (detailImages.some((item) => isSameAssetUrl(item, url))) {
            refs.push({ type: 'product.detail_images', id: row.id, label: row.name || `Product#${row.id}` });
        }
    }

    return refs;
};

const collectFieldRefs = async (model, field, type, url, labelField = 'title') => {
    const likePatterns = buildLikePatterns(url);
    if (!likePatterns.length) return [];

    const rows = await model.findAll({
        attributes: ['id', field, labelField],
        where: { [field]: { [Op.or]: likePatterns } }
    });

    return rows
        .filter((row) => isSameAssetUrl(row[field], url))
        .map((row) => ({
            type,
            id: row.id,
            label: row[labelField] || `${type}#${row.id}`
        }));
};

const collectAssetReferences = async (url) => {
    const normalized = normalizeAssetUrl(url);
    if (!normalized) return [];

    const [
        productRefs,
        materialRefs,
        materialThumbRefs,
        bannerRefs,
        contentRefs,
        boardItemRefs
    ] = await Promise.all([
        collectProductRefs(normalized),
        collectFieldRefs(Material, 'url', 'material.url', normalized, 'title'),
        collectFieldRefs(Material, 'thumbnail_url', 'material.thumbnail_url', normalized, 'title'),
        collectFieldRefs(Banner, 'image_url', 'banner.image_url', normalized, 'title'),
        collectFieldRefs(Content, 'cover_image', 'content.cover_image', normalized, 'title'),
        collectFieldRefs(ContentBoardItem, 'image_url', 'content_board_item.image_url', normalized, 'id')
    ]);

    return [
        ...productRefs,
        ...materialRefs,
        ...materialThumbRefs,
        ...bannerRefs,
        ...contentRefs,
        ...boardItemRefs
    ];
};

const deleteAssetIfUnreferenced = async (url) => {
    const normalized = normalizeAssetUrl(url);
    if (!normalized) {
        return { deleted: false, references: [] };
    }

    const references = await collectAssetReferences(normalized);
    if (references.length > 0) {
        return { deleted: false, references };
    }

    await deleteFileByUrl(url);
    return { deleted: true, references: [] };
};

module.exports = {
    normalizeAssetUrl,
    isSameAssetUrl,
    collectAssetReferences,
    deleteAssetIfUnreferenced
};
