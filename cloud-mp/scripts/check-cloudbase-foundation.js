const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');

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

  assert(checks, exists(projectConfigPath), 'project.config.json exists', projectConfigPath);
  assert(checks, exists(packageJsonPath), 'cloud-mp package.json exists', packageJsonPath);
  assert(checks, exists(skillsPath), 'CloudBase skill installed', skillsPath);
  assert(checks, exists(mcporterPath), 'mcporter config exists', mcporterPath);
  assert(checks, exists(seedSummaryPath), 'normalized seed exists', seedSummaryPath);
  assert(checks, exists(importSummaryPath), 'import package exists', importSummaryPath);
  assert(checks, exists(docsPath), 'migration progress doc exists', docsPath);

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
