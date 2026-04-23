'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const targetModelPath = path.join(projectRoot, 'CLOUDBASE_TARGET_MODEL.md');
const contractPath = path.join(projectRoot, 'config', 'cloudbase-collection-contract.json');
const seedRoot = path.join(projectRoot, 'cloudbase-seed');
const importRoot = path.join(projectRoot, 'cloudbase-import');
const mcporterConfigPath = path.join(workspaceRoot, 'config', 'mcporter.json');
const mcporterCliPath = process.env.MCPORTER_CLI_PATH || 'D:/nodejs/node_global/node_modules/mcporter/dist/cli.js';

const IGNORE_DIRS = new Set([
    '.git',
    '.runtime',
    'build',
    'dist',
    'node_modules',
    'cloudbase-import',
    'cloudbase-seed'
]);

const CODE_SCAN_ROOTS = [
    path.join(projectRoot, 'cloudfunctions'),
    path.join(projectRoot, 'scripts'),
    path.join(projectRoot, 'admin-ui'),
    path.join(projectRoot, 'miniprogram')
];

const COLLECTION_PATTERNS = [
    /\.collection\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    /getCollection\(\s*['"`]([^'"`]+)['"`]\s*\)/g
];
const IGNORED_COLLECTION_NAMES = new Set([
    '_summary'
]);

function parseArgs(argv = []) {
    const options = {
        create: false,
        groups: [],
        json: false,
        includeSeeds: true,
        includeTargetModel: true,
        collections: []
    };

    argv.forEach((arg) => {
        if (arg === '--create') options.create = true;
        else if (arg === '--json') options.json = true;
        else if (arg === '--no-seeds') options.includeSeeds = false;
        else if (arg === '--no-target-model') options.includeTargetModel = false;
        else if (arg.startsWith('--groups=')) {
            options.groups = arg
                .slice('--groups='.length)
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean);
        }
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

function listLiveCollections() {
    const response = callMcporter('cloudbase.readNoSqlDatabaseStructure', {
        action: 'listCollections',
        limit: 500,
        offset: 0
    });

    const rawList = []
        .concat(response?.collections || [])
        .concat(response?.data || [])
        .concat(response?.list || []);

    return [...new Set(rawList.map((item) => {
        if (!item) return '';
        if (typeof item === 'string') return item.trim();
        return String(
            item.CollectionName
            || item.collectionName
            || item.name
            || item.collection
            || ''
        ).trim();
    }).filter(Boolean))].sort();
}

function createCollection(collectionName) {
    return callMcporter('cloudbase.writeNoSqlDatabaseStructure', {
        action: 'createCollection',
        collectionName
    });
}

function loadCollectionContract() {
    if (!fs.existsSync(contractPath)) return null;
    const raw = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    const groups = Array.isArray(raw.groups) ? raw.groups : [];
    return {
        ...raw,
        groups
    };
}

function extractCollectionsFromTargetModel() {
    if (!fs.existsSync(targetModelPath)) return [];
    const text = fs.readFileSync(targetModelPath, 'utf8');
    const lines = text.split(/\r?\n/);
    const collections = [];
    let inSection = false;

    for (const line of lines) {
        if (line.trim() === '## 正式集合') {
            inSection = true;
            continue;
        }
        if (inSection && line.startsWith('## ')) break;
        if (!inSection) continue;
        const match = line.match(/^- `([^`]+)`/);
        if (match) collections.push(match[1].trim());
    }

    return collections;
}

function extractCollectionsFromDir(dirPath, extensions) {
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath)
        .filter((name) => extensions.some((ext) => name.endsWith(ext)))
        .map((name) => name.replace(/\.(jsonl|json)$/i, '').trim())
        .filter(Boolean);
}

function walkFiles(dirPath, result = []) {
    if (!fs.existsSync(dirPath)) return result;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    entries.forEach((entry) => {
        if (IGNORE_DIRS.has(entry.name)) return;
        const absPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            walkFiles(absPath, result);
            return;
        }
        if (!/\.(js|ts|tsx|vue|md)$/i.test(entry.name)) return;
        result.push(absPath);
    });
    return result;
}

function extractCollectionsFromCode() {
    const collectionMap = new Map();

    CODE_SCAN_ROOTS.forEach((rootPath) => {
        walkFiles(rootPath).forEach((filePath) => {
            const content = fs.readFileSync(filePath, 'utf8');
            COLLECTION_PATTERNS.forEach((pattern) => {
                let match = pattern.exec(content);
                while (match) {
                    const collectionName = String(match[1] || '').trim();
                    if (collectionName) {
                        if (!collectionMap.has(collectionName)) collectionMap.set(collectionName, new Set());
                        collectionMap.get(collectionName).add(path.relative(projectRoot, filePath).replace(/\\/g, '/'));
                    }
                    match = pattern.exec(content);
                }
                pattern.lastIndex = 0;
            });
        });
    });

    return collectionMap;
}

function sortedUnique(list = []) {
    return [...new Set((Array.isArray(list) ? list : [])
        .map((item) => String(item || '').trim())
        .filter((item) => item && !IGNORED_COLLECTION_NAMES.has(item))
    )].sort();
}

function flattenContractCollections(contract, groupKeys = []) {
    if (!(contract && Array.isArray(contract.groups))) return [];
    const selectedGroups = groupKeys.length
        ? contract.groups.filter((group) => groupKeys.includes(group.key))
        : contract.groups.filter((group) => group.createByDefault !== false);
    return sortedUnique(selectedGroups.flatMap((group) => group.collections || []));
}

function flattenAllContractCollections(contract) {
    if (!(contract && Array.isArray(contract.groups))) return [];
    return sortedUnique(contract.groups.flatMap((group) => group.collections || []));
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    assertFileExists(mcporterConfigPath, 'mcporter 配置');
    assertFileExists(mcporterCliPath, 'mcporter CLI');

    const contract = loadCollectionContract();
    const codeCollections = extractCollectionsFromCode();
    const collectionsFromCode = sortedUnique([...codeCollections.keys()]);
    const collectionsFromSeed = options.includeSeeds
        ? sortedUnique([
            ...extractCollectionsFromDir(seedRoot, ['.json']),
            ...extractCollectionsFromDir(importRoot, ['.jsonl'])
        ])
        : [];
    const collectionsFromTargetModel = options.includeTargetModel
        ? sortedUnique(extractCollectionsFromTargetModel())
        : [];

    const discoveredCollections = sortedUnique([
        ...collectionsFromCode,
        ...collectionsFromSeed,
        ...collectionsFromTargetModel
    ]);
    const contractDesiredCollections = flattenContractCollections(contract, options.groups);
    const allContractCollections = flattenAllContractCollections(contract);
    const unclassifiedCollections = contract
        ? discoveredCollections.filter((item) => !allContractCollections.includes(item))
        : [];

    let desiredCollections = contractDesiredCollections.length
        ? contractDesiredCollections
        : discoveredCollections;

    if (options.collections.length) {
        const filterSet = new Set(options.collections);
        desiredCollections = desiredCollections.filter((item) => filterSet.has(item));
    }

    const liveCollections = listLiveCollections();
    const liveSet = new Set(liveCollections);
    const missingCollections = desiredCollections.filter((item) => !liveSet.has(item));

    const created = [];
    if (options.create) {
        missingCollections.forEach((collectionName) => {
            createCollection(collectionName);
            created.push(collectionName);
        });
    }

    const report = {
        ok: missingCollections.length === 0 || (options.create && created.length === missingCollections.length),
        desired_count: desiredCollections.length,
        live_count: liveCollections.length,
        missing_count: missingCollections.length,
        created_count: created.length,
        contract_loaded: !!contract,
        selected_groups: options.groups,
        desired_collections: desiredCollections,
        live_collections: liveCollections,
        missing_collections: missingCollections,
        created_collections: created,
        unclassified_collections: unclassifiedCollections,
        duplicate_watch: contract && Array.isArray(contract.duplicateWatch) ? contract.duplicateWatch : [],
        code_references: Object.fromEntries(
            [...codeCollections.entries()]
                .filter(([name]) => desiredCollections.includes(name))
                .map(([name, refs]) => [name, [...refs].sort()])
        ),
        sources: {
            target_model: collectionsFromTargetModel,
            seed_and_import: collectionsFromSeed,
            code_scan: collectionsFromCode
        }
    };

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }

    console.log(`目标集合数: ${report.desired_count}`);
    console.log(`线上已存在: ${report.live_count}`);
    console.log(`缺失集合数: ${report.missing_count}`);
    if (missingCollections.length) {
        console.log('\n缺失集合:');
        missingCollections.forEach((name) => console.log(`- ${name}`));
    }
    if (created.length) {
        console.log('\n已创建集合:');
        created.forEach((name) => console.log(`- ${name}`));
    }
}

main();
