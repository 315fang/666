'use strict';

const GOODS_FUND_TRANSFER_STATUS = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected'
};

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function pickString(value, fallback = '') {
    if (!hasValue(value)) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function roundMoney(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
}

function normalizeGoodsFundTransferStatus(status = '') {
    const raw = pickString(status).toLowerCase();
    if (Object.values(GOODS_FUND_TRANSFER_STATUS).includes(raw)) return raw;
    return GOODS_FUND_TRANSFER_STATUS.PENDING;
}

function buildGoodsFundTransferStatusText(status = '') {
    return ({
        [GOODS_FUND_TRANSFER_STATUS.PENDING]: '待审核',
        [GOODS_FUND_TRANSFER_STATUS.APPROVED]: '已通过',
        [GOODS_FUND_TRANSFER_STATUS.REJECTED]: '已拒绝'
    }[normalizeGoodsFundTransferStatus(status)] || '待审核');
}

function normalizeGoodsFundTransferAmount(amount) {
    return roundMoney(Math.max(0, toNumber(amount, 0)));
}

function ensureGoodsFundTransferAmount(amount) {
    const normalized = normalizeGoodsFundTransferAmount(amount);
    if (normalized <= 0) {
        return {
            ok: false,
            amount: normalized,
            message: '划拨金额必须大于 0 元'
        };
    }
    return {
        ok: true,
        amount: normalized
    };
}

function buildGoodsFundTransferNo(prefix = 'GFT') {
    return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function buildRelationSourceText(source = '') {
    const normalized = pickString(source).toLowerCase();
    if (normalized === 'directed_b1') return '定向邀约';
    if (normalized === 'directed_invite') return '定向邀约';
    if (normalized === 'manual') return '后台指定';
    return '普通邀请';
}

module.exports = {
    GOODS_FUND_TRANSFER_STATUS,
    pickString,
    toNumber,
    roundMoney,
    normalizeGoodsFundTransferStatus,
    buildGoodsFundTransferStatusText,
    normalizeGoodsFundTransferAmount,
    ensureGoodsFundTransferAmount,
    buildGoodsFundTransferNo,
    buildRelationSourceText
};
