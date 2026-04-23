'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const seedRoot = path.join(projectRoot, 'cloudbase-seed');
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

function readJsonArray(filePath) {
    assertFileExists(filePath, `seed 文件 ${path.basename(filePath)}`);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(parsed)) {
        throw new Error(`seed 文件不是数组: ${filePath}`);
    }
    return parsed;
}

function stripId(doc = {}) {
    const next = { ...doc };
    delete next._id;
    return next;
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

function readCollection(collectionName) {
    const response = callMcporter('cloudbase.readNoSqlDatabaseContent', {
        collectionName,
        limit: 500,
        offset: 0
    });
    return response && Array.isArray(response.data) ? response.data : [];
}

function insertDocuments(collectionName, documents) {
    return callMcporter('cloudbase.writeNoSqlDatabaseContent', {
        action: 'insert',
        collectionName,
        documents
    });
}

function updateDocument(collectionName, docId, patch) {
    return callMcporter('cloudbase.writeNoSqlDatabaseContent', {
        action: 'update',
        collectionName,
        query: { _id: String(docId) },
        update: {
            $set: patch
        },
        isMulti: false,
        upsert: false
    });
}

function deleteDocument(collectionName, docId) {
    return callMcporter('cloudbase.writeNoSqlDatabaseContent', {
        action: 'delete',
        collectionName,
        query: { _id: String(docId) },
        isMulti: false
    });
}

function getBusinessKey(collectionName, doc = {}) {
    if (collectionName === 'admins') return String(doc.username || '').trim().toLowerCase();
    if (collectionName === 'admin_roles') return String(doc.code || doc.name || '').trim().toLowerCase();
    return '';
}

function chooseCanonicalDocId(seedDoc, existingDocs = []) {
    const seedId = String(seedDoc && seedDoc._id != null ? seedDoc._id : '').trim();
    if (!existingDocs.length) return seedId;
    const exact = existingDocs.find((doc) => String(doc && doc._id != null ? doc._id : '') === seedId);
    if (exact) return String(exact._id);
    return String(existingDocs[0]._id);
}

function upsertCollection(collectionName, seedDocs) {
    const existsResponse = checkCollection(collectionName);
    if (!(existsResponse && existsResponse.exists)) {
        createCollection(collectionName);
    }

    const currentDocs = readCollection(collectionName);
    const existingByBusinessKey = new Map();
    currentDocs.forEach((doc) => {
        const businessKey = getBusinessKey(collectionName, doc);
        if (!businessKey) return;
        const list = existingByBusinessKey.get(businessKey) || [];
        list.push(doc);
        existingByBusinessKey.set(businessKey, list);
    });

    const inserts = [];
    const updates = [];
    const deletes = [];

    seedDocs.forEach((doc) => {
        const docId = String(doc && doc._id != null ? doc._id : '').trim();
        if (!docId) {
            throw new Error(`${collectionName} 存在缺少 _id 的文档`);
        }
        const businessKey = getBusinessKey(collectionName, doc);
        const matchedDocs = businessKey ? (existingByBusinessKey.get(businessKey) || []) : [];
        if (matchedDocs.length > 0) {
            const canonicalDocId = chooseCanonicalDocId(doc, matchedDocs);
            updates.push({ docId: canonicalDocId, patch: stripId(doc) });
            matchedDocs
                .filter((item) => String(item._id) !== canonicalDocId)
                .forEach((item) => deletes.push(String(item._id)));
        } else {
            inserts.push(doc);
        }
    });

    if (inserts.length) {
        insertDocuments(collectionName, inserts);
    }
    updates.forEach((item) => {
        updateDocument(collectionName, item.docId, item.patch);
    });
    deletes.forEach((docId) => {
        deleteDocument(collectionName, docId);
    });

    return {
        collectionName,
        inserted: inserts.length,
        updated: updates.length,
        deleted: deletes.length,
        totalSeed: seedDocs.length
    };
}

function main() {
    assertFileExists(mcporterConfigPath, 'mcporter 配置');
    assertFileExists(mcporterCliPath, 'mcporter CLI');

    const collections = [
        {
            collectionName: 'admin_roles',
            seedPath: path.join(seedRoot, 'admin_roles.json')
        },
        {
            collectionName: 'admins',
            seedPath: path.join(seedRoot, 'admins.json')
        }
    ];

    const report = collections.map(({ collectionName, seedPath }) => (
        upsertCollection(collectionName, readJsonArray(seedPath))
    ));

    console.log(JSON.stringify({
        ok: true,
        report
    }, null, 2));
}

main();
