'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getAuditArtifactPaths } = require('./lib/audit-output');

const projectRoot = path.resolve(__dirname, '..');
const {
  outputDir: docsDir,
  jsonPath: outputJsonPath,
  mdPath: outputMarkdownPath
} = getAuditArtifactPaths(projectRoot, 'CLOUDBASE_ASSET_URL_AUDIT');

const TARGET_COLLECTIONS = [
  {
    name: 'banners',
    candidates: ['file_id', 'image_url', 'url', 'image', 'cover_image'],
    titleFields: ['title', 'name', 'position'],
    clearFields: ['url', 'image_url', 'temp_url']
  },
  {
    name: 'splash_screens',
    candidates: ['file_id', 'image_url', 'url', 'image', 'cover_image'],
    titleFields: ['title', 'name'],
    clearFields: ['url', 'image_url', 'temp_url']
  },
  {
    name: 'materials',
    candidates: ['file_id', 'url', 'temp_url', 'image_url'],
    titleFields: ['title', 'name', 'type'],
    clearFields: ['url', 'temp_url', 'image_url']
  },
  {
    name: 'products',
    candidates: ['file_id', 'cover_image', 'image_url', 'image', 'images', 'preview_images', 'detail_images', 'preview_detail_images'],
    titleFields: ['name', 'title'],
    clearFields: ['cover_image', 'image_url', 'image', 'preview_images', 'preview_detail_images'],
    extractEntries(doc) {
      const entries = [];
      const productFileId = pickString(doc?.file_id || doc?.image_ref);
      const primaryAsset = pickString(
        doc?.cover_image
        || doc?.image_url
        || doc?.image
        || toAssetValues(doc?.images)[0]
        || toAssetValues(doc?.preview_images)[0]
      );
      if (primaryAsset || productFileId) {
        entries.push(createCollectionAssetEntry(doc, {
          fieldPath: 'cover_image|image_url|image|images.0',
          fileId: productFileId,
          assetValue: primaryAsset,
          titleFields: ['name', 'title'],
          clearFields: ['cover_image', 'image_url', 'image', 'preview_images'],
          allowCloudAssetRef: true
        }));
      }

      [
        { field: 'images', clearFields: ['images'] },
        { field: 'preview_images', clearFields: ['preview_images'] },
        { field: 'detail_images', clearFields: ['detail_images'] },
        { field: 'preview_detail_images', clearFields: ['preview_detail_images'] }
      ].forEach((config) => {
        toAssetValues(doc?.[config.field]).forEach((assetValue, index) => {
          entries.push(createCollectionAssetEntry(doc, {
            fieldPath: `${config.field}.${index}`,
            fileId: isCloudFileId(assetValue) ? assetValue : '',
            assetValue,
            titleFields: ['name', 'title'],
            clearFields: config.clearFields,
            allowCloudAssetRef: true
          }));
        });
      });
      return entries;
    }
  }
];

const TARGET_SINGLETONS = [
  {
    singletonKey: 'settings',
    name: 'admin_singletons.settings.homepage',
    extractEntries(row, value, rootField) {
      const homepage = value && typeof value === 'object'
        ? (value.homepage || value.HOMEPAGE || null)
        : null;
      if (!homepage || typeof homepage !== 'object') return [];

      const entries = [
        createSingletonAssetEntry(row, {
          singletonKey: 'settings',
          rootField,
          fieldPath: 'homepage.brand_logo',
          fileIdPath: '',
          fileId: '',
          assetValue: homepage.brand_logo,
          title: pickTitle(homepage, ['nav_brand_title', 'brand_name'])
        }),
        createSingletonAssetEntry(row, {
          singletonKey: 'settings',
          rootField,
          fieldPath: 'homepage.official_promo_cover',
          fileIdPath: '',
          fileId: '',
          assetValue: homepage.official_promo_cover,
          title: pickTitle(homepage, ['official_promo_title', 'brand_zone_title'])
        }),
        createSingletonAssetEntry(row, {
          singletonKey: 'settings',
          rootField,
          fieldPath: 'homepage.brand_zone_cover',
          fileIdPath: 'homepage.brand_zone_cover_file_id',
          fileId: homepage.brand_zone_cover_file_id,
          assetValue: homepage.brand_zone_cover,
          title: pickTitle(homepage, ['brand_zone_title'])
        })
      ];

      const endorsements = Array.isArray(homepage.brand_endorsements) ? homepage.brand_endorsements : [];
      endorsements.forEach((item, index) => {
        entries.push(createSingletonAssetEntry(row, {
          singletonKey: 'settings',
          rootField,
          fieldPath: `homepage.brand_endorsements.${index}.image`,
          fileIdPath: `homepage.brand_endorsements.${index}.file_id`,
          fileId: item && item.file_id,
          assetValue: item && (item.image || item.image_url || item.url || item.temp_url),
          title: pickTitle(item, ['title', 'subtitle'])
        }));
      });

      const certifications = Array.isArray(homepage.brand_certifications) ? homepage.brand_certifications : [];
      certifications.forEach((item, index) => {
        entries.push(createSingletonAssetEntry(row, {
          singletonKey: 'settings',
          rootField,
          fieldPath: `homepage.brand_certifications.${index}.image`,
          fileIdPath: `homepage.brand_certifications.${index}.file_id`,
          fileId: item && item.file_id,
          assetValue: item && (item.image || item.image_url || item.url || item.temp_url),
          title: pickTitle(item, ['title', 'subtitle'])
        }));
      });

      return entries.filter(Boolean);
    }
  },
  {
    singletonKey: 'popup-ad-config',
    name: 'admin_singletons.popup-ad-config',
    extractEntries(row, value, rootField) {
      if (!value || typeof value !== 'object') return [];
      return [
        createSingletonAssetEntry(row, {
          singletonKey: 'popup-ad-config',
          rootField,
          fieldPath: 'image_url',
          fileIdPath: 'file_id',
          fileId: value.file_id,
          assetValue: value.image_url || value.url || value.image,
          title: pickTitle(value, ['title', 'button_text'])
        })
      ];
    }
  },
  {
    singletonKey: 'mini-program-config',
    name: 'admin_singletons.mini-program-config.brand_config',
    extractEntries(row, value, rootField) {
      const brandConfig = value && typeof value === 'object' ? value.brand_config || null : null;
      if (!brandConfig || typeof brandConfig !== 'object') return [];
      return [
        createSingletonAssetEntry(row, {
          singletonKey: 'mini-program-config',
          rootField,
          fieldPath: 'brand_config.brand_logo',
          fileIdPath: '',
          fileId: '',
          assetValue: brandConfig.brand_logo,
          title: pickTitle(brandConfig, ['brand_name', 'nav_brand_title'])
        }),
        createSingletonAssetEntry(row, {
          singletonKey: 'mini-program-config',
          rootField,
          fieldPath: 'brand_config.share_poster_url',
          fileIdPath: 'brand_config.share_poster_file_id',
          fileId: brandConfig.share_poster_file_id,
          assetValue: brandConfig.share_poster_url,
          title: pickTitle(brandConfig, ['brand_name', 'share_title'])
        }),
        createSingletonAssetEntry(row, {
          singletonKey: 'mini-program-config',
          rootField,
          fieldPath: 'brand_config.share_poster_cover_url',
          fileIdPath: 'brand_config.share_poster_cover_file_id',
          fileId: brandConfig.share_poster_cover_file_id,
          assetValue: brandConfig.share_poster_cover_url,
          title: pickTitle(brandConfig, ['brand_name', 'share_title'])
        })
      ];
    }
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
  return String(value).trim();
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (trimmed[0] !== '{' && trimmed[0] !== '[') return value;
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    return value;
  }
}

function toAssetValues(value) {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => toAssetValues(item));
  }
  if (parsed && typeof parsed === 'object') {
    const direct = pickString(
      parsed.file_id
      || parsed.fileId
      || parsed.image_ref
      || parsed.imageRef
      || parsed.url
      || parsed.image_url
      || parsed.imageUrl
      || parsed.image
      || parsed.cover_image
      || parsed.coverImage
    );
    return direct ? [direct] : [];
  }
  const direct = pickString(parsed);
  return direct ? [direct] : [];
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

function pickAssetField(doc, keys) {
  for (const key of keys) {
    const value = pickString(doc?.[key]);
    if (value) return { key, value };
  }
  return { key: '', value: '' };
}

function pickTitle(doc, keys) {
  const parts = (Array.isArray(keys) ? keys : [])
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

function classifyAssetEntry(entry) {
  if (!entry || typeof entry !== 'object') return 'missing_asset_ref';
  const fileId = pickString(entry.file_id);
  const primaryAsset = pickString(entry.asset_value || entry.image_url || entry.url || entry.temp_url);
  const signedByImageUrl = isSignedTempUrl(entry.image_url) || isSignedTempUrl(entry.url) || isSignedTempUrl(entry.temp_url);

  if (isCloudFileId(fileId)) {
    if (signedByImageUrl) return 'stale_url_but_recoverable';
    return 'healthy';
  }

  if (isCloudFileId(primaryAsset)) return entry.allow_cloud_asset_ref ? 'healthy' : 'cloud_asset_without_file_id';
  if (isSignedTempUrl(primaryAsset)) return 'signed_url_without_file_id';
  if (isHttpUrl(primaryAsset)) return 'http_url_without_file_id';
  return 'missing_asset_ref';
}

function createCollectionAssetEntry(doc, options = {}) {
  const assetValue = pickString(options.assetValue);
  const fileId = pickString(options.fileId);
  if (!(assetValue || fileId)) return null;
  return {
    source_type: 'collection',
    collection: options.collection || 'products',
    doc_id: resolveId(doc),
    id: resolveId(doc),
    category: '',
    field_path: pickString(options.fieldPath),
    file_id_path: pickString(options.fileIdPath || 'file_id'),
    asset_value: assetValue,
    clear_fields: options.clearFields || [],
    file_id: fileId,
    image_url: assetValue,
    url: '',
    temp_url: '',
    title: pickTitle(doc, options.titleFields || []),
    allow_cloud_asset_ref: !!options.allowCloudAssetRef
  };
}

function createCollectionSample(doc, config, category) {
  const assetField = pickAssetField(doc, config.candidates);
  return {
    source_type: 'collection',
    collection: config.name,
    doc_id: resolveId(doc),
    id: resolveId(doc),
    category,
    field_path: assetField.key,
    file_id_path: 'file_id',
    asset_value: assetField.value,
    clear_fields: config.clearFields || [],
    file_id: pickString(doc?.file_id),
    image_url: pickString(doc?.image_url),
    url: pickString(doc?.url),
    temp_url: pickString(doc?.temp_url),
    title: pickTitle(doc, config.titleFields)
  };
}

function createSingletonAssetEntry(row, options = {}) {
  const rootField = options.rootField || 'value';
  const fieldPath = pickString(options.fieldPath);
  const fileIdPath = pickString(options.fileIdPath);
  const assetValue = pickString(options.assetValue);
  const fileId = pickString(options.fileId);
  if (!(assetValue || fileId)) return null;
  return {
    source_type: 'singleton',
    collection: 'admin_singletons',
    singleton_key: pickString(options.singletonKey),
    doc_id: resolveId(row),
    id: resolveId(row),
    field_path: fieldPath ? `${rootField}.${fieldPath}` : '',
    file_id_path: fileIdPath ? `${rootField}.${fileIdPath}` : '',
    asset_value: assetValue,
    clear_fields: fieldPath ? [`${rootField}.${fieldPath}`] : [],
    file_id: fileId,
    image_url: assetValue,
    url: '',
    temp_url: '',
    title: pickString(options.title)
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

function buildMetricBucket() {
  return {
    healthy: 0,
    stale_url_but_recoverable: 0,
    cloud_asset_without_file_id: 0,
    signed_url_without_file_id: 0,
    http_url_without_file_id: 0,
    missing_asset_ref: 0
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
  lines.push(`- Checked targets: ${report.summary.target_count}`);
  lines.push(`- Checked records: ${report.summary.checked_records}`);
  lines.push(`- Risky records: ${report.summary.risky_records}`);
  lines.push('');
  lines.push('## Risk Breakdown');
  lines.push('');
  Object.entries(report.summary.risk_breakdown).forEach(([key, count]) => {
    lines.push(`- ${key}: ${count}`);
  });
  lines.push('');
  lines.push('## Target Details');
  lines.push('');
  report.targets.forEach((item) => {
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
      const location = sample.source_type === 'singleton'
        ? `${sample.collection}.${sample.singleton_key || ''}:${sample.field_path || ''}`
        : sample.collection;
      lines.push(`- [${location}] ${sample.category} | id=${sample.id || 'unknown'} | ${sample.title || 'untitled'}`);
    });
  }

  lines.push('');
  lines.push('## Recommended Actions');
  lines.push('');
  lines.push('1. 优先修复 `signed_url_without_file_id`：这些记录过期后会直接 403 且无法自动续签。');
  lines.push('2. 清理 `http_url_without_file_id`：迁移到素材库上传，保存 cloud:// file_id。');
  lines.push('3. 对 `stale_url_but_recoverable` 可批量清空 image_url/url，仅保留 file_id（读取链路会动态续签）。');
  lines.push('4. 对 `cloud_asset_without_file_id` 可批量回填 file_id，并清理重复 URL 字段。');
  lines.push('5. `missing_asset_ref` 记录需补图或下线，避免前端空白位。');

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
    targets: [],
    samples: [],
    summary: {
      target_count: TARGET_COLLECTIONS.length + TARGET_SINGLETONS.length,
      checked_records: 0,
      risky_records: 0,
      risk_breakdown: buildMetricBucket()
    }
  };

  for (const config of TARGET_COLLECTIONS) {
    const docs = await fetchCollectionDocs(config.name);
    const metrics = buildMetricBucket();
    let checkedTotal = docs.total;
    const entries = typeof config.extractEntries === 'function'
      ? docs.list.flatMap((doc) => (config.extractEntries(doc) || []).filter(Boolean).map((entry) => ({
        ...entry,
        collection: config.name
      })))
      : docs.list.map((doc) => ({
        file_id: pickString(doc?.file_id),
        image_url: pickString(doc?.image_url),
        url: pickString(doc?.url),
        temp_url: pickString(doc?.temp_url),
        asset_value: pickAssetField(doc, config.candidates).value,
        doc
      }));
    if (typeof config.extractEntries === 'function') {
      checkedTotal = entries.length;
    }

    entries.forEach((entry) => {
      const category = classifyAssetEntry(entry);
      if (!Object.prototype.hasOwnProperty.call(metrics, category)) return;
      metrics[category] += 1;
      if (category !== 'healthy' && report.samples.length < 120) {
        report.samples.push(entry.doc
          ? createCollectionSample(entry.doc, config, category)
          : { ...entry, category });
      }
    });

    report.targets.push({
      name: config.name,
      total: checkedTotal,
      metrics
    });

    report.summary.checked_records += checkedTotal;
    Object.keys(report.summary.risk_breakdown).forEach((key) => {
      report.summary.risk_breakdown[key] += metrics[key] || 0;
    });
  }

  const singletonDocs = await fetchCollectionDocs('admin_singletons');
  const singletonMap = new Map((singletonDocs.list || []).map((row) => {
    const key = pickString(row.key || row.name || row._id);
    return [key, row];
  }));

  for (const target of TARGET_SINGLETONS) {
    const row = singletonMap.get(target.singletonKey);
    const rootField = row && row.value !== undefined ? 'value' : 'config_value';
    const value = row ? parseMaybeJson(row[rootField]) : null;
    const entries = row ? (target.extractEntries(row, value, rootField) || []).filter(Boolean) : [];
    const metrics = buildMetricBucket();

    entries.forEach((entry) => {
      const category = classifyAssetEntry(entry);
      metrics[category] += 1;
      if (category !== 'healthy' && report.samples.length < 120) {
        report.samples.push({
          ...entry,
          category
        });
      }
    });

    report.targets.push({
      name: target.name,
      total: entries.length,
      metrics
    });

    report.summary.checked_records += entries.length;
    Object.keys(report.summary.risk_breakdown).forEach((key) => {
      report.summary.risk_breakdown[key] += metrics[key] || 0;
    });
  }

  report.summary.risky_records = Object.entries(report.summary.risk_breakdown)
    .filter(([key]) => key !== 'healthy')
    .reduce((sum, [, count]) => sum + Number(count || 0), 0);

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
