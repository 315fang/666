const fs = require('fs');
const path = require('path');

const cloudRoot = path.resolve(__dirname, '..');
const targetModelPath = path.join(cloudRoot, 'CLOUDBASE_TARGET_MODEL.md');
const seedDir = path.join(cloudRoot, 'cloudbase-seed');
const importDir = path.join(cloudRoot, 'cloudbase-import');

function extractCollections() {
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
    if (match) collections.push(match[1]);
  }
  return collections;
}

function ensureFile(filePath, content) {
  if (fs.existsSync(filePath)) return false;
  fs.writeFileSync(filePath, content);
  return true;
}

function main() {
  const collections = extractCollections();
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

main();
