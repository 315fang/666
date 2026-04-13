'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadPaymentConfig } = require('../cloudfunctions/payment/config');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const docsRoot = path.join(projectRoot, 'docs');
const localJsonlRoot = path.join(projectRoot, 'mysql', 'jsonl');
const mcporterConfigPath = path.join(workspaceRoot, 'config', 'mcporter.json');
const mcporterCliPath = process.env.MCPORTER_CLI_PATH || 'D:/nodejs/node_global/node_modules/mcporter/dist/cli.js';
const defaultJsonPath = path.join(docsRoot, 'REFUND_RECON_AUDIT.json');
const defaultMarkdownPath = path.join(docsRoot, 'REFUND_RECON_AUDIT.md');
const pageLimit = 500;

function parseArgs(argv) {
    const options = {
        source: 'cloud',
        skipWechat: false,
        onlyWechat: false,
        statuses: ['approved', 'processing', 'completed', 'failed'],
        queryLimit: 100,
        jsonPath: defaultJsonPath,
        markdownPath: defaultMarkdownPath,
        maxMarkdownRows: 50
    };

    argv.forEach((arg) => {
        if (arg === '--jsonl') options.source = 'jsonl';
        else if (arg === '--cloud') options.source = 'cloud';
        else if (arg === '--skip-wechat') options.skipWechat = true;
        else if (arg === '--only-wechat') options.onlyWechat = true;
        else if (arg === '--all-statuses') options.statuses = [];
        else if (arg.startsWith('--statuses=')) {
            options.statuses = String(arg.slice('--statuses='.length))
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean);
        } else if (arg.startsWith('--query-limit=')) {
            const value = Number(arg.slice('--query-limit='.length));
            if (Number.isFinite(value) && value >= 0) {
                options.queryLimit = value;
            }
        } else if (arg.startsWith('--json=')) {
            options.jsonPath = path.resolve(projectRoot, arg.slice('--json='.length));
        } else if (arg.startsWith('--md=')) {
            options.markdownPath = path.resolve(projectRoot, arg.slice('--md='.length));
        } else if (arg.startsWith('--max-md-rows=')) {
            const value = Number(arg.slice('--max-md-rows='.length));
            if (Number.isFinite(value) && value > 0) {
                options.maxMarkdownRows = value;
            }
        }
    });

    return options;
}

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

function isPlaceholderValue(value) {
    return /^\$\{[^}]+\}$/.test(String(value || '').trim());
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

function normalizeRefundStatus(rawValue) {
    return pickString(rawValue).toLowerCase() || 'unknown';
}

function primaryId(row) {
    return row && (row._id || row.id || row._legacy_id || null);
}

function buildOrderLookup(orders) {
    const lookup = new Map();
    orders.forEach((order) => {
        const id = primaryId(order);
        const orderNo = pickString(order && order.order_no);
        if (id != null) lookup.set(String(id), order);
        if (orderNo) lookup.set(orderNo, order);
    });
    return lookup;
}

function parseJsonlCollection(filePath) {
    const rows = [];
    const parseErrors = [];
    const content = fs.readFileSync(filePath, 'utf8');
    content.split(/\r?\n/).forEach((line, index) => {
        const text = line.trim();
        if (!text) return;
        try {
            rows.push(JSON.parse(text));
        } catch (error) {
            parseErrors.push({
                line: index + 1,
                error: error.message
            });
        }
    });
    return { rows, parseErrors };
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
    return stdout ? JSON.parse(stdout) : null;
}

function readCloudCollection(collectionName) {
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

function loadCollections(source) {
    if (source === 'jsonl') {
        const ordersResult = parseJsonlCollection(path.join(localJsonlRoot, 'orders.json'));
        const refundsResult = parseJsonlCollection(path.join(localJsonlRoot, 'refunds.json'));
        return {
            orders: ordersResult.rows,
            refunds: refundsResult.rows,
            parseErrors: {
                orders: ordersResult.parseErrors,
                refunds: refundsResult.parseErrors
            }
        };
    }

    if (!fs.existsSync(mcporterConfigPath)) {
        throw new Error(`mcporter 配置不存在: ${mcporterConfigPath}`);
    }
    if (!fs.existsSync(mcporterCliPath)) {
        throw new Error(`mcporter CLI 不存在: ${mcporterCliPath}`);
    }

    return {
        orders: readCloudCollection('orders'),
        refunds: readCloudCollection('refunds'),
        parseErrors: {
            orders: [],
            refunds: []
        }
    };
}

function bootstrapWechatQuery() {
    const config = loadPaymentConfig(process.env);
    const envAssignments = {
        PAYMENT_WECHAT_APPID: config.wechat.appid,
        PAYMENT_WECHAT_MCHID: config.wechat.mchid,
        PAYMENT_WECHAT_NOTIFY_URL: config.wechat.notifyUrl,
        PAYMENT_WECHAT_SERIAL_NO: config.wechat.serialNo,
        PAYMENT_WECHAT_API_V3_KEY: config.wechat.apiV3Key,
        PAYMENT_WECHAT_PUBLIC_KEY_ID: config.wechat.publicKeyId
    };

    Object.entries(envAssignments).forEach(([key, value]) => {
        if (pickString(process.env[key])) return;
        if (!pickString(value) || isPlaceholderValue(value)) return;
        process.env[key] = value;
    });

    const missing = [];
    if (!pickString(config.wechat.mchid) || isPlaceholderValue(config.wechat.mchid)) missing.push('PAYMENT_WECHAT_MCHID');
    if (!pickString(config.wechat.serialNo) || isPlaceholderValue(config.wechat.serialNo)) missing.push('PAYMENT_WECHAT_SERIAL_NO');
    if (!pickString(config.wechat.apiV3Key) || isPlaceholderValue(config.wechat.apiV3Key)) missing.push('PAYMENT_WECHAT_API_V3_KEY');
    if (!pickString(config.wechat.privateKey) || isPlaceholderValue(config.wechat.privateKey)) missing.push('PAYMENT_WECHAT_PRIVATE_KEY');

    if (missing.length) {
        return {
            available: false,
            reason: `微信正式查询配置不完整: ${missing.join(', ')}`,
            config
        };
    }

    const wechatModulePath = path.join(projectRoot, 'cloudfunctions', 'payment', 'wechat-pay-v3.js');
    delete require.cache[require.resolve(wechatModulePath)];
    const wechatPay = require(wechatModulePath);

    return {
        available: true,
        config,
        query: (refundNo) => wechatPay.queryRefundByOutRefundNo(refundNo, config.wechat.privateKey)
    };
}

function mapWechatStatusToExpectedLocalStatus(wxStatus) {
    if (wxStatus === 'SUCCESS') return 'completed';
    if (wxStatus === 'PROCESSING') return 'processing';
    if (['ABNORMAL', 'CLOSED'].includes(wxStatus)) return 'failed';
    return '';
}

function buildActionDecision(localStatus, wxStatus) {
    const expectedLocalStatus = mapWechatStatusToExpectedLocalStatus(wxStatus);
    if (!expectedLocalStatus) {
        return {
            action: 'manual_review',
            severity: 'warning',
            reason: `未知微信退款状态 ${wxStatus || 'UNKNOWN'}`
        };
    }

    if (localStatus === expectedLocalStatus) {
        return {
            action: 'noop',
            severity: 'ok',
            reason: '本地状态与微信状态一致'
        };
    }

    if (wxStatus === 'SUCCESS') {
        return {
            action: 'sync_to_completed',
            severity: 'high',
            reason: `微信已成功退款，但本地仍为 ${localStatus || 'unknown'}`
        };
    }

    if (wxStatus === 'PROCESSING') {
        return {
            action: localStatus === 'completed' ? 'manual_review' : 'keep_processing',
            severity: localStatus === 'completed' ? 'high' : 'info',
            reason: localStatus === 'completed'
                ? '本地已完成，但微信仍在处理中'
                : `微信仍在处理中，本地当前为 ${localStatus || 'unknown'}`
        };
    }

    return {
        action: 'sync_to_failed',
        severity: 'high',
        reason: `微信退款状态为 ${wxStatus}，本地当前为 ${localStatus || 'unknown'}`
    };
}

function buildInternalDecision(paymentMethod, localStatus) {
    if (paymentMethod === 'goods_fund') {
        return {
            action: 'internal_goods_fund_review',
            severity: localStatus === 'completed' ? 'info' : 'warning',
            reason: localStatus === 'completed' ? '货款余额退款，默认视为内部完成' : `货款余额退款，本地当前为 ${localStatus || 'unknown'}`
        };
    }

    if (paymentMethod === 'wallet') {
        return {
            action: 'internal_wallet_review',
            severity: localStatus === 'completed' ? 'warning' : 'warning',
            reason: localStatus === 'completed'
                ? '账户余额退款缺少官方回执，需结合用户余额与管理员操作核对'
                : `账户余额退款，本地当前为 ${localStatus || 'unknown'}`
        };
    }

    return {
        action: 'manual_review',
        severity: 'warning',
        reason: '缺少支付方式或关联订单信息，暂时无法判断真实退款通道'
    };
}

function formatDateTime(value) {
    const text = pickString(value);
    if (!text) return '-';
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function renderMarkdown(report) {
    const summaryLines = [
        '# Refund Reconciliation Audit',
        '',
        `生成时间：${report.generated_at}`,
        `数据源：${report.source}`,
        `退款总数：${report.summary.total_refunds}`,
        `纳入审计：${report.summary.audited_refunds}`,
        `微信退款：${report.summary.wechat_refunds}`,
        `内部退款：${report.summary.internal_refunds}`,
        `微信官方查询：${report.wechat_query.available ? '可用' : '不可用'}`,
        `微信实际查询笔数：${report.wechat_query.attempted}`,
        ''
    ];

    if (report.wechat_query.reason) {
        summaryLines.push(`微信查询说明：${report.wechat_query.reason}`);
        summaryLines.push('');
    }

    summaryLines.push('## 动作汇总');
    summaryLines.push('');
    summaryLines.push('| 动作 | 数量 |');
    summaryLines.push('| --- | ---: |');
    Object.entries(report.summary.actions)
        .sort((left, right) => right[1] - left[1])
        .forEach(([action, count]) => {
            summaryLines.push(`| ${action} | ${count} |`);
        });

    const actionableItems = report.items
        .filter((item) => item.action !== 'noop')
        .slice(0, report.options.maxMarkdownRows);

    summaryLines.push('');
    summaryLines.push(`## 待处理记录（前 ${actionableItems.length} 条）`);
    summaryLines.push('');
    summaryLines.push('| 退款单 | 订单号 | 通道 | 本地状态 | 微信状态 | 动作 | 说明 |');
    summaryLines.push('| --- | --- | --- | --- | --- | --- | --- |');
    actionableItems.forEach((item) => {
        summaryLines.push(`| ${item.refund_no || item.refund_id} | ${item.order_no || item.order_id || '-'} | ${item.payment_method} | ${item.local_status} | ${item.wechat_status || '-'} | ${item.action} | ${item.reason} |`);
    });

    if (report.items.length > actionableItems.length) {
        summaryLines.push('');
        summaryLines.push(`其余 ${report.items.length - actionableItems.length} 条记录见 JSON：\`${path.relative(projectRoot, report.paths.json)}\``);
    }

    if (report.parse_errors.orders.length || report.parse_errors.refunds.length) {
        summaryLines.push('');
        summaryLines.push('## 解析警告');
        summaryLines.push('');
        summaryLines.push(`- orders 解析失败：${report.parse_errors.orders.length}`);
        summaryLines.push(`- refunds 解析失败：${report.parse_errors.refunds.length}`);
    }

    return `${summaryLines.join('\n')}\n`;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const collections = loadCollections(options.source);
    const orderLookup = buildOrderLookup(collections.orders);
    const wechatQuery = options.skipWechat ? {
        available: false,
        reason: '显式跳过微信官方查询'
    } : bootstrapWechatQuery();

    const filteredRefunds = collections.refunds.filter((refund) => {
        const localStatus = normalizeRefundStatus(refund.status);
        if (options.statuses.length && !options.statuses.includes(localStatus)) return false;
        const order = orderLookup.get(String(refund.order_id)) || orderLookup.get(pickString(refund.order_no));
        const paymentMethod = normalizePaymentMethodCode(refund.payment_method || (order && (order.payment_method || order.pay_type || order.pay_channel || order.payment_channel)));
        if (options.onlyWechat && paymentMethod !== 'wechat') return false;
        return true;
    });

    const items = [];
    let attemptedWechatQueries = 0;
    let skippedWechatQueries = 0;

    for (const refund of filteredRefunds) {
        const order = orderLookup.get(String(refund.order_id)) || orderLookup.get(pickString(refund.order_no)) || null;
        const paymentMethod = normalizePaymentMethodCode(refund.payment_method || (order && (order.payment_method || order.pay_type || order.pay_channel || order.payment_channel)));
        const localStatus = normalizeRefundStatus(refund.status);
        const baseItem = {
            refund_id: primaryId(refund),
            refund_no: pickString(refund.refund_no),
            order_id: refund.order_id || '',
            order_no: pickString(refund.order_no || (order && order.order_no)),
            amount: toNumber(refund.amount, 0),
            payment_method: paymentMethod,
            local_status: localStatus,
            created_at: formatDateTime(refund.created_at),
            completed_at: formatDateTime(refund.completed_at),
            wechat_status: '',
            action: '',
            severity: '',
            reason: '',
            authoritative_status: ''
        };

        if (paymentMethod !== 'wechat') {
            const decision = buildInternalDecision(paymentMethod, localStatus);
            items.push({
                ...baseItem,
                action: decision.action,
                severity: decision.severity,
                reason: decision.reason,
                authoritative_status: 'INTERNAL'
            });
            continue;
        }

        if (!baseItem.refund_no) {
            items.push({
                ...baseItem,
                action: 'manual_review',
                severity: 'high',
                reason: '微信退款记录缺少 refund_no，无法对官方状态',
                authoritative_status: 'UNKNOWN'
            });
            continue;
        }

        if (!wechatQuery.available || (options.queryLimit > 0 && attemptedWechatQueries >= options.queryLimit)) {
            skippedWechatQueries += 1;
            items.push({
                ...baseItem,
                action: 'wechat_query_skipped',
                severity: 'warning',
                reason: wechatQuery.available ? '达到本次微信查询上限，未继续查询' : (wechatQuery.reason || '微信官方查询不可用'),
                authoritative_status: 'SKIPPED'
            });
            continue;
        }

        attemptedWechatQueries += 1;

        try {
            const wxResult = await wechatQuery.query(baseItem.refund_no);
            const wxStatus = pickString(wxResult && (wxResult.status || wxResult.refund_status)).toUpperCase();
            const decision = buildActionDecision(localStatus, wxStatus);
            items.push({
                ...baseItem,
                wechat_status: wxStatus,
                action: decision.action,
                severity: decision.severity,
                reason: decision.reason,
                authoritative_status: wxStatus || 'UNKNOWN',
                wx_refund_id: pickString(wxResult && wxResult.refund_id),
                wx_success_time: formatDateTime(wxResult && wxResult.success_time)
            });
        } catch (error) {
            items.push({
                ...baseItem,
                action: 'wechat_query_error',
                severity: 'high',
                reason: `微信查询失败: ${error.message}`,
                authoritative_status: 'ERROR'
            });
        }
    }

    const summaryActions = {};
    items.forEach((item) => {
        summaryActions[item.action] = (summaryActions[item.action] || 0) + 1;
    });

    const report = {
        generated_at: new Date().toISOString(),
        source: options.source,
        options,
        paths: {
            json: options.jsonPath,
            markdown: options.markdownPath
        },
        parse_errors: collections.parseErrors,
        wechat_query: {
            available: !!wechatQuery.available,
            reason: wechatQuery.reason || '',
            attempted: attemptedWechatQueries,
            skipped: skippedWechatQueries,
            query_limit: options.queryLimit
        },
        summary: {
            total_refunds: collections.refunds.length,
            audited_refunds: filteredRefunds.length,
            wechat_refunds: items.filter((item) => item.payment_method === 'wechat').length,
            internal_refunds: items.filter((item) => item.payment_method !== 'wechat').length,
            actionable_refunds: items.filter((item) => item.action !== 'noop').length,
            actions: summaryActions
        },
        items
    };

    writeJson(options.jsonPath, report);
    writeText(options.markdownPath, renderMarkdown(report));

    console.log(JSON.stringify({
        ok: true,
        json: options.jsonPath,
        markdown: options.markdownPath,
        summary: report.summary,
        wechatQuery: report.wechat_query
    }, null, 2));
}

main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
});
