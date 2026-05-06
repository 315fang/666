const { parseImages } = require('../../utils/dataFormatter');
const { resolveCloudImageList, resolveCloudImageUrl } = require('./utils/cloudAsset');

function appendImageCandidates(target, value) {
    if (!value) return;
    if (Array.isArray(value)) {
        value.forEach((item) => appendImageCandidates(target, item));
        return;
    }
    if (typeof value === 'string') {
        const text = value.trim();
        if (!text) return;
        if (text.startsWith('[')) {
            try {
                appendImageCandidates(target, JSON.parse(text));
                return;
            } catch (_) {}
        }
        target.push(text);
        return;
    }
    if (typeof value !== 'object') return;
    [
        value.display_image,
        value.displayImage,
        value.product_image,
        value.productImage,
        value.image_url,
        value.imageUrl,
        value.url,
        value.temp_url,
        value.image,
        value.snapshot_image,
        value.snapshotImage,
        value.cover_image,
        value.coverImage,
        value.cover,
        value.cover_url,
        value.coverUrl,
        value.file_id,
        value.fileId,
        value.image_ref,
        value.imageRef,
        value.thumb,
        value.thumbnail,
        value.images,
        value.preview_images,
        value.previewImages,
        value.image_candidates,
        value.imageCandidates,
        value.product,
        value.sku
    ].forEach((item) => appendImageCandidates(target, item));
}

function collectOrderImageCandidates(...sources) {
    const seen = new Set();
    const candidates = [];
    sources.forEach((source) => appendImageCandidates(candidates, source));
    return candidates.filter((candidate) => {
        if (!candidate || seen.has(candidate)) return false;
        seen.add(candidate);
        return true;
    });
}

async function resolveProductImageFields(product = {}, ...sources) {
    const imageCandidates = collectOrderImageCandidates(...sources, product);
    const parsedProductImages = parseImages(product.images);
    const fallbackList = parsedProductImages.length ? parsedProductImages : parseImages(imageCandidates);
    const images = await resolveCloudImageList(imageCandidates, fallbackList);
    const image = await resolveCloudImageUrl(imageCandidates, images);
    return {
        ...product,
        images,
        image,
        image_candidates: imageCandidates,
        image_candidate_index: imageCandidates.length ? 0 : -1
    };
}

async function resolveOrderImageFields(order = {}) {
    const firstItem = Array.isArray(order.items) ? (order.items[0] || {}) : {};
    const nextOrder = { ...order };
    if (nextOrder.product) {
        nextOrder.product = await resolveProductImageFields(nextOrder.product, firstItem, order);
    }
    if (Array.isArray(nextOrder.items) && nextOrder.items.length > 0) {
        nextOrder.items = await Promise.all(nextOrder.items.map(async (item) => {
            const product = item.product && typeof item.product === 'object' ? item.product : null;
            if (!product) return item;
            return {
                ...item,
                product: await resolveProductImageFields(product, item)
            };
        }));
    }
    return nextOrder;
}

async function resolveNextProductImage(product = {}) {
    const candidates = Array.isArray(product.image_candidates) ? product.image_candidates : collectOrderImageCandidates(product);
    const rawIndex = Number(product.image_candidate_index);
    const currentIndex = Number.isFinite(rawIndex) ? Math.max(0, rawIndex) : 0;
    let nextIndex = currentIndex;
    while (nextIndex < candidates.length) {
        const nextImage = await resolveCloudImageUrl(candidates[nextIndex], '', { forceRefresh: nextIndex === currentIndex });
        if (nextImage && nextImage !== product.image) {
            return {
                image: nextImage,
                image_candidate_index: nextIndex,
                image_candidates: candidates
            };
        }
        nextIndex += 1;
    }
    return {
        image: '',
        images: [],
        image_candidate_index: candidates.length,
        image_candidates: candidates
    };
}

module.exports = {
    collectOrderImageCandidates,
    resolveProductImageFields,
    resolveOrderImageFields,
    resolveNextProductImage
};
