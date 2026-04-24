const fs = require('fs');
const path = require('path');
const { getAuditArtifactPaths } = require('./lib/audit-output');

const cloudRoot = path.resolve(__dirname, '..');
const viewsRoot = path.join(cloudRoot, 'admin-ui', 'src', 'views');
const { outputDir: docsDir, jsonPath, mdPath } = getAuditArtifactPaths(cloudRoot, 'ADMIN_RESPONSE_SHAPE_AUDIT');

const rules = [
  {
    id: 'raw-data-or-res-array',
    description: '可能把分页对象直接当数组使用',
    pattern: /res\.data\s*\|\|\s*res\s*\|\|\s*\[\]/g
  },
  {
    id: 'data-or-empty-array',
    description: '可能忽略后端 list 包装',
    pattern: /Array\.isArray\(res\)\s*\?\s*res\s*:\s*\(res\?\.data\s*\|\|\s*\[\]\)/g
  }
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.vue')) out.push(full);
  }
  return out;
}

function countLine(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function main() {
  const files = walk(viewsRoot);
  const findings = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const rule of rules) {
      for (const match of text.matchAll(rule.pattern)) {
        findings.push({
          file: path.relative(cloudRoot, file).replace(/\\/g, '/'),
          line: countLine(text, match.index),
          rule: rule.id,
          description: rule.description,
          snippet: match[0]
        });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    total: findings.length,
    findings
  };

  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  const lines = [
    '# Admin Response Shape Audit',
    '',
    `生成时间：${report.generatedAt}`,
    `问题数量：${report.total}`,
    '',
    '| 文件 | 行号 | 规则 | 说明 | 片段 |',
    '| --- | --- | --- | --- | --- |',
    ...report.findings.map((item) => `| ${item.file} | ${item.line} | ${item.rule} | ${item.description} | \`${item.snippet.replace(/\|/g, '\\|')}\` |`),
    ''
  ];
  fs.writeFileSync(mdPath, lines.join('\n'));

  console.log(JSON.stringify({ jsonPath, mdPath, total: report.total }, null, 2));
  if (report.total > 0) process.exit(1);
}

main();
