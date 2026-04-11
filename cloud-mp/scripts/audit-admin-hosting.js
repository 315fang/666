const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const cloudRoot = path.resolve(__dirname, '..');
const docsDir = path.join(cloudRoot, 'docs');
const jsonPath = path.join(docsDir, 'ADMIN_HOSTING_AUDIT.json');
const mdPath = path.join(docsDir, 'ADMIN_HOSTING_AUDIT.md');

function readLocalAssets() {
  const html = fs.readFileSync(path.join(cloudRoot, 'admin-ui', 'dist', 'index.html'), 'utf8');
  return [...html.matchAll(/\/admin\/(assets\/[^"']+)/g)].map((match) => match[1]);
}

function readRemoteHtml() {
  const projectConfig = JSON.parse(fs.readFileSync(path.join(cloudRoot, 'project.config.json'), 'utf8'));
  const envId = projectConfig.cloudbaseEnv;
  const url = `https://${envId}-1419893803.tcloudbaseapp.com/admin/index.html?v=${Date.now()}`;
  let lastError = null;
  let html = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      html = execSync(`curl.exe --ssl-no-revoke "${url}"`, {
        cwd: cloudRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!html) throw lastError;
  return { url, html };
}

function extractAssets(html) {
  return [...html.matchAll(/\/admin\/(assets\/[^"']+)/g)].map((match) => match[1]);
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Admin Hosting Audit');
  lines.push('');
  lines.push(`生成时间：${report.generatedAt}`);
  lines.push(`入口：${report.url}`);
  lines.push('');
  lines.push('| 检查项 | 结果 |');
  lines.push('| --- | --- |');
  lines.push(`| 本地资源数 | ${report.localAssets.length} |`);
  lines.push(`| 线上资源数 | ${report.remoteAssets.length} |`);
  lines.push(`| 差异数 | ${report.diff.length} |`);
  lines.push('');
  if (report.diff.length) {
    lines.push('## 差异资源');
    lines.push('');
    for (const item of report.diff) lines.push(`- ${item}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const localAssets = readLocalAssets();
  const remote = readRemoteHtml();
  const remoteAssets = extractAssets(remote.html);
  const diff = localAssets.filter((item) => !remoteAssets.includes(item))
    .concat(remoteAssets.filter((item) => !localAssets.includes(item)));
  const report = {
    generatedAt: new Date().toISOString(),
    url: remote.url,
    ok: diff.length === 0,
    localAssets,
    remoteAssets,
    diff
  };
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, renderMarkdown(report));
  console.log(JSON.stringify({ jsonPath, mdPath, ok: report.ok, diffCount: diff.length }, null, 2));
  if (!report.ok) process.exit(1);
}

main();
