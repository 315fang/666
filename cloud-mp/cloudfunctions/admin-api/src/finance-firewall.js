'use strict';

/**
 * ⚠️ 命名警告（2026-05-03 审计后追加）
 *
 * 该模块名叫 "finance-firewall"，但实际**不是任何意义上的资金防火墙**：
 *   - 不拦截写入
 *   - 不校验余额不变量
 *   - 不做权限/角色检查
 *   - 不做幂等去重
 *
 * 它当前只是**资金类日志的写入助手 + 一个手动调账原因校验**：
 *   - appendWalletLogEntry / appendGoodsFundLogEntry / appendPointLogEntry
 *   - requireManualAdjustmentReason
 *
 * 调用方使用本模块时**不能**因为它叫 firewall 就假设资金安全已被它兜底。
 * 真正的资金安全约束（金额服务端重算、CAS、事务、幂等 key）必须在调用层显式实现。
 *
 * P1 待办（与 docs/production/FINANCE_FIREWALL_STANDARD.md 一并收口）：
 *   选择一：改名为 finance-log，并同步刷新所有 docs 与脚本别名；
 *   选择二：保留 firewall 名字但把"真闸"语义补齐（余额一致性断言 + 必填 audit）。
 *
 * 详见：cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md §3 P0-3
 */
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
        const changeType = pickString(
            entry?.change_type
            || entry?.changeType
            || entry?.type
        );
        return appendCollectionLogEntry('wallet_logs', {
            ...entry,
            // 统一以 change_type 作为钱包流水真相字段；保留 type 仅做兼容读取。
            change_type: changeType,
            type: pickString(entry?.type || changeType)
        });
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
