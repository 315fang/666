'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const docsRoot = path.join(projectRoot, 'docs');
const auditJsonPath = path.join(docsRoot, 'CLOUDBASE_ASSET_URL_AUDIT.json');
const reportJsonPath = path.join(docsRoot, 'CLOUDBASE_ASSET_URL_REPAIR_REPORT.json');
const reportMdPath = path.join(docsRoot, 'CLOUDBASE_ASSET_URL_REPAIR_REPORT.md');
const migrationTodoJsonPath = path.join(docsRoot, 'CLOUDBASE_ASSET_URL_MIGRATION_TODO.json');
const migrationTodoMdPath = path.join(docsRoot, 'CLOUDBASE_ASSET_URL_MIGRATION_TODO.md');

const shouldApply = process.argv.includes('--apply');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value, 'utf8');
}

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function pickString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function callMcporter(selector, payload) {
  const argPairs = Object.entries(payload || {}).map(([key, value]) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'object') {
      return `${key}="${JSON.stringify(value).replace(/"/g, '\\"')}"`;
    }
    return `${key}="${String(value).replace(/"/g, '\\"')}"`;
  }).filter(Boolean);

  const command = `npx mcporter call ${selector} ${argPairs.join(' ')} --output json`;
  try {
    const output = execSync(command, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return JSON.parse(output || '{}');
  } catch (error) {
    const detail = `${error?.stderr?.toString?.() || ''}\n${error?.stdout?.toString?.() || ''}`;
    const shouldFallback = /ERR_MODULE_NOT_FOUND|Cannot find package 'ora'/i.test(detail);
    if (!shouldFallback) {
      throw new Error(detail || `${selector} execution failed`);
    }
    const fallbackCommand = `npx --yes mcporter@latest call ${selector} ${argPairs.join(' ')} --output json`;
    const fallbackOutput = execSync(fallbackCommand, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return JSON.parse(fallbackOutput || '{}');
  }
}

function buildCleanupPatch(sample) {
  const patch = {
    updated_at: nowIso()
  };

  // For recoverable records, clear stale URL fields and keep file_id as source of truth.
  if (sample.collection === 'materials') {
    patch.url = '';
    patch.temp_url = '';
    patch.image_url = '';
  } else {
    patch.url = '';
    patch.image_url = '';
    patch.temp_url = '';
  }

  return patch;
}

function applyUpdate(collectionName, docId, patch) {
  return callMcporter('cloudbase.writeNoSqlDatabaseContent', {
    action: 'update',
    collectionName,
    query: { _id: docId },
    update: { $set: patch },
    isMulti: false,
    upsert: false
  });
}

function renderRepairReportMarkdown(report) {
  const lines = [];
  lines.push('# CloudBase Asset URL Repair Report');
  lines.push('');
  lines.push(`- Executed at: ${report.executed_at}`);
  lines.push(`- Mode: ${report.mode}`);
  lines.push(`- Source audit: ${report.source_audit}`);
  lines.push(`- Environment: ${report.environment.env_id || 'unknown'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- stale_url_but_recoverable candidates: ${report.summary.stale_candidates}`);
  lines.push(`- stale records updated: ${report.summary.stale_updated}`);
  lines.push(`- stale records failed: ${report.summary.stale_failed}`);
  lines.push(`- manual migration required: ${report.summary.manual_migration_required}`);
  lines.push('');

  lines.push('## Updated Records');
  lines.push('');
  if (!report.updated.length) {
    lines.push('- none');
  } else {
    report.updated.forEach((item) => {
      lines.push(`- [${item.collection}] id=${item.id} | ${item.ok ? 'OK' : `FAILED (${item.error || 'unknown'})`}`);
    });
  }

  lines.push('');
  lines.push('## Manual Migration Required');
  lines.push('');
  if (!report.manual_migration.length) {
    lines.push('- none');
  } else {
    report.manual_migration.forEach((item) => {
      lines.push(`- [${item.collection}] id=${item.id} | ${item.title || 'untitled'} | ${item.image_url || item.url || ''}`);
    });
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function renderMigrationTodoMarkdown(todo) {
  const lines = [];
  lines.push('# CloudBase Asset Migration TODO');
  lines.push('');
  lines.push(`- Generated at: ${todo.generated_at}`);
  lines.push(`- Environment: ${todo.environment.env_id || 'unknown'}`);
  lines.push(`- Records: ${todo.records.length}`);
  lines.push('');
  lines.push('## Required Actions');
  lines.push('');
  lines.push('1. Re-upload this asset in the admin material library so a cloud:// file_id is created.');
  lines.push('2. Backfill file_id for the related banner/splash record and clear legacy image_url/url fields.');
  lines.push('3. Run npm run audit:asset-urls again and verify http_url_without_file_id is zero.');
  lines.push('');
  lines.push('## Records');
  lines.push('');
  if (!todo.records.length) {
    lines.push('- none');
  } else {
    todo.records.forEach((item) => {
      lines.push(`- [${item.collection}] id=${item.id} | ${item.title || 'untitled'} | ${item.image_url || item.url || ''}`);
    });
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const audit = readJson(auditJsonPath);
  if (!audit || !Array.isArray(audit.samples)) {
    throw new Error('Missing docs/CLOUDBASE_ASSET_URL_AUDIT.json. Run npm run audit:asset-urls first.');
  }

  const staleCandidates = audit.samples.filter((item) => item.category === 'stale_url_but_recoverable');
  const manualMigration = audit.samples.filter((item) => item.category === 'http_url_without_file_id' || item.category === 'signed_url_without_file_id');

  const report = {
    kind: 'cloudbase_asset_url_repair_report',
    executed_at: nowIso(),
    mode: shouldApply ? 'apply' : 'dry-run',
    source_audit: path.relative(projectRoot, auditJsonPath),
    environment: {
      env_id: pickString(audit.environment?.env_id),
      auth_status: pickString(audit.environment?.auth_status),
      env_status: pickString(audit.environment?.env_status)
    },
    summary: {
      stale_candidates: staleCandidates.length,
      stale_updated: 0,
      stale_failed: 0,
      manual_migration_required: manualMigration.length
    },
    updated: [],
    manual_migration: manualMigration
  };

  if (shouldApply) {
    staleCandidates.forEach((item) => {
      const record = {
        collection: item.collection,
        id: item.id,
        ok: false,
        error: ''
      };
      try {
        const patch = buildCleanupPatch(item);
        const result = applyUpdate(item.collection, item.id, patch);
        record.ok = !!(result && result.success !== false);
        if (!record.ok) {
          record.error = 'writeNoSqlDatabaseContent returned non-success';
        }
      } catch (error) {
        record.ok = false;
        record.error = error.message || String(error);
      }
      report.updated.push(record);
    });
  } else {
    report.updated = staleCandidates.map((item) => ({
      collection: item.collection,
      id: item.id,
      ok: true,
      error: '',
      dry_run_patch: buildCleanupPatch(item)
    }));
  }

  report.summary.stale_updated = report.updated.filter((item) => item.ok).length;
  report.summary.stale_failed = report.updated.filter((item) => !item.ok).length;

  const migrationTodo = {
    kind: 'cloudbase_asset_migration_todo',
    generated_at: nowIso(),
    environment: report.environment,
    records: manualMigration
  };

  writeJson(reportJsonPath, report);
  writeText(reportMdPath, renderRepairReportMarkdown(report));
  writeJson(migrationTodoJsonPath, migrationTodo);
  writeText(migrationTodoMdPath, renderMigrationTodoMarkdown(migrationTodo));

  console.log(JSON.stringify({
    ok: report.summary.stale_failed === 0,
    mode: report.mode,
    stale_candidates: report.summary.stale_candidates,
    stale_updated: report.summary.stale_updated,
    stale_failed: report.summary.stale_failed,
    manual_migration_required: report.summary.manual_migration_required,
    report_json: path.relative(projectRoot, reportJsonPath),
    migration_todo_json: path.relative(projectRoot, migrationTodoJsonPath)
  }, null, 2));

  if (report.summary.stale_failed > 0) {
    process.exitCode = 1;
  }
}

main();
