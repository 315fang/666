'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const shouldApply = process.argv.includes('--apply');
const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const docsDir = path.join(projectRoot, 'docs', 'audit');
const mcporterConfigPath = path.join(workspaceRoot, 'config', 'mcporter.json');
const mcporterCliPath = process.env.MCPORTER_CLI_PATH || 'D:/nodejs/node_global/node_modules/mcporter/dist/cli.js';
const outputPath = path.join(docsDir, '2026-04-19-wallet-log-change-type-backfill.json');
const pageLimit = 500;

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

function main() {
    const rows = readAllDocuments('wallet_logs');
    const targets = rows
        .filter((row) => !String(row.change_type || '').trim() && String(row.type || '').trim())
        .map((row) => ({
            docId: String(row._id || row.id),
            openid: row.openid || '',
            amount: Number(row.amount || 0),
            type: String(row.type || '').trim(),
            description: String(row.description || row.remark || '')
        }));

    const report = {
        generated_at: new Date().toISOString(),
        apply: shouldApply,
        target_count: targets.length,
        targets
    };

    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));

    if (!shouldApply) return;

    const results = targets.map((target) => {
        const response = updateDocument('wallet_logs', target.docId, {
            change_type: target.type,
            updated_at: new Date().toISOString()
        });
        return {
            ...target,
            ok: !!(response && response.success)
        };
    });

    const applyReport = {
        generated_at: new Date().toISOString(),
        apply: true,
        updated_count: results.filter((item) => item.ok).length,
        failed_count: results.filter((item) => !item.ok).length,
        results
    };
    fs.writeFileSync(outputPath, JSON.stringify(applyReport, null, 2));
    console.log(JSON.stringify(applyReport, null, 2));
}

main();
