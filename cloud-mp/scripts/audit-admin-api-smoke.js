const fs = require('fs');
const path = require('path');

const cloudRoot = path.resolve(__dirname, '..');
const docsDir = path.join(cloudRoot, 'docs');
const jsonPath = path.join(docsDir, 'ADMIN_API_SMOKE.json');
const mdPath = path.join(docsDir, 'ADMIN_API_SMOKE.md');

function loadJwt() {
  try {
    return require(path.join(cloudRoot, 'cloudfunctions', 'admin-api', 'node_modules', 'jsonwebtoken'));
  } catch (_) {
    return require('jsonwebtoken');
  }
}

function queryFunctionDetail(functionName) {
  const output = execCommand(
    `npx mcporter call cloudbase.queryFunctions action=getFunctionDetail functionName=${functionName} --output json`
  );
  const payload = JSON.parse(output);
  return payload?.data?.functionDetail || payload?.data?.raw || {};
}

function resolveAdminJwtSecret() {
  if (process.env.ADMIN_JWT_SECRET) return process.env.ADMIN_JWT_SECRET;
  const detail = queryFunctionDetail('admin-api');
  const vars = Array.isArray(detail?.Environment?.Variables) ? detail.Environment.Variables : [];
  const hit = vars.find((item) => item?.Key === 'ADMIN_JWT_SECRET');
  if (hit?.Value) return hit.Value;
  throw new Error('无法解析云端 admin-api 的 ADMIN_JWT_SECRET');
}

function createToken() {
  const jwt = loadJwt();
  return jwt.sign(
    { id: 1, username: 'admin', role: 'super_admin' },
    resolveAdminJwtSecret(),
    { expiresIn: '12h' }
  );
}

function getAdminApiBase() {
  const projectConfig = JSON.parse(fs.readFileSync(path.join(cloudRoot, 'project.config.json'), 'utf8'));
  return `https://${projectConfig.cloudbaseEnv}.service.tcloudbase.com/admin/api`;
}

function execCommand(command) {
  const execute = (cmd) => require('child_process').execSync(cmd, {
    cwd: cloudRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true
  });

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return execute(command);
    } catch (error) {
      const detail = `${error?.stderr?.toString?.() || ''}\n${error?.stdout?.toString?.() || ''}`;
      const shouldFallback = /ERR_MODULE_NOT_FOUND|Cannot find package 'ora'/i.test(detail)
        && /npx\s+mcporter\b/i.test(command);
      if (shouldFallback) {
        const fallbackCommand = command.replace(/npx\s+mcporter\b/i, 'npx --yes mcporter@latest');
        return execute(fallbackCommand);
      }
      lastError = error;
    }
  }
  throw lastError;
}

function fetchJson(url, token) {
  const endpointPath = url.replace(getAdminApiBase(), '');
  const event = {
    httpMethod: 'GET',
    path: `/admin/api${endpointPath}`,
    headers: {
      authorization: `Bearer ${token}`
    }
  };
  const output = execCommand(
    `npx mcporter call cloudbase.manageFunctions action=invokeFunction functionName=admin-api params="${JSON.stringify(event).replace(/"/g, '\\"')}" --output json`
  );
  const invokePayload = JSON.parse(output);
  const retMsg = invokePayload?.data?.invokeResult?.RetMsg || '{}';
  let body;
  try {
    body = JSON.parse(retMsg);
  } catch (_) {
    body = { raw: retMsg };
  }
  const statusCode = Number(body.statusCode || body.code || 500);
  let responseBody = body;
  if (typeof body.body === 'string') {
    try {
      responseBody = JSON.parse(body.body);
    } catch (_) {
      responseBody = { raw: body.body };
    }
  }
  return { status: statusCode, body: responseBody };
}

function validateListPayload(name, response, { min = 0, requireFields = [] } = {}) {
  const result = { name, ok: true, status: response.status, count: 0, issues: [] };
  const body = response.body;
  if (response.status !== 200 || body.code !== 0) {
    result.ok = false;
    result.issues.push(`HTTP ${response.status} / code ${body.code ?? 'unknown'}`);
    return result;
  }
  const data = body.data;
  const list = Array.isArray(data) ? data : (Array.isArray(data?.list) ? data.list : []);
  result.count = list.length;
  if (list.length < min) {
    result.ok = false;
    result.issues.push(`返回数量 ${list.length} 小于期望 ${min}`);
  }
  if (list.length && requireFields.length) {
    const first = list[0];
    for (const field of requireFields) {
      if (first[field] == null || first[field] === '') {
        result.ok = false;
        result.issues.push(`首条记录缺少字段 ${field}`);
      }
    }
  }
  return result;
}

function validateObjectPayload(name, response, requiredKeys = []) {
  const result = { name, ok: true, status: response.status, issues: [] };
  const body = response.body;
  if (response.status !== 200 || body.code !== 0) {
    result.ok = false;
    result.issues.push(`HTTP ${response.status} / code ${body.code ?? 'unknown'}`);
    return result;
  }
  const data = body.data;
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
  lines.push('# Admin API Smoke');
  lines.push('');
  lines.push(`生成时间：${report.generatedAt}`);
  lines.push(`入口：${report.baseUrl}`);
  lines.push('');
  lines.push('| 接口 | 结果 | 数量 | 问题 |');
  lines.push('| --- | --- | --- | --- |');
  for (const item of report.results) {
    lines.push(`| ${item.name} | ${item.ok ? '通过' : '失败'} | ${item.count ?? '-'} | ${(item.issues || []).join('；') || '-'} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const baseUrl = getAdminApiBase();
  const token = createToken();
  const endpoints = [
    { name: 'products', path: '/products', type: 'list', min: 1, requireFields: ['name'] },
    { name: 'orders', path: '/orders', type: 'list', min: 1, requireFields: ['order_no'] },
    { name: 'users', path: '/users', type: 'list', min: 1, requireFields: ['nickname'] },
    { name: 'refunds', path: '/refunds', type: 'list', min: 0, requireFields: [] },
    { name: 'withdrawals', path: '/withdrawals', type: 'list', min: 0, requireFields: [] },
    { name: 'commissions', path: '/commissions', type: 'list', min: 0, requireFields: [] },
    { name: 'group-buys', path: '/group-buys', type: 'list', min: 1, requireFields: ['name'] },
    { name: 'lottery-prizes', path: '/lottery-prizes', type: 'list', min: 1, requireFields: ['name'] },
    { name: 'pickup-stations', path: '/pickup-stations', type: 'list', min: 1, requireFields: ['name'] },
    { name: 'activity-links', path: '/activity-links', type: 'object', requiredKeys: ['banners', 'permanent', 'limited', 'brand_news'] }
  ];

  const results = [];
  for (const endpoint of endpoints) {
    const response = fetchJson(`${baseUrl}${endpoint.path}`, token);
    if (endpoint.type === 'list') {
      results.push(validateListPayload(endpoint.name, response, endpoint));
    } else {
      results.push(validateObjectPayload(endpoint.name, response, endpoint.requiredKeys));
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    ok: results.every((item) => item.ok),
    results
  };

  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, renderMarkdown(report));
  console.log(JSON.stringify({ jsonPath, mdPath, ok: report.ok, results }, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
