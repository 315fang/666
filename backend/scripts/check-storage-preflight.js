#!/usr/bin/env node
require('dotenv').config();

const provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
const checks = [];

const add = (ok, name, detail) => {
  checks.push({ ok, name, detail });
};

add(['local', 'aliyun', 'tencent', 'qiniu', 'minio'].includes(provider), 'STORAGE_PROVIDER', provider);

if (provider === 'tencent') {
  add(!!process.env.TENCENT_SECRET_ID, 'TENCENT_SECRET_ID', process.env.TENCENT_SECRET_ID ? 'configured' : 'missing');
  add(!!process.env.TENCENT_SECRET_KEY, 'TENCENT_SECRET_KEY', process.env.TENCENT_SECRET_KEY ? 'configured' : 'missing');
  add(!!process.env.TENCENT_COS_BUCKET, 'TENCENT_COS_BUCKET', process.env.TENCENT_COS_BUCKET || 'missing');
  add(!!process.env.TENCENT_COS_REGION, 'TENCENT_COS_REGION', process.env.TENCENT_COS_REGION || 'missing');
  add(!!process.env.TENCENT_COS_CUSTOM_DOMAIN, 'TENCENT_COS_CUSTOM_DOMAIN', process.env.TENCENT_COS_CUSTOM_DOMAIN || 'missing');
}

if (provider === 'local') {
  add(!!process.env.LOCAL_UPLOAD_DIR, 'LOCAL_UPLOAD_DIR', process.env.LOCAL_UPLOAD_DIR || 'missing');
  add(!!process.env.LOCAL_BASE_URL, 'LOCAL_BASE_URL', process.env.LOCAL_BASE_URL || 'missing');
}

let hasError = false;
console.log('\n[Storage Preflight]');
checks.forEach((c) => {
  const tag = c.ok ? 'OK ' : 'ERR';
  if (!c.ok) hasError = true;
  console.log(`${tag}  ${c.name}: ${c.detail}`);
});

if (provider === 'tencent' && process.env.TENCENT_COS_CUSTOM_DOMAIN) {
  const sample = `${String(process.env.TENCENT_COS_CUSTOM_DOMAIN).replace(/\/+$/, '')}/products/sample.jpg`;
  console.log(`\nSample CDN URL: ${sample}`);
}

if (hasError) {
  console.log('\nResult: FAILED (fix missing items before go-live)');
  process.exit(1);
}

console.log('\nResult: PASSED');
