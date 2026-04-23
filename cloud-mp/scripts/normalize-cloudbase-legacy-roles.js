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
const outputPath = path.join(docsDir, '2026-04-19-role-level-normalization.json');
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
    const users = readAllDocuments('users');
    const targets = users
        .filter((row) => Number(row.role_level ?? row.distributor_level ?? 0) === 7)
        .map((row) => ({
            docId: String(row._id || row.id),
            user_id: row.id || row._legacy_id || row._id,
            openid: row.openid || '',
            nickname: row.nickname || row.nick_name || row.name || '',
            current_role_level: Number(row.role_level ?? row.distributor_level ?? 0),
            next_role_level: 5,
            next_role_name: '区域合伙人'
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
        const patch = {
            role_level: 5,
            role_name: '区域合伙人',
            updated_at: new Date().toISOString()
        };
        const response = updateDocument('users', target.docId, patch);
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
