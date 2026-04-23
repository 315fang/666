const fs = require('fs');
const path = require('path');

const cloudRoot = path.resolve(__dirname, '..');
const targetModelPath = path.join(cloudRoot, 'CLOUDBASE_TARGET_MODEL.md');
const contractPath = path.join(cloudRoot, 'config', 'cloudbase-collection-contract.json');
const seedDir = path.join(cloudRoot, 'cloudbase-seed');
const importDir = path.join(cloudRoot, 'cloudbase-import');
const TARGET_MODEL_SECTIONS = new Set([
  '正式主集合',
  '正式流程集合',
  '正式日志集合',
  '兼容读取集合'
]);

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en'));
}

function extractCollectionsFromContract() {
  if (!fs.existsSync(contractPath)) return [];
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const groups = Array.isArray(contract.groups) ? contract.groups : [];
  return uniqueSorted(groups
    .filter((group) => group.createByDefault !== false)
    .flatMap((group) => Array.isArray(group.collections) ? group.collections : []));
}

function extractCollectionsFromTargetModel() {
  if (!fs.existsSync(targetModelPath)) return [];
  const text = fs.readFileSync(targetModelPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const collections = [];
  let inSection = false;
  let activeHeading = '';
  for (const line of lines) {
    const headingMatch = line.match(/^###\s+(.+?)\s*$/);
    if (headingMatch) {
      activeHeading = headingMatch[1].trim();
      inSection = TARGET_MODEL_SECTIONS.has(activeHeading);
      continue;
    }
    if (line.trim() === '## 正式集合') {
      inSection = true;
      continue;
    }
    if (inSection && (line.startsWith('## ') || (line.startsWith('### ') && !TARGET_MODEL_SECTIONS.has(activeHeading)))) break;
    if (!inSection) continue;
    const match = line.match(/^- `([^`]+)`/);
    if (match) collections.push(match[1]);
  }
  return uniqueSorted(collections);
}

function extractCollections() {
  const targetCollections = extractCollectionsFromTargetModel();
  const contractCollections = extractCollectionsFromContract();
  return contractCollections.length ? contractCollections : targetCollections;
}

function ensureFile(filePath, content) {
  if (fs.existsSync(filePath)) return false;
  fs.writeFileSync(filePath, content);
  return true;
}

function main() {
  const collections = extractCollections();
  if (!collections.length) {
    throw new Error(`未解析到目标集合，请检查 ${contractPath} 或 ${targetModelPath}`);
  }

  const created = [];
  for (const collection of collections) {
    const seedPath = path.join(seedDir, `${collection}.json`);
    const importPath = path.join(importDir, `${collection}.jsonl`);
    if (ensureFile(seedPath, '[]\n')) {
      created.push(path.relative(cloudRoot, seedPath).replace(/\\/g, '/'));
    }
    if (ensureFile(importPath, '')) {
      created.push(path.relative(cloudRoot, importPath).replace(/\\/g, '/'));
    }
  }
  console.log(JSON.stringify({ created, total: created.length }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  extractCollections,
  extractCollectionsFromContract,
  extractCollectionsFromTargetModel
};
