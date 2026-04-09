'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const workspaceRoot = path.resolve(__dirname, '..', '..');
const mcporterConfigPath = path.join(workspaceRoot, 'config', 'mcporter.json');
const mcporterCliPath = process.env.MCPORTER_CLI_PATH || 'D:/nodejs/node_global/node_modules/mcporter/dist/cli.js';
const shouldApply = process.argv.includes('--apply');

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
    if (!stdout) return null;
    return JSON.parse(stdout);
}

function readAllDocuments(collectionName, limit = 500) {
    const response = callMcporter('cloudbase.readNoSqlDatabaseContent', {
        collectionName,
        limit,
        offset: 0
    });
    return response && Array.isArray(response.data) ? response.data : [];
}

function updateDocument(collectionName, docId, openid) {
    return callMcporter('cloudbase.writeNoSqlDatabaseContent', {
        action: 'update',
        collectionName,
        query: { _id: docId },
        update: {
            $set: {
                openid
            }
        },
        isMulti: false,
        upsert: false
    });
}

function buildUserMap(users) {
    const map = new Map();
    users.forEach((user) => {
        if (!user || user.id == null || !user.openid) return;
        map.set(String(user.id), user.openid);
    });
    return map;
}

function collectPlans(collectionName, fieldName, docs, userMap) {
    return docs
        .filter((doc) => !doc.openid && doc[fieldName] != null && userMap.has(String(doc[fieldName])))
        .map((doc) => ({
            collectionName,
            docId: String(doc._id),
            fieldName,
            fieldValue: doc[fieldName],
            openid: userMap.get(String(doc[fieldName]))
        }));
}

function printSummary(summary) {
    const total = summary.reduce((sum, item) => sum + item.plans.length, 0);
    console.log(JSON.stringify({
        apply: shouldApply,
        totalCollections: summary.length,
        totalPlannedUpdates: total,
        collections: summary.map((item) => ({
            collectionName: item.collectionName,
            fieldName: item.fieldName,
            totalDocuments: item.totalDocuments,
            plannedUpdates: item.plans.length,
            samples: item.plans.slice(0, 5)
        }))
    }, null, 2));
}

function main() {
    assertFileExists(mcporterConfigPath, 'mcporter 配置');
    assertFileExists(mcporterCliPath, 'mcporter CLI');

    const users = readAllDocuments('users');
    const userMap = buildUserMap(users);
    const collections = [
        { collectionName: 'orders', fieldName: 'buyer_id' },
        { collectionName: 'refunds', fieldName: 'user_id' },
        { collectionName: 'addresses', fieldName: 'user_id' }
    ];

    const summary = collections.map(({ collectionName, fieldName }) => {
        const docs = readAllDocuments(collectionName);
        return {
            collectionName,
            fieldName,
            totalDocuments: docs.length,
            plans: collectPlans(collectionName, fieldName, docs, userMap)
        };
    });

    printSummary(summary);

    if (!shouldApply) {
        return;
    }

    const plans = summary.flatMap((item) => item.plans);
    const results = [];
    plans.forEach((plan) => {
        const response = updateDocument(plan.collectionName, plan.docId, plan.openid);
        results.push({
            collectionName: plan.collectionName,
            docId: plan.docId,
            ok: !!(response && response.success)
        });
    });

    console.log(JSON.stringify({
        apply: true,
        updatedCount: results.filter((item) => item.ok).length,
        failedCount: results.filter((item) => !item.ok).length,
        results
    }, null, 2));
}

main();
