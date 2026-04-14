'use strict';

function createFinanceFirewall(deps = {}) {
    const {
        dataStore,
        getCollection,
        saveCollection,
        nextId,
        nowIso,
        pickString
    } = deps;

    async function appendCollectionLogEntry(collectionName, entry) {
        const payload = {
            ...entry,
            created_at: pickString(entry?.created_at || nowIso())
        };
        const db = dataStore && dataStore._internals && dataStore._internals.db;
        if (db) {
            await db.collection(collectionName).add({ data: payload });
            return true;
        }
        const rows = getCollection(collectionName);
        rows.push({
            id: nextId(rows),
            ...payload
        });
        saveCollection(collectionName, rows);
        return true;
    }

    async function appendWalletLogEntry(entry) {
        return appendCollectionLogEntry('wallet_logs', entry);
    }

    async function appendGoodsFundLogEntry(entry) {
        return appendCollectionLogEntry('goods_fund_logs', entry);
    }

    async function appendPointLogEntry(entry) {
        return appendCollectionLogEntry('point_logs', entry);
    }

    function requireManualAdjustmentReason(rawReason, label = '原因') {
        const reason = pickString(rawReason).trim();
        if (!reason) {
            return { ok: false, message: `请输入${label}` };
        }
        if (reason.length < 2) {
            return { ok: false, message: `${label}至少 2 个字符` };
        }
        return { ok: true, reason };
    }

    return {
        appendWalletLogEntry,
        appendGoodsFundLogEntry,
        appendPointLogEntry,
        requireManualAdjustmentReason
    };
}

module.exports = {
    createFinanceFirewall
};
