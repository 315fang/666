const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const seedRoot = path.join(projectRoot, 'cloudbase-seed');
const importRoot = path.join(projectRoot, 'cloudbase-import');

function exists(targetPath) {
  return fs.existsSync(targetPath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assert(checks, condition, name, detail) {
  checks.push({ ok: !!condition, name, detail });
}

function run() {
  const checks = [];

  const projectConfigPath = path.join(projectRoot, 'project.config.json');
  const packageJsonPath = path.join(projectRoot, 'package.json');
  const skillsPath = path.join(projectRoot, '.agents', 'skills', 'cloudbase', 'SKILL.md');
  const mcporterPath = path.join(workspaceRoot, 'config', 'mcporter.json');
  const seedSummaryPath = path.join(projectRoot, 'cloudbase-seed', '_summary.json');
  const importSummaryPath = path.join(projectRoot, 'cloudbase-import', '_summary.json');
  const docsPath = path.join(projectRoot, 'docs', 'CLOUDBASE_MIGRATION_PROGRESS.md');
  const adminUiPackagePath = path.join(projectRoot, 'admin-ui', 'package.json');
  const migrationMatrixPath = path.join(projectRoot, 'docs', 'CLOUD_MP_MIGRATION_MATRIX.md');
  const collectionContractPath = path.join(projectRoot, 'config', 'cloudbase-collection-contract.json');

  assert(checks, exists(projectConfigPath), 'project.config.json exists', projectConfigPath);
  assert(checks, exists(packageJsonPath), 'cloud-mp package.json exists', packageJsonPath);
  assert(checks, exists(skillsPath), 'CloudBase skill installed', skillsPath);
  assert(checks, exists(mcporterPath), 'mcporter config exists', mcporterPath);
  assert(checks, exists(seedSummaryPath), 'normalized seed exists', seedSummaryPath);
  assert(checks, exists(importSummaryPath), 'import package exists', importSummaryPath);
  assert(checks, exists(docsPath), 'migration progress doc exists', docsPath);
  assert(checks, exists(adminUiPackagePath), 'cloud-mp admin-ui exists', adminUiPackagePath);
  assert(checks, exists(migrationMatrixPath), 'migration matrix exists', migrationMatrixPath);
  assert(checks, exists(collectionContractPath), 'CloudBase collection contract exists', collectionContractPath);

  if (exists(projectConfigPath)) {
    const projectConfig = readJson(projectConfigPath);
    assert(checks, !!projectConfig.cloudbaseEnv, 'cloudbaseEnv configured', String(projectConfig.cloudbaseEnv || ''));
    assert(checks, projectConfig.cloudfunctionRoot === 'cloudfunctions/', 'cloudfunctionRoot configured', String(projectConfig.cloudfunctionRoot || ''));
    assert(checks, projectConfig.miniprogramRoot === 'miniprogram/', 'miniprogramRoot configured', String(projectConfig.miniprogramRoot || ''));
  }

  const requiredCloudFunctions = [
    'login',
    'user',
    'products',
    'cart',
    'order',
    'payment',
    'config',
    'distribution',
    'admin-api',
    'order-timeout-cancel',
    'commission-deadline-process',
    'order-auto-confirm'
  ];
  requiredCloudFunctions.forEach((name) => {
    const fnIndexPath = path.join(projectRoot, 'cloudfunctions', name, 'index.js');
    assert(checks, exists(fnIndexPath), `cloudfunction ${name} exists`, fnIndexPath);
  });

  if (exists(collectionContractPath)) {
    const contract = readJson(collectionContractPath);
    const defaultCollections = new Set((Array.isArray(contract.groups) ? contract.groups : [])
      .filter((group) => group.createByDefault !== false)
      .flatMap((group) => Array.isArray(group.collections) ? group.collections : []));
    [
      'product_bundles',
      'lottery_claims'
    ].forEach((name) => {
      assert(checks, defaultCollections.has(name), `default collection ${name} in contract`, name);
      assert(checks, exists(path.join(seedRoot, `${name}.json`)), `seed shell ${name} exists`, path.join(seedRoot, `${name}.json`));
      assert(checks, exists(path.join(importRoot, `${name}.jsonl`)), `import shell ${name} exists`, path.join(importRoot, `${name}.jsonl`));
    });
  }

  const failures = checks.filter((item) => !item.ok);
  const report = {
    ok: failures.length === 0,
    total: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    checks
  };

  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) process.exit(1);
}

run();
