'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { getAuditArtifactPaths } = require('./lib/audit-output');

const cloudRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(cloudRoot, '..');
const { outputDir: docsDir, jsonPath, mdPath } = getAuditArtifactPaths(cloudRoot, 'FINANCE_SMOKE_AUDIT');
const mcporterConfigPath = path.join(workspaceRoot, 'config', 'mcporter.json');
const mcporterCliPath = process.env.MCPORTER_CLI_PATH || 'D:/nodejs/node_global/node_modules/mcporter/dist/cli.js';

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

    const stdout = (result.stdout || '').trim();
    return stdout ? JSON.parse(stdout) : null;
}

function readCollectionSample(collectionName, limit = 5) {
    const response = callMcporter('cloudbase.readNoSqlDatabaseContent', {
        collectionName,
        limit,
        offset: 0
    });
    return {
        total: Number(response?.total || response?.pager?.Total || 0),
        list: Array.isArray(response?.data) ? response.data : []
    };
}

function validateCollection(name, collectionName, { min = 0, requiredFields = [], requiredAnyOf = [] }) {
    const sample = readCollectionSample(collectionName, Math.max(5, min || 1));
    const result = {
        name,
        collectionName,
        ok: true,
        count: sample.total,
        issues: []
    };
    if (sample.total < min) {
        result.ok = false;
        result.issues.push(`数量 ${sample.total} 小于期望 ${min}`);
    }
    if (sample.list.length && requiredFields.length) {
        requiredFields.forEach((field) => {
            if (!(field in sample.list[0])) {
                result.ok = false;
                result.issues.push(`首条记录缺少字段 ${field}`);
            }
        });
    }
    if (sample.list.length && requiredAnyOf.length) {
        requiredAnyOf.forEach((group) => {
            const matched = group.some((field) => field in sample.list[0]);
            if (!matched) {
                result.ok = false;
                result.issues.push(`首条记录缺少字段组 ${group.join(' | ')}`);
            }
        });
    }
    return result;
}

function renderMarkdown(report) {
    const lines = [
        '# Finance Smoke Audit',
        '',
        `生成时间：${report.generatedAt}`,
        '',
        '| 检查项 | 结果 | 数量 | 问题 |',
        '| --- | --- | ---: | --- |'
    ];
    report.results.forEach((item) => {
        lines.push(`| ${item.name} | ${item.ok ? '通过' : '失败'} | ${item.count} | ${(item.issues || []).join('；') || '-'} |`);
    });
    lines.push('');
    lines.push('说明：当前 smoke 以 CloudBase live 集合和关键字段为准，不依赖 admin-api JWT。');
    return `${lines.join('\n')}\n`;
}

function main() {
    const results = [
        validateCollection('refunds', 'refunds', { min: 0, requiredFields: ['status', 'amount'] }),
        validateCollection('withdrawals', 'withdrawals', { min: 0, requiredFields: ['status', 'amount'] }),
        validateCollection('commissions', 'commissions', { min: 0, requiredFields: ['status', 'amount'] }),
        validateCollection('wallet_logs', 'wallet_logs', { min: 1, requiredFields: ['amount'], requiredAnyOf: [['type', 'change_type']] }),
        validateCollection('goods_fund_logs', 'goods_fund_logs', { min: 1, requiredFields: ['type', 'amount'] }),
        validateCollection('point_logs', 'point_logs', { min: 1, requiredFields: ['type'], requiredAnyOf: [['amount', 'points']] }),
        validateCollection('users', 'users', { min: 1, requiredFields: ['balance', 'debt_amount'], requiredAnyOf: [['commission_balance', 'balance'], ['agent_wallet_balance', 'wallet_balance', 'balance']] })
    ];

    const report = {
        generatedAt: new Date().toISOString(),
        ok: results.every((item) => item.ok),
        results
    };

    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(mdPath, renderMarkdown(report));
    console.log(JSON.stringify({ ok: report.ok, jsonPath, mdPath, results }, null, 2));
    if (!report.ok) process.exit(1);
}

main();
