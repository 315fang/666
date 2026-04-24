const fs = require('fs');
const path = require('path');
const { getAuditArtifactPaths, toMarkdownFileLink } = require('./lib/audit-output');

const projectRoot = path.resolve(__dirname, '..');
const docsRoot = path.join(projectRoot, 'docs');
const seedRoot = path.join(projectRoot, 'cloudbase-seed');
const importRoot = path.join(projectRoot, 'cloudbase-import');
const projectConfigPath = path.join(projectRoot, 'project.config.json');
const seedSummaryPath = path.join(seedRoot, '_summary.json');
const importSummaryPath = path.join(importRoot, '_summary.json');

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

const optionalCollections = ['configs'];

const readinessDocPath = path.join(docsRoot, 'CLOUDBASE_ENV_IMPORT_READINESS.md');
const readinessJsonPath = path.join(docsRoot, 'CLOUDBASE_ENV_IMPORT_READINESS.json');
const resultDocPath = path.join(docsRoot, 'CLOUDBASE_ENV_IMPORT_RESULT.md');
const resultJsonPath = path.join(docsRoot, 'CLOUDBASE_ENV_IMPORT_RESULT.json');
const { jsonPath: runtimeStatusJsonPath, mdPath: runtimeStatusDocPath } = getAuditArtifactPaths(projectRoot, 'CLOUDBASE_ENV_RUNTIME_STATUS');

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value);
}

function toList(value) {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).map(([name, count]) => ({ name, count: Number(count) || 0 }));
}

function readContext() {
  return {
    projectConfigPath,
    docsRoot,
    seedRoot,
    importRoot,
    seedSummaryPath,
    importSummaryPath,
    projectConfig: readJson(projectConfigPath, {}),
    seedSummary: readJson(seedSummaryPath, {}),
    importSummary: readJson(importSummaryPath, {}),
    runtimeStatus: readJson(runtimeStatusJsonPath, null),
    envIdInput: process.env.CLOUDBASE_ENV_ID || process.env.CLOUDBASE_ENV || '',
    operator: process.env.CLOUDBASE_OPERATOR || process.env.USERNAME || process.env.USER || '',
    importedAt: process.env.CLOUDBASE_IMPORTED_AT || '',
    importStatus: process.env.CLOUDBASE_IMPORT_STATUS || ''
  };
}

function summarizeSummary(summary) {
  return toList(summary).sort((left, right) => left.name.localeCompare(right.name));
}

function buildReadinessReport(context = readContext()) {
  const checks = [];
  const warnings = [];
  const projectEnv = context.projectConfig.cloudbaseEnv || '';
  const requiredFiles = [
    projectConfigPath,
    seedSummaryPath,
    importSummaryPath,
    path.join(docsRoot, 'CLOUDBASE_ENV_IMPORT_CHECKLIST.md'),
    path.join(docsRoot, 'CLOUDBASE_ENV_IMPORT_RESULT_TEMPLATE.md'),
    path.join(docsRoot, 'CLOUDBASE_MIGRATION_PROGRESS.md'),
    path.join(docsRoot, 'CLOUDBASE_MIGRATION_BACKLOG.md')
  ];

  requiredFiles.forEach((filePath) => {
    const ok = fs.existsSync(filePath);
    checks.push({
      name: path.basename(filePath),
      ok,
      detail: filePath
    });
  });

  const envMatches = !context.envIdInput || context.envIdInput === projectEnv;
  checks.push({
    name: 'cloudbase env matches',
    ok: envMatches,
    detail: context.envIdInput ? `${context.envIdInput} vs ${projectEnv || 'missing'}` : 'no override env provided'
  });

  checks.push({
    name: 'project cloudbaseEnv configured',
    ok: !!projectEnv,
    detail: projectEnv || 'missing'
  });

  const importCollections = Object.keys(context.importSummary || {});
  const missingRequired = requiredCollections.filter((name) => !Object.prototype.hasOwnProperty.call(context.importSummary || {}, name));
  const missingOptional = optionalCollections.filter((name) => !Object.prototype.hasOwnProperty.call(context.importSummary || {}, name));
  const unexpectedCollections = importCollections.filter((name) => !requiredCollections.includes(name) && !optionalCollections.includes(name));

  checks.push({
    name: 'required collections present',
    ok: missingRequired.length === 0,
    detail: missingRequired.length ? `missing: ${missingRequired.join(', ')}` : 'all required collections present'
  });

  checks.push({
    name: 'import package exists',
    ok: fs.existsSync(importRoot),
    detail: importRoot
  });

  checks.push({
    name: 'seed package exists',
    ok: fs.existsSync(seedRoot),
    detail: seedRoot
  });

  if (missingOptional.length) {
    warnings.push(`optional collections not prepared: ${missingOptional.join(', ')}`);
  }

  if (unexpectedCollections.length) {
    warnings.push(`extra collections in import package: ${unexpectedCollections.join(', ')}`);
  }

  if (!context.envIdInput) {
    warnings.push('no CLOUDBASE_ENV_ID provided; env matching check is informational only');
  }

  const failed = checks.filter((item) => !item.ok);
  return {
    kind: 'readiness',
    generated_at: new Date().toISOString(),
    ok: failed.length === 0,
    project_env: projectEnv,
    input_env: context.envIdInput || '',
    operator: context.operator || '',
    files: {
      project_config: projectConfigPath,
      seed_summary: seedSummaryPath,
      import_summary: importSummaryPath
    },
    summaries: {
      seed: summarizeSummary(context.seedSummary),
      import: summarizeSummary(context.importSummary)
    },
    collections: {
      required: requiredCollections.slice(),
      optional: optionalCollections.slice(),
      missing_required: missingRequired,
      missing_optional: missingOptional,
      unexpected: unexpectedCollections
    },
    warnings,
    checks
  };
}

function buildResultReport(context = readContext()) {
  const importCollections = summarizeSummary(context.importSummary);
  const runtimeStatus = context.runtimeStatus || null;
  const runtimeValidation = runtimeStatus
    ? {
      checked_at: runtimeStatus.generated_at || '',
      env_id: (runtimeStatus.environment && runtimeStatus.environment.env_id) || '',
      required_collections_readable: !!(runtimeStatus.summary && runtimeStatus.summary.required_collections_readable),
      required_collection_baseline_met: !!(runtimeStatus.summary && runtimeStatus.summary.required_collection_baseline_met),
      matched_required_collection_count: Number((runtimeStatus.summary && runtimeStatus.summary.matched_required_collection_count) || 0),
      required_collection_count: Number((runtimeStatus.summary && runtimeStatus.summary.required_collection_count) || 0),
      missing_required_collections: (runtimeStatus.collections && (runtimeStatus.collections.missing_required || runtimeStatus.collections.missing_or_mismatched_required)) || [],
      below_import_baseline: (runtimeStatus.collections && runtimeStatus.collections.below_import_baseline) || [],
      functions_match: !!(runtimeStatus.summary && runtimeStatus.summary.functions_match),
      missing_functions: (runtimeStatus.functions && runtimeStatus.functions.missing) || [],
      extra_functions: (runtimeStatus.functions && runtimeStatus.functions.extra) || [],
      cloudrun_service_count: Number((runtimeStatus.cloudrun && runtimeStatus.cloudrun.service_count) || 0),
      blockers: runtimeStatus.blockers || [],
      warnings: runtimeStatus.warnings || []
    }
    : null;
  const status = context.importStatus || (runtimeValidation ? (runtimeStatus.ok ? 'VERIFIED' : 'PARTIAL') : 'DRAFT');
  const envId = context.envIdInput || context.projectConfig.cloudbaseEnv || '';
  const completedChecks = runtimeValidation
    ? (runtimeValidation.required_collections_readable
      ? `YES (${runtimeValidation.matched_required_collection_count}/${runtimeValidation.required_collection_count})`
      : `NO (${runtimeValidation.matched_required_collection_count}/${runtimeValidation.required_collection_count}; missing: ${runtimeValidation.missing_required_collections.join(', ') || 'unknown'})`)
    : process.env.CLOUDBASE_IMPORT_COUNTS_MATCH === '1'
    ? 'YES'
    : 'PENDING';

  return {
    kind: 'result',
    generated_at: new Date().toISOString(),
    status,
    environment: {
      env_id: envId,
      imported_at: context.importedAt || '',
      operator: context.operator || '',
      import_source: 'cloud-mp/cloudbase-import',
      seed_summary_source: 'cloud-mp/cloudbase-import/_summary.json'
    },
    package_summary: importCollections,
    validation: {
      import_counts_match_summary: completedChecks,
      users_sample_checked: 'PENDING',
      products_sample_checked: 'PENDING',
      orders_sample_checked: 'PENDING',
      mini_program_login_smoke_test: 'PENDING',
      product_list_smoke_test: 'PENDING',
      order_list_smoke_test: 'PENDING',
      admin_login_smoke_test: 'PENDING'
    },
    runtime_validation: runtimeValidation,
    rollback: {
      legacy_jsonl_retained: 'YES',
      cloudbase_seed_retained: 'YES',
      runtime_overrides_retained: 'YES'
    },
    follow_up: [
      'Switch backend read priority to CloudBase',
      'Switch mini program runtime to CloudBase collections',
      'Remove temporary compatibility reads',
      'Start formal payment cutover'
    ]
  };
}

function renderReadinessMarkdown(report) {
  const checks = report.checks
    .map((item) => `- ${item.ok ? '[x]' : '[ ]'} ${item.name}: ${item.detail}`)
    .join('\n');
  const warnings = report.warnings.length
    ? report.warnings.map((item) => `- ${item}`).join('\n')
    : '- none';
  const required = report.collections.required.map((item) => `- \`${item}\``).join('\n');
  const optional = report.collections.optional.map((item) => `- \`${item}\``).join('\n');
  const summary = report.summaries.import.map((item) => `- \`${item.name}\`: ${item.count}`).join('\n');

  return `# CloudBase Environment Import Readiness

Generated at: ${report.generated_at}

## Environment

- Project env: ${report.project_env || 'missing'}
- Input env: ${report.input_env || 'not provided'}
- Operator: ${report.operator || 'not provided'}

## Checks

${checks}

## Required Collections

${required}

## Optional Collections

${optional || '- none'}

## Import Package Summary

${summary || '- no summary available'}

## Warnings

${warnings}

## Result

- Ready for formal CloudBase import: ${report.ok ? 'YES' : 'NO'}
- Notes: This report validates the local import package and preparatory files only. It does not claim the target CloudBase environment has already been imported.
`;
}

function renderResultMarkdown(report) {
  const packageSummary = report.package_summary
    .map((item) => `- \`${item.name}\`: ${item.count}`)
    .join('\n');
  const runtimeValidation = report.runtime_validation;
  const runtimeSection = runtimeValidation
    ? `
## Runtime Validation

- Checked at: ${runtimeValidation.checked_at || 'PENDING'}
- Runtime env ID: ${runtimeValidation.env_id || 'PENDING'}
- Required collections readable: ${runtimeValidation.required_collections_readable ? 'YES' : 'NO'}
- Import baseline met: ${runtimeValidation.required_collection_baseline_met ? 'YES' : 'NO'}
- Matched required collections: ${runtimeValidation.matched_required_collection_count}/${runtimeValidation.required_collection_count}
- Missing required collections: ${runtimeValidation.missing_required_collections.length ? runtimeValidation.missing_required_collections.join(', ') : 'none'}
- Below import baseline: ${runtimeValidation.below_import_baseline.length ? runtimeValidation.below_import_baseline.join(', ') : 'none'}
- Functions match local source: ${runtimeValidation.functions_match ? 'YES' : 'NO'}
- Missing functions: ${runtimeValidation.missing_functions.length ? runtimeValidation.missing_functions.join(', ') : 'none'}
- Extra deployed functions: ${runtimeValidation.extra_functions.length ? runtimeValidation.extra_functions.join(', ') : 'none'}
- CloudRun services: ${runtimeValidation.cloudrun_service_count}
- Runtime status report: ${toMarkdownFileLink(runtimeStatusDocPath, 'CLOUDBASE_ENV_RUNTIME_STATUS.md')}

## Runtime Blockers

${runtimeValidation.blockers.length ? runtimeValidation.blockers.map((item) => `- ${item}`).join('\n') : '- none'}

## Runtime Warnings

${runtimeValidation.warnings.length ? runtimeValidation.warnings.map((item) => `- ${item}`).join('\n') : '- none'}
`
    : '';

  return `# CloudBase Environment Import Result

Generated at: ${report.generated_at}

## Environment

- Env ID: ${report.environment.env_id || 'PENDING'}
- Imported at: ${report.environment.imported_at || 'PENDING'}
- Operator: ${report.environment.operator || 'PENDING'}
- Import source: \`${report.environment.import_source}\`
- Seed summary source: [cloud-mp/cloudbase-import/_summary.json](C:\\Users\\21963\\WeChatProjects\\zz\\cloud-mp\\cloudbase-import\\_summary.json)
- Status: ${report.status}

## Package Summary

${packageSummary || '- no summary available'}

## Validation

- Import counts match _summary.json: ${report.validation.import_counts_match_summary}
- Users sample checked: ${report.validation.users_sample_checked}
- Products sample checked: ${report.validation.products_sample_checked}
- Orders sample checked: ${report.validation.orders_sample_checked}
- Mini program login smoke test: ${report.validation.mini_program_login_smoke_test}
- Product list smoke test: ${report.validation.product_list_smoke_test}
- Order list smoke test: ${report.validation.order_list_smoke_test}
- Admin login smoke test: ${report.validation.admin_login_smoke_test}
${runtimeSection}

## Rollback Baseline

- Legacy JSONL retained: ${report.rollback.legacy_jsonl_retained}
- cloudbase-seed retained: ${report.rollback.cloudbase_seed_retained}
- runtime overrides retained: ${report.rollback.runtime_overrides_retained}

## Follow-up

${report.follow_up.map((item) => `- ${item}`).join('\n')}

## Notes

This file is a draft unless the real target CloudBase import has been executed and the validation fields have been completed.
`;
}

function writeReadinessArtifacts(report) {
  writeJson(readinessJsonPath, report);
  writeText(readinessDocPath, renderReadinessMarkdown(report));
}

function writeResultArtifacts(report) {
  writeJson(resultJsonPath, report);
  writeText(resultDocPath, renderResultMarkdown(report));
}

module.exports = {
  readContext,
  buildReadinessReport,
  buildResultReport,
  writeReadinessArtifacts,
  writeResultArtifacts,
  readinessDocPath,
  readinessJsonPath,
  resultDocPath,
  resultJsonPath
};
