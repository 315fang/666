'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const mcporterConfigPath = path.join(workspaceRoot, 'config', 'mcporter.json');
const mcporterCliPath = process.env.MCPORTER_CLI_PATH || 'D:/nodejs/node_global/node_modules/mcporter/dist/cli.js';
const manifestPath = path.join(projectRoot, 'config', 'cloudbase-index-manifest.json');

function parseArgs(argv = []) {
    const options = {
        create: false,
        json: false,
        collections: []
    };

    argv.forEach((arg) => {
        if (arg === '--create') options.create = true;
        else if (arg === '--json') options.json = true;
        else if (arg.startsWith('--collections=')) {
            options.collections = arg
                .slice('--collections='.length)
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean);
        }
    });

    return options;
}

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

    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || `${selector} 执行失败`);
    }

    const stdout = String(result.stdout || '').trim();
    return stdout ? JSON.parse(stdout) : null;
}

function listIndexes(collectionName) {
    const response = callMcporter('cloudbase.readNoSqlDatabaseStructure', {
        action: 'listIndexes',
        collectionName
    });
    return Array.isArray(response?.indexes) ? response.indexes : [];
}

function createIndexes(collectionName, indexes = []) {
    return callMcporter('cloudbase.writeNoSqlDatabaseStructure', {
        action: 'updateCollection',
        collectionName,
        updateOptions: {
            CreateIndexes: indexes
        }
    });
}

function normalizeDirection(order = 'asc') {
    return String(order).toLowerCase() === 'desc' ? '-1' : '1';
}

function buildCreateIndexPayload(index = {}) {
    return {
        IndexName: index.name,
        MgoKeySchema: {
            MgoIsUnique: !!index.unique,
            MgoIndexKeys: (index.fields || []).map((field) => ({
                Name: field.field,
                Direction: normalizeDirection(field.order)
            }))
        }
    };
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    assertFileExists(mcporterConfigPath, 'mcporter 配置');
    assertFileExists(mcporterCliPath, 'mcporter CLI');
    assertFileExists(manifestPath, '索引清单');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const collectionSpecs = Array.isArray(manifest.collections) ? manifest.collections : [];
    const targetSpecs = options.collections.length
        ? collectionSpecs.filter((item) => options.collections.includes(item.name))
        : collectionSpecs;

    const report = targetSpecs.map((spec) => {
        const existingIndexes = listIndexes(spec.name);
        const existingNames = new Set(existingIndexes.map((item) => String(item.Name || item.name || '').trim()).filter(Boolean));
        const missingSpecs = (spec.indexes || []).filter((index) => !existingNames.has(index.name));
        return {
            collection: spec.name,
            existing_indexes: [...existingNames].sort(),
            missing_indexes: missingSpecs.map((item) => item.name),
            create_payload: missingSpecs.map(buildCreateIndexPayload)
        };
    });

    const created = [];
    if (options.create) {
        report.forEach((item) => {
            if (!item.create_payload.length) return;
            createIndexes(item.collection, item.create_payload);
            created.push({
                collection: item.collection,
                indexes: item.missing_indexes
            });
        });
    }

    const output = {
        ok: report.every((item) => item.missing_indexes.length === 0) || created.length > 0,
        checked_count: report.length,
        collections_with_missing_indexes: report
            .filter((item) => item.missing_indexes.length > 0)
            .map((item) => ({
                collection: item.collection,
                missing_indexes: item.missing_indexes
            })),
        created
    };

    if (options.json) {
        console.log(JSON.stringify(output, null, 2));
        return;
    }

    console.log(JSON.stringify(output, null, 2));
}

main();
