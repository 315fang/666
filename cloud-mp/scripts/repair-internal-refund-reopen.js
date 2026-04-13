'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const docsRoot = path.join(projectRoot, 'docs');
const mcporterConfigPath = path.join(workspaceRoot, 'config', 'mcporter.json');
const mcporterCliPath = process.env.MCPORTER_CLI_PATH || 'D:/nodejs/node_global/node_modules/mcporter/dist/cli.js';
const outputJsonPath = path.join(docsRoot, 'REFUND_INTERNAL_REOPEN_REPAIR.json');
const outputMarkdownPath = path.join(docsRoot, 'REFUND_INTERNAL_REOPEN_REPAIR.md');

const TARGET_REFUND_NOS = [
    'REF1775897852197731',
    'SYSRF177510363794967505',
    'SYSRF177512683468041091',
    'REF1775993281617789',
    'REF1776058290289539',
    'REF1776083909694275',
    'REF1776089368463924'
];

const shouldApply = process.argv.includes('--apply');
const allowGoodsFundDebt = process.argv.includes('--allow-goods-fund-debt');
const pageLimit = 500;

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeText(filePath, value) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, value, 'utf8');
}

function nowIso() {
    return new Date().toISOString();
}

function pickString(value, fallback = '') {
    return value == null ? fallback : String(value).trim();
}

function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function normalizePaymentMethodCode(rawValue) {
    const raw = pickString(rawValue).toLowerCase();
    if (['wechat', 'wx', 'wxpay', 'jsapi', 'miniapp', 'wechatpay', 'wechat_pay', 'weixin'].includes(raw)) return 'wechat';
    if (['goods_fund', 'goods-fund', 'goodsfund'].includes(raw)) return 'goods_fund';
    if (['wallet', 'wallet_balance', 'account_balance', 'balance', 'credit', 'debt'].includes(raw)) return 'wallet';
    return raw || 'unknown';
}

function deriveResumeOrderStatus(order) {
    if (!order || typeof order !== 'object') return 'paid';
    if (pickString(order.prev_status)) return pickString(order.prev_status);
    if (order.confirmed_at || order.auto_confirmed_at) return 'completed';
    if (order.shipped_at) return 'shipped';
    if (order.paid_at || order.pay_time) return 'paid';
    return 'pending_payment';
}

function callMcporter(selector, payload) {
    const result = spawnSync(process.execPath, [
        mcporterCliPath,
        '--config',
        mcporterConfigPath,
        'call',
        selector,
        '--args',
        JSON.stringify(payload),
        '--output',
        'json'
    ], {
        cwd: workspaceRoot,
        encoding: 'utf8'
    });

    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || `${selector} 执行失败`);
    }

    const stdout = (result.stdout || '').trim();
    if (!stdout) return null;
    try {
        return JSON.parse(stdout);
    } catch (_) {
        return { raw: stdout };
    }
}

function readAllDocuments(collectionName) {
    const rows = [];
    let offset = 0;
    while (true) {
        const response = callMcporter('cloudbase.readNoSqlDatabaseContent', {
            collectionName,
            limit: pageLimit,
            offset
        });
        const batch = response && Array.isArray(response.data) ? response.data : [];
        rows.push(...batch);
        if (batch.length < pageLimit) break;
        offset += batch.length;
    }
    return rows;
}

function updateDocument(collectionName, docId, patch) {
    return callMcporter('cloudbase.writeNoSqlDatabaseContent', {
        action: 'update',
        collectionName,
        query: { _id: docId },
        update: { $set: patch },
        isMulti: false,
        upsert: false
    });
}

function collectionExists(collectionName) {
    const response = callMcporter('cloudbase.readNoSqlDatabaseStructure', {
        action: 'checkCollection',
        collectionName
    });
    return !!(response && response.exists);
}

function ensureCollectionExists(collectionName) {
    if (collectionExists(collectionName)) return true;
    callMcporter('cloudbase.writeNoSqlDatabaseStructure', {
        action: 'createCollection',
        collectionName
    });
    return true;
}

function insertDocuments(collectionName, documents) {
    if (!documents.length) return null;
    ensureCollectionExists(collectionName);
    return callMcporter('cloudbase.writeNoSqlDatabaseContent', {
        action: 'insert',
        collectionName,
        documents
    });
}

function buildLookup(rows, keys) {
    const map = new Map();
    rows.forEach((row) => {
        keys(row)
            .map((value) => pickString(value))
            .filter(Boolean)
            .forEach((key) => map.set(key, row));
    });
    return map;
}

function getUserLabel(user) {
    return pickString(
        user?.nickname
        || user?.nickName
        || user?.name
        || user?.real_name
        || user?.member_no
        || user?.my_invite_code
        || user?.invite_code
        || user?.openid
        || '-'
    );
}

function buildWalletReversalPatch(user, amount) {
    const currentBalance = toNumber(user.commission_balance ?? user.balance, 0);
    const currentTotalEarned = toNumber(user.total_earned, 0);
    if (currentBalance < amount) {
        return {
            ok: false,
            reason: `当前账户余额不足，余额 ${currentBalance}，需回退 ${amount}`
        };
    }
    return {
        ok: true,
        patch: {
            balance: currentBalance - amount,
            commission_balance: currentBalance - amount,
            total_earned: Math.max(0, currentTotalEarned - amount),
            updated_at: nowIso()
        }
    };
}

function buildGoodsFundReversalPatch(user, amount) {
    const currentGoodsFund = toNumber(user.agent_wallet_balance ?? user.wallet_balance, 0);
    if (currentGoodsFund < amount) {
        return {
            ok: false,
            reason: `当前货款余额不足，余额 ${currentGoodsFund}，需回退 ${amount}`
        };
    }
    return {
        ok: true,
        patch: {
            agent_wallet_balance: currentGoodsFund - amount,
            updated_at: nowIso()
        }
    };
}

function createWalletLog(refund, order, user, amount) {
    return {
        openid: pickString(user.openid),
        type: 'refund_reopen_reversal',
        amount: -amount,
        refund_id: pickString(refund._id || refund.id),
        refund_no: pickString(refund.refund_no),
        order_id: pickString(order._id || order.id || refund.order_id),
        order_no: pickString(order.order_no || refund.order_no),
        description: `退款回退冲正 ${pickString(order.order_no || refund.order_no)}`,
        created_at: nowIso()
    };
}

function createGoodsFundLog(refund, order, user, amount) {
    return {
        openid: pickString(user.openid),
        type: 'refund_reopen_reversal',
        amount: -amount,
        refund_id: pickString(refund._id || refund.id),
        refund_no: pickString(refund.refund_no),
        order_id: pickString(order._id || order.id || refund.order_id),
        order_no: pickString(order.order_no || refund.order_no),
        remark: `退款回退冲正 ${pickString(order.order_no || refund.order_no)}`,
        created_at: nowIso()
    };
}

function createGoodsFundDebtLog(refund, order, user, deductedAmount, debtAdded) {
    return {
        openid: pickString(user.openid),
        type: 'refund_reopen_reversal',
        amount: -deductedAmount,
        debt_added: debtAdded,
        refund_id: pickString(refund._id || refund.id),
        refund_no: pickString(refund.refund_no),
        order_id: pickString(order._id || order.id || refund.order_id),
        order_no: pickString(order.order_no || refund.order_no),
        remark: `退款回退冲正 ${pickString(order.order_no || refund.order_no)}，实扣货款 ${deductedAmount}，新增欠款 ${debtAdded}`,
        created_at: nowIso()
    };
}

function createAuditLog(refund, order, user, detail) {
    return {
        admin_id: null,
        admin_name: 'refund-repair-script',
        action: 'refund.reopen_internal',
        target: 'refunds',
        detail: {
            refund_no: pickString(refund.refund_no),
            order_no: pickString(order.order_no || refund.order_no),
            user_openid: pickString(user.openid),
            ...detail
        },
        status: 'success',
        created_at: nowIso()
    };
}

function renderMarkdown(report) {
    const lines = [
        '# Internal Refund Reopen Repair',
        '',
        `生成时间：${report.generated_at}`,
        `执行模式：${report.apply ? 'apply' : 'dry-run'}`,
        '',
        '| 退款单 | 订单号 | 用户 | 通道 | 金额 | 结果 | 说明 |',
        '| --- | --- | --- | --- | ---: | --- | --- |'
    ];

    report.results.forEach((item) => {
        lines.push(`| ${item.refund_no} | ${item.order_no} | ${item.user_label} | ${item.payment_method} | ${item.amount} | ${item.result} | ${item.reason || '-'} |`);
    });

    lines.push('');
    lines.push('## 汇总');
    lines.push('');
    lines.push(`- 目标退款数：${report.summary.target_count}`);
    lines.push(`- 可回退：${report.summary.reopenable_count}`);
    lines.push(`- 已执行回退：${report.summary.applied_count}`);
    lines.push(`- 跳过：${report.summary.skipped_count}`);
    return `${lines.join('\n')}\n`;
}

function main() {
    const refunds = readAllDocuments('refunds');
    const orders = readAllDocuments('orders');
    const users = readAllDocuments('users');

    const refundMap = new Map(refunds.map((row) => [pickString(row.refund_no), row]));
    const orderMap = buildLookup(orders, (row) => [row._id, row.id, row._legacy_id, row.order_no]);
    const userMap = buildLookup(users, (row) => [row._id, row.id, row._legacy_id, row.openid, row.member_no, row.my_invite_code, row.invite_code]);
    const workingUsers = new Map(users.map((row) => [pickString(row._id || row.id || row.openid), { ...row }]));

    const results = [];
    const applyOperations = [];

    TARGET_REFUND_NOS.forEach((refundNo) => {
        const refund = refundMap.get(refundNo);
        if (!refund) {
            results.push({ refund_no: refundNo, order_no: '-', user_label: '-', payment_method: 'unknown', amount: 0, result: 'skipped', reason: '退款记录不存在' });
            return;
        }

        const order = orderMap.get(pickString(refund.order_id)) || orderMap.get(pickString(refund.order_no));
        if (!order) {
            results.push({ refund_no: refundNo, order_no: pickString(refund.order_no || refund.order_id || '-'), user_label: '-', payment_method: 'unknown', amount: toNumber(refund.amount, 0), result: 'skipped', reason: '关联订单不存在' });
            return;
        }

        const user = userMap.get(pickString(refund.openid))
            || userMap.get(pickString(refund.user_id))
            || userMap.get(pickString(order.openid))
            || userMap.get(pickString(order.buyer_id));
        if (!user) {
            results.push({ refund_no: refundNo, order_no: pickString(order.order_no || '-'), user_label: '-', payment_method: 'unknown', amount: toNumber(refund.amount, 0), result: 'skipped', reason: '关联用户不存在' });
            return;
        }

        const userKey = pickString(user._id || user.id || user.openid);
        const workingUser = workingUsers.get(userKey) || { ...user };
        const paymentMethod = normalizePaymentMethodCode(refund.payment_method || order.payment_method || order.pay_type || order.pay_channel || order.payment_channel);
        const amount = toNumber(refund.amount, 0);
        const baseResult = {
            refund_no: refundNo,
            order_no: pickString(order.order_no || refund.order_no || refund.order_id || '-'),
            user_label: getUserLabel(user),
            payment_method: paymentMethod,
            amount
        };

        if (!['wallet', 'goods_fund'].includes(paymentMethod)) {
            results.push({ ...baseResult, result: 'skipped', reason: `仅支持内部退款回退，当前通道为 ${paymentMethod}` });
            return;
        }
        if (pickString(refund.status).toLowerCase() !== 'completed') {
            results.push({ ...baseResult, result: 'skipped', reason: `退款状态不是 completed，而是 ${refund.status}` });
            return;
        }
        if (pickString(order.status).toLowerCase() !== 'refunded') {
            results.push({ ...baseResult, result: 'skipped', reason: `订单状态不是 refunded，而是 ${order.status}` });
            return;
        }

        const reversal = paymentMethod === 'wallet'
            ? buildWalletReversalPatch(workingUser, amount)
            : buildGoodsFundReversalPatch(workingUser, amount);

        if (!reversal.ok) {
            if (paymentMethod === 'goods_fund' && allowGoodsFundDebt) {
                const currentGoodsFund = toNumber(workingUser.agent_wallet_balance ?? workingUser.wallet_balance, 0);
                const debtAdded = Math.max(0, roundTo2(amount - currentGoodsFund));
                const debtPatch = {
                    agent_wallet_balance: 0,
                    debt_amount: roundTo2(toNumber(workingUser.debt_amount, 0) + debtAdded),
                    debt_reason: `退款回退冲正 ${baseResult.order_no}`,
                    updated_at: nowIso()
                };
                Object.assign(workingUser, debtPatch);
                workingUsers.set(userKey, workingUser);

                const refundPatch = {
                    status: 'approved',
                    approved_at: pickString(refund.approved_at || refund.processed_at || nowIso()),
                    completed_at: null,
                    processing_at: null,
                    reopened_at: nowIso(),
                    reopened_from_status: pickString(refund.status),
                    reopen_reason: '内部退款回退，货款不足部分转欠款，重新进入待退款',
                    updated_at: nowIso()
                };
                const orderPatch = {
                    status: deriveResumeOrderStatus(order),
                    prev_status: deriveResumeOrderStatus(order),
                    refunded_at: null,
                    updated_at: nowIso()
                };
                applyOperations.push({
                    refund,
                    order,
                    user,
                    paymentMethod,
                    amount,
                    userPatch: debtPatch,
                    refundPatch,
                    orderPatch,
                    ledgerDoc: {
                        collectionName: 'goods_fund_logs',
                        document: createGoodsFundDebtLog(refund, order, user, currentGoodsFund, debtAdded)
                    },
                    auditDoc: createAuditLog(refund, order, user, {
                        payment_method: paymentMethod,
                        amount,
                        debt_added: debtAdded,
                        order_status_before: pickString(order.status),
                        refund_status_before: pickString(refund.status)
                    })
                });
                results.push({ ...baseResult, result: shouldApply ? 'applied' : 'planned', reason: `货款不足，已计划转欠款 ${debtAdded}` });
                return;
            }
            results.push({ ...baseResult, result: 'skipped', reason: reversal.reason });
            return;
        }

        Object.assign(workingUser, reversal.patch);
        workingUsers.set(userKey, workingUser);

        const refundPatch = {
            status: 'approved',
            approved_at: pickString(refund.approved_at || refund.processed_at || nowIso()),
            completed_at: null,
            processing_at: null,
            reopened_at: nowIso(),
            reopened_from_status: pickString(refund.status),
            reopen_reason: '内部退款回退，重新进入待退款',
            updated_at: nowIso()
        };
        const orderPatch = {
            status: deriveResumeOrderStatus(order),
            prev_status: deriveResumeOrderStatus(order),
            refunded_at: null,
            updated_at: nowIso()
        };

        applyOperations.push({
            refund,
            order,
            user,
            paymentMethod,
            amount,
            userPatch: reversal.patch,
            refundPatch,
            orderPatch,
            ledgerDoc: paymentMethod === 'wallet'
                ? { collectionName: 'wallet_logs', document: createWalletLog(refund, order, user, amount) }
                : { collectionName: 'goods_fund_logs', document: createGoodsFundLog(refund, order, user, amount) },
            auditDoc: createAuditLog(refund, order, user, {
                payment_method: paymentMethod,
                amount,
                order_status_before: pickString(order.status),
                refund_status_before: pickString(refund.status)
            })
        });
        results.push({ ...baseResult, result: shouldApply ? 'applied' : 'planned', reason: '可安全回退到待退款状态' });
    });

    if (shouldApply) {
        applyOperations.forEach((operation) => {
            const userDocId = pickString(operation.user._id || operation.user.id);
            const refundDocId = pickString(operation.refund._id || operation.refund.id);
            const orderDocId = pickString(operation.order._id || operation.order.id);

            if (!userDocId || !refundDocId || !orderDocId) {
                throw new Error(`缺少文档 ID，无法执行 ${operation.refund.refund_no}`);
            }

            updateDocument('users', userDocId, operation.userPatch);
            updateDocument('refunds', refundDocId, operation.refundPatch);
            updateDocument('orders', orderDocId, operation.orderPatch);
            insertDocuments(operation.ledgerDoc.collectionName, [operation.ledgerDoc.document]);
            insertDocuments('admin_audit_logs', [operation.auditDoc]);
        });
    }

    const report = {
        generated_at: nowIso(),
        apply: shouldApply,
        allow_goods_fund_debt: allowGoodsFundDebt,
        target_refund_nos: TARGET_REFUND_NOS,
        summary: {
            target_count: TARGET_REFUND_NOS.length,
            reopenable_count: applyOperations.length,
            applied_count: shouldApply ? applyOperations.length : 0,
            skipped_count: results.filter((item) => item.result === 'skipped').length
        },
        results
    };

    writeJson(outputJsonPath, report);
    writeText(outputMarkdownPath, renderMarkdown(report));
    console.log(JSON.stringify(report, null, 2));
}

function roundTo2(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

main();
