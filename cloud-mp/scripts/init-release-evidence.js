'use strict';

const fs = require('fs');
const path = require('path');
const {
  templatesRoot,
  runtimeFile,
  ensureDir
} = require('./release-runtime-kit');

const COPIES = [
  ['PREPROD_EVIDENCE_TEMPLATE.json', 'preprod-evidence-latest.json'],
  ['ROLLBACK_DRILL_TEMPLATE.json', 'rollback-drill-latest.json'],
  ['PREPROD_EVIDENCE_TEMPLATE.md', 'preprod-evidence-latest.md'],
  ['ROLLBACK_DRILL_TEMPLATE.md', 'rollback-drill-latest.md']
];

for (const [templateName, targetName] of COPIES) {
  const source = path.join(templatesRoot, templateName);
  const target = runtimeFile(targetName);
  ensureDir(path.dirname(target));
  if (!fs.existsSync(target) && fs.existsSync(source)) {
    fs.copyFileSync(source, target);
  }
}

console.log('release evidence initialized');
