'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');
const { execSync } = require('child_process');
const {
  getAuditArtifactPaths,
  resolveAuditInputPath
} = require('./lib/audit-output');

const projectRoot = path.resolve(__dirname, '..');
const auditJsonPath = resolveAuditInputPath(projectRoot, 'CLOUDBASE_ASSET_URL_AUDIT.json');
const {
  jsonPath: reportJsonPath,
  mdPath: reportMdPath
} = getAuditArtifactPaths(projectRoot, 'CLOUDBASE_ASSET_RISK_MIGRATION_REPORT');

const shouldApply = process.argv.includes('--apply');
const MAX_REDIRECTS = 5;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

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

function hashShort(value) {
  return crypto.createHash('md5').update(String(value || '')).digest('hex').slice(0, 12);
}

function extFromUrl(rawUrl, mimeType = '') {
  try {
    const parsed = new URL(rawUrl);
    const ext = path.extname(parsed.pathname || '').toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'].includes(ext)) return ext;
  } catch (_) {
    // ignore
  }
  const normalizedMime = pickString(mimeType).split(';')[0].toLowerCase();
  if (normalizedMime.includes('png')) return '.png';
  if (normalizedMime.includes('webp')) return '.webp';
  if (normalizedMime.includes('gif')) return '.gif';
  if (normalizedMime.includes('avif')) return '.avif';
  return '.jpg';
}

function sanitizePathSegment(value, fallback = 'asset') {
  const safe = pickString(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe || fallback;
}

function buildCloudPath(sample, sourceUrl, mimeType = '') {
  const collection = sanitizePathSegment(sample.collection, 'assets');
  const id = sanitizePathSegment(sample.id || sample.doc_id, hashShort(sourceUrl));
  const ext = extFromUrl(sourceUrl, mimeType);
  return `materials/migrated/audit/${collection}/${id}-${hashShort(sourceUrl)}${ext}`;
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return value;
  if (text[0] !== '[' && text[0] !== '{') return value;
  try {
    return JSON.parse(text);
  } catch (_) {
    return value;
  }
}

function toArray(value) {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed;
  if (parsed === undefined || parsed === null || parsed === '') return [];
  return [parsed];
}

function normalizeDocId(doc = {}) {
  return pickString(doc._id || doc.id || doc._legacy_id);
}

function callMcporter(selector, payload) {
  const args = Object.entries(payload || {}).map(([key, value]) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'object') {
      return `${key}="${JSON.stringify(value).replace(/"/g, '\\"')}"`;
    }
    return `${key}="${String(value).replace(/"/g, '\\"')}"`;
  }).filter(Boolean);

  const command = `npx mcporter call ${selector} ${args.join(' ')} --output json`;
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
      throw new Error(detail || `${selector} failed`);
    }
    const fallbackCommand = `npx --yes mcporter@latest call ${selector} ${args.join(' ')} --output json`;
    const fallbackOutput = execSync(fallbackCommand, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return JSON.parse(fallbackOutput || '{}');
  }
}

function readCollectionDoc(collectionName, sample) {
  const query = pickString(sample.doc_id)
    ? { _id: pickString(sample.doc_id) }
    : { _id: pickString(sample.id) };
  let response = callMcporter('cloudbase.readNoSqlDatabaseContent', {
    collectionName,
    query,
    limit: 1,
    offset: 0
  });
  let rows = Array.isArray(response?.data) ? response.data : [];
  if (rows[0]) return rows[0];

  if (pickString(sample.id)) {
    response = callMcporter('cloudbase.readNoSqlDatabaseContent', {
      collectionName,
      query: { id: /^\d+$/.test(String(sample.id)) ? Number(sample.id) : sample.id },
      limit: 1,
      offset: 0
    });
    rows = Array.isArray(response?.data) ? response.data : [];
  }
  return rows[0] || null;
}

function readSingletonDoc(singletonKey) {
  const response = callMcporter('cloudbase.readNoSqlDatabaseContent', {
    collectionName: 'admin_singletons',
    query: { key: singletonKey },
    limit: 1,
    offset: 0
  });
  const rows = Array.isArray(response?.data) ? response.data : [];
  return rows[0] || null;
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

function downloadRemoteBuffer(rawUrl, redirectCount = 0) {
  if (redirectCount > MAX_REDIRECTS) {
    return Promise.reject(new Error('too many redirects'));
  }
  return new Promise((resolve, reject) => {
    const transport = /^https:/i.test(rawUrl) ? https : http;
    const request = transport.get(rawUrl, {
      headers: {
        'User-Agent': 'cloud-mp-audited-asset-migrator/1.0',
        Accept: 'image/*,*/*;q=0.8'
      }
    }, (response) => {
      const statusCode = Number(response.statusCode || 0);
      if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location) {
        response.resume();
        const nextUrl = new URL(response.headers.location, rawUrl).toString();
        resolve(downloadRemoteBuffer(nextUrl, redirectCount + 1));
        return;
      }
      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`download failed with HTTP ${statusCode || 'unknown'}`));
        return;
      }

      const chunks = [];
      let total = 0;
      response.on('data', (chunk) => {
        total += chunk.length;
        if (total > MAX_FILE_BYTES) {
          request.destroy(new Error('remote file exceeds 20MB'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          mimeType: pickString(response.headers['content-type']).split(';')[0] || 'application/octet-stream'
        });
      });
    });
    request.setTimeout(30000, () => request.destroy(new Error('download timeout')));
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

function buildFileIdFromTemporaryUrl(temporaryUrl, envId) {
  const rawUrl = pickString(temporaryUrl);
  const rawEnvId = pickString(envId);
  if (!rawUrl || !rawEnvId) return '';
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const suffix = '.tcb.qcloud.la';
    if (!host.endsWith(suffix)) return '';
    const bucket = host.slice(0, -suffix.length);
    const pathname = decodeURIComponent(parsed.pathname || '').replace(/^\/+/, '');
    if (!bucket || !pathname) return '';
    return `cloud://${rawEnvId}.${bucket}/${pathname}`;
  } catch (_) {
    return '';
  }
}

function extractFileId(uploadResult, envId) {
  const direct = pickString(
    uploadResult?.fileID
    || uploadResult?.fileId
    || uploadResult?.file_id
    || uploadResult?.data?.fileID
    || uploadResult?.data?.fileId
    || uploadResult?.data?.file_id
  );
  if (direct) return direct;
  return buildFileIdFromTemporaryUrl(uploadResult?.data?.temporaryUrl || uploadResult?.temporaryUrl, envId);
}

async function ensureUploaded(sourceUrl, sample, context) {
  if (!isHttpUrl(sourceUrl)) return pickString(sourceUrl);
  if (context.uploadCache.has(sourceUrl)) return context.uploadCache.get(sourceUrl);

  const dryRunFileId = `cloud://${context.envId}/${buildCloudPath(sample, sourceUrl)}`;
  if (!shouldApply) {
    context.uploadCache.set(sourceUrl, dryRunFileId);
    return dryRunFileId;
  }

  const remote = await downloadRemoteBuffer(sourceUrl);
  const cloudPath = buildCloudPath(sample, sourceUrl, remote.mimeType);
  const localPath = path.join(
    context.tempDir,
    `${sanitizePathSegment(sample.collection)}-${sanitizePathSegment(sample.id)}-${hashShort(sourceUrl)}${extFromUrl(sourceUrl, remote.mimeType)}`
  );
  fs.writeFileSync(localPath, remote.buffer);
  const uploadResult = uploadToCloudStorage(localPath, cloudPath);
  const fileId = extractFileId(uploadResult, context.envId);
  if (!isCloudFileId(fileId)) {
    throw new Error(`upload did not return a cloud:// file_id for ${sourceUrl}`);
  }
  context.uploadCache.set(sourceUrl, fileId);
  return fileId;
}

function replaceExactAsset(value, replacements) {
  const text = pickString(value);
  return replacements.get(text) || value;
}

function buildProductPatch(doc, replacements) {
  const patch = {};
  ['images', 'preview_images', 'detail_images', 'preview_detail_images'].forEach((field) => {
    const current = toArray(doc[field]);
    if (!current.length) return;
    let changed = false;
    const next = current.map((item) => {
      const replaced = replaceExactAsset(item, replacements);
      if (replaced !== item) changed = true;
      return replaced;
    });
    if (changed) patch[field] = next;
  });

  ['cover_image', 'image_url', 'image'].forEach((field) => {
    const current = pickString(doc[field]);
    if (!current) return;
    const next = replacements.get(current);
    if (next) patch[field] = next;
  });

  const firstImage = Array.isArray(patch.images)
    ? patch.images.find(isCloudFileId)
    : toArray(doc.images).find(isCloudFileId);
  if (!isCloudFileId(doc.file_id) && isCloudFileId(firstImage)) {
    patch.file_id = firstImage;
  }
  if (Object.keys(patch).length) patch.updated_at = nowIso();
  return patch;
}

function collectCurrentProductAssetUrls(doc = {}) {
  const values = [];
  ['images', 'preview_images', 'detail_images', 'preview_detail_images'].forEach((field) => {
    values.push(...toArray(doc[field]).map((item) => pickString(item)).filter(Boolean));
  });
  ['cover_image', 'image_url', 'image'].forEach((field) => {
    const value = pickString(doc[field]);
    if (value) values.push(value);
  });
  return new Set(values);
}

async function migrateProductSamples(samples, context, report) {
  const byDoc = new Map();
  samples.forEach((sample) => {
    const key = pickString(sample.doc_id || sample.id);
    if (!key) return;
    if (!byDoc.has(key)) byDoc.set(key, []);
    byDoc.get(key).push(sample);
  });

  for (const [docKey, docSamples] of byDoc.entries()) {
    const record = {
      collection: 'products',
      id: docKey,
      title: pickString(docSamples[0]?.title),
      ok: false,
      changed: false,
      uploaded: [],
      error: ''
    };
    try {
      const doc = readCollectionDoc('products', docSamples[0]);
      if (!doc) throw new Error('product document not found');
      const currentAssets = collectCurrentProductAssetUrls(doc);
      const riskyUrls = [...new Set(docSamples
        .map((item) => pickString(item.asset_value))
        .filter((url) => isHttpUrl(url) && currentAssets.has(url)))];
      const replacements = new Map();
      for (const url of riskyUrls) {
        const fileId = await ensureUploaded(url, docSamples[0], context);
        replacements.set(url, fileId);
        record.uploaded.push({ source_url: url, file_id: fileId });
      }
      const patch = buildProductPatch(doc, replacements);
      record.patch = patch;
      record.changed = Object.keys(patch).length > 0;
      if (shouldApply && record.changed) {
        const query = pickString(doc._id)
          ? { _id: pickString(doc._id) }
          : { id: doc.id };
        const result = updateDocument('products', query, patch);
        if (result && result.success === false) throw new Error('product update returned non-success');
      }
      record.ok = true;
    } catch (error) {
      record.ok = false;
      record.error = error.message || String(error);
    }
    report.results.push(record);
  }
}

async function migrateSingletonSample(sample, context) {
  const record = {
    collection: 'admin_singletons',
    id: pickString(sample.id || sample.doc_id || sample.singleton_key),
    singleton_key: pickString(sample.singleton_key),
    field_path: pickString(sample.field_path),
    ok: false,
    changed: false,
    uploaded: [],
    error: ''
  };
  try {
    const patch = { updated_at: nowIso() };
    if (sample.category === 'stale_url_but_recoverable' && isCloudFileId(sample.file_id)) {
      patch[sample.field_path] = sample.file_id;
    } else {
      const sourceUrl = pickString(sample.asset_value || sample.image_url || sample.url);
      if (!isHttpUrl(sourceUrl)) throw new Error('singleton sample has no migratable HTTP URL');
      const fileId = await ensureUploaded(sourceUrl, sample, context);
      if (sample.file_id_path) patch[sample.file_id_path] = fileId;
      if (sample.field_path) patch[sample.field_path] = fileId;
      record.uploaded.push({ source_url: sourceUrl, file_id: fileId });
    }
    record.patch = patch;
    record.changed = true;
    if (shouldApply) {
      const singletonDoc = readSingletonDoc(sample.singleton_key);
      const query = singletonDoc && pickString(singletonDoc._id)
        ? { _id: pickString(singletonDoc._id) }
        : { key: sample.singleton_key };
      const result = updateDocument('admin_singletons', query, patch);
      if (result && result.success === false) throw new Error('singleton update returned non-success');
    }
    record.ok = true;
  } catch (error) {
    record.ok = false;
    record.error = error.message || String(error);
  }
  return record;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# CloudBase Asset Risk Migration Report');
  lines.push('');
  lines.push(`- Executed at: ${report.executed_at}`);
  lines.push(`- Mode: ${report.mode}`);
  lines.push(`- Environment: ${report.environment.env_id || 'unknown'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Input risk samples: ${report.summary.input_samples}`);
  lines.push(`- Result records: ${report.summary.result_records}`);
  lines.push(`- OK: ${report.summary.ok}`);
  lines.push(`- Failed: ${report.summary.failed}`);
  lines.push('');
  lines.push('## Results');
  lines.push('');
  report.results.forEach((item) => {
    lines.push(`- [${item.collection}] id=${item.id || item.singleton_key} | ${item.ok ? 'OK' : `FAILED (${item.error || 'unknown'})`}`);
    (item.uploaded || []).forEach((upload) => {
      lines.push(`  - ${upload.source_url} -> ${upload.file_id}`);
    });
  });
  if (!report.results.length) lines.push('- none');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const audit = JSON.parse(fs.readFileSync(auditJsonPath, 'utf8'));
  const auth = callMcporter('cloudbase.auth', { action: 'status' });
  const envId = pickString(auth.current_env_id);
  if (!envId) throw new Error('CloudBase env is not ready');

  const riskSamples = (audit.samples || []).filter((item) => (
    ['http_url_without_file_id', 'signed_url_without_file_id', 'stale_url_but_recoverable'].includes(item.category)
  ));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-mp-asset-risk-migrate-'));
  const context = {
    envId,
    tempDir,
    uploadCache: new Map()
  };
  const report = {
    kind: 'cloudbase_asset_risk_migration_report',
    executed_at: nowIso(),
    mode: shouldApply ? 'apply' : 'dry-run',
    source_audit: path.relative(projectRoot, auditJsonPath),
    environment: {
      env_id: envId,
      auth_status: pickString(auth.auth_status),
      env_status: pickString(auth.env_status)
    },
    summary: {
      input_samples: riskSamples.length,
      result_records: 0,
      ok: 0,
      failed: 0
    },
    results: []
  };

  try {
    await migrateProductSamples(riskSamples.filter((item) => item.collection === 'products'), context, report);
    for (const sample of riskSamples.filter((item) => item.collection === 'admin_singletons')) {
      report.results.push(await migrateSingletonSample(sample, context));
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  report.summary.result_records = report.results.length;
  report.summary.ok = report.results.filter((item) => item.ok).length;
  report.summary.failed = report.results.filter((item) => !item.ok).length;

  writeJson(reportJsonPath, report);
  writeText(reportMdPath, renderMarkdown(report));
  console.log(JSON.stringify({
    ok: report.summary.failed === 0,
    mode: report.mode,
    input_samples: report.summary.input_samples,
    result_records: report.summary.result_records,
    ok_records: report.summary.ok,
    failed_records: report.summary.failed,
    report_json: path.relative(projectRoot, reportJsonPath),
    report_md: path.relative(projectRoot, reportMdPath)
  }, null, 2));
  if (report.summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
