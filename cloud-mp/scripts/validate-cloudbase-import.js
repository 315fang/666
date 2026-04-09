const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const importRoot = path.join(projectRoot, 'cloudbase-import');
const summaryPath = path.join(importRoot, '_summary.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`Import summary not found: ${summaryPath}`);
  }

  const summary = readJson(summaryPath);
  const checks = [];

  Object.entries(summary).forEach(([name, expected]) => {
    const filePath = path.join(importRoot, `${name}.jsonl`);
    const exists = fs.existsSync(filePath);
    let actual = 0;
    if (exists) {
      actual = fs.readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .length;
    }
    checks.push({
      name,
      exists,
      expected,
      actual,
      ok: exists && actual === expected
    });
  });

  const failed = checks.filter((item) => !item.ok);
  const report = {
    ok: failed.length === 0,
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    checks
  };

  console.log(JSON.stringify(report, null, 2));
  if (failed.length) process.exit(1);
}

main();
