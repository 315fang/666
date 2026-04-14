'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const cloudRoot = path.resolve(__dirname, '..');
const docsDir = path.join(cloudRoot, 'docs');
const jsonPath = path.join(docsDir, 'FINANCE_RELEASE_CHECK.json');
const mdPath = path.join(docsDir, 'FINANCE_RELEASE_CHECK.md');

const steps = [
    { name: 'financeFirewall', command: 'npm run audit:finance-firewall', jsonPath: path.join(docsDir, 'STRATEGIC_FINANCE_FIREWALL_AUDIT.json') },
    { name: 'refundRecon', command: 'npm run audit:refunds', jsonPath: path.join(docsDir, 'REFUND_RECON_AUDIT.json') },
    { name: 'financeSmoke', command: 'node scripts/audit-finance-smoke.js', jsonPath: path.join(docsDir, 'FINANCE_SMOKE_AUDIT.json') },
    { name: 'financeSyntax', command: 'node scripts/check-finance-function-syntax.js', jsonPath: path.join(docsDir, 'FINANCE_FUNCTION_SYNTAX_CHECK.json') },
    { name: 'adminBuild', command: 'npm run build', cwd: path.join(cloudRoot, 'admin-ui') }
];

function runCommand(command, cwd = cloudRoot) {
    try {
        const output = execSync(command, {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true
        });
        return { ok: true, output };
    } catch (error) {
        return {
            ok: false,
            output: `${error.stdout || ''}${error.stderr || ''}`.trim()
        };
    }
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
        return null;
    }
}

function renderMarkdown(summary) {
    const lines = [
        '# Finance Release Check',
        '',
        `生成时间：${summary.generatedAt}`,
        '',
        '| 检查项 | 结果 | 摘要 |',
        '| --- | --- | --- |'
    ];
    summary.steps.forEach((item) => {
        lines.push(`| ${item.name} | ${item.ok ? '通过' : '失败'} | ${item.brief} |`);
    });
    return `${lines.join('\n')}\n`;
}

function main() {
    const summary = {
        generatedAt: new Date().toISOString(),
        ok: true,
        steps: []
    };

    steps.forEach((step) => {
        const result = runCommand(step.command, step.cwd || cloudRoot);
        const payload = step.jsonPath ? readJson(step.jsonPath) : null;
        const ok = payload && payload.ok !== undefined ? payload.ok : result.ok;
        let brief = result.ok ? '执行完成' : '执行失败';

        if (step.name === 'financeFirewall' && payload?.summary) {
            brief = `缺口项 ${Object.values(payload.summary).reduce((sum, value) => sum + Number(value || 0), 0)}`;
        } else if (step.name === 'refundRecon' && payload?.summary) {
            brief = `退款 ${payload.summary.audited_refunds} 笔，微信 ${payload.summary.wechat_refunds}，未知通道 ${payload.summary.unknown_channel_refunds || 0}`;
        } else if (step.name === 'financeSmoke' && payload?.results) {
            brief = `接口 ${payload.results.length} 个，失败 ${payload.results.filter((item) => !item.ok).length} 个`;
        } else if (step.name === 'financeSyntax' && payload?.results) {
            brief = `文件 ${payload.results.length} 个，失败 ${payload.results.filter((item) => !item.ok).length} 个`;
        } else if (step.name === 'adminBuild') {
            brief = ok ? 'admin-ui 构建通过' : 'admin-ui 构建失败';
        }

        summary.steps.push({
            name: step.name,
            ok,
            brief,
            output: result.output
        });
        if (!ok) summary.ok = false;
    });

    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
    fs.writeFileSync(mdPath, renderMarkdown(summary));
    console.log(JSON.stringify({ ok: summary.ok, jsonPath, mdPath, steps: summary.steps.map(({ name, ok, brief }) => ({ name, ok, brief })) }, null, 2));
    if (!summary.ok) process.exit(1);
}

main();
