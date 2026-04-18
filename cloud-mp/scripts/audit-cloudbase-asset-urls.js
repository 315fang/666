'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const docsDir = path.join(projectRoot, 'docs');
const outputJsonPath = path.join(docsDir, 'CLOUDBASE_ASSET_URL_AUDIT.json');
const outputMarkdownPath = path.join(docsDir, 'CLOUDBASE_ASSET_URL_AUDIT.md');

const TARGET_COLLECTIONS = [
  {
    name: 'banners',
    candidates: ['file_id', 'image_url', 'url', 'image', 'cover_image'],
    titleFields: ['title', 'name', 'position']
  },
  {
    name: 'splash_screens',
    candidates: ['file_id', 'image_url', 'url', 'image', 'cover_image'],
    titleFields: ['title', 'name']
  },
  {
    name: 'materials',
    candidates: ['file_id', 'url', 'temp_url', 'image_url'],
    titleFields: ['title', 'name', 'type']
  }
];

const PAGE_SIZE = 200;

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
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return JSON.parse(output || '{}');
  } catch (error) {
    const detail = `${error?.stderr?.toString?.() || ''}\n${error?.stdout?.toString?.() || ''}`;
    const shouldFallback = /ERR_MODULE_NOT_FOUND|Cannot find package 'ora'/i.test(detail);
    if (!shouldFallback) {
      throw new Error(detail || `mcporter call cloudbase.${toolName} failed`);
    }
    const fallbackCommand = `npx --yes mcporter@latest call cloudbase.${toolName} ${args.join(' ')} --output json`;
    const fallbackOutput = execSync(fallbackCommand, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return JSON.parse(fallbackOutput || '{}');
  }
}

function pickString(value) {
  if (value == null) return '';
  const text = String(value).trim();
  return text;
}

function isCloudFileId(value) {
  return /^cloud:\/\//i.test(pickString(value));
}

function isSignedTempUrl(value) {
  const text = pickString(value);
  return /^https?:\/\//i.test(text) && /[?&]sign=/.test(text) && /[?&]t=/.test(text);
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(pickString(value));
}

function pickAssetValue(doc, keys) {
  for (const key of keys) {
    const value = pickString(doc?.[key]);
    if (value) return value;
  }
  return '';
}

function pickTitle(doc, keys) {
  const parts = keys
    .map((key) => pickString(doc?.[key]))
    .filter(Boolean)
    .slice(0, 3);
  return parts.join(' | ');
}

function resolveId(doc) {
  return pickString(doc?._id || doc?.id || doc?._legacy_id);
}

function resolveTotal(payload, fallbackCount) {
  if (Number.isFinite(payload?.total)) return Number(payload.total);
  if (Number.isFinite(payload?.pager?.Total)) return Number(payload.pager.Total);
  if (Array.isArray(payload?.data)) return payload.data.length;
  return fallbackCount;
}

function classifyRecord(doc, config) {
  const fileId = pickString(doc?.file_id);
  const primaryAsset = pickAssetValue(doc, config.candidates);
  const signedByImageUrl = isSignedTempUrl(doc?.image_url) || isSignedTempUrl(doc?.url) || isSignedTempUrl(doc?.temp_url);

  if (isCloudFileId(fileId)) {
    if (signedByImageUrl) return 'stale_url_but_recoverable';
    return 'healthy';
  }

  if (isCloudFileId(primaryAsset)) return 'cloud_asset_without_file_id';
  if (isSignedTempUrl(primaryAsset)) return 'signed_url_without_file_id';
  if (isHttpUrl(primaryAsset)) return 'http_url_without_file_id';
  return 'missing_asset_ref';
}

function createSample(doc, config, category) {
  return {
    id: resolveId(doc),
    category,
    file_id: pickString(doc?.file_id),
    image_url: pickString(doc?.image_url),
    url: pickString(doc?.url),
    temp_url: pickString(doc?.temp_url),
    title: pickTitle(doc, config.titleFields)
  };
}

async function fetchCollectionDocs(collectionName) {
  const data = [];
  let offset = 0;
  let total = 0;

  while (true) {
    const payload = runMcporterCall('readNoSqlDatabaseContent', {
      collectionName,
      limit: PAGE_SIZE,
      offset
    });
    const rows = Array.isArray(payload.data) ? payload.data : [];
    data.push(...rows);
    total = resolveTotal(payload, total);
    offset += rows.length;
    if (!rows.length || rows.length < PAGE_SIZE) break;
  }

  return {
    list: data,
    total: total || data.length
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# CloudBase Asset URL Audit');
  lines.push('');
  lines.push(`- Generated at: ${report.generated_at}`);
  lines.push(`- Environment: ${report.environment.env_id || 'unknown'}`);
  lines.push(`- Auth status: ${report.environment.auth_status || 'unknown'}`);
  lines.push(`- Env status: ${report.environment.env_status || 'unknown'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Checked collections: ${report.summary.collection_count}`);
  lines.push(`- Checked records: ${report.summary.checked_records}`);
  lines.push(`- Risky records: ${report.summary.risky_records}`);
  lines.push('');
  lines.push('## Risk Breakdown');
  lines.push('');
  Object.entries(report.summary.risk_breakdown).forEach(([key, count]) => {
    lines.push(`- ${key}: ${count}`);
  });
  lines.push('');
  lines.push('## Collection Details');
  lines.push('');
  report.collections.forEach((item) => {
    lines.push(`### ${item.name}`);
    lines.push('');
    lines.push(`- Total: ${item.total}`);
    lines.push(`- Healthy: ${item.metrics.healthy}`);
    lines.push(`- stale_url_but_recoverable: ${item.metrics.stale_url_but_recoverable}`);
    lines.push(`- cloud_asset_without_file_id: ${item.metrics.cloud_asset_without_file_id}`);
    lines.push(`- signed_url_without_file_id: ${item.metrics.signed_url_without_file_id}`);
    lines.push(`- http_url_without_file_id: ${item.metrics.http_url_without_file_id}`);
    lines.push(`- missing_asset_ref: ${item.metrics.missing_asset_ref}`);
    lines.push('');
  });

  lines.push('## Top Risk Samples');
  lines.push('');
  if (!report.samples.length) {
    lines.push('- none');
  } else {
    report.samples.forEach((sample) => {
      lines.push(`- [${sample.collection}] ${sample.category} | id=${sample.id || 'unknown'} | ${sample.title || 'untitled'}`);
    });
  }

  lines.push('');
  lines.push('## Recommended Actions');
  lines.push('');
  lines.push('1. 优先修复 `signed_url_without_file_id`：这些记录过期后会直接 403 且无法自动续签。');
  lines.push('2. 清理 `http_url_without_file_id`：迁移到素材库上传，保存 cloud:// file_id。');
  lines.push('3. 对 `stale_url_but_recoverable` 可批量清空 image_url/url，仅保留 file_id（读取链路会动态续签）。');
  lines.push('4. `missing_asset_ref` 记录需补图或下线，避免前端空白位。');

  return `${lines.join('\n')}\n`;
}

async function main() {
  const authStatus = runMcporterCall('auth', { action: 'status' });
  const report = {
    kind: 'cloudbase_asset_url_audit',
    generated_at: nowIso(),
    environment: {
      env_id: pickString(authStatus.current_env_id),
      auth_status: pickString(authStatus.auth_status),
      env_status: pickString(authStatus.env_status)
    },
    collections: [],
    samples: [],
    summary: {
      collection_count: TARGET_COLLECTIONS.length,
      checked_records: 0,
      risky_records: 0,
      risk_breakdown: {
        stale_url_but_recoverable: 0,
        cloud_asset_without_file_id: 0,
        signed_url_without_file_id: 0,
        http_url_without_file_id: 0,
        missing_asset_ref: 0
      }
    }
  };

  for (const config of TARGET_COLLECTIONS) {
    const docs = await fetchCollectionDocs(config.name);
    const metrics = {
      healthy: 0,
      stale_url_but_recoverable: 0,
      cloud_asset_without_file_id: 0,
      signed_url_without_file_id: 0,
      http_url_without_file_id: 0,
      missing_asset_ref: 0
    };

    docs.list.forEach((doc) => {
      const category = classifyRecord(doc, config);
      if (!Object.prototype.hasOwnProperty.call(metrics, category)) return;
      metrics[category] += 1;
      if (category !== 'healthy' && report.samples.length < 120) {
        report.samples.push({
          collection: config.name,
          ...createSample(doc, config, category)
        });
      }
    });

    report.collections.push({
      name: config.name,
      total: docs.total,
      metrics
    });

    report.summary.checked_records += docs.total;
    Object.keys(report.summary.risk_breakdown).forEach((key) => {
      report.summary.risk_breakdown[key] += metrics[key] || 0;
    });
  }

  report.summary.risky_records = Object.values(report.summary.risk_breakdown)
    .reduce((sum, count) => sum + Number(count || 0), 0);

  writeJson(outputJsonPath, report);
  writeText(outputMarkdownPath, renderMarkdown(report));

  console.log(JSON.stringify({
    ok: true,
    output_json: path.relative(projectRoot, outputJsonPath),
    output_md: path.relative(projectRoot, outputMarkdownPath),
    checked_records: report.summary.checked_records,
    risky_records: report.summary.risky_records,
    risk_breakdown: report.summary.risk_breakdown
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
