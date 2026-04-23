'use strict';

const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const docsRoot = path.join(projectRoot, 'docs');
const reportJsonPath = path.join(docsRoot, 'CLOUDBASE_PRODUCT_IMAGE_FILEID_REPAIR_REPORT.json');
const reportMdPath = path.join(docsRoot, 'CLOUDBASE_PRODUCT_IMAGE_FILEID_REPAIR_REPORT.md');
const shouldApply = process.argv.includes('--apply');
const PAGE_SIZE = 200;

const TARGETS = [
  {
    collection: 'products',
    groups: [
      { kind: 'array', key: 'images' },
      { kind: 'array', key: 'detail_images' },
      { kind: 'array', key: 'preview_images' },
      { kind: 'array', key: 'preview_detail_images' },
      { kind: 'alias', keys: ['image', 'image_url', 'cover_image', 'coverImage', 'cover', 'cover_url', 'coverUrl'] }
    ],
    titleFields: ['name']
  },
  {
    collection: 'skus',
    groups: [
      { kind: 'array', key: 'images' },
      { kind: 'array', key: 'preview_images' },
      { kind: 'alias', keys: ['image', 'image_url', 'cover_image', 'coverImage'] }
    ],
    titleFields: ['name', 'sku_code', 'spec_value']
  }
];

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

function isCloudFileId(value) {
  return /^cloud:\/\//i.test(pickString(value));
}

function isTcbAssetUrl(value) {
  return /^https?:\/\/[^/]+\.tcb\.qcloud\.la\//i.test(pickString(value));
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const result = [];
  values.forEach((value) => {
    const text = pickString(value);
    if (!text || seen.has(text)) return;
    seen.add(text);
    result.push(text);
  });
  return result;
}

function toAssetArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    if (text.startsWith('[') && text.endsWith(']')) {
      try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (_) {
        return [text];
      }
    }
    return [text];
  }
  return [value];
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

function resolveDocId(doc = {}) {
  return pickString(doc._id || doc.id || doc._legacy_id);
}

function createQuery(doc = {}) {
  if (pickString(doc._id)) return { _id: pickString(doc._id) };
  if (pickString(doc.id)) return { id: doc.id };
  throw new Error('Document missing _id/id');
}

function pickTitle(doc = {}, fields = []) {
  const parts = (Array.isArray(fields) ? fields : [])
    .map((field) => pickString(doc[field]))
    .filter(Boolean)
    .slice(0, 3);
  return parts.join(' | ') || resolveDocId(doc);
}

function deriveCloudFileIdFromTcbUrl(rawUrl, envId) {
  const value = pickString(rawUrl);
  if (!isTcbAssetUrl(value)) return '';

  try {
    const parsed = new URL(value);
    const host = pickString(parsed.hostname);
    const bucket = host.replace(/\.tcb\.qcloud\.la$/i, '');
    const cloudPath = pickString(parsed.pathname).replace(/^\/+/, '');
    if (!bucket || !cloudPath) return '';
    return `cloud://${envId}.${bucket}/${cloudPath}`;
  } catch (_) {
    return '';
  }
}

function patchArrayField(doc, key, envId, changedUrls) {
  const currentList = toAssetArray(doc[key]);
  if (!currentList.length) return null;

  let changed = false;
  const nextList = currentList.map((entry) => {
    const raw = pickString(entry);
    if (!isTcbAssetUrl(raw)) return entry;
    const fileId = deriveCloudFileIdFromTcbUrl(raw, envId);
    if (!isCloudFileId(fileId)) return entry;
    changed = true;
    changedUrls.push(raw);
    return fileId;
  });

  if (!changed) return null;
  return nextList;
}

function patchAliasFields(doc, keys, envId, changedUrls) {
  const patch = {};
  let changed = false;

  keys.forEach((key) => {
    const raw = pickString(doc[key]);
    if (!isTcbAssetUrl(raw)) return;
    const fileId = deriveCloudFileIdFromTcbUrl(raw, envId);
    if (!isCloudFileId(fileId)) return;
    patch[key] = fileId;
    changedUrls.push(raw);
    changed = true;
  });

  return changed ? patch : null;
}

function buildPatch(target, doc, envId) {
  const patch = {};
  const changedUrls = [];

  target.groups.forEach((group) => {
    if (group.kind === 'array') {
      const nextList = patchArrayField(doc, group.key, envId, changedUrls);
      if (nextList) patch[group.key] = nextList;
      return;
    }

    if (group.kind === 'alias') {
      Object.assign(patch, patchAliasFields(doc, group.keys, envId, changedUrls) || {});
    }
  });

  if (!Object.keys(patch).length) return null;
  patch.updated_at = nowIso();
  return {
    patch,
    changed_urls: uniqueStrings(changedUrls)
  };
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

function renderMarkdown(report) {
  const lines = [];
  lines.push('# CloudBase Product Image FileId Repair Report');
  lines.push('');
  lines.push(`- Executed at: ${report.executed_at}`);
  lines.push(`- Mode: ${report.mode}`);
  lines.push(`- Environment: ${report.environment.env_id || 'unknown'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Scanned documents: ${report.summary.scanned_documents}`);
  lines.push(`- Changed documents: ${report.summary.changed_documents}`);
  lines.push(`- Failed documents: ${report.summary.failed_documents}`);
  lines.push(`- Repaired URLs: ${report.summary.repaired_urls}`);
  lines.push('');
  lines.push('## Per Collection');
  lines.push('');
  report.collections.forEach((item) => {
    lines.push(`### ${item.name}`);
    lines.push(`- scanned: ${item.scanned}`);
    lines.push(`- changed: ${item.changed}`);
    lines.push(`- failed: ${item.failed}`);
    lines.push('');
  });
  lines.push('## Changed Samples');
  lines.push('');
  if (!report.changed.length) {
    lines.push('- none');
  } else {
    report.changed.slice(0, 50).forEach((item) => {
      lines.push(`- [${item.collection}] id=${item.id} | ${item.title || 'untitled'} | repaired=${item.changed_urls.length}`);
    });
  }
  lines.push('');
  lines.push('## Failures');
  lines.push('');
  if (!report.failures.length) {
    lines.push('- none');
  } else {
    report.failures.forEach((item) => {
      lines.push(`- [${item.collection}] id=${item.id} | ${item.error}`);
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

  const report = {
    kind: 'cloudbase_product_image_fileid_repair_report',
    executed_at: nowIso(),
    mode: shouldApply ? 'apply' : 'dry-run',
    environment: {
      env_id: envId,
      auth_status: pickString(auth.auth_status),
      env_status: pickString(auth.env_status)
    },
    summary: {
      scanned_documents: 0,
      changed_documents: 0,
      failed_documents: 0,
      repaired_urls: 0
    },
    collections: [],
    changed: [],
    failures: []
  };

  for (const target of TARGETS) {
    const docs = fetchCollectionDocs(target.collection);
    const collectionSummary = {
      name: target.collection,
      scanned: docs.length,
      changed: 0,
      failed: 0
    };

    report.summary.scanned_documents += docs.length;

    for (const doc of docs) {
      try {
        const result = buildPatch(target, doc, envId);
        if (!result) continue;

        if (shouldApply) {
          const writeResult = updateDocument(target.collection, createQuery(doc), result.patch);
          if (writeResult && writeResult.success === false) {
            throw new Error('Database update returned non-success');
          }
        }

        collectionSummary.changed += 1;
        report.summary.repaired_urls += result.changed_urls.length;
        report.changed.push({
          collection: target.collection,
          id: resolveDocId(doc),
          title: pickTitle(doc, target.titleFields),
          changed_urls: result.changed_urls,
          patch: shouldApply ? undefined : result.patch
        });
      } catch (error) {
        collectionSummary.failed += 1;
        report.failures.push({
          collection: target.collection,
          id: resolveDocId(doc),
          title: pickTitle(doc, target.titleFields),
          error: error.message || String(error)
        });
      }
    }

    report.collections.push(collectionSummary);
  }

  report.summary.changed_documents = report.collections.reduce((sum, item) => sum + item.changed, 0);
  report.summary.failed_documents = report.collections.reduce((sum, item) => sum + item.failed, 0);

  writeJson(reportJsonPath, report);
  writeText(reportMdPath, renderMarkdown(report));

  console.log(JSON.stringify({
    ok: report.summary.failed_documents === 0,
    mode: report.mode,
    scanned_documents: report.summary.scanned_documents,
    changed_documents: report.summary.changed_documents,
    failed_documents: report.summary.failed_documents,
    repaired_urls: report.summary.repaired_urls,
    report_json: path.relative(projectRoot, reportJsonPath),
    report_md: path.relative(projectRoot, reportMdPath)
  }, null, 2));

  if (report.summary.failed_documents > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
