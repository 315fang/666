const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getAuditArtifactPaths } = require('./lib/audit-output');

const cloudRoot = path.resolve(__dirname, '..');
const { outputDir: docsDir, jsonPath, mdPath } = getAuditArtifactPaths(cloudRoot, 'CLOUDBASE_LIVE_SMOKE');

const checks = [
  { collection: 'admin_singletons', minCount: 4 },
  { collection: 'lottery_configs', minCount: 1 },
  { collection: 'wallet_recharge_configs', minCount: 1 }
];

function callMcporter(args) {
  const escapedArgs = args.map((arg) => {
    if (/[\s"]/g.test(arg)) {
      return `"${arg.replace(/"/g, '\\"')}"`;
    }
    return arg;
  });
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const output = execSync(`npx mcporter ${escapedArgs.join(' ')}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true
      });
      return JSON.parse(output);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function main() {
  const projectConfig = JSON.parse(fs.readFileSync(path.join(cloudRoot, 'project.config.json'), 'utf8'));
  const auth = callMcporter(['call', 'cloudbase.auth', 'action=status', '--output', 'json']);
  const results = [];
  for (const check of checks) {
    const structure = callMcporter([
      'call',
      'cloudbase.readNoSqlDatabaseStructure',
      'action=checkCollection',
      `collectionName=${check.collection}`,
      '--output',
      'json'
    ]);
    const content = callMcporter([
      'call',
      'cloudbase.readNoSqlDatabaseContent',
      `collectionName=${check.collection}`,
      'limit=20',
      '--output',
      'json'
    ]);
    results.push({
      collection: check.collection,
      exists: !!structure.exists,
      total: Number(content.total || 0),
      ok: !!structure.exists && Number(content.total || 0) >= check.minCount
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    envId: auth.current_env_id || projectConfig.cloudbaseEnv || '',
    authStatus: auth.auth_status || 'UNKNOWN',
    envStatus: auth.env_status || 'UNKNOWN',
    ok: results.every((item) => item.ok),
    results
  };

  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, [
    '# CloudBase Live Smoke',
    '',
    `生成时间：${report.generatedAt}`,
    `环境：${report.envId}`,
    '',
    '| 集合 | 存在 | 数量 | 结果 |',
    '| --- | --- | --- | --- |',
    ...report.results.map((item) => `| ${item.collection} | ${item.exists ? 'Y' : 'N'} | ${item.total} | ${item.ok ? '已验收' : '失败'} |`)
  ].join('\n') + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main();
