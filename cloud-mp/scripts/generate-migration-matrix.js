const fs = require('fs');
const path = require('path');

const cloudRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(cloudRoot, '..');
const docsDir = path.join(cloudRoot, 'docs');
const jsonPath = path.join(docsDir, 'CLOUD_MP_MIGRATION_MATRIX.json');
const mdPath = path.join(docsDir, 'CLOUD_MP_MIGRATION_MATRIX.md');
const liveSmokePath = path.join(docsDir, 'CLOUDBASE_LIVE_SMOKE.json');

const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', '.runtime', '.omx']);
const textExtensions = new Set(['.js', '.json', '.md', '.vue', '.wxml', '.wxss']);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignoreDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    if (textExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

function toPosix(value) {
  return value.replace(/\\/g, '/');
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function normalizeTemplateUrl(raw) {
  if (!raw) return '';
  let url = raw.trim();
  url = url.replace(/\$\{[^}]+\}/g, ':id');
  url = url.replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, ':id');
  url = url.replace(/\?[^`'"]*$/, '');
  url = url.replace(/:id:id/g, ':id');
  url = url.replace(/\/+/g, '/');
  return url;
}

function extractAppPages(appJsonPath) {
  const appJson = readJson(appJsonPath, {});
  const pages = [];
  for (const page of appJson.pages || []) {
    pages.push(page);
  }
  for (const pkg of appJson.subPackages || []) {
    for (const page of pkg.pages || []) {
      pages.push(`${pkg.root}/${page}`);
    }
  }
  return uniqueSorted(pages);
}

function extractRouteTableActions(requestJsPath) {
  const text = fs.readFileSync(requestJsPath, 'utf8');
  const matches = [...text.matchAll(/'([^']+)'\s*:\s*\{\s*fn:\s*'([^']+)'\s*,\s*action:\s*(null|'([^']+)')/g)];
  return matches.map((match) => ({
    routeKey: match[1],
    fn: match[2],
    action: match[3] === 'null' ? null : match[4]
  }));
}

function extractCloudFunctionActions(indexJsPath) {
  const text = fs.readFileSync(indexJsPath, 'utf8');
  const actions = new Set();
  for (const match of text.matchAll(/'([^']+)'\s*:/g)) {
    actions.add(match[1]);
  }
  for (const match of text.matchAll(/action\s*===\s*'([^']+)'/g)) {
    actions.add(match[1]);
  }
  return actions;
}

function extractAdminApiRoutes(adminApiSrcDir) {
  const routes = new Map();
  for (const file of walkFiles(adminApiSrcDir)) {
    if (!file.endsWith('.js')) continue;
    const text = fs.readFileSync(file, 'utf8');
    const rel = toPosix(path.relative(cloudRoot, file));
    for (const match of text.matchAll(/app\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g)) {
      const method = match[1].toUpperCase();
      const routePath = normalizeTemplateUrl(match[2].replace(/^\/admin\/api/, ''));
      routes.set(`${method} ${routePath}`, rel);
    }
    for (const match of text.matchAll(/crudCollection\(\{\s*[\s\S]*?basePath:\s*'([^']+)'[\s\S]*?\}\);/g)) {
      const basePath = normalizeTemplateUrl(`/${match[1]}`);
      for (const routeKey of [
        `GET ${basePath}`,
        `GET ${basePath}/:id`,
        `POST ${basePath}`,
        `PUT ${basePath}/:id`,
        `DELETE ${basePath}/:id`
      ]) {
        routes.set(routeKey, rel);
      }
    }
  }
  return routes;
}

function extractAdminUiUrls(adminApiModulesDir) {
  const calls = [];
  if (!fs.existsSync(adminApiModulesDir)) return calls;
  const files = walkFiles(adminApiModulesDir).filter((file) => file.endsWith('.js'));
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = toPosix(path.relative(workspaceRoot, file));
    for (const match of text.matchAll(/request\(\{\s*url:\s*['"`]([^'"`]+)['"`]\s*,\s*method:\s*['"`]([^'"`]+)['"`]/g)) {
      calls.push({
        method: match[2].toUpperCase(),
        rawUrl: match[1],
        url: normalizeTemplateUrl(match[1]),
        file: rel
      });
    }
  }
  return calls;
}

function extractTargetCollections(targetModelPath) {
  const text = fs.readFileSync(targetModelPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const collections = [];
  let inSection = false;
  for (const line of lines) {
    if (line.trim() === '## 正式集合') {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith('## ')) break;
    if (!inSection) continue;
    const match = line.match(/^- `([^`]+)`/);
    if (match) {
      collections.push(match[1]);
    }
  }
  return uniqueSorted(collections);
}

function routeKeyMatches(patternKey, concreteKey) {
  const [patternMethod, patternPath] = patternKey.split(' ');
  const [concreteMethod, concretePath] = concreteKey.split(' ');
  if (patternMethod !== concreteMethod) return false;
  const patternParts = patternPath.split('/');
  const concreteParts = concretePath.split('/');
  if (patternParts.length !== concreteParts.length) return false;
  for (let i = 0; i < patternParts.length; i += 1) {
    if (patternParts[i] === ':id') continue;
    if (patternParts[i] !== concreteParts[i]) return false;
  }
  return true;
}

function countLegacyCollectionReferences(collectionName) {
  const roots = [
    path.join(workspaceRoot, 'backend'),
    path.join(workspaceRoot, 'admin-ui'),
    path.join(workspaceRoot, 'miniprogram')
  ];
  const pattern = new RegExp(`\\b${collectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
  let count = 0;
  for (const root of roots) {
    for (const file of walkFiles(root)) {
      const text = fs.readFileSync(file, 'utf8');
      count += [...text.matchAll(pattern)].length;
    }
  }
  return count;
}

function buildMiniProgramMatrix() {
  const legacyPages = extractAppPages(path.join(workspaceRoot, 'miniprogram', 'app.json'));
  const targetPages = extractAppPages(path.join(cloudRoot, 'miniprogram', 'app.json'));
  const targetPageSet = new Set(targetPages);
  const rows = legacyPages.map((page) => ({
    item: page,
    legacy: `miniprogram/${page}`,
    target: targetPageSet.has(page) ? `cloud-mp/miniprogram/${page}` : '',
    status: targetPageSet.has(page) ? '已通' : '缺前端'
  }));
  const extras = targetPages
    .filter((page) => !legacyPages.includes(page))
    .map((page) => ({
      item: page,
      legacy: '',
      target: `cloud-mp/miniprogram/${page}`,
      status: '仅cloud-mp'
    }));
  return [...rows, ...extras];
}

function buildCloudFunctionMatrix() {
  const requestEntries = extractRouteTableActions(path.join(cloudRoot, 'miniprogram', 'utils', 'request.js'));
  const grouped = new Map();
  for (const entry of requestEntries) {
    if (!entry.action) continue;
    const key = `${entry.fn}:${entry.action}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        item: key,
        routeKeys: [],
        fn: entry.fn,
        action: entry.action
      });
    }
    grouped.get(key).routeKeys.push(entry.routeKey);
  }

  const rows = [];
  for (const entry of grouped.values()) {
    const indexJsPath = path.join(cloudRoot, 'cloudfunctions', entry.fn, 'index.js');
    const actionSet = fs.existsSync(indexJsPath) ? extractCloudFunctionActions(indexJsPath) : new Set();
    rows.push({
      item: `${entry.fn}.${entry.action}`,
      legacy: entry.routeKeys.join(' | '),
      target: `cloud-mp/cloudfunctions/${entry.fn}/index.js`,
      status: actionSet.has(entry.action) ? '已通' : '缺接口'
    });
  }
  return rows.sort((a, b) => a.item.localeCompare(b.item, 'en'));
}

function buildAdminApiMatrix() {
  const apiCalls = extractAdminUiUrls(path.join(workspaceRoot, 'admin-ui', 'src', 'api', 'modules'));
  const adminRoutes = extractAdminApiRoutes(path.join(cloudRoot, 'cloudfunctions', 'admin-api', 'src'));
  const seen = new Set();
  const rows = [];

  for (const call of apiCalls) {
    const methodKey = `${call.method} ${call.url}`;
    const matchedKey = adminRoutes.has(methodKey)
      ? methodKey
      : [...adminRoutes.keys()].find((routeKey) => routeKeyMatches(routeKey, methodKey));
    const status = matchedKey ? '已通' : '缺接口';
    const item = methodKey || call.url;
    const dedupeKey = `${call.file}|${call.url}|${call.method}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    rows.push({
      item,
      legacy: call.file,
      target: matchedKey ? `cloud-mp/${adminRoutes.get(matchedKey)}` : '',
      status
    });
  }
  return rows.sort((a, b) => a.item.localeCompare(b.item, 'en'));
}

function buildCollectionMatrix() {
  const liveSmoke = readJson(liveSmokePath, null);
  const validated = new Set(
    Array.isArray(liveSmoke && liveSmoke.results)
      ? liveSmoke.results.filter((item) => item.ok).map((item) => item.collection)
      : []
  );
  const collections = extractTargetCollections(path.join(cloudRoot, 'CLOUDBASE_TARGET_MODEL.md'));
  return collections.map((collection) => {
    const seedPath = path.join(cloudRoot, 'cloudbase-seed', `${collection}.json`);
    const importPath = path.join(cloudRoot, 'cloudbase-import', `${collection}.jsonl`);
    const hasSeed = fs.existsSync(seedPath);
    const hasImport = fs.existsSync(importPath);
    const referenceCount = countLegacyCollectionReferences(collection);
    let status = '已建模';
    if (!hasSeed || !hasImport) {
      status = '缺数据';
    } else if (validated.has(collection)) {
      status = '已验收';
    } else if (!referenceCount) {
      status = '缺验收';
    }
    return {
      item: collection,
      legacy: referenceCount ? `旧工程引用 ${referenceCount} 次` : '旧工程未直接命中',
      target: `seed:${hasSeed ? 'Y' : 'N'} / import:${hasImport ? 'Y' : 'N'}`,
      status
    };
  });
}

function buildAdminSourceStatus() {
  const targetAdminDir = path.join(cloudRoot, 'admin-ui');
  return {
    exists: fs.existsSync(path.join(targetAdminDir, 'package.json')),
    routeSource: fs.existsSync(path.join(targetAdminDir, 'src', 'router', 'index.js'))
  };
}

function countStatus(rows) {
  return rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
}

function renderTable(rows) {
  const lines = ['| 项目 | 旧工程参考 | cloud-mp 落点 | 状态 |', '| --- | --- | --- | --- |'];
  for (const row of rows) {
    lines.push(`| ${row.item} | ${row.legacy} | ${row.target} | ${row.status} |`);
  }
  return lines.join('\n');
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# cloud-mp 迁移矩阵');
  lines.push('');
  lines.push(`生成时间：${report.generatedAt}`);
  lines.push('');
  lines.push('本矩阵以 `cloud-mp` 为主工程，只把旧 `backend / admin-ui / miniprogram` 作为对照参考。');
  lines.push('');
  lines.push('## 概览');
  lines.push('');
  lines.push(`- 管理端源码并入：${report.adminSource.exists ? '已并入' : '缺前端'}`);
  lines.push(`- 管理端路由入口：${report.adminSource.routeSource ? '已存在' : '缺前端'}`);
  lines.push(`- 小程序页面状态统计：${JSON.stringify(report.summary.miniprogram)}`);
  lines.push(`- 云函数 action 状态统计：${JSON.stringify(report.summary.cloudfunctions)}`);
  lines.push(`- 管理接口状态统计：${JSON.stringify(report.summary.adminApi)}`);
  lines.push(`- 数据模型状态统计：${JSON.stringify(report.summary.collections)}`);
  lines.push('');
  lines.push('## 小程序页面');
  lines.push('');
  lines.push(renderTable(report.miniprogram));
  lines.push('');
  lines.push('## 云函数 Action');
  lines.push('');
  lines.push(renderTable(report.cloudfunctions));
  lines.push('');
  lines.push('## 管理接口');
  lines.push('');
  lines.push(renderTable(report.adminApi));
  lines.push('');
  lines.push('## CloudBase 数据集合');
  lines.push('');
  lines.push(renderTable(report.collections));
  lines.push('');
  lines.push('## 说明');
  lines.push('');
  lines.push('- `已通`：旧工程参考项在 `cloud-mp` 中已有明确落点。');
  lines.push('- `缺前端`：旧页面或管理端源码尚未并入 `cloud-mp`。');
  lines.push('- `缺接口`：旧 API 调用在 `cloud-mp` 管理服务中尚未找到实现。');
  lines.push('- `缺数据`：正式集合缺少 seed 或 import 文件。');
  lines.push('- `缺验收`：已建模但旧工程引用证据弱，仍需场景级 smoke test。');
  lines.push('- `已验收`：已建模且已通过 live smoke 校验。');
  lines.push('- `仅cloud-mp`：只在新工程中出现的页面或能力。');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    adminSource: buildAdminSourceStatus(),
    miniprogram: buildMiniProgramMatrix(),
    cloudfunctions: buildCloudFunctionMatrix(),
    adminApi: buildAdminApiMatrix(),
    collections: buildCollectionMatrix()
  };
  report.summary = {
    miniprogram: countStatus(report.miniprogram),
    cloudfunctions: countStatus(report.cloudfunctions),
    adminApi: countStatus(report.adminApi),
    collections: countStatus(report.collections)
  };

  ensureDir(docsDir);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, renderMarkdown(report));
  console.log(JSON.stringify({
    jsonPath: toPosix(path.relative(workspaceRoot, jsonPath)),
    mdPath: toPosix(path.relative(workspaceRoot, mdPath)),
    summary: report.summary
  }, null, 2));
}

main();
