'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const importRoot = path.join(projectRoot, 'cloudbase-import');
const mcporterConfigPath = path.join(workspaceRoot, 'config', 'mcporter.json');
const mcporterCliPath = process.env.MCPORTER_CLI_PATH || 'D:/nodejs/node_global/node_modules/mcporter/dist/cli.js';

function assertFileExists(filePath, label) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`${label} 不存在: ${filePath}`);
    }
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

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || `${selector} 执行失败`);
    }

    const stdout = (result.stdout || '').trim();
    return stdout ? JSON.parse(stdout) : null;
}

function readJsonl(collectionName) {
    const filePath = path.join(importRoot, `${collectionName}.jsonl`);
    assertFileExists(filePath, `${collectionName} 导入包`);
    return fs.readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}

function checkCollection(collectionName) {
    return callMcporter('cloudbase.readNoSqlDatabaseStructure', {
        action: 'checkCollection',
        collectionName
    });
}

function createCollection(collectionName) {
    return callMcporter('cloudbase.writeNoSqlDatabaseStructure', {
        action: 'createCollection',
        collectionName
    });
}

function insertDocuments(collectionName, documents) {
    return callMcporter('cloudbase.writeNoSqlDatabaseContent', {
        action: 'insert',
        collectionName,
        documents
    });
}

function countCollection(collectionName) {
    const response = callMcporter('cloudbase.readNoSqlDatabaseContent', {
        collectionName,
        limit: 500,
        offset: 0
    });
    return Array.isArray(response && response.data) ? response.data.length : 0;
}

function main() {
    assertFileExists(mcporterConfigPath, 'mcporter 配置');
    assertFileExists(mcporterCliPath, 'mcporter CLI');

    const collectionNames = process.argv.slice(2).map((item) => String(item).trim()).filter(Boolean);
    if (!collectionNames.length) {
        throw new Error('请传入至少一个集合名，例如: node scripts/import-cloudbase-collections.js skus admin_roles');
    }

    const report = [];

    collectionNames.forEach((collectionName) => {
        const docs = readJsonl(collectionName);
        const existsResponse = checkCollection(collectionName);
        const exists = !!(existsResponse && existsResponse.exists);

        if (!exists) {
            createCollection(collectionName);
        }

        const beforeCount = exists ? countCollection(collectionName) : 0;
        let inserted = 0;
        let skipped = false;

        if (beforeCount === 0) {
            insertDocuments(collectionName, docs);
            inserted = docs.length;
        } else {
            skipped = true;
        }

        const afterCount = countCollection(collectionName);
        report.push({
            collectionName,
            existed: exists,
            beforeCount,
            inserted,
            skipped,
            afterCount,
            expectedCount: docs.length,
            ok: afterCount === docs.length
        });
    });

    console.log(JSON.stringify({
        ok: report.every((item) => item.ok),
        report
    }, null, 2));
}

main();
