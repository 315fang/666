const fs = require('fs');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..', '..');
const reportDir = path.join(workspaceRoot, 'cloud-mp', 'docs');
const reportPath = path.join(reportDir, 'CLOUDBASE_LEGACY_COMPAT_AUDIT.md');
const jsonPath = path.join(reportDir, 'CLOUDBASE_LEGACY_COMPAT_AUDIT.json');

const targets = [
  { name: 'miniprogram', root: path.join(workspaceRoot, 'cloud-mp', 'miniprogram') },
  { name: 'admin-ui', root: path.join(workspaceRoot, 'admin-ui', 'src') },
  { name: 'cloudrun-admin-service', root: path.join(workspaceRoot, 'backend', 'cloudrun-admin-service', 'src') }
];

const checks = [
  { key: 'quantity', label: '`quantity` old cart count field', pattern: /\bquantity\b/g },
  { key: 'buyer_id', label: '`buyer_id` old order owner field', pattern: /\bbuyer_id\b/g },
  { key: 'user_id', label: '`user_id` old user owner field', pattern: /\buser_id\b/g },
  { key: 'product_skus', label: '`product_skus` old sku collection name', pattern: /\bproduct_skus\b/g },
  { key: 'image_url', label: '`image_url` legacy image field', pattern: /\bimage_url\b/g },
  { key: 'avatar_url', label: '`avatar_url` legacy avatar field', pattern: /\bavatar_url\b/g },
  { key: 'nickname', label: '`nickname` legacy display field', pattern: /\bnickname\b/g },
  { key: 'pending_ship', label: '`pending_ship` legacy status bucket', pattern: /\bpending_ship\b/g },
  { key: 'pending_payment', label: '`pending_payment` old storage status', pattern: /\bpending_payment\b/g }
];

const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', '.runtime', 'cloudbase-import', 'cloudbase-seed']);
const textExtensions = new Set(['.js', '.json', '.wxml', '.wxss', '.ts', '.tsx', '.jsx', '.vue', '.md']);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignoreDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (textExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

function collectMatches(target) {
  const summary = Object.fromEntries(checks.map((check) => [check.key, { count: 0, files: [] }]));
  for (const file of walk(target.root)) {
    const content = fs.readFileSync(file, 'utf8');
    const relPath = path.relative(workspaceRoot, file).replace(/\\/g, '/');
    for (const check of checks) {
      const count = [...content.matchAll(check.pattern)].length;
      if (!count) continue;
      summary[check.key].count += count;
      summary[check.key].files.push({ file: relPath, count });
    }
  }
  return summary;
}

function renderMarkdown(results) {
  const lines = [];
  lines.push('# CloudBase Legacy Compatibility Audit');
  lines.push('');
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('This report tracks remaining legacy field/status/image references that should be removed as the CloudBase migration closes.');
  lines.push('');
  for (const target of targets) {
    const summary = results[target.name];
    lines.push(`## ${target.name}`);
    lines.push('');
    for (const check of checks) {
      const item = summary[check.key];
      lines.push(`- ${check.label}: ${item.count}`);
      for (const match of item.files.slice(0, 8)) {
        lines.push(`  - ${match.file}: ${match.count}`);
      }
      if (item.files.length > 8) {
        lines.push(`  - ... ${item.files.length - 8} more files`);
      }
    }
    lines.push('');
  }
  lines.push('## Recommended next cleanup');
  lines.push('');
  lines.push('- Replace frontend display adapters that still read `image_url`, `avatar_url`, or `nickname` with normalized `file_id`, `avatarUrl`, and `nickName`.');
  lines.push('- Keep `pending_ship` only as an admin display bucket; do not expand it into new storage or cloud-function logic.');
  lines.push('- Remove remaining `buyer_id`, `user_id`, `quantity`, and `product_skus` reads after CloudBase import finishes and runtime data is fully normalized.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const results = {};
  for (const target of targets) {
    results[target.name] = collectMatches(target);
  }
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  fs.writeFileSync(reportPath, renderMarkdown(results));

  const totals = checks.map((check) => ({
    key: check.key,
    total: targets.reduce((sum, target) => sum + results[target.name][check.key].count, 0)
  }));
  console.log(JSON.stringify({ reportPath, jsonPath, totals }, null, 2));
}

main();
