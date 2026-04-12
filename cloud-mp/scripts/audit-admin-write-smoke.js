const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const cloudRoot = path.resolve(__dirname, '..');
const docsDir = path.join(cloudRoot, 'docs');
const jsonPath = path.join(docsDir, 'ADMIN_WRITE_SMOKE.json');
const mdPath = path.join(docsDir, 'ADMIN_WRITE_SMOKE.md');

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0r8AAAAASUVORK5CYII=';

function execCommand(command) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return execSync(command, {
        cwd: cloudRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function loadJwt() {
  return require(path.join(cloudRoot, 'cloudfunctions', 'admin-api', 'node_modules', 'jsonwebtoken'));
}

function createAdminToken() {
  const jwt = loadJwt();
  return jwt.sign({ id: 1, username: 'admin', role: 'super_admin' }, 'admin-api-function-secret', { expiresIn: '12h' });
}

function invokeAdmin(method, pathname, token, body) {
  const event = {
    httpMethod: method,
    path: `/admin/api${pathname}`,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    }
  };
  if (body !== undefined) event.body = body;

  const payload = JSON.stringify(event).replace(/"/g, '\\"');
  const output = execCommand(
    `npx mcporter call cloudbase.manageFunctions action=invokeFunction functionName=admin-api params="${payload}" --output json`
  );
  const json = JSON.parse(output);
  const retMsg = json?.data?.invokeResult?.RetMsg || '{}';
  let result;
  try {
    result = JSON.parse(retMsg);
  } catch (_) {
    result = { raw: retMsg };
  }

  const status = Number(result.statusCode || result.code || 500);
  let responseBody = result;
  if (typeof result.body === 'string') {
    try {
      responseBody = JSON.parse(result.body);
    } catch (_) {
      responseBody = { raw: result.body };
    }
  }
  return { status, body: responseBody };
}

function pushStep(steps, name, response, extra = {}) {
  const ok = response.status === 200 && response.body?.code === 0;
  const item = {
    name,
    ok,
    status: response.status,
    message: ok ? 'ok' : (response.body?.message || response.body?.raw || 'unknown error'),
    ...extra
  };
  steps.push(item);
  return item;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Admin Write Smoke');
  lines.push('');
  lines.push(`生成时间：${report.generatedAt}`);
  lines.push('');
  lines.push('| 步骤 | 结果 | HTTP | 说明 |');
  lines.push('| --- | --- | --- | --- |');
  for (const item of report.steps) {
    lines.push(`| ${item.name} | ${item.ok ? '通过' : '失败'} | ${item.status} | ${item.message || '-'} |`);
  }
  lines.push('');
  if (report.productId) lines.push(`- 回滚商品 ID: ${report.productId}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const token = createAdminToken();
  const steps = [];
  let productId = null;

  try {
    const uploadResponse = invokeAdmin('POST', '/upload', token, {
      name: 'admin-write-smoke.png',
      mime_type: 'image/png',
      content_base64: TINY_PNG_BASE64,
      skip_library: '1',
      folder: 'materials'
    });
    pushStep(steps, 'upload', uploadResponse);
    if (!(uploadResponse.status === 200 && uploadResponse.body?.code === 0)) {
      throw new Error(uploadResponse.body?.message || 'upload failed');
    }

    const uploadData = uploadResponse.body.data || {};
    const persistedImage = uploadData.file_id || uploadData.url;
    if (!persistedImage) {
      throw new Error('upload missing file_id/url');
    }

    const createResponse = invokeAdmin('POST', '/products', token, {
      name: `Smoke Product ${Date.now()}`,
      description: 'Created by admin write smoke',
      retail_price: 0.01,
      cost_price: 0.01,
      market_price: 0.01,
      stock: 1,
      status: 0,
      images: [persistedImage],
      detail_images: [],
      enable_coupon: 0,
      enable_group_buy: 0,
      custom_commissions: 0,
      allow_points: 1
    });
    pushStep(steps, 'create_product', createResponse);
    if (!(createResponse.status === 200 && createResponse.body?.code === 0)) {
      throw new Error(createResponse.body?.message || 'create product failed');
    }

    productId = createResponse.body?.data?.id;
    if (!productId) {
      throw new Error('create product missing id');
    }

    const detailResponse = invokeAdmin('GET', `/products/${productId}`, token);
    const detailStep = pushStep(steps, 'product_detail', detailResponse);
    if (detailStep.ok) {
      const firstImage = detailResponse.body?.data?.images?.[0] || '';
      if (!/^https?:\/\//i.test(firstImage)) {
        detailStep.ok = false;
        detailStep.message = 'product detail did not resolve image url';
      }
    } else if (detailResponse.status === 404) {
      detailStep.message = '商品创建已返回成功，但后续读取为 404；现网 admin-api 很可能仍缺少商品直写 CloudBase 的部署'
    }
  } catch (error) {
    steps.push({
      name: 'summary',
      ok: false,
      status: 500,
      message: error.message || 'write smoke failed'
    });
  } finally {
    if (productId != null) {
      const deleteResponse = invokeAdmin('DELETE', `/products/${productId}`, token);
      const deleteStep = pushStep(steps, 'delete_product', deleteResponse);
      if (!deleteStep.ok && deleteResponse.status === 404) {
        deleteStep.ok = true;
        deleteStep.message = '商品已不存在，无需回滚删除';
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    ok: steps.every((item) => item.ok),
    steps,
    productId
  };

  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, renderMarkdown(report));
  console.log(JSON.stringify({ ok: report.ok, jsonPath, mdPath, steps }, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
