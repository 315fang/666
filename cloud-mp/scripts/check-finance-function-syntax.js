'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const cloudRoot = path.resolve(__dirname, '..');
const docsDir = path.join(cloudRoot, 'docs');
const jsonPath = path.join(docsDir, 'FINANCE_FUNCTION_SYNTAX_CHECK.json');
const mdPath = path.join(docsDir, 'FINANCE_FUNCTION_SYNTAX_CHECK.md');

const files = [
    'cloudfunctions/admin-api/src/app.js',
    'cloudfunctions/admin-api/src/admin-marketing.js',
    'cloudfunctions/distribution/index.js',
    'cloudfunctions/distribution/distribution-commission.js',
    'cloudfunctions/payment/payment-prepay.js',
    'cloudfunctions/order/order-create.js'
];

function runCheck(file) {
    try {
        execSync(`node --check "${file}"`, {
            cwd: cloudRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true
        });
        return { file, ok: true, output: '' };
    } catch (error) {
        return {
            file,
            ok: false,
            output: `${error.stdout || ''}${error.stderr || ''}`.trim()
        };
    }
}

function renderMarkdown(report) {
    const lines = [
        '# Finance Function Syntax Check',
        '',
        `生成时间：${report.generatedAt}`,
        '',
        '| 文件 | 结果 |',
        '| --- | --- |'
    ];
    report.results.forEach((item) => {
        lines.push(`| ${item.file} | ${item.ok ? '通过' : '失败'} |`);
    });
    return `${lines.join('\n')}\n`;
}

function main() {
    const results = files.map(runCheck);
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
