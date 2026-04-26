'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getAuditArtifactPaths } = require('./lib/audit-output');

const projectRoot = path.resolve(__dirname, '..');
const {
  jsonPath: reportJsonPath,
  mdPath: reportMdPath
} = getAuditArtifactPaths(projectRoot, 'CLOUDBASE_SHORT_FILEID_REPAIR_REPORT');

const shouldApply = process.argv.includes('--apply');
const PAGE_SIZE = 200;
const MAX_REPORT_REFS_PER_DOC = 40;

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

function pickString(value, fallback = '') {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function getArgValue(name) {
  const prefix = `--${name}=`;
  const item = process.argv.find((arg) => String(arg || '').startsWith(prefix));
  return item ? item.slice(prefix.length).trim() : '';
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

function getAuthStatus() {
  return callMcporter('cloudbase.auth', { action: 'status' });
}

function listCollections() {
  const explicitCollections = pickString(getArgValue('collections'));
  if (explicitCollections) {
    return explicitCollections.split(',').map((item) => item.trim()).filter(Boolean).sort();
  }

  const response = callMcporter('cloudbase.readNoSqlDatabaseStructure', {
    action: 'listCollections',
    limit: 500
  });
  const rows = Array.isArray(response?.collections) ? response.collections : [];
  return rows.map((item) => pickString(item?.name || item)).filter(Boolean).sort();
}

function fetchCollectionDocs(collectionName) {
  const rows = [];
  let offset = 0;

  while (true) {
    const response = callMcporter('cloudbase.readNoSqlDatabaseContent', {
      collectionName,
      limit: PAGE_SIZE,
      offset
    });
    const list = Array.isArray(response?.data) ? response.data : [];
    rows.push(...list);
    offset += list.length;
    if (!list.length || list.length < PAGE_SIZE) break;
  }

  return rows;
}

function createQuery(doc = {}) {
  if (pickString(doc._id)) return { _id: pickString(doc._id) };
  if (doc.id !== undefined && doc.id !== null && doc.id !== '') return { id: doc.id };
  throw new Error('Document missing _id/id');
}

function updateDocument(collectionName, query, patch) {
  return callMcporter('cloudbase.writeNoSqlDatabaseContent', {
    action: 'update',
    collectionName,
    query,
    update: { $set: patch },
    isMulti: false,
    upsert: false
  });
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectFullBuckets(value, envId, counts) {
  if (typeof value === 'string') {
    const match = value.match(new RegExp(`^cloud://${escapeRegex(envId)}\\.([^/]+)/`, 'i'));
    if (match && match[1]) {
      counts.set(match[1], (counts.get(match[1]) || 0) + 1);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectFullBuckets(item, envId, counts));
    return;
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectFullBuckets(item, envId, counts));
  }
}

function inferBucket(collectionDocs, envId) {
  const explicitBucket = pickString(getArgValue('bucket') || process.env.CLOUDBASE_STORAGE_BUCKET);
  if (explicitBucket) return explicitBucket;

  const counts = new Map();
  collectionDocs.forEach((item) => {
    item.docs.forEach((doc) => collectFullBuckets(doc, envId, counts));
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([bucket]) => bucket)[0] || '';
}

function repairValue(value, context) {
  const { shortPrefix, fullPrefix, fieldPath } = context;

  if (typeof value === 'string') {
    if (value.startsWith(shortPrefix)) {
      const repaired = `${fullPrefix}${value.slice(shortPrefix.length)}`;
      return {
        changed: true,
        value: repaired,
        refs: [{
          field_path: fieldPath,
          before: value,
          after: repaired
        }]
      };
    }
    return { changed: false, value, refs: [] };
  }

  if (Array.isArray(value)) {
    let changed = false;
    const refs = [];
    const next = value.map((item, index) => {
      const result = repairValue(item, {
        ...context,
        fieldPath: `${fieldPath}.${index}`
      });
      if (result.changed) {
        changed = true;
        refs.push(...result.refs);
      }
      return result.value;
    });
    return { changed, value: changed ? next : value, refs };
  }

  if (value && typeof value === 'object') {
    let changed = false;
    const refs = [];
    const next = {};
    Object.entries(value).forEach(([key, item]) => {
      const result = repairValue(item, {
        ...context,
        fieldPath: fieldPath ? `${fieldPath}.${key}` : key
      });
      if (result.changed) {
        changed = true;
        refs.push(...result.refs);
      }
      next[key] = result.value;
    });
    return { changed, value: changed ? next : value, refs };
  }

  return { changed: false, value, refs: [] };
}

function buildPatch(doc, envId, bucket) {
  const shortPrefix = `cloud://${envId}/`;
  const fullPrefix = `cloud://${envId}.${bucket}/`;
  const patch = {};
  const refs = [];

  Object.entries(doc || {}).forEach(([key, value]) => {
    if (key === '_id') return;
    const result = repairValue(value, {
      shortPrefix,
      fullPrefix,
      fieldPath: key
    });
    if (!result.changed) return;
    patch[key] = result.value;
    refs.push(...result.refs);
  });

  if (!Object.keys(patch).length) return null;
  patch.updated_at = nowIso();

  return {
    patch,
    refs
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# CloudBase Short FileID Repair Report');
  lines.push('');
  lines.push(`- Executed at: ${report.executed_at}`);
  lines.push(`- Mode: ${report.mode}`);
  lines.push(`- Environment: ${report.environment.env_id || 'unknown'}`);
  lines.push(`- Bucket: ${report.environment.bucket || 'unknown'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Collections scanned: ${report.summary.collections_scanned}`);
  lines.push(`- Documents scanned: ${report.summary.documents_scanned}`);
  lines.push(`- Documents changed: ${report.summary.documents_changed}`);
  lines.push(`- FileIDs repaired: ${report.summary.fileids_repaired}`);
  lines.push(`- Failures: ${report.summary.failures}`);
  lines.push('');
  lines.push('## Per Collection');
  lines.push('');
  report.collections.forEach((item) => {
    lines.push(`- ${item.name}: scanned ${item.scanned}, changed ${item.changed}, repaired ${item.fileids_repaired}, failed ${item.failed}`);
  });
  lines.push('');
  lines.push('## Changed Records');
  lines.push('');
  if (!report.changed.length) {
    lines.push('- none');
  } else {
    report.changed.slice(0, 80).forEach((item) => {
      lines.push(`- [${item.collection}] id=${item.id || 'unknown'} | repaired=${item.fileids_repaired} | fields=${item.fields.join(', ')}`);
    });
  }
  lines.push('');
  lines.push('## Failures');
  lines.push('');
  if (!report.failures.length) {
    lines.push('- none');
  } else {
    report.failures.forEach((item) => {
      lines.push(`- [${item.collection}] id=${item.id || 'collection'} | ${item.error}`);
    });
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const auth = getAuthStatus();
  const envId = pickString(auth.current_env_id);
  if (!envId) {
    throw new Error('CloudBase env is not ready. Run cloudbase.auth action=status first.');
  }

  const collectionNames = listCollections();
  const collectionDocs = [];
  const loadFailures = [];

  for (const name of collectionNames) {
    try {
      collectionDocs.push({
        name,
        docs: fetchCollectionDocs(name)
      });
    } catch (error) {
      loadFailures.push({
        collection: name,
        id: '',
        error: error.message || String(error)
      });
    }
  }

  const bucket = inferBucket(collectionDocs, envId);
  if (!bucket) {
    throw new Error('Unable to infer CloudBase storage bucket. Pass --bucket=<bucket> and retry.');
  }

  const report = {
    kind: 'cloudbase_short_fileid_repair_report',
    executed_at: nowIso(),
    mode: shouldApply ? 'apply' : 'dry-run',
    environment: {
      env_id: envId,
      bucket,
      auth_status: pickString(auth.auth_status),
      env_status: pickString(auth.env_status)
    },
    summary: {
      collections_scanned: collectionDocs.length,
      documents_scanned: 0,
      documents_changed: 0,
      fileids_repaired: 0,
      failures: loadFailures.length
    },
    collections: [],
    changed: [],
    failures: [...loadFailures]
  };

  for (const item of collectionDocs) {
    const collectionSummary = {
      name: item.name,
      scanned: item.docs.length,
      changed: 0,
      fileids_repaired: 0,
      failed: 0
    };

    report.summary.documents_scanned += item.docs.length;

    for (const doc of item.docs) {
      const id = pickString(doc?._id || doc?.id || doc?._legacy_id);
      try {
        const result = buildPatch(doc, envId, bucket);
        if (!result) continue;

        if (shouldApply) {
          const writeResult = updateDocument(item.name, createQuery(doc), result.patch);
          if (writeResult && writeResult.success === false) {
            throw new Error('Database update returned non-success');
          }
        }

        collectionSummary.changed += 1;
        collectionSummary.fileids_repaired += result.refs.length;
        report.changed.push({
          collection: item.name,
          id,
          fileids_repaired: result.refs.length,
          fields: Array.from(new Set(result.refs.map((ref) => ref.field_path.split('.')[0]))),
          refs: result.refs.slice(0, MAX_REPORT_REFS_PER_DOC),
          patch: shouldApply ? undefined : result.patch
        });
      } catch (error) {
        collectionSummary.failed += 1;
        report.failures.push({
          collection: item.name,
          id,
          error: error.message || String(error)
        });
      }
    }

    report.collections.push(collectionSummary);
  }

  report.summary.documents_changed = report.collections.reduce((sum, item) => sum + item.changed, 0);
  report.summary.fileids_repaired = report.collections.reduce((sum, item) => sum + item.fileids_repaired, 0);
  report.summary.failures = report.failures.length;

  writeJson(reportJsonPath, report);
  writeText(reportMdPath, renderMarkdown(report));

  console.log(JSON.stringify({
    ok: report.summary.failures === 0,
    mode: report.mode,
    env_id: report.environment.env_id,
    bucket: report.environment.bucket,
    collections_scanned: report.summary.collections_scanned,
    documents_scanned: report.summary.documents_scanned,
    documents_changed: report.summary.documents_changed,
    fileids_repaired: report.summary.fileids_repaired,
    failures: report.summary.failures,
    report_json: path.relative(projectRoot, reportJsonPath),
    report_md: path.relative(projectRoot, reportMdPath)
  }, null, 2));

  if (report.summary.failures > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
