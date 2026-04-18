'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const {
  runtimeFile,
  readJson,
  writeJson,
  writeText,
  nowIso
} = require('./release-runtime-kit');

const SAMPLE_COLLECTIONS = ['admins', 'orders'];

function runMcporterCall(toolName, payload) {
  const args = Object.entries(payload || {}).map(([key, value]) => {
    if (value === undefined || value === null || value === '') return null;
    const normalized = typeof value === 'string'
      ? `"${String(value).replace(/"/g, '\\"')}"`
      : String(value);
    return `${key}=${normalized}`;
  }).filter(Boolean);
  const command = `npx mcporter call cloudbase.${toolName} ${args.join(' ')} --output json`;
  try {
    const output = execSync(command, {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return JSON.parse(output || '{}');
  } catch (error) {
    const stderr = error?.stderr?.toString?.() || '';
    const stdout = error?.stdout?.toString?.() || '';
    throw new Error(stderr || stdout || `mcporter call cloudbase.${toolName} failed`);
  }
}

function checkStorageObject(cloudPath) {
  return runMcporterCall('queryStorage', {
    action: 'info',
    cloudPath
  });
}

function downloadStorageObject(cloudPath, outputPath) {
  return runMcporterCall('manageStorage', {
    action: 'download',
    localPath: outputPath,
    cloudPath
  });
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Daily Backup Verification');
  lines.push('');
  lines.push(`- Executed at: ${report.executed_at}`);
  lines.push(`- Backup generated at: ${report.backup_generated_at || 'unknown'}`);
  lines.push(`- Status: ${report.status}`);
  lines.push(`- Storage prefix: \`${report.storage_prefix || ''}\``);
  lines.push('');
  lines.push('## Checked Objects');
  lines.push('');
  report.checked_objects.forEach((item) => {
    lines.push(`- \`${item.key}\`: ${item.ok ? 'OK' : `FAIL (${item.message})`}`);
  });
  lines.push('');
  lines.push('## Sample Collections');
  lines.push('');
  report.sample_restore_checks.forEach((item) => {
    lines.push(`- \`${item.collection}\`: ${item.ok ? `OK (${item.sample_rows} sample rows)` : `FAIL (${item.message})`}`);
  });
  lines.push('');
  lines.push('## Errors');
  lines.push('');
  if (report.errors.length) {
    report.errors.forEach((item) => lines.push(`- ${item}`));
  } else {
    lines.push('- none');
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const manifest = readJson(runtimeFile('backup-latest.json'));
  if (!manifest || !manifest.storage_prefix) {
    throw new Error('未找到 backup-latest.json 或其中缺少 storage_prefix，请先执行 npm run backup:daily');
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-mp-backup-verify-'));
  const report = {
    executed_at: nowIso(),
    backup_generated_at: manifest.generated_at || '',
    env_id: manifest.env_id || '',
    storage_prefix: manifest.storage_prefix || '',
    status: 'success',
    checked_objects: [],
    sample_restore_checks: [],
    errors: []
  };

  try {
    const manifestKey = `${manifest.storage_prefix}/backup-manifest.json`;
    const summaryKey = `${manifest.storage_prefix}/_summary.json`;
    for (const key of [manifestKey, summaryKey]) {
      try {
        checkStorageObject(key);
        report.checked_objects.push({ key, ok: true, message: '' });
      } catch (error) {
        report.status = 'failure';
        report.checked_objects.push({ key, ok: false, message: error.message || String(error) });
        report.errors.push(`Object missing: ${key}`);
      }
    }

    const sampleCollections = manifest.collections
      .filter((item) => SAMPLE_COLLECTIONS.includes(item.collection))
      .slice(0, SAMPLE_COLLECTIONS.length);

    for (const sample of sampleCollections) {
      const outputPath = path.join(tempRoot, `${sample.collection}.jsonl`);
      try {
        downloadStorageObject(sample.object_key, outputPath);
        const lines = fs.readFileSync(outputPath, 'utf8').split(/\r?\n/).filter(Boolean);
        lines.slice(0, 3).forEach((line) => JSON.parse(line));
        report.sample_restore_checks.push({
          collection: sample.collection,
          ok: true,
          sample_rows: Math.min(lines.length, 3),
          message: ''
        });
      } catch (error) {
        report.status = 'failure';
        report.sample_restore_checks.push({
          collection: sample.collection,
          ok: false,
          sample_rows: 0,
          message: error.message || String(error)
        });
        report.errors.push(`Sample restore failed: ${sample.collection}`);
      }
    }

    writeJson(runtimeFile('backup-verify-latest.json'), report);
    writeText(runtimeFile('backup-verify-latest.md'), renderMarkdown(report));
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'success') process.exitCode = 1;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const report = {
    executed_at: nowIso(),
    backup_generated_at: '',
    env_id: '',
    storage_prefix: '',
    status: 'failure',
    checked_objects: [],
    sample_restore_checks: [],
    errors: [error.message || String(error)]
  };
  writeJson(runtimeFile('backup-verify-latest.json'), report);
  writeText(runtimeFile('backup-verify-latest.md'), renderMarkdown(report));
  console.error(error && error.stack || error);
  process.exit(1);
});
