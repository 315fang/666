'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const {
  projectRoot,
  ensureDir,
  nowIso,
  getShanghaiTimestampKey,
  formatDateParts,
  writeJson,
  writeText,
  runtimeFile
} = require('./release-runtime-kit');

const COLLECTION_GROUPS = [
  {
    group: 'admin_identity',
    collections: ['admins', 'admin_roles', 'admin_singletons']
  },
  {
    group: 'catalog_content',
    collections: ['products', 'skus', 'categories', 'banners', 'contents', 'materials', 'material_groups', 'content_boards', 'content_board_products', 'splash_screens']
  },
  {
    group: 'transaction_fulfillment',
    collections: ['cart_items', 'orders', 'refunds', 'reviews', 'stations', 'station_staff']
  },
  {
    group: 'user_finance',
    collections: ['users', 'commissions', 'withdrawals', 'wallet_accounts', 'wallet_logs', 'upgrade_piggy_bank_logs', 'point_accounts', 'point_logs', 'user_coupons']
  },
  {
    group: 'distribution_lineage',
    collections: ['promotion_lineage_logs']
  },
  {
    group: 'configs',
    collections: ['configs', 'app_configs']
  }
];

const COLLECTION_NAMES = COLLECTION_GROUPS.flatMap((item) => item.collections);
const DEFAULT_LIMIT = 200;

function getProjectEnvId() {
  const projectConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'project.config.json'), 'utf8'));
  return String(projectConfig.cloudbaseEnv || '').trim();
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
    const stderr = error?.stderr?.toString?.() || '';
    const stdout = error?.stdout?.toString?.() || '';
    throw new Error(stderr || stdout || `mcporter call cloudbase.${toolName} failed`);
  }
}

function resolveTotal(payload, fallbackCount) {
  if (Number.isFinite(payload?.total)) return Number(payload.total);
  if (Number.isFinite(payload?.pager?.Total)) return Number(payload.pager.Total);
  if (Array.isArray(payload?.data)) return payload.data.length;
  return fallbackCount;
}

function normalizeStoragePath(value) {
  return String(value || '').replace(/^\/+|\/+$/g, '');
}

function uploadToCloudBaseStorage(localPath, cloudPath) {
  return runMcporterCall('manageStorage', {
    action: 'upload',
    localPath,
    cloudPath: normalizeStoragePath(cloudPath)
  });
}

async function exportCollectionToJsonl(collectionName, filePath) {
  ensureDir(path.dirname(filePath));
  const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
  let offset = 0;
  let total = 0;

  try {
    while (true) {
      const payload = runMcporterCall('readNoSqlDatabaseContent', {
        collectionName,
        limit: DEFAULT_LIMIT,
        offset
      });
      const rows = Array.isArray(payload.data) ? payload.data : [];
      rows.forEach((row) => {
        stream.write(`${JSON.stringify(row)}\n`);
      });
      total = resolveTotal(payload, total);
      offset += rows.length;
      if (!rows.length || rows.length < DEFAULT_LIMIT) break;
    }
  } finally {
    await new Promise((resolve) => {
      stream.end(resolve);
    });
  }

  return total;
}

function renderBackupMarkdown(report) {
  const lines = [];
  lines.push('# Daily CloudBase Backup');
  lines.push('');
  lines.push(`- Env ID: ${report.env_id}`);
  lines.push(`- Generated at: ${report.generated_at}`);
  lines.push(`- Status: ${report.status}`);
  lines.push(`- Storage prefix: \`${report.storage_prefix}\``);
  lines.push('');
  lines.push('## Collections');
  lines.push('');
  report.collections.forEach((item) => {
    lines.push(`- \`${item.collection}\`: ${item.count} rows -> \`${item.object_key}\``);
  });
  lines.push('');
  lines.push('## Errors');
  lines.push('');
  if (report.errors.length) {
    report.errors.forEach((item) => lines.push(`- ${item.collection}: ${item.message}`));
  } else {
    lines.push('- none');
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const envId = getProjectEnvId();
  if (!envId) {
    throw new Error('project.config.json 缺少 cloudbaseEnv，无法执行日备份');
  }

  const authStatus = runMcporterCall('auth', { action: 'status' });
  if (authStatus.auth_status !== 'READY' || authStatus.env_status !== 'READY') {
    throw new Error(`CloudBase 认证或环境未就绪：auth=${authStatus.auth_status || 'unknown'}, env=${authStatus.env_status || 'unknown'}`);
  }

  const prefix = normalizeStoragePath(process.env.OPS_BACKUP_PREFIX || 'ops-backups');
  const shanghaiParts = formatDateParts(new Date());
  const timestampKey = getShanghaiTimestampKey(new Date());
  const storagePrefix = `${prefix}/${envId}/daily/${shanghaiParts.year}/${shanghaiParts.month}/${shanghaiParts.day}/${timestampKey}`;
  const tempRoot = path.join(os.tmpdir(), `cloud-mp-backup-${timestampKey}`);
  ensureDir(tempRoot);

  const report = {
    env_id: envId,
    generated_at: nowIso(),
    storage_prefix: storagePrefix,
    status: 'success',
    collections: [],
    counts: {},
    errors: []
  };

  try {
    for (const collectionName of COLLECTION_NAMES) {
      const localPath = path.join(tempRoot, `${collectionName}.jsonl`);
      try {
        const count = await exportCollectionToJsonl(collectionName, localPath);
        const objectKey = `${storagePrefix}/${collectionName}.jsonl`;
        uploadToCloudBaseStorage(localPath, objectKey);
        report.collections.push({
          group: COLLECTION_GROUPS.find((group) => group.collections.includes(collectionName))?.group || 'unknown',
          collection: collectionName,
          count,
          object_key: objectKey
        });
        report.counts[collectionName] = count;
      } catch (error) {
        report.status = 'partial_failure';
        report.errors.push({
          collection: collectionName,
          message: error.message || String(error)
        });
      }
    }

    const summaryPath = path.join(tempRoot, '_summary.json');
    const manifestPath = path.join(tempRoot, 'backup-manifest.json');
    writeJson(summaryPath, report.counts);
    writeJson(manifestPath, report);

    uploadToCloudBaseStorage(summaryPath, `${storagePrefix}/_summary.json`);
    uploadToCloudBaseStorage(manifestPath, `${storagePrefix}/backup-manifest.json`);

    const latestJsonPath = runtimeFile('backup-latest.json');
    const latestMdPath = runtimeFile('backup-latest.md');
    writeJson(latestJsonPath, report);
    writeText(latestMdPath, renderBackupMarkdown(report));

    console.log(JSON.stringify({
      ok: report.status === 'success',
      env_id: report.env_id,
      storage_prefix: report.storage_prefix,
      collections: report.collections.length,
      errors: report.errors
    }, null, 2));

    if (report.status !== 'success') {
      process.exitCode = 1;
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const fallback = {
    env_id: (() => {
      try {
        return getProjectEnvId();
      } catch (_) {
        return '';
      }
    })(),
    generated_at: nowIso(),
    storage_prefix: '',
    status: 'failure',
    collections: [],
    counts: {},
    errors: [{ collection: 'backup', message: error.message || String(error) }]
  };
  writeJson(runtimeFile('backup-latest.json'), fallback);
  writeText(runtimeFile('backup-latest.md'), renderBackupMarkdown(fallback));
  console.error(error && error.stack || error);
  process.exit(1);
});
