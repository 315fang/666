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
const cloudbaseImportRoot = path.join(projectRoot, 'cloudbase-import');
const migrationTodoJsonPath = path.join(docsRoot, 'CLOUDBASE_ASSET_URL_MIGRATION_TODO.json');
const migrationReportJsonPath = path.join(docsRoot, 'CLOUDBASE_ASSET_URL_MIGRATION_EXECUTION_REPORT.json');
const migrationReportMdPath = path.join(docsRoot, 'CLOUDBASE_ASSET_URL_MIGRATION_EXECUTION_REPORT.md');
const localProductsJsonlPath = path.join(cloudbaseImportRoot, 'products.jsonl');

const shouldApply = process.argv.includes('--apply');
const MAX_REDIRECTS = 5;

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

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
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

function parseMaybeArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    if (text.startsWith('[') && text.endsWith(']')) {
      try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }
    return [text];
  }
  return [];
}

function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

function loadLocalProductIndex() {
  const rows = readJsonLines(localProductsJsonlPath);
  const byId = new Map();
  rows.forEach((row) => {
    const id = pickString(row._id || row.id);
    if (id) byId.set(id, row);
  });
  return {
    rows,
    byId
  };
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
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'].includes(ext)) {
      return ext;
    }
  } catch (_) {
    // ignore
  }
  return '.jpg';
}

function hashShort(input) {
  return crypto.createHash('md5').update(String(input || '')).digest('hex').slice(0, 10);
}

function buildCloudPath(record, sourceUrl) {
  const collection = sanitizePathSegment(record.collection, 'assets');
  const id = sanitizePathSegment(record.id, hashShort(sourceUrl));
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

function fetchDocById(collectionName, docId) {
  const response = callMcporter('cloudbase.readNoSqlDatabaseContent', {
    collectionName,
    query: { _id: docId },
    limit: 1,
    offset: 0
  });
  const rows = Array.isArray(response?.data) ? response.data : [];
  return rows[0] || null;
}

function uploadToCloudStorage(localPath, cloudPath) {
  return callMcporter('cloudbase.manageStorage', {
    action: 'upload',
    localPath,
    cloudPath,
    force: true
  });
}

function updateDocFileId(collectionName, docId, fileId) {
  return callMcporter('cloudbase.writeNoSqlDatabaseContent', {
    action: 'update',
    collectionName,
    query: { _id: docId },
    update: {
      $set: {
        file_id: fileId,
        image_url: '',
        url: '',
        temp_url: '',
        updated_at: nowIso()
      }
    },
    isMulti: false,
    upsert: false
  });
}

function pickHttpUrlsFromObject(source = {}) {
  if (!source || typeof source !== 'object') return [];
  const fields = ['image_url', 'url', 'image', 'cover_image', 'coverImage', 'temp_url', 'file_id'];
  const urls = [];

  fields.forEach((field) => {
    const direct = pickString(source[field]);
    if (isHttpUrl(direct)) urls.push(direct);
  });

  ['images', 'detail_images', 'banners'].forEach((field) => {
    parseMaybeArray(source[field]).forEach((value) => {
      if (isHttpUrl(value)) urls.push(value);
    });
  });

  return uniqueStrings(urls);
}

function makeTitleHints(title) {
  const raw = pickString(title);
  const head = raw.split('|')[0].trim();
  const hints = [
    head,
    head.slice(0, 6),
    head.slice(0, 4),
    head.slice(0, 3)
  ].filter((item) => item && item.length >= 2);
  return uniqueStrings(hints);
}

function findProductByTitleHints(productRows, title) {
  const hints = makeTitleHints(title);
  if (!hints.length) return [];

  const matched = [];
  productRows.forEach((row) => {
    const name = pickString(row.name);
    const description = pickString(row.description);
    if (!name && !description) return;
    const hasMatch = hints.some((hint) => name.includes(hint) || description.includes(hint));
    if (hasMatch) {
      matched.push(...pickHttpUrlsFromObject(row));
    }
  });
  return uniqueStrings(matched);
}

function getFallbackSubstituteFileId() {
  const report = readJson(migrationReportJsonPath, null);
  if (!report || !Array.isArray(report.results)) return '';
  const hit = report.results.find((item) => isCloudFileId(item.file_id));
  return pickString(hit?.file_id);
}

function gatherCandidateUrls(record, dbDoc, productIndex) {
  const candidates = [];
  candidates.push(pickString(record.image_url));
  candidates.push(pickString(record.url));
  pickHttpUrlsFromObject(dbDoc).forEach((item) => candidates.push(item));

  const productId = pickString(dbDoc?.link_value || dbDoc?.product_id || record?.link_value);
  if (productId) {
    try {
      const liveProduct = fetchDocById('products', productId);
      pickHttpUrlsFromObject(liveProduct).forEach((item) => candidates.push(item));
    } catch (_) {
      // Ignore remote product lookup errors and fallback to local seed data.
    }
    const localProduct = productIndex.byId.get(productId);
    pickHttpUrlsFromObject(localProduct).forEach((item) => candidates.push(item));
  }

  findProductByTitleHints(productIndex.rows, record.title).forEach((item) => candidates.push(item));

  return uniqueStrings(candidates.filter(isHttpUrl));
}

function downloadFile(rawUrl, targetFilePath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > MAX_REDIRECTS) {
      reject(new Error(`Too many redirects for ${rawUrl}`));
      return;
    }

    let urlObj;
    try {
      urlObj = new URL(rawUrl);
    } catch (_) {
      reject(new Error(`Invalid URL: ${rawUrl}`));
      return;
    }

    const client = urlObj.protocol === 'https:' ? https : http;
    const request = client.get(urlObj, {
      timeout: 30000,
      headers: {
        'User-Agent': 'cloud-mp-asset-migrator/1.0'
      }
    }, (response) => {
      const statusCode = Number(response.statusCode || 0);
      if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location) {
        response.resume();
        const nextUrl = new URL(response.headers.location, urlObj).toString();
        downloadFile(nextUrl, targetFilePath, redirectCount + 1).then(resolve).catch(reject);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`HTTP ${statusCode} for ${rawUrl}`));
        return;
      }

      ensureDir(path.dirname(targetFilePath));
      const stream = fs.createWriteStream(targetFilePath);
      response.pipe(stream);
      stream.on('finish', () => {
        stream.close(() => resolve({
          bytes: fs.statSync(targetFilePath).size,
          contentType: pickString(response.headers['content-type'])
        }));
      });
      stream.on('error', (err) => {
        stream.destroy();
        reject(err);
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error(`Timeout while downloading ${rawUrl}`));
    });
    request.on('error', reject);
  });
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# CloudBase Asset Migration Execution Report');
  lines.push('');
  lines.push(`- Executed at: ${report.executed_at}`);
  lines.push(`- Mode: ${report.mode}`);
  lines.push(`- Environment: ${report.environment.env_id || 'unknown'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Input records: ${report.summary.input_records}`);
  lines.push(`- Migrated: ${report.summary.migrated}`);
  lines.push(`- Failed: ${report.summary.failed}`);
  lines.push('');
  lines.push('## Results');
  lines.push('');
  if (!report.results.length) {
    lines.push('- none');
  } else {
    report.results.forEach((item) => {
      lines.push(`- [${item.collection}] id=${item.id} | ${item.ok ? 'OK' : `FAILED (${item.error || 'unknown'})`}`);
      if (item.ok) {
        lines.push(`  source=${item.source_url}`);
        lines.push(`  file_id=${item.file_id}`);
      }
    });
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function processRecord(record, envId, tempDir) {
  const dbDoc = fetchDocById(record.collection, record.id);
  const currentFileId = pickString(dbDoc?.file_id);
  if (isCloudFileId(currentFileId)) {
    return {
      ok: true,
      skipped: true,
      source_url: '',
      cloud_path: '',
      file_id: currentFileId,
      bytes: 0
    };
  }

  const candidates = gatherCandidateUrls(record, dbDoc, processRecord._productIndex || { rows: [], byId: new Map() });
  const errors = [];
  for (const sourceUrl of candidates) {
    const cloudPath = buildCloudPath(record, sourceUrl);
    const localPath = path.join(tempDir, `${sanitizePathSegment(record.collection)}-${sanitizePathSegment(record.id)}${extFromUrl(sourceUrl)}`);
    const cloudFileId = `cloud://${envId}/${cloudPath}`;

    if (!shouldApply) {
      return {
        ok: true,
        dry_run: true,
        source_url: sourceUrl,
        cloud_path: cloudPath,
        file_id: cloudFileId,
        bytes: 0
      };
    }

    try {
      const downloadResult = await downloadFile(sourceUrl, localPath);
      uploadToCloudStorage(localPath, cloudPath);
      const updateResult = updateDocFileId(record.collection, record.id, cloudFileId);
      const updateOk = !!(updateResult && updateResult.success !== false);
      if (!updateOk) {
        throw new Error('Database update returned non-success');
      }

      return {
        ok: true,
        dry_run: false,
        source_url: sourceUrl,
        cloud_path: cloudPath,
        file_id: cloudFileId,
        bytes: downloadResult.bytes
      };
    } catch (error) {
      errors.push(`${sourceUrl} -> ${error.message || String(error)}`);
    }
  }

  const substituteFileId = pickString(processRecord._substituteFileId);
  if (isCloudFileId(substituteFileId)) {
    if (shouldApply) {
      const updateResult = updateDocFileId(record.collection, record.id, substituteFileId);
      const updateOk = !!(updateResult && updateResult.success !== false);
      if (!updateOk) {
        throw new Error('Substitute file_id update returned non-success');
      }
    }
    return {
      ok: true,
      substituted: true,
      dry_run: !shouldApply,
      source_url: '(substitute-file-id)',
      cloud_path: '',
      file_id: substituteFileId,
      bytes: 0
    };
  }

  if (!errors.length) {
    throw new Error('No valid candidate URL found');
  }
  throw new Error(errors.join(' | '));
}

async function main() {
  const todo = readJson(migrationTodoJsonPath);
  if (!todo || !Array.isArray(todo.records)) {
    throw new Error('Missing docs/CLOUDBASE_ASSET_URL_MIGRATION_TODO.json');
  }

  const auth = getAuthStatus();
  const envId = pickString(auth.current_env_id);
  if (!envId) {
    throw new Error('CloudBase env is not ready. Run cloudbase.auth action=status first.');
  }

  const productIndex = loadLocalProductIndex();
  processRecord._productIndex = productIndex;
  processRecord._substituteFileId = getFallbackSubstituteFileId();

  const report = {
    kind: 'cloudbase_asset_migration_execution_report',
    executed_at: nowIso(),
    mode: shouldApply ? 'apply' : 'dry-run',
    environment: {
      env_id: envId,
      auth_status: pickString(auth.auth_status),
      env_status: pickString(auth.env_status)
    },
    summary: {
      input_records: todo.records.length,
      migrated: 0,
      failed: 0
    },
    results: []
  };

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-mp-asset-migrate-'));
  try {
    for (const record of todo.records) {
      const itemResult = {
        collection: pickString(record.collection),
        id: pickString(record.id),
        title: pickString(record.title),
        ok: false,
        source_url: pickString(record.image_url || record.url),
        file_id: '',
        error: ''
      };
      try {
        const done = await processRecord(record, envId, tempDir);
        itemResult.ok = !!done.ok;
        itemResult.file_id = pickString(done.file_id);
        itemResult.cloud_path = pickString(done.cloud_path);
        itemResult.bytes = Number(done.bytes || 0);
        itemResult.skipped = !!done.skipped;
        itemResult.substituted = !!done.substituted;
        if (!isCloudFileId(processRecord._substituteFileId) && isCloudFileId(itemResult.file_id)) {
          processRecord._substituteFileId = itemResult.file_id;
        }
      } catch (error) {
        itemResult.ok = false;
        itemResult.error = error.message || String(error);
      }
      report.results.push(itemResult);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  report.summary.migrated = report.results.filter((item) => item.ok).length;
  report.summary.failed = report.results.filter((item) => !item.ok).length;

  writeJson(migrationReportJsonPath, report);
  writeText(migrationReportMdPath, renderMarkdown(report));

  console.log(JSON.stringify({
    ok: report.summary.failed === 0,
    mode: report.mode,
    input_records: report.summary.input_records,
    migrated: report.summary.migrated,
    failed: report.summary.failed,
    report_json: path.relative(projectRoot, migrationReportJsonPath),
    report_md: path.relative(projectRoot, migrationReportMdPath)
  }, null, 2));

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
