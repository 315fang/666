'use strict';

const db = require('wx-server-sdk').database();
const { getAllRecords } = require('./shared/utils');

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function roundMoney(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
}

function emptyPiggyBankSummary() {
    return {
        locked_amount: 0,
        unlocked_amount: 0,
        reversed_amount: 0
    };
}

function hasPiggyBankFields(user = {}) {
    return [
        'piggy_bank_locked_amount',
        'piggy_bank_unlocked_amount',
        'piggy_bank_reversed_amount'
    ].some((key) => Object.prototype.hasOwnProperty.call(user, key));
}

function summarizePiggyBankRows(rows = []) {
    const summary = rows.reduce((acc, row) => {
        const amount = toNumber(row.incremental_amount, 0);
        const status = String(row.status || 'locked').trim().toLowerCase();
        if (status === 'locked') acc.locked_amount += amount;
        if (status === 'unlocked') acc.unlocked_amount += amount;
        if (status === 'reversed' || status === 'clawed_back') acc.reversed_amount += amount;
        return acc;
    }, {
        locked_amount: 0,
        unlocked_amount: 0,
        reversed_amount: 0
    });

    return {
        locked_amount: roundMoney(summary.locked_amount),
        unlocked_amount: roundMoney(summary.unlocked_amount),
        reversed_amount: roundMoney(summary.reversed_amount)
    };
}

async function loadUserPiggyBankSummary(openid) {
    if (!openid) return null;
    const res = await db.collection('users')
        .where({ openid })
        .limit(1)
        .get();
    const user = res.data && res.data[0] ? res.data[0] : null;
    if (!user || !hasPiggyBankFields(user)) return null;
    return {
        locked_amount: roundMoney(user.piggy_bank_locked_amount),
        unlocked_amount: roundMoney(user.piggy_bank_unlocked_amount),
        reversed_amount: roundMoney(user.piggy_bank_reversed_amount)
    };
}

async function getUpgradePiggyBankAsset(openid) {
    if (!openid) return emptyPiggyBankSummary();
    const userSummary = await loadUserPiggyBankSummary(openid);
    if (userSummary) return userSummary;

    const rows = await getAllRecords(db, 'upgrade_piggy_bank_logs', { openid });
    return summarizePiggyBankRows(rows);
}

module.exports = {
    getUpgradePiggyBankAsset,
    summarizePiggyBankRows
};
