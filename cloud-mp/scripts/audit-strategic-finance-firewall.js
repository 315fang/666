'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { getAuditArtifactPaths } = require('./lib/audit-output');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const mcporterConfigPath = path.join(workspaceRoot, 'config', 'mcporter.json');
const mcporterCliPath = process.env.MCPORTER_CLI_PATH || 'D:/nodejs/node_global/node_modules/mcporter/dist/cli.js';
const { jsonPath: outputJsonPath, mdPath: outputMarkdownPath } = getAuditArtifactPaths(projectRoot, 'STRATEGIC_FINANCE_FIREWALL_AUDIT');
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

function pickString(value, fallback = '') {
    return value == null ? fallback : String(value).trim();
}

function normalizePaymentMethodCode(rawValue) {
    const raw = pickString(rawValue).toLowerCase();
    if (['wechat', 'wx', 'wxpay', 'jsapi', 'miniapp', 'wechatpay', 'wechat_pay', 'weixin'].includes(raw)) return 'wechat';
    if (['goods_fund', 'goods-fund', 'goodsfund'].includes(raw)) return 'goods_fund';
    if (['wallet', 'wallet_balance', 'account_balance', 'balance', 'credit', 'debt'].includes(raw)) return 'wallet';
    return raw || 'unknown';
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

function buildOrderLookup(orders) {
    const map = new Map();
    orders.forEach((order) => {
        [order._id, order.id, order._legacy_id, order.order_no]
            .map((value) => pickString(value))
            .filter(Boolean)
            .forEach((key) => map.set(key, order));
    });
    return map;
}

function renderMarkdown(report) {
    const lines = [
        '# Strategic Finance Firewall Audit',
        '',
        `生成时间：${report.generated_at}`,
        '',
        '| 检查项 | 数量 |',
        '| --- | ---: |',
        `| 内部余额退款缺少流水 | ${report.summary.missing_internal_wallet_logs} |`,
        `| 内部货款退款缺少流水 | ${report.summary.missing_internal_goods_fund_logs} |`,
        `| 已忽略货款测试退款 | ${report.summary.ignored_goods_fund_test_refunds} |`,
        `| 回退修复缺少反向流水 | ${report.summary.missing_reopen_reversal_logs} |`,
        `| 管理员战略调账缺少原因 | ${report.summary.missing_adjustment_reasons} |`,
        `| 代理商欠款缺少原因 | ${report.summary.missing_debt_reasons} |`,
        `| 年终分红缺少说明 | ${report.summary.missing_dividend_remarks} |`,
        `| 退出结算缺少审批备注 | ${report.summary.missing_exit_review_remarks} |`
    ];

    const sections = [
        { title: '内部余额退款缺少流水', rows: report.findings.missingInternalWalletLogs },
        { title: '内部货款退款缺少流水', rows: report.findings.missingInternalGoodsFundLogs },
        { title: '已忽略货款测试退款', rows: report.findings.ignoredGoodsFundTestRefunds },
        { title: '回退修复缺少反向流水', rows: report.findings.missingReopenReversalLogs },
        { title: '管理员战略调账缺少原因', rows: report.findings.missingAdjustmentReasons },
        { title: '代理商欠款缺少原因', rows: report.findings.missingDebtReasons },
        { title: '年终分红缺少说明', rows: report.findings.missingDividendRemarks },
        { title: '退出结算缺少审批备注', rows: report.findings.missingExitReviewRemarks }
    ];

    sections.forEach((section) => {
        lines.push('');
        lines.push(`## ${section.title}`);
        lines.push('');
        if (!section.rows.length) {
            lines.push('- none');
            return;
        }
        section.rows.slice(0, 50).forEach((row) => {
            lines.push(`- ${row}`);
        });
    });

    return `${lines.join('\n')}\n`;
}

function main() {
    const refunds = readAllDocuments('refunds');
    const orders = readAllDocuments('orders');
    const users = readAllDocuments('users');
    const walletLogs = readAllDocuments('wallet_logs');
    const goodsFundLogs = readAllDocuments('goods_fund_logs');
    const auditLogs = readAllDocuments('admin_audit_logs');
    const dividendExecutions = readAllDocuments('dividend_executions');
    const exitApplications = readAllDocuments('agent_exit_applications');

    const orderLookup = buildOrderLookup(orders);
    const walletRefundLogNos = new Set(walletLogs.filter((row) => pickString(row.type) === 'refund').map((row) => pickString(row.refund_no)).filter(Boolean));
    const goodsFundRefundLogNos = new Set(goodsFundLogs.filter((row) => pickString(row.type) === 'refund').map((row) => pickString(row.refund_no)).filter(Boolean));
    const walletReversalLogNos = new Set(walletLogs.filter((row) => pickString(row.type) === 'refund_reopen_reversal').map((row) => pickString(row.refund_no)).filter(Boolean));
    const goodsFundReversalLogNos = new Set(goodsFundLogs.filter((row) => pickString(row.type) === 'refund_reopen_reversal').map((row) => pickString(row.refund_no)).filter(Boolean));

    const missingInternalWalletLogs = [];
    const missingInternalGoodsFundLogs = [];
    const ignoredGoodsFundTestRefunds = [];
    const missingReopenReversalLogs = [];

    refunds.forEach((refund) => {
        const refundNo = pickString(refund.refund_no);
        if (!refundNo) return;
        const order = orderLookup.get(pickString(refund.order_id)) || orderLookup.get(pickString(refund.order_no));
        const paymentMethod = normalizePaymentMethodCode(refund.payment_method || order?.payment_method || order?.pay_channel || order?.pay_type || order?.payment_channel);
        const status = pickString(refund.status).toLowerCase();
        const reopenedAt = pickString(refund.reopened_at);

        if (status === 'completed' && paymentMethod === 'wallet' && !walletRefundLogNos.has(refundNo)) {
            missingInternalWalletLogs.push(`${refundNo} / ${pickString(order?.order_no || refund.order_no || refund.order_id || '-')}`);
        }
        if (status === 'completed' && paymentMethod === 'goods_fund' && !goodsFundRefundLogNos.has(refundNo)) {
            ignoredGoodsFundTestRefunds.push(`${refundNo} / ${pickString(order?.order_no || refund.order_no || refund.order_id || '-')}`);
        }
        if (reopenedAt) {
            if (paymentMethod === 'wallet' && !walletReversalLogNos.has(refundNo)) {
                missingReopenReversalLogs.push(`${refundNo} / wallet / ${pickString(order?.order_no || refund.order_no || refund.order_id || '-')}`);
            }
            if (paymentMethod === 'goods_fund' && !goodsFundReversalLogNos.has(refundNo)) {
                ignoredGoodsFundTestRefunds.push(`${refundNo} / goods_fund reopen / ${pickString(order?.order_no || refund.order_no || refund.order_id || '-')}`);
            }
        }
    });

    const strategicAdjustActions = new Set([
        'user.balance.adjust',
        'user.goods_fund.adjust',
        'user.points.adjust',
        'user.growth.adjust',
        'user.commission.adjust'
    ]);
    const missingAdjustmentReasons = auditLogs
        .filter((row) => strategicAdjustActions.has(pickString(row.action)))
        .filter((row) => !pickString(row.detail?.reason))
        .map((row) => `${pickString(row.action)} / user=${pickString(row.detail?.user_id || '-')}`);

    const missingDebtReasons = orders
        ? users
            .filter((row) => Number(row.debt_amount || 0) > 0)
            .filter((row) => !pickString(row.debt_reason))
            .map((row) => `${pickString(row.nickname || row.nickName || row.member_no || row.openid || '-')}`)
        : [];

    const missingDividendRemarks = dividendExecutions
        .filter((row) => pickString(row.status) === 'completed')
        .filter((row) => !pickString(row.remark))
        .map((row) => `${pickString(row.year || '-')}`);

    const missingExitReviewRemarks = exitApplications
        .filter((row) => ['approved', 'rejected'].includes(pickString(row.status)))
        .filter((row) => !pickString(row.review_remark))
        .map((row) => `${pickString(row.user_id || row.id || '-')}`);

    const report = {
        generated_at: new Date().toISOString(),
        summary: {
            missing_internal_wallet_logs: missingInternalWalletLogs.length,
            missing_internal_goods_fund_logs: missingInternalGoodsFundLogs.length,
            ignored_goods_fund_test_refunds: ignoredGoodsFundTestRefunds.length,
            missing_reopen_reversal_logs: missingReopenReversalLogs.length,
            missing_adjustment_reasons: missingAdjustmentReasons.length,
            missing_debt_reasons: missingDebtReasons.length,
            missing_dividend_remarks: missingDividendRemarks.length,
            missing_exit_review_remarks: missingExitReviewRemarks.length
        },
        findings: {
            missingInternalWalletLogs,
            missingInternalGoodsFundLogs,
            ignoredGoodsFundTestRefunds,
            missingReopenReversalLogs,
            missingAdjustmentReasons,
            missingDebtReasons,
            missingDividendRemarks,
            missingExitReviewRemarks
        }
    };

    writeJson(outputJsonPath, report);
    writeText(outputMarkdownPath, renderMarkdown(report));
    console.log(JSON.stringify(report, null, 2));
}

main();
