const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getAuditArtifactPaths, getAuditOutputDir, toMarkdownFileLink } = require('./lib/audit-output');

const cloudRoot = path.resolve(__dirname, '..');
const docsDir = getAuditOutputDir(cloudRoot);
const { jsonPath, mdPath } = getAuditArtifactPaths(cloudRoot, 'AUDIT_ALL_SUMMARY');

const steps = [
  { name: 'foundation', command: 'npm run check:foundation', jsonPath: null },
  { name: 'hosting', command: 'npm run audit:hosting', jsonPath: path.join(docsDir, 'ADMIN_HOSTING_AUDIT.json') },
  { name: 'migration', command: 'npm run audit:migration', jsonPath: path.join(docsDir, 'CLOUD_MP_MIGRATION_MATRIX.json') },
  { name: 'runtimeSmoke', command: 'npm run runtime:smoke', jsonPath: path.join(docsDir, 'CLOUDBASE_LIVE_SMOKE.json') },
  { name: 'display', command: 'npm run audit:display', jsonPath: path.join(docsDir, 'ADMIN_DISPLAY_AUDIT.json') },
  { name: 'adminApi', command: 'npm run audit:admin-api', jsonPath: path.join(docsDir, 'ADMIN_API_SMOKE.json') },
  { name: 'business', command: 'npm run audit:business', jsonPath: path.join(docsDir, 'BUSINESS_SMOKE_AUDIT.json') },
  { name: 'responseShape', command: 'npm run audit:response-shape', jsonPath: path.join(docsDir, 'ADMIN_RESPONSE_SHAPE_AUDIT.json') }
];

function runCommand(command) {
  try {
    const output = execSync(command, {
      cwd: cloudRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: {
        ...process.env,
        AUDIT_OUTPUT_DIR: docsDir
      }
    });
    return { ok: true, output };
  } catch (error) {
    return {
      ok: false,
      output: `${error.stdout || ''}${error.stderr || ''}`.trim(),
      status: error.status || 1
    };
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function renderMarkdown(summary) {
  const lines = [];
  lines.push('# Audit All Summary');
  lines.push('');
  lines.push(`生成时间：${summary.generatedAt}`);
  lines.push('');
  lines.push('| 检查项 | 结果 | 摘要 |');
  lines.push('| --- | --- | --- |');
  for (const item of summary.steps) {
    lines.push(`| ${item.name} | ${item.ok ? '通过' : '失败'} | ${item.brief} |`);
  }
  lines.push('');
  lines.push('## 文件输出');
  lines.push('');
  lines.push(`- 迁移矩阵：${toMarkdownFileLink(path.join(docsDir, 'CLOUD_MP_MIGRATION_MATRIX.md'))}`);
  lines.push(`- 云端集合 smoke：${toMarkdownFileLink(path.join(docsDir, 'CLOUDBASE_LIVE_SMOKE.md'))}`);
  lines.push(`- 静态托管审计：${toMarkdownFileLink(path.join(docsDir, 'ADMIN_HOSTING_AUDIT.md'))}`);
  lines.push(`- 展示字段审计：${toMarkdownFileLink(path.join(docsDir, 'ADMIN_DISPLAY_AUDIT.md'))}`);
  lines.push(`- 管理端 API smoke：${toMarkdownFileLink(path.join(docsDir, 'ADMIN_API_SMOKE.md'))}`);
  lines.push(`- 业务 smoke：${toMarkdownFileLink(path.join(docsDir, 'BUSINESS_SMOKE_AUDIT.md'))}`);
  lines.push(`- 响应结构审计：${toMarkdownFileLink(path.join(docsDir, 'ADMIN_RESPONSE_SHAPE_AUDIT.md'))}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const summary = {
    generatedAt: new Date().toISOString(),
    ok: true,
    steps: []
  };

  for (const step of steps) {
    const result = runCommand(step.command);
    const payload = step.jsonPath ? readJson(step.jsonPath) : null;
    const derivedOk =
      step.name === 'hosting' && payload ? payload.ok === true :
      step.name === 'adminApi' && payload?.results ? payload.results.every((item) => item.ok) :
      step.name === 'runtimeSmoke' && payload?.results ? payload.ok === true :
      step.name === 'display' && payload?.summary ? payload.summary.totalIssues === 0 :
      step.name === 'responseShape' && payload ? payload.total === 0 :
      result.ok;
    let brief = '执行完成';
    if (step.name === 'foundation' && result.ok) {
      brief = '基础结构与主入口检查通过';
    } else if (step.name === 'hosting' && payload) {
      brief = `静态托管差异${payload.diff.length}项`;
    } else if (step.name === 'migration' && payload?.summary) {
      brief = `小程序${payload.summary.miniprogram?.已通 || 0}，云函数${payload.summary.cloudfunctions?.已通 || 0}，管理接口${payload.summary.adminApi?.已通 || 0}`;
    } else if (step.name === 'runtimeSmoke' && payload?.results) {
      brief = payload.results.map((item) => `${item.collection}:${item.ok ? 'OK' : 'FAIL'}`).join('，');
    } else if (step.name === 'display' && payload?.summary) {
      brief = `问题${payload.summary.totalIssues}条，页面${Object.keys(payload.summary.byPage || {}).length}个`;
    } else if (step.name === 'adminApi' && payload?.results) {
      brief = `接口${payload.results.length}个，失败${payload.results.filter((item) => !item.ok).length}个`;
    } else if (step.name === 'business' && payload?.results) {
      brief = `业务项${payload.results.length}个，失败${payload.results.filter((item) => !item.ok).length}个`;
    } else if (step.name === 'responseShape' && payload) {
      brief = `潜在结构风险${payload.total}条`;
    } else if (!result.ok) {
      brief = '执行失败，请查看输出日志';
    }

    summary.steps.push({
      name: step.name,
      ok: derivedOk,
      brief,
      output: result.output
    });
    if (!derivedOk) summary.ok = false;
  }

  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  fs.writeFileSync(mdPath, renderMarkdown(summary));
  console.log(JSON.stringify({
    ok: summary.ok,
    jsonPath,
    mdPath,
    steps: summary.steps.map(({ name, ok, brief }) => ({ name, ok, brief }))
  }, null, 2));
  if (!summary.ok) process.exit(1);
}

main();
