'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const defaultMcporterCli = 'D:/nodejs/node_global/node_modules/mcporter/dist/cli.js';
const mcporterCliPath = process.env.MCPORTER_CLI_PATH || defaultMcporterCli;
const shouldApply = process.argv.includes('--apply');
const PAGE_SIZE = 200;
const requestTimeoutMs = 7000;
const statusCache = new Map();

function pickString(value, fallback = '') {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function toAssetArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    if (text.startsWith('[')) {
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

function extractAssetValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    return pickString(
      value.image_ref
      || value.imageRef
      || value.file_id
      || value.fileId
      || value.url
      || value.image_url
      || value.imageUrl
      || value.temp_url
      || value.image
      || value.cover_image
      || value.coverImage
    );
  }
  return '';
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(pickString(value));
}

function isCloudFileId(value) {
  return /^cloud:\/\//i.test(pickString(value));
}

function unique(values) {
  const seen = new Set();
  const out = [];
  values.forEach((value) => {
    const text = extractAssetValue(value);
    if (!text || seen.has(text)) return;
    seen.add(text);
    out.push(text);
  });
  return out;
}

function callMcporter(selector, payload) {
  const useDirectCli = fs.existsSync(mcporterCliPath);
  const command = useDirectCli ? process.execPath : 'npx';
  const args = useDirectCli ? [
    mcporterCliPath,
    'call',
    selector,
    '--args',
    JSON.stringify(payload || {}),
    '--output',
    'json'
  ] : [
    'mcporter',
    'call',
    selector,
    '--args',
    JSON.stringify(payload || {}),
    '--output',
    'json'
  ];
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: !useDirectCli && process.platform === 'win32'
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${selector} failed`);
  }
  const stdout = pickString(result.stdout);
  return stdout ? JSON.parse(stdout) : {};
}

function readAll(collectionName) {
  const rows = [];
  let offset = 0;
  while (true) {
    const response = callMcporter('cloudbase.readNoSqlDatabaseContent', {
      collectionName,
      limit: PAGE_SIZE,
      offset
    });
    const list = Array.isArray(response && response.data) ? response.data : [];
    rows.push(...list);
    offset += list.length;
    if (!list.length || list.length < PAGE_SIZE) break;
  }
  return rows;
}

function updateOne(collectionName, docId, patch) {
  return callMcporter('cloudbase.writeNoSqlDatabaseContent', {
    action: 'update',
    collectionName,
    query: { _id: docId },
    update: { $set: patch },
    isMulti: false,
    upsert: false
  });
}

function headStatus(url) {
  const text = pickString(url);
  if (!isHttpUrl(text)) return Promise.resolve({ ok: true, statusCode: 0 });
  if (statusCache.has(text)) return Promise.resolve(statusCache.get(text));

  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(text);
    } catch (_) {
      const result = { ok: false, statusCode: 0, error: 'invalid_url' };
      statusCache.set(text, result);
      resolve(result);
      return;
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(parsed, { method: 'HEAD', timeout: requestTimeoutMs }, (res) => {
      const result = { ok: res.statusCode >= 200 && res.statusCode < 400, statusCode: res.statusCode || 0 };
      statusCache.set(text, result);
      res.resume();
      resolve(result);
    });
    req.on('timeout', () => {
      req.destroy();
      const result = { ok: false, statusCode: 0, error: 'timeout' };
      statusCache.set(text, result);
      resolve(result);
    });
    req.on('error', (error) => {
      const result = { ok: false, statusCode: 0, error: error.message || 'request_error' };
      statusCache.set(text, result);
      resolve(result);
    });
    req.end();
  });
}

async function isBadAsset(value) {
  const text = extractAssetValue(value);
  if (!text) return true;
  if (isCloudFileId(text)) return false;
  if (!isHttpUrl(text)) return false;
  const status = await headStatus(text);
  return !status.ok;
}

async function isStaleHttpAsset(value) {
  const text = extractAssetValue(value);
  if (!isHttpUrl(text)) return false;
  const status = await headStatus(text);
  return !status.ok;
}

async function pickUsableProductImage(product = {}) {
  const candidates = unique([
    ...toAssetArray(product.images),
    product.display_image,
    product.image_ref,
    product.image,
    product.image_url,
    product.cover_image,
    product.cover,
    product.thumbnail,
    ...toAssetArray(product.preview_images)
  ]);

  const cloudCandidate = candidates.find(isCloudFileId);
  if (cloudCandidate) return cloudCandidate;

  for (const candidate of candidates) {
    if (!(await isBadAsset(candidate))) return candidate;
  }
  return '';
}

function indexProducts(products) {
  const map = new Map();
  products.forEach((product) => {
    [product._id, product.id, product._legacy_id].forEach((key) => {
      const text = pickString(key);
      if (text) map.set(text, product);
    });
  });
  return map;
}

function summarizePlan(kind, doc, from, to) {
  return {
    kind,
    id: pickString(doc._id || doc.id),
    product_id: pickString(doc.product_id || doc.id || doc._legacy_id),
    name: pickString(doc.snapshot_name || doc.name).slice(0, 80),
    from,
    to
  };
}

async function buildPlan() {
  const [products, skus, cartItems] = ['products', 'skus', 'cart_items'].map(readAll);
  const productMap = indexProducts(products);
  const productImageCache = new Map();
  const plans = [];

  async function productImage(productId) {
    const key = pickString(productId);
    if (!key) return '';
    if (productImageCache.has(key)) return productImageCache.get(key);
    const product = productMap.get(key);
    const image = product ? await pickUsableProductImage(product) : '';
    productImageCache.set(key, image);
    return image;
  }

  for (const product of products) {
    if (!Array.isArray(product.skus) || !product.skus.length) continue;
    const fallback = await productImage(product._id || product.id || product._legacy_id);
    if (!fallback) continue;
    let changed = false;
    const nextSkus = [];
    for (const sku of product.skus) {
      const nextSku = { ...sku };
      if (await isStaleHttpAsset(sku.image) && sku.image !== fallback) {
        nextSku.image = fallback;
        changed = true;
      }
      nextSkus.push(nextSku);
    }
    if (changed) {
      plans.push({
        collection: 'products',
        queryId: pickString(product._id),
        patch: { skus: nextSkus },
        summary: summarizePlan('embedded_product_skus', product, '[embedded stale sku image]', fallback)
      });
    }
  }

  for (const sku of skus) {
    const fallback = await productImage(sku.product_id);
    if (!fallback) continue;
    if (await isStaleHttpAsset(sku.image) && sku.image !== fallback) {
      plans.push({
        collection: 'skus',
        queryId: pickString(sku._id),
        patch: { image: fallback },
        summary: summarizePlan('sku_image', sku, pickString(sku.image), fallback)
      });
    }
  }

  for (const item of cartItems) {
    const fallback = await productImage(item.product_id);
    if (!fallback) continue;
    if (await isStaleHttpAsset(item.snapshot_image) && item.snapshot_image !== fallback) {
      plans.push({
        collection: 'cart_items',
        queryId: pickString(item._id),
        patch: { snapshot_image: fallback },
        summary: summarizePlan('cart_snapshot_image', item, pickString(item.snapshot_image), fallback)
      });
    }
  }

  return plans;
}

async function main() {
  const plans = await buildPlan();
  console.log(JSON.stringify({
    mode: shouldApply ? 'apply' : 'dry-run',
    planned_updates: plans.length,
    plans: plans.map((item) => item.summary)
  }, null, 2));

  if (!shouldApply || !plans.length) return;

  for (const plan of plans) {
    if (!plan.queryId) throw new Error(`Missing _id for ${plan.collection}`);
    updateOne(plan.collection, plan.queryId, plan.patch);
    console.log(`updated ${plan.collection}/${plan.queryId} (${plan.summary.kind})`);
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
