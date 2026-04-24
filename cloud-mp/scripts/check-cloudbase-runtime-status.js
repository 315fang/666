'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getAuditArtifactPaths } = require('./lib/audit-output');

const projectRoot = path.resolve(__dirname, '..');
const importSummaryPath = path.join(projectRoot, 'cloudbase-import', '_summary.json');
const cloudfunctionsRoot = path.join(projectRoot, 'cloudfunctions');
const { jsonPath: outputJsonPath, mdPath: outputMarkdownPath } = getAuditArtifactPaths(projectRoot, 'CLOUDBASE_ENV_RUNTIME_STATUS');

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
    const execJson = (command) => {
        const output = execSync(command, {
            cwd: projectRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
        });
        return JSON.parse(output);
    };

    const primaryCommand = ['npx', 'mcporter', ...args].join(' ');
    try {
        return execJson(primaryCommand);
    } catch (error) {
        const detail = `${error?.stderr?.toString?.() || ''}\n${error?.stdout?.toString?.() || ''}`;
        const shouldFallback = /ERR_MODULE_NOT_FOUND|Cannot find package 'ora'/i.test(detail);
        if (!shouldFallback) throw error;

        const fallbackCommand = ['npx', '--yes', 'mcporter@latest', ...args].join(' ');
        return execJson(fallbackCommand);
    }
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

function buildCollectionRows(expectedSummary, actualCollections, collectionMeta = {}) {
    return requiredCollections.map((name) => {
        const hasExpected = Object.prototype.hasOwnProperty.call(expectedSummary, name);
        const hasActual = Object.prototype.hasOwnProperty.call(actualCollections, name);
        const meta = collectionMeta[name] || {};
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
        return {
            name,
            expected,
            actual,
            status,
            listed: meta.listed === true,
            structure_count: meta.structure_count ?? null,
            structure_status: meta.structure_status || (meta.listed ? 'listed' : 'not_listed'),
            read_source: meta.read_source || (hasActual ? 'unknown' : 'none'),
            read_error: meta.read_error || ''
        };
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
        const structure = item.structure_status && item.structure_status !== 'listed'
            ? `, structure=${item.structure_status}`
            : '';
        const readSource = item.read_source && item.read_source !== 'direct_read'
            ? `, read=${item.read_source}`
            : '';
        return `- \`${item.name}\`: expected=${item.expected == null ? 'n/a' : item.expected}, actual=${item.actual == null ? 'missing' : item.actual}, status=${item.status}${structure}${readSource}`;
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
- Required collections readable: ${report.summary.required_collections_readable ? 'YES' : 'NO'} (${report.summary.matched_required_collection_count}/${report.summary.required_collection_count})
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

    const collectionRows = Array.isArray(collectionPayload.collections) ? collectionPayload.collections : [];
    const listedCollectionMap = new Map(collectionRows.map((item) => [item.CollectionName, item]));
    const actualCollections = {};
    const collectionMeta = {};
    requiredCollections.forEach((name) => {
        const listedRow = listedCollectionMap.get(name) || {};
        const listed = listedCollectionMap.has(name);
        const structureCount = typeof listedRow.Count === 'number' ? listedRow.Count : null;
        collectionMeta[name] = {
            listed,
            structure_count: structureCount,
            structure_status: listed ? 'listed' : 'not_listed'
        };

        try {
            actualCollections[name] = readCollectionTotal(name);
            collectionMeta[name].read_source = 'direct_read';
            collectionMeta[name].structure_status = listed ? 'listed' : 'not_listed_direct_read_ok';
        } catch (error) {
            collectionMeta[name].read_error = String(error?.message || error || '').slice(0, 240);
            if (listed) {
                actualCollections[name] = structureCount == null ? 0 : structureCount;
                collectionMeta[name].read_source = 'listCollections';
                collectionMeta[name].structure_status = 'listed_direct_read_failed';
            } else {
                collectionMeta[name].read_source = 'direct_read_failed';
                collectionMeta[name].structure_status = 'not_listed_direct_read_failed';
            }
        }
    });
    const requiredRows = buildCollectionRows(expectedSummary, actualCollections, collectionMeta);
    const missingRequiredRows = requiredRows
        .filter((item) => item.status === 'missing_collection')
        .map((item) => item.name);
    const belowImportBaselineRows = requiredRows
        .filter((item) => item.status === 'count_below_expected')
        .map((item) => item.name);
    const grownRequiredRows = requiredRows
        .filter((item) => item.status === 'count_above_seed')
        .map((item) => item.name);
    const structureMismatchRows = requiredRows
        .filter((item) => item.structure_status !== 'listed')
        .map((item) => `${item.name}(${item.structure_status})`);

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

    if (missingRequiredRows.length) {
        blockers.push(`Required collections missing or unreadable: ${missingRequiredRows.join(', ')}`);
    }

    if (belowImportBaselineRows.length) {
        warnings.push(`Required collections are below mutable import baseline: ${belowImportBaselineRows.join(', ')}`);
    }

    if (grownRequiredRows.length) {
        warnings.push(`Required collections contain runtime data beyond import baseline: ${grownRequiredRows.join(', ')}`);
    }

    if (structureMismatchRows.length) {
        warnings.push(`Required collection structure list differs from direct reads: ${structureMismatchRows.join(', ')}`);
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
            missing_required: missingRequiredRows,
            below_import_baseline: belowImportBaselineRows,
            missing_or_below_required: missingRequiredRows.concat(belowImportBaselineRows),
            above_seed_required: grownRequiredRows,
            structure_mismatches: structureMismatchRows
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
            matched_required_collection_count: requiredRows.filter((item) => item.status !== 'missing_collection').length,
            required_collections_readable: missingRequiredRows.length === 0,
            required_collection_baseline_met: missingRequiredRows.length === 0 && belowImportBaselineRows.length === 0,
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
