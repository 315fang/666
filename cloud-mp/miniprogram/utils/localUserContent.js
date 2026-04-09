/**
 * 足迹 / 收藏 — 仅本机 wx.storage，不同步服务端（换机或清缓存会丢失）
 * 无需改动，与原版完全一致
 */
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
function recordFootprint(item) {
    const id = Number(item.id);
    if (!Number.isFinite(id) || id <= 0) return;
    let list = readList(STORAGE_FOOTPRINTS);
    list = list.filter(x => Number(x.id) !== id);
    list.unshift({ id, name: String(item.name || '').slice(0, 200), image: String(item.image || ''), price: String(item.price || ''), viewed_at: Date.now() });
    if (list.length > MAX_FOOTPRINTS) list = list.slice(0, MAX_FOOTPRINTS);
    writeList(STORAGE_FOOTPRINTS, list);
}
function listFootprints() { return readList(STORAGE_FOOTPRINTS); }
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
    list.unshift({ id, name: String(item.name || '').slice(0, 200), image: String(item.image || ''), price: String(item.price || ''), saved_at: Date.now() });
    if (list.length > MAX_FAVORITES) list = list.slice(0, MAX_FAVORITES);
    writeList(STORAGE_FAVORITES, list);
    return true;
}
function listFavorites() { return readList(STORAGE_FAVORITES); }
function removeFavorite(id) {
    const n = Number(id);
    writeList(STORAGE_FAVORITES, readList(STORAGE_FAVORITES).filter(x => Number(x.id) !== n));
}
function clearFavorites() { writeList(STORAGE_FAVORITES, []); }

module.exports = { recordFootprint, listFootprints, removeFootprint, clearFootprints, isFavorite, toggleFavorite, listFavorites, removeFavorite, clearFavorites };
