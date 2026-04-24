'use strict';

function toNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function pickString(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        return Number.isFinite(parsed.getTime()) ? parsed : null;
    }
    if (typeof value === 'object') {
        if (value.$date) return parseDate(value.$date);
        if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
        if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
        if (typeof value.toDate === 'function') return parseDate(value.toDate());
    }
    return null;
}

function normalizeSlashExpireHours(value, fallback = 24) {
    const hours = Math.floor(toNumber(value, fallback));
    return Math.max(1, Math.min(720, hours));
}

function buildSlashExpireAt(expireHours, baseTime = Date.now()) {
    const base = parseDate(baseTime) || new Date();
    return new Date(base.getTime() + normalizeSlashExpireHours(expireHours) * 3600 * 1000).toISOString();
}

function resolveSlashExpiryState(record = {}, activity = {}, nowTime = Date.now()) {
    const expireHours = normalizeSlashExpireHours(
        record.expire_hours_snapshot ?? record.expire_hours ?? activity?.expire_hours,
        24
    );
    const explicitExpireAt = parseDate(record.expire_at || record.expires_at);
    const createdAt = parseDate(record.created_at || record.started_at);
    const expireAtDate = explicitExpireAt || (createdAt
        ? new Date(createdAt.getTime() + expireHours * 3600 * 1000)
        : null);
    const now = parseDate(nowTime) || new Date();
    const expired = !!expireAtDate && expireAtDate.getTime() <= now.getTime();
    const remainSeconds = expireAtDate
        ? Math.max(0, Math.floor((expireAtDate.getTime() - now.getTime()) / 1000))
        : null;

    return {
        expireHours,
        expireAt: expireAtDate ? expireAtDate.toISOString() : '',
        remainSeconds,
        expired
    };
}

function normalizeSlashRecordStatus(record = {}, activity = {}, nowTime = Date.now()) {
    const rawStatus = pickString(record.status || 'active').toLowerCase();
    if (rawStatus === 'purchased') return 'purchased';
    if (rawStatus === 'expired') return 'expired';

    const expiry = resolveSlashExpiryState(record, activity, nowTime);
    if (expiry.expired) return 'expired';

    const originalPrice = toNumber(record.original_price ?? activity?.original_price ?? activity?.initial_price, 0);
    const currentPrice = toNumber(record.current_price, originalPrice);
    const floorPrice = toNumber(record.target_price ?? activity?.floor_price ?? activity?.target_price, 0);
    if (rawStatus === 'completed' || rawStatus === 'success') return 'success';
    if (floorPrice > 0 && currentPrice <= floorPrice) return 'success';
    return 'active';
}

function canResumeSlashRecord(record = {}, activity = {}, nowTime = Date.now()) {
    const status = normalizeSlashRecordStatus(record, activity, nowTime);
    return status === 'active' || status === 'success';
}

module.exports = {
    parseDate,
    normalizeSlashExpireHours,
    buildSlashExpireAt,
    resolveSlashExpiryState,
    normalizeSlashRecordStatus,
    canResumeSlashRecord
};
