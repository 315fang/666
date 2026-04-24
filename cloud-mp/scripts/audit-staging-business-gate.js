'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { getAuditArtifactPaths } = require('./lib/audit-output');

const cloudRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(cloudRoot, '..');
const { outputDir: docsDir, jsonPath, mdPath } = getAuditArtifactPaths(cloudRoot, 'STAGING_BUSINESS_GATE_AUDIT');
const mcporterConfigPath = path.join(workspaceRoot, 'config', 'mcporter.json');
const mcporterCliPath = process.env.MCPORTER_CLI_PATH || 'D:/nodejs/node_global/node_modules/mcporter/dist/cli.js';

const allowLive = process.argv.includes('--allow-live');
const declaredEnv = String(process.env.BUSINESS_SMOKE_ENV || '').trim().toLowerCase();
if (!allowLive && declaredEnv !== 'staging') {
    console.error('请先设置 BUSINESS_SMOKE_ENV=staging；如确需对非 staging 环境运行，请显式追加 --allow-live');
    process.exit(1);
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
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${selector} 执行失败`);
    return JSON.parse((result.stdout || '').trim() || '{}');
}

function readCollectionPage(collectionName, limit = 200, offset = 0) {
    const response = callMcporter('cloudbase.readNoSqlDatabaseContent', {
        collectionName,
        limit,
        offset
    });
    return {
        total: Number(response?.total || response?.pager?.Total || 0),
        list: Array.isArray(response?.data) ? response.data : []
    };
}

function readAllDocuments(collectionName, batchSize = 200, maxTotal = 2000) {
    const first = readCollectionPage(collectionName, batchSize, 0);
    const total = Math.min(first.total, maxTotal);
    const list = [...first.list];
    for (let offset = batchSize; offset < total; offset += batchSize) {
        const page = readCollectionPage(collectionName, batchSize, offset);
        list.push(...page.list);
    }
    return list;
}

function pickString(value, fallback = '') {
    if (value == null) return fallback;
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

function isPaidLikeOrder(order = {}) {
    return ['paid', 'pending_group', 'pickup_pending', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed'].includes(pickString(order.status));
}

function isCompletedRefund(refund = {}) {
    return pickString(refund.status) === 'completed';
}

function getOrderType(order = {}) {
    if (pickString(order.type) === 'bundle' || order.bundle_id || order.bundle_meta) return 'bundle';
    if (pickString(order.type) === 'group' || order.group_no || order.group_activity_id) return 'group';
    if (pickString(order.type) === 'slash' || order.slash_no) return 'slash';
    return pickString(order.type || order.order_type || 'normal');
}

function buildGoodsFundLogIndex(logs = []) {
    const index = {};
    logs.forEach((row) => {
        const keys = [pickString(row.order_id), pickString(row.order_no)].filter(Boolean);
        keys.forEach((key) => {
            if (!index[key]) {
                index[key] = { spend: 0, refund: 0, rows: [] };
            }
            const type = pickString(row.type).toLowerCase();
            if (type === 'spend') index[key].spend += 1;
            if (type === 'refund') index[key].refund += 1;
            index[key].rows.push(row);
        });
    });
    return index;
}

function buildCommissionIndex(rows = []) {
    const map = {};
    rows.forEach((row) => {
        const openid = pickString(row.openid);
        if (!openid) return;
        if (!map[openid]) {
            map[openid] = { settled: 0 };
        }
        if (['settled', 'completed'].includes(pickString(row.status))) {
            map[openid].settled += roundMoney(row.amount);
        }
    });
    return map;
}

function buildWalletAccountIndex(rows = []) {
    const map = {};
    rows.forEach((row) => {
        const openid = pickString(row.openid);
        if (openid) map[openid] = row;
    });
    return map;
}

function pushIssue(result, message) {
    result.ok = false;
    result.issues.push(message);
}

function buildChainResult(name, count) {
    return { name, count, ok: count > 0, issues: count > 0 ? [] : ['样本数为 0，无法作为 staging 验收凭证'] };
}

function main() {
    const orders = readAllDocuments('orders');
    const refunds = readAllDocuments('refunds');
    const stationSkuStocks = readAllDocuments('station_sku_stocks');
    const stationStockLogs = readAllDocuments('station_stock_logs');
    const commissions = readAllDocuments('commissions');
    const withdrawals = readAllDocuments('withdrawals');
    const walletAccounts = readAllDocuments('wallet_accounts');
    const goodsFundLogs = readAllDocuments('goods_fund_logs');
    const users = readAllDocuments('users');

    const goodsFundLogIndex = buildGoodsFundLogIndex(goodsFundLogs);
    const commissionIndex = buildCommissionIndex(commissions);
    const walletAccountIndex = buildWalletAccountIndex(walletAccounts);

    const expressPaidOrders = orders.filter((row) => isPaidLikeOrder(row) && pickString(row.delivery_type || 'express') === 'express');
    const pickupOrders = orders.filter((row) => pickString(row.pickup_stock_reservation_mode) === 'station');
    const groupOrders = orders.filter((row) => getOrderType(row) === 'group');
    const slashOrders = orders.filter((row) => getOrderType(row) === 'slash');
    const bundleOrders = orders.filter((row) => getOrderType(row) === 'bundle');
    const goodsFundPaidOrders = orders.filter((row) => pickString(row.payment_method) === 'goods_fund');
    const goodsFundRefunds = refunds.filter((row) => isCompletedRefund(row) && pickString(row.payment_method) === 'goods_fund');

    const results = [
        buildChainResult('express_paid_orders', expressPaidOrders.length),
        buildChainResult('pickup_stock_chain', pickupOrders.length),
        buildChainResult('group_orders', groupOrders.length),
        buildChainResult('slash_orders', slashOrders.length),
        buildChainResult('bundle_orders', bundleOrders.length),
        buildChainResult('goods_fund_paid_orders', goodsFundPaidOrders.length),
        buildChainResult('goods_fund_refunds', goodsFundRefunds.length),
        buildChainResult('commission_and_withdrawals', commissions.length + withdrawals.length)
    ];

    pickupOrders.forEach((order) => {
        const rowKey = pickString(order.order_no || order._id || order.id);
        const pickupResult = results.find((item) => item.name === 'pickup_stock_chain');
        const status = pickString(order.pickup_stock_reservation_status);
        if (!status) {
            pushIssue(pickupResult, `${rowKey}: 缺少 pickup_stock_reservation_status`);
        }
        if (pickString(order.pickup_stock_consumed_at) && status !== 'consumed') {
            pushIssue(pickupResult, `${rowKey}: 已核销但 reservation_status 不是 consumed`);
        }
    });

    goodsFundPaidOrders.forEach((order) => {
        const orderKey = pickString(order._id || order.id);
        const lookup = goodsFundLogIndex[orderKey] || goodsFundLogIndex[pickString(order.order_no)];
        const target = results.find((item) => item.name === 'goods_fund_paid_orders');
        if (!lookup || lookup.spend <= 0) {
            pushIssue(target, `${pickString(order.order_no || orderKey)}: 缺少 goods_fund_logs spend 流水`);
        }
    });

    goodsFundRefunds.forEach((refund) => {
        const orderKey = pickString(refund.order_id);
        const lookup = goodsFundLogIndex[orderKey] || goodsFundLogIndex[pickString(refund.order_no)];
        const target = results.find((item) => item.name === 'goods_fund_refunds');
        if (!lookup || lookup.refund <= 0) {
            pushIssue(target, `${pickString(refund.refund_no || refund._id || refund.id)}: 缺少 goods_fund_logs refund 流水`);
        }
    });

    groupOrders.forEach((order) => {
        const target = results.find((item) => item.name === 'group_orders');
        if (!pickString(order.group_no || order.group_activity_id)) {
            pushIssue(target, `${pickString(order.order_no || order._id || order.id)}: 拼团订单缺少 group_no/group_activity_id`);
        }
    });

    slashOrders.forEach((order) => {
        const target = results.find((item) => item.name === 'slash_orders');
        if (!pickString(order.slash_no)) {
            pushIssue(target, `${pickString(order.order_no || order._id || order.id)}: 砍价订单缺少 slash_no`);
        }
    });

    bundleOrders.forEach((order) => {
        const target = results.find((item) => item.name === 'bundle_orders');
        if (!pickString(order.bundle_id) && !order.bundle_meta) {
            pushIssue(target, `${pickString(order.order_no || order._id || order.id)}: 组合订单缺少 bundle_id/bundle_meta`);
        }
    });

    const commissionResult = results.find((item) => item.name === 'commission_and_withdrawals');
    users
        .filter((user) => {
            return roundMoney(user.commission_balance) > 0
                || roundMoney(user.total_withdrawn) > 0
                || roundMoney(user.agent_wallet_balance ?? user.wallet_balance) > 0;
        })
        .forEach((user) => {
            const openid = pickString(user.openid);
            const storedCommission = roundMoney(user.commission_balance ?? user.balance);
            const derivedCommission = Math.max(0, roundMoney((commissionIndex[openid]?.settled || 0) - roundMoney(user.total_withdrawn)));
            if (Math.abs(storedCommission - derivedCommission) > 0.01) {
                pushIssue(commissionResult, `${openid}: commission_balance=${storedCommission} 与 settled-withdrawn=${derivedCommission} 不一致`);
            }
            const walletAccount = walletAccountIndex[openid];
            const storedGoodsFund = roundMoney(user.agent_wallet_balance ?? user.wallet_balance);
            const accountBalance = roundMoney(walletAccount?.balance);
            if (!walletAccount) {
                pushIssue(commissionResult, `${openid}: 缺少 wallet_accounts 记录`);
                return;
            }
            if (Math.abs(storedGoodsFund - accountBalance) > 0.01) {
                pushIssue(commissionResult, `${openid}: goods_fund_balance=${storedGoodsFund} 与 wallet_accounts.balance=${accountBalance} 不一致`);
            }
        });

    const anomalies = results
        .flatMap((result) => result.issues.map((issue) => ({ chain: result.name, issue })));

    const report = {
        generatedAt: new Date().toISOString(),
        declaredEnv: declaredEnv || '(unset)',
        allowLive,
        ok: results.every((item) => item.ok),
        collectionCounts: {
            orders: orders.length,
            refunds: refunds.length,
            station_sku_stocks: stationSkuStocks.length,
            station_stock_logs: stationStockLogs.length,
            commissions: commissions.length,
            withdrawals: withdrawals.length,
            wallet_accounts: walletAccounts.length,
            goods_fund_logs: goodsFundLogs.length,
            users: users.length
        },
        results,
        anomalies
    };

    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    const lines = [
        '# Staging Business Gate Audit',
        '',
        `生成时间：${report.generatedAt}`,
        `声明环境：${report.declaredEnv}`,
        `允许非 staging：${report.allowLive ? '是' : '否'}`,
        '',
        '## 集合数量',
        '',
        '| 集合 | 数量 |',
        '| --- | ---: |',
        ...Object.entries(report.collectionCounts).map(([key, value]) => `| ${key} | ${value} |`),
        '',
        '## 链路检查',
        '',
        '| 链路 | 结果 | 样本数 | 问题 |',
        '| --- | --- | ---: | --- |',
        ...results.map((item) => `| ${item.name} | ${item.ok ? '通过' : '失败'} | ${item.count} | ${(item.issues || []).join('；') || '-'} |`),
        '',
        '## 异常清单',
        ''
    ];
    if (anomalies.length) {
        anomalies.forEach((item) => {
            lines.push(`- [${item.chain}] ${item.issue}`);
        });
    } else {
        lines.push('- 无异常');
    }
    lines.push('');
    fs.writeFileSync(mdPath, `${lines.join('\n')}\n`);
    console.log(JSON.stringify({ ok: report.ok, jsonPath, mdPath, results, anomalies: anomalies.length }, null, 2));
    if (!report.ok) process.exit(1);
}

main();
