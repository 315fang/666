const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const cloudRoot = path.resolve(__dirname, '..');
const docsDir = path.join(cloudRoot, 'docs');
const jsonPath = path.join(docsDir, 'BUSINESS_SMOKE_AUDIT.json');
const mdPath = path.join(docsDir, 'BUSINESS_SMOKE_AUDIT.md');

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

function projectEnvId() {
  const config = JSON.parse(fs.readFileSync(path.join(cloudRoot, 'project.config.json'), 'utf8'));
  return config.cloudbaseEnv;
}

function invokeFunction(functionName, params) {
  const payload = JSON.stringify(params).replace(/"/g, '\\"');
  const output = execCommand(
    `npx mcporter call cloudbase.manageFunctions action=invokeFunction functionName=${functionName} params="${payload}" --output json`
  );
  const json = JSON.parse(output);
  const retMsg = json?.data?.invokeResult?.RetMsg || '{}';
  let body;
  try {
    body = JSON.parse(retMsg);
  } catch (_) {
    body = { raw: retMsg };
  }
  if (typeof body.body === 'string') {
    try {
      body = JSON.parse(body.body);
    } catch (_) {
      body = { raw: body.body, statusCode: body.statusCode };
    }
  }
  return {
    status: Number(body.statusCode || body.code || 200),
    body
  };
}

function invokeAdmin(pathname, token) {
  return invokeFunction('admin-api', {
    httpMethod: 'GET',
    path: `/admin/api${pathname}`,
    headers: {
      authorization: `Bearer ${token}`
    }
  });
}

function invokeCloud(functionName, event) {
  return invokeFunction(functionName, event);
}

function validateAdminList(name, response, requireFields = []) {
  const result = { area: 'admin', name, ok: true, count: 0, issues: [] };
  if (response.status !== 200 || response.body.code !== 0) {
    result.ok = false;
    result.issues.push(`HTTP ${response.status} / code ${response.body.code ?? 'unknown'}`);
    return result;
  }
  const data = response.body.data;
  const list = Array.isArray(data) ? data : (Array.isArray(data?.list) ? data.list : []);
  result.count = list.length;
  if (!list.length) {
    result.ok = false;
    result.issues.push('返回列表为空');
    return result;
  }
  for (const field of requireFields) {
    if (list[0]?.[field] == null || list[0]?.[field] === '') {
      result.ok = false;
      result.issues.push(`首条记录缺少字段 ${field}`);
    }
  }
  return result;
}

function validateAdminObject(name, response, requiredKeys = []) {
  const result = { area: 'admin', name, ok: true, issues: [] };
  if (response.status !== 200 || response.body.code !== 0) {
    result.ok = false;
    result.issues.push(`HTTP ${response.status} / code ${response.body.code ?? 'unknown'}`);
    return result;
  }
  const data = response.body.data;
  for (const key of requiredKeys) {
    if (!(key in data)) {
      result.ok = false;
      result.issues.push(`缺少键 ${key}`);
    }
  }
  return result;
}

function validateCloudList(area, name, response, requireDataKey = 'list') {
  const result = { area, name, ok: true, count: 0, issues: [] };
  if (response.status !== 200 || response.body.code !== 0) {
    result.ok = false;
    result.issues.push(`HTTP ${response.status} / code ${response.body.code ?? 'unknown'}`);
    return result;
  }
  const data = response.body.data;
  const list = Array.isArray(data) ? data : (Array.isArray(data?.[requireDataKey]) ? data[requireDataKey] : []);
  result.count = list.length;
  if (!list.length) {
    result.ok = false;
    result.issues.push('返回列表为空');
  }
  return result;
}

function validateCloudObject(area, name, response, requiredKeys = []) {
  const result = { area, name, ok: true, issues: [] };
  if (response.status !== 200 || response.body.code !== 0) {
    result.ok = false;
    result.issues.push(`HTTP ${response.status} / code ${response.body.code ?? 'unknown'}`);
    return result;
  }
  const data = response.body.data;
  for (const key of requiredKeys) {
    if (!(key in data)) {
      result.ok = false;
      result.issues.push(`缺少键 ${key}`);
    }
  }
  return result;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Business Smoke Audit');
  lines.push('');
  lines.push(`生成时间：${report.generatedAt}`);
  lines.push(`环境：${report.envId}`);
  lines.push('');
  lines.push('| 范围 | 项目 | 结果 | 数量 | 问题 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const item of report.results) {
    lines.push(`| ${item.area} | ${item.name} | ${item.ok ? '通过' : '失败'} | ${item.count ?? '-'} | ${(item.issues || []).join('；') || '-'} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const envId = projectEnvId();
  const token = createAdminToken();
  const results = [];

  // Admin read-only business smoke
  results.push(validateAdminObject('dashboard-overview', invokeAdmin('/statistics/overview', token), ['total_orders', 'total_products']));
  results.push(validateAdminList('products', invokeAdmin('/products', token), ['name']));
  results.push(validateAdminList('orders', invokeAdmin('/orders', token), ['order_no']));
  results.push(validateAdminList('users', invokeAdmin('/users', token), ['nickname']));
  results.push(validateAdminList('refunds', invokeAdmin('/refunds', token)));
  results.push(validateAdminList('withdrawals', invokeAdmin('/withdrawals', token)));
  results.push(validateAdminList('group-buys', invokeAdmin('/group-buys', token), ['name']));
  results.push(validateAdminList('lottery-prizes', invokeAdmin('/lottery-prizes', token), ['name']));
  results.push(validateAdminObject('activity-links', invokeAdmin('/activity-links', token), ['banners', 'permanent', 'limited', 'brand_news']));
  results.push(validateAdminList('pickup-stations', invokeAdmin('/pickup-stations', token), ['name']));

  // Mini-program public cloud functions smoke
  const productsList = invokeCloud('products', { action: 'list', page: 1, size: 10 });
  results.push(validateCloudList('mini', 'products.list', productsList));

  const productsData = productsList.body?.data?.list || [];
  const firstProduct = productsData[0];
  if (firstProduct && (firstProduct._id || firstProduct.id)) {
    results.push(validateCloudObject('mini', 'products.detail', invokeCloud('products', { action: 'detail', product_id: firstProduct._id || firstProduct.id }), ['name']));
  }

  results.push(validateCloudList('mini', 'products.categories', invokeCloud('products', { action: 'categories' })));
  results.push(validateCloudObject('mini', 'config.homeContent', invokeCloud('config', { action: 'homeContent' }), ['banners', 'hot_products']));
  results.push(validateCloudList('mini', 'config.groups', invokeCloud('config', { action: 'groups' })));
  results.push(validateCloudList('mini', 'config.slashList', invokeCloud('config', { action: 'slashList' })));
  results.push(validateCloudObject('mini', 'config.lottery', invokeCloud('config', { action: 'lottery' })));
  results.push(validateCloudObject('mini', 'config.miniProgramConfig', invokeCloud('config', { action: 'miniProgramConfig' }), ['brand_config', 'feature_flags']));
  results.push(validateCloudList('mini', 'user.listStations', invokeCloud('user', { action: 'listStations' })));

  const report = {
    generatedAt: new Date().toISOString(),
    envId,
    ok: results.every((item) => item.ok),
    results
  };

  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, renderMarkdown(report));
  console.log(JSON.stringify({ jsonPath, mdPath, ok: report.ok, results }, null, 2));
  if (!report.ok) process.exit(1);
}

main();
