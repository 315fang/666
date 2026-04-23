/**
 * 足迹 / 收藏 — 仅本机 wx.storage，不同步服务端（换机或清缓存会丢失）
 * 无需改动，与原版完全一致
 */
const { normalizeAssetUrl, isTemporarySignedAssetUrl } = require('./dataFormatter');

const STORAGE_FOOTPRINTS = 'local_product_footprints_v1';
const STORAGE_FAVORITES  = 'local_product_favorites_v1';
const MAX_FOOTPRINTS = 200;
const MAX_FAVORITES  = 300;

function readList(key) {
    try {
        const raw = wx.getStorageSync(key);
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') {
            const p = JSON.parse(raw);
            return Array.isArray(p) ? p : [];
        }
    } catch (e) { console.warn('[localUserContent] readList', key, e); }
    return [];
}
function writeList(key, list) {
    try { wx.setStorageSync(key, list); }
    catch (e) { console.warn('[localUserContent] writeList', key, e); }
}

function pickString(value) {
    return String(value || '').trim();
}

function isCloudFileId(value) {
    return /^cloud:\/\//i.test(pickString(value));
}

function pickStoredImageRef(item = {}) {
    const candidates = [
        item.image_ref,
        item.file_id,
        item.cover_image,
        item.coverImage,
        item.image_url,
        item.image
    ].map((value) => normalizeAssetUrl(value)).filter(Boolean);

    const cloudRef = candidates.find((value) => isCloudFileId(value));
    if (cloudRef) return cloudRef;

    const stableRef = candidates.find((value) => !isTemporarySignedAssetUrl(value));
    return stableRef || pickString(item.image_ref || item.file_id || item.cover_image || item.image_url || item.image);
}

function buildStoredEntry(item = {}, timeKey) {
    return {
        id: Number(item.id),
        name: String(item.name || '').slice(0, 200),
        image: pickStoredImageRef(item),
        image_ref: pickStoredImageRef(item),
        price: String(item.price || ''),
        [timeKey]: Date.now()
    };
}

function recordFootprint(item) {
    const id = Number(item.id);
    if (!Number.isFinite(id) || id <= 0) return;
    let list = readList(STORAGE_FOOTPRINTS);
    list = list.filter(x => Number(x.id) !== id);
    list.unshift(buildStoredEntry(item, 'viewed_at'));
    if (list.length > MAX_FOOTPRINTS) list = list.slice(0, MAX_FOOTPRINTS);
    writeList(STORAGE_FOOTPRINTS, list);
}
function listFootprints() { return readList(STORAGE_FOOTPRINTS); }
function replaceFootprints(list) { writeList(STORAGE_FOOTPRINTS, Array.isArray(list) ? list : []); }
function removeFootprint(id) {
    const n = Number(id);
    writeList(STORAGE_FOOTPRINTS, readList(STORAGE_FOOTPRINTS).filter(x => Number(x.id) !== n));
}
function clearFootprints() { writeList(STORAGE_FOOTPRINTS, []); }
function isFavorite(id) {
    const n = Number(id);
    return readList(STORAGE_FAVORITES).some(x => Number(x.id) === n);
}
function toggleFavorite(item) {
    const id = Number(item.id);
    if (!Number.isFinite(id) || id <= 0) return false;
    let list = readList(STORAGE_FAVORITES);
    const idx = list.findIndex(x => Number(x.id) === id);
    if (idx >= 0) { list.splice(idx, 1); writeList(STORAGE_FAVORITES, list); return false; }
    list.unshift(buildStoredEntry(item, 'saved_at'));
    if (list.length > MAX_FAVORITES) list = list.slice(0, MAX_FAVORITES);
    writeList(STORAGE_FAVORITES, list);
    return true;
}
function listFavorites() { return readList(STORAGE_FAVORITES); }
function replaceFavorites(list) { writeList(STORAGE_FAVORITES, Array.isArray(list) ? list : []); }
function removeFavorite(id) {
    const n = Number(id);
    writeList(STORAGE_FAVORITES, readList(STORAGE_FAVORITES).filter(x => Number(x.id) !== n));
}
function clearFavorites() { writeList(STORAGE_FAVORITES, []); }

module.exports = { recordFootprint, listFootprints, replaceFootprints, removeFootprint, clearFootprints, isFavorite, toggleFavorite, listFavorites, replaceFavorites, removeFavorite, clearFavorites };
