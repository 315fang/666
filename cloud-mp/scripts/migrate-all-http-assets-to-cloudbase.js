'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const docsRoot = path.join(projectRoot, 'docs');
const reportJsonPath = path.join(docsRoot, 'CLOUDBASE_ALL_ASSET_MIGRATION_REPORT.json');
const reportMdPath = path.join(docsRoot, 'CLOUDBASE_ALL_ASSET_MIGRATION_REPORT.md');
const shouldApply = process.argv.includes('--apply');
const MAX_REDIRECTS = 5;
const PAGE_SIZE = 200;

const TARGET_COLLECTIONS = [
  {
    name: 'banners',
    titleFields: ['title', 'name', 'position'],
    groups: [
      { kind: 'alias', keys: ['file_id', 'image_url', 'url', 'image', 'cover_image', 'coverImage'] }
    ]
  },
  {
    name: 'splash_screens',
    titleFields: ['title', 'name'],
    groups: [
      { kind: 'alias', keys: ['file_id', 'image_url', 'url', 'image', 'cover_image', 'coverImage'] }
    ]
  },
  {
    name: 'materials',
    titleFields: ['title', 'name', 'type'],
    groups: [
      { kind: 'alias', keys: ['file_id', 'url', 'image_url', 'temp_url'] }
    ]
  },
  {
    name: 'products',
    titleFields: ['name'],
    groups: [
      { kind: 'array', key: 'images' },
      { kind: 'array', key: 'detail_images' },
      { kind: 'alias', keys: ['file_id', 'image_url', 'image', 'cover_image', 'coverImage'] }
    ]
  },
  {
    name: 'skus',
    titleFields: ['sku_code', 'spec_name', 'spec_value'],
    groups: [
      { kind: 'alias', keys: ['file_id', 'image', 'image_url', 'cover_image'] }
    ]
  },
  {
    name: 'users',
    titleFields: ['nickname', 'nickName', 'member_no'],
    groups: [
      { kind: 'alias', keys: ['avatarUrl', 'avatar_url', 'avatar'] }
    ]
  },
  {
    name: 'reviews',
    titleFields: ['content', 'product_name'],
    groups: [
      { kind: 'array', key: 'images' }
    ]
  },
  {
    name: 'brand_news',
    titleFields: ['title'],
    groups: [
      { kind: 'alias', keys: ['cover_image', 'image_url', 'image'] }
    ]
  },
  {
    name: 'lottery_prizes',
    titleFields: ['name'],
    groups: [
      { kind: 'alias', keys: ['file_id', 'image_url', 'image', 'cover_image'] }
    ]
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

function isHttpUrl(value) {
  return /^https?:\/\//i.test(pickString(value));
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const out = [];
  values.forEach((value) => {
    const text = pickString(value);
    if (!text || seen.has(text)) return;
    seen.add(text);
    out.push(text);
  });
  return out;
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

function sanitizePathSegment(value, fallback = 'item') {
  const base = pickString(value, fallback).toLowerCase();
  const safe = base.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe || fallback;
}

function extFromUrl(rawUrl) {
  try {
    const urlObj = new URL(rawUrl);
    const ext = path.extname(urlObj.pathname || '').toLowerCase();
    if (ext) return ext;
  } catch (_) {
    // ignore
  }
  return '.jpg';
}

function hashShort(input) {
  return crypto.createHash('md5').update(String(input || '')).digest('hex').slice(0, 10);
}

function buildCloudPath(collectionName, docId, sourceUrl) {
  const collection = sanitizePathSegment(collectionName, 'assets');
  const id = sanitizePathSegment(docId, hashShort(sourceUrl));
  const ext = extFromUrl(sourceUrl);
  return `materials/migrated/${collection}/${id}-${hashShort(sourceUrl)}${ext}`;
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

function pickTitle(doc = {}, fields = []) {
  const parts = fields.map((field) => pickString(doc[field])).filter(Boolean).slice(0, 3);
  return parts.join(' | ') || resolveDocId(doc);
}

function buildRecordList() {
  const records = [];
  TARGET_COLLECTIONS.forEach((config) => {
    const docs = fetchCollectionDocs(config.name);
    docs.forEach((doc) => {
      records.push({
        collection: config.name,
        title: pickTitle(doc, config.titleFields),
        id: resolveDocId(doc),
        doc,
        config
      });
    });
  });
  return records;
}

function createQuery(doc = {}) {
  if (pickString(doc._id)) return { _id: pickString(doc._id) };
  if (pickString(doc.id)) return { id: doc.id };
  throw new Error('Document missing _id/id');
}

function getFileNameFromUrl(url, mimeType) {
  try {
    const parsed = new URL(url);
    const baseName = path.basename(decodeURIComponent(parsed.pathname || ''));
    if (baseName && baseName !== '/' && path.extname(baseName)) return baseName;
  } catch (_) {
    // ignore
  }
  const ext = path.extname(url || '') || (mimeType && mimeType.includes('png') ? '.png' : '.jpg');
  return `${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
}

async function downloadRemoteBuffer(url, redirectCount = 0) {
  if (redirectCount > MAX_REDIRECTS) {
    throw new Error('远程文件重定向次数过多');
  }
  return new Promise((resolve, reject) => {
    const transport = /^https:/i.test(url) ? https : http;
    const request = transport.get(url, {
      headers: {
        'User-Agent': 'cloud-mp-all-asset-migrator/1.0',
        Accept: '*/*'
      }
    }, (response) => {
      const statusCode = Number(response.statusCode || 0);
      if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location) {
        response.resume();
        const nextUrl = new URL(response.headers.location, url).toString();
        resolve(downloadRemoteBuffer(nextUrl, redirectCount + 1));
        return;
      }
      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`下载失败，状态码 ${statusCode || 'unknown'}`));
        return;
      }

      const chunks = [];
      let total = 0;
      response.on('data', (chunk) => {
        total += chunk.length;
        if (total > 20 * 1024 * 1024) {
          request.destroy(new Error('远程文件超过 20MB 限制'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const mimeType = pickString(response.headers['content-type']).split(';')[0].trim() || 'application/octet-stream';
        resolve({
          buffer: Buffer.concat(chunks),
          mimeType,
          fileName: getFileNameFromUrl(url, mimeType)
        });
      });
    });

    request.setTimeout(30000, () => request.destroy(new Error(`下载远程文件超时: ${url}`)));
    request.on('error', reject);
  });
}

function uploadToCloudStorage(localPath, cloudPath) {
  return callMcporter('cloudbase.manageStorage', {
    action: 'upload',
    localPath,
    cloudPath,
    force: true
  });
}

async function ensureCloudFileId(sourceUrl, collectionName, docId, envId, tempDir, uploadCache) {
  if (!isHttpUrl(sourceUrl)) return pickString(sourceUrl);
  const cached = uploadCache.get(sourceUrl);
  if (cached) return cached;

  const cloudPath = buildCloudPath(collectionName, docId, sourceUrl);
  if (!shouldApply) {
    const dryRunFileId = `cloud://${envId}/${cloudPath}`;
    uploadCache.set(sourceUrl, dryRunFileId);
    return dryRunFileId;
  }

  const remote = await downloadRemoteBuffer(sourceUrl);
  const fileName = `${sanitizePathSegment(collectionName)}-${sanitizePathSegment(docId)}-${hashShort(sourceUrl)}${path.extname(remote.fileName || '') || extFromUrl(sourceUrl)}`;
  const localPath = path.join(tempDir, fileName);
  fs.writeFileSync(localPath, remote.buffer);

  const uploadResult = uploadToCloudStorage(localPath, cloudPath);
  const fileId = pickString(uploadResult?.fileID || uploadResult?.fileId || uploadResult?.file_id || `cloud://${envId}/${cloudPath}`);
  if (!isCloudFileId(fileId)) {
    throw new Error(`上传 CloudBase 成功但未返回 file_id: ${sourceUrl}`);
  }
  uploadCache.set(sourceUrl, fileId);
  return fileId;
}

async function migrateAliasGroup(doc, group, context) {
  const values = group.keys.map((key) => pickString(doc[key])).filter(Boolean);
  const currentCloudId = values.find(isCloudFileId);
  const sourceUrl = values.find(isHttpUrl);
  if (!currentCloudId && !sourceUrl) return null;

  const cloudFileId = currentCloudId || await ensureCloudFileId(sourceUrl, context.collection, context.docId, context.envId, context.tempDir, context.uploadCache);
  const patch = {};
  group.keys.forEach((key) => {
    patch[key] = cloudFileId;
  });
  return {
    patch,
    migratedUrls: sourceUrl ? [sourceUrl] : []
  };
}

async function migrateArrayField(doc, group, context) {
  const list = toAssetArray(doc[group.key]);
  if (!list.length) return null;

  let changed = false;
  const migratedUrls = [];
  const nextList = [];
  for (const entry of list) {
    const raw = pickString(entry);
    if (isHttpUrl(raw)) {
      const cloudFileId = await ensureCloudFileId(raw, context.collection, context.docId, context.envId, context.tempDir, context.uploadCache);
      nextList.push(cloudFileId);
      migratedUrls.push(raw);
      changed = true;
    } else {
      nextList.push(entry);
    }
  }

  if (!changed) return null;
  return {
    patch: { [group.key]: nextList },
    migratedUrls
  };
}

async function buildPatch(record, context) {
  const { doc, config } = record;
  const patch = {};
  const migratedUrls = [];

  for (const group of config.groups) {
    const result = group.kind === 'array'
      ? await migrateArrayField(doc, group, context)
      : await migrateAliasGroup(doc, group, context);
    if (!result) continue;
    Object.assign(patch, result.patch);
    migratedUrls.push(...result.migratedUrls);
  }

  if (!Object.keys(patch).length) return null;
  patch.updated_at = nowIso();
  return {
    patch,
    migratedUrls: uniqueStrings(migratedUrls)
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
  lines.push('# CloudBase All Asset Migration Report');
  lines.push('');
  lines.push(`- Executed at: ${report.executed_at}`);
  lines.push(`- Mode: ${report.mode}`);
  lines.push(`- Environment: ${report.environment.env_id || 'unknown'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Scanned records: ${report.summary.scanned_records}`);
  lines.push(`- Changed records: ${report.summary.changed_records}`);
  lines.push(`- Failed records: ${report.summary.failed_records}`);
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
  lines.push('## Failures');
  lines.push('');
  if (!report.failures.length) {
    lines.push('- none');
  } else {
    report.failures.forEach((item) => {
      lines.push(`- [${item.collection}] id=${item.id} | ${item.error}`);
    });
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const auth = getAuthStatus();
  const envId = pickString(auth.current_env_id);
  if (!envId) {
    throw new Error('CloudBase env is not ready. Run cloudbase.auth action=status first.');
  }

  const report = {
    kind: 'cloudbase_all_asset_migration_report',
    executed_at: nowIso(),
    mode: shouldApply ? 'apply' : 'dry-run',
    environment: {
      env_id: envId,
      auth_status: pickString(auth.auth_status),
      env_status: pickString(auth.env_status)
    },
    summary: {
      scanned_records: 0,
      changed_records: 0,
      failed_records: 0
    },
    collections: [],
    failures: []
  };

  const records = buildRecordList();
  report.summary.scanned_records = records.length;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-mp-all-asset-migrate-'));
  const uploadCache = new Map();

  try {
    for (const target of TARGET_COLLECTIONS) {
      const collectionRecords = records.filter((item) => item.collection === target.name);
      const collectionSummary = { name: target.name, scanned: collectionRecords.length, changed: 0, failed: 0 };
      for (const record of collectionRecords) {
        try {
          const patchPayload = await buildPatch(record, {
            collection: record.collection,
            docId: record.id,
            envId,
            tempDir,
            uploadCache
          });
          if (!patchPayload) continue;
          if (shouldApply) {
            const result = updateDocument(record.collection, createQuery(record.doc), patchPayload.patch);
            if (result && result.success === false) {
              throw new Error('数据库回写失败');
            }
          }
          collectionSummary.changed += 1;
        } catch (error) {
          collectionSummary.failed += 1;
          report.failures.push({
            collection: record.collection,
            id: record.id,
            title: record.title,
            error: error.message || String(error)
          });
        }
      }
      report.collections.push(collectionSummary);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  report.summary.changed_records = report.collections.reduce((sum, item) => sum + item.changed, 0);
  report.summary.failed_records = report.collections.reduce((sum, item) => sum + item.failed, 0);

  writeJson(reportJsonPath, report);
  writeText(reportMdPath, renderMarkdown(report));

  console.log(JSON.stringify({
    ok: report.summary.failed_records === 0,
    mode: report.mode,
    scanned_records: report.summary.scanned_records,
    changed_records: report.summary.changed_records,
    failed_records: report.summary.failed_records,
    report_json: path.relative(projectRoot, reportJsonPath),
    report_md: path.relative(projectRoot, reportMdPath)
  }, null, 2));

  if (report.summary.failed_records > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
