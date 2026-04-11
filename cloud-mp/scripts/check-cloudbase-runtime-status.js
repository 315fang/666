'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const docsRoot = path.join(projectRoot, 'docs');
const importSummaryPath = path.join(projectRoot, 'cloudbase-import', '_summary.json');
const cloudfunctionsRoot = path.join(projectRoot, 'cloudfunctions');
const outputJsonPath = path.join(docsRoot, 'CLOUDBASE_ENV_RUNTIME_STATUS.json');
const outputMarkdownPath = path.join(docsRoot, 'CLOUDBASE_ENV_RUNTIME_STATUS.md');

const requiredCollections = [
    'users',
    'products',
    'skus',
    'categories',
    'cart_items',
    'orders',
    'refunds',
    'reviews',
    'commissions',
    'withdrawals',
    'banners',
    'materials',
    'material_groups',
    'admins',
    'admin_roles'
];

function readJson(filePath, fallback = null) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
        return fallback;
    }
}

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeText(filePath, value) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, value, 'utf8');
}

function uniqueSorted(list) {
    return Array.from(new Set((Array.isArray(list) ? list : []).map((item) => String(item)))).sort((a, b) => a.localeCompare(b));
}

function callMcporter(args) {
    const command = ['npx', 'mcporter', ...args].join(' ');
    const output = execSync(command, {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });
    return JSON.parse(output);
}

function getLocalFunctionNames() {
    try {
        return uniqueSorted(
            fs.readdirSync(cloudfunctionsRoot, { withFileTypes: true })
                .filter((entry) => entry.isDirectory())
                .filter((entry) => {
                    const dir = path.join(cloudfunctionsRoot, entry.name);
                    return fs.existsSync(path.join(dir, 'index.js')) && fs.existsSync(path.join(dir, 'package.json'));
                })
                .map((entry) => entry.name)
        );
    } catch (_) {
        return [];
    }
}

function buildCollectionRows(expectedSummary, actualCollections) {
    return requiredCollections.map((name) => {
        const hasExpected = Object.prototype.hasOwnProperty.call(expectedSummary, name);
        const hasActual = Object.prototype.hasOwnProperty.call(actualCollections, name);
        const expected = hasExpected ? Number(expectedSummary[name]) || 0 : null;
        const actual = hasActual ? Number(actualCollections[name]) || 0 : null;
        let status = 'ok';
        if (!hasActual) {
            status = 'missing_collection';
        } else if (hasExpected && actual < expected) {
            status = 'count_below_expected';
        } else if (hasExpected && actual > expected) {
            status = 'count_above_seed';
        }
        return { name, expected, actual, status };
    });
}

function readCollectionTotal(collectionName) {
    const response = callMcporter([
        'call',
        'cloudbase.readNoSqlDatabaseContent',
        `collectionName=${collectionName}`,
        'limit=1',
        'offset=0',
        '--output',
        'json'
    ]);
    if (typeof response.total === 'number') {
        return response.total;
    }
    if (response.pager && typeof response.pager.Total === 'number') {
        return response.pager.Total;
    }
    return Array.isArray(response.data) ? response.data.length : 0;
}

function resolveAdminChain(localFunctions, deployedFunctions, cloudRunServices) {
    const hasLocalAdminFunction = localFunctions.includes('admin-api');
    const hasDeployedAdminFunction = deployedFunctions.includes('admin-api');

    if (cloudRunServices.length > 0) {
        return {
            mode: 'cloudrun',
            ready: true,
            evidence: `CloudRun services deployed: ${cloudRunServices.join(', ')}`
        };
    }

    if (hasLocalAdminFunction && hasDeployedAdminFunction) {
        return {
            mode: 'function_gateway',
            ready: true,
            evidence: 'Admin chain currently resolves through the deployed admin-api cloud function gateway.'
        };
    }

    return {
        mode: 'missing',
        ready: false,
        evidence: 'No CloudRun service or deployed admin-api cloud function was found for the admin chain.'
    };
}

function renderMarkdown(report) {
    const collectionLines = report.collections.required.map((item) => {
        return `- \`${item.name}\`: expected=${item.expected == null ? 'n/a' : item.expected}, actual=${item.actual == null ? 'missing' : item.actual}, status=${item.status}`;
    }).join('\n');

    const functionLines = report.functions.local.map((name) => {
        const deployed = report.functions.deployed.includes(name) ? 'yes' : 'no';
        return `- \`${name}\`: deployed=${deployed}`;
    }).join('\n');

    const blockers = report.blockers.length
        ? report.blockers.map((item) => `- ${item}`).join('\n')
        : '- none';

    const warnings = report.warnings.length
        ? report.warnings.map((item) => `- ${item}`).join('\n')
        : '- none';

    return `# CloudBase Environment Runtime Status

Generated at: ${report.generated_at}

## Environment

- Env ID: ${report.environment.env_id || 'missing'}
- Auth status: ${report.environment.auth_status || 'unknown'}
- Env status: ${report.environment.env_status || 'unknown'}

## Required Collections

${collectionLines || '- none'}

## Functions

- Local function count: ${report.summary.local_function_count}
- Deployed function count: ${report.summary.deployed_function_count}
- Function names match: ${report.summary.functions_match ? 'YES' : 'NO'}

${functionLines || '- none'}

## Admin Chain

- Mode: ${report.admin_chain.mode}
- Ready: ${report.admin_chain.ready ? 'YES' : 'NO'}
- Evidence: ${report.admin_chain.evidence}

## CloudRun

- Service count: ${report.cloudrun.service_count}
- Services: ${report.cloudrun.services.length ? report.cloudrun.services.map((item) => `\`${item}\``).join(', ') : 'none'}

## Summary

- Required collection baseline met: ${report.summary.required_collection_baseline_met ? 'YES' : 'NO'}
- Required collections at or above baseline: ${report.summary.matched_required_collection_count}/${report.summary.required_collection_count}
- Runtime ready: ${report.ok ? 'YES' : 'NO'}

## Blockers

${blockers}

## Warnings

${warnings}
`;
}

function main() {
    const expectedSummary = readJson(importSummaryPath, {});
    const authStatus = callMcporter(['call', 'cloudbase.auth', 'action=status', '--output', 'json']);
    const collectionPayload = callMcporter(['call', 'cloudbase.readNoSqlDatabaseStructure', 'action=listCollections', 'limit=100', '--output', 'json']);
    const functionPayload = callMcporter(['call', 'cloudbase.queryFunctions', 'action=listFunctions', 'limit=100', '--output', 'json']);
    const cloudRunPayload = callMcporter(['call', 'cloudbase.queryCloudRun', 'action=list', 'pageSize=100', 'pageNum=1', '--output', 'json']);

    const listedCollections = uniqueSorted((collectionPayload.collections || []).map((item) => item.CollectionName));
    const actualCollections = {};
    listedCollections.forEach((name) => {
        actualCollections[name] = requiredCollections.includes(name)
            ? readCollectionTotal(name)
            : (((collectionPayload.collections || []).find((item) => item.CollectionName === name) || {}).Count || 0);
    });
    const requiredRows = buildCollectionRows(expectedSummary, actualCollections);
    const blockingRequiredRows = requiredRows
        .filter((item) => item.status === 'missing_collection' || item.status === 'count_below_expected')
        .map((item) => item.name);
    const grownRequiredRows = requiredRows
        .filter((item) => item.status === 'count_above_seed')
        .map((item) => item.name);

    const localFunctions = getLocalFunctionNames();
    const deployedFunctions = uniqueSorted((((functionPayload.data || {}).functions) || []).map((item) => item.FunctionName));
    const missingFunctions = localFunctions.filter((name) => !deployedFunctions.includes(name));
    const extraFunctions = deployedFunctions.filter((name) => !localFunctions.includes(name));
    const cloudRunServices = uniqueSorted((((cloudRunPayload.data || {}).services) || []).map((item) => item.ServerName || item.serverName || item.Name || item.name).filter(Boolean));
    const adminChain = resolveAdminChain(localFunctions, deployedFunctions, cloudRunServices);

    const blockers = [];
    const warnings = [];

    if (authStatus.auth_status !== 'READY' || authStatus.env_status !== 'READY') {
        blockers.push(`CloudBase auth/env not ready: auth=${authStatus.auth_status || 'unknown'}, env=${authStatus.env_status || 'unknown'}`);
    }

    if (blockingRequiredRows.length) {
        blockers.push(`Required collections missing or below import baseline: ${blockingRequiredRows.join(', ')}`);
    }

    if (grownRequiredRows.length) {
        warnings.push(`Required collections contain runtime data beyond import baseline: ${grownRequiredRows.join(', ')}`);
    }

    if (missingFunctions.length) {
        blockers.push(`Cloud functions not deployed from local source: ${missingFunctions.join(', ')}`);
    }

    if (extraFunctions.length) {
        warnings.push(`Extra deployed functions not found in local cloudfunctions/: ${extraFunctions.join(', ')}`);
    }

    if (!adminChain.ready) {
        blockers.push(adminChain.evidence);
    }

    const report = {
        kind: 'runtime_status',
        generated_at: new Date().toISOString(),
        ok: blockers.length === 0,
        environment: {
            env_id: authStatus.current_env_id || '',
            auth_status: authStatus.auth_status || '',
            env_status: authStatus.env_status || ''
        },
        collections: {
            required: requiredRows,
            missing_or_below_required: blockingRequiredRows,
            above_seed_required: grownRequiredRows
        },
        functions: {
            local: localFunctions,
            deployed: deployedFunctions,
            missing: missingFunctions,
            extra: extraFunctions
        },
        admin_chain: adminChain,
        cloudrun: {
            service_count: cloudRunServices.length,
            services: cloudRunServices
        },
        summary: {
            required_collection_count: requiredRows.length,
            matched_required_collection_count: requiredRows.filter((item) => item.status === 'ok' || item.status === 'count_above_seed').length,
            required_collection_baseline_met: blockingRequiredRows.length === 0,
            local_function_count: localFunctions.length,
            deployed_function_count: deployedFunctions.length,
            functions_match: missingFunctions.length === 0 && extraFunctions.length === 0,
            admin_chain_ready: adminChain.ready
        },
        blockers,
        warnings
    };

    writeJson(outputJsonPath, report);
    writeText(outputMarkdownPath, renderMarkdown(report));
    console.log(JSON.stringify(report, null, 2));
}

main();
