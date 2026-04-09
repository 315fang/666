const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const seedRoot = path.join(projectRoot, 'cloudbase-seed');
const outputRoot = path.join(projectRoot, 'cloudbase-import');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed) ? parsed : null;
}

function stringifyLine(doc) {
  return JSON.stringify(doc);
}

function build() {
  if (!fs.existsSync(seedRoot)) {
    throw new Error(`Seed root not found: ${seedRoot}`);
  }

  ensureDir(outputRoot);
  const files = fs.readdirSync(seedRoot).filter((name) => name.endsWith('.json') && !name.startsWith('_'));
  const summary = {};

  files.forEach((file) => {
    const collectionName = path.basename(file, '.json');
    const data = readJsonArray(path.join(seedRoot, file));
    if (!data) return;
    const outputFile = path.join(outputRoot, `${collectionName}.jsonl`);
    const content = data.map(stringifyLine).join('\n');
    fs.writeFileSync(outputFile, content ? `${content}\n` : '');
    summary[collectionName] = data.length;
  });

  fs.writeFileSync(path.join(outputRoot, '_summary.json'), JSON.stringify(summary, null, 2));
  console.log(`Built CloudBase import package at ${outputRoot}`);
  console.log(summary);
}

build();
