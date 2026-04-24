'use strict';

const fs = require('fs');
const path = require('path');

function getAuditOutputDir(projectRoot) {
  const override = process.env.CLOUD_MP_AUDIT_OUTPUT_DIR || process.env.AUDIT_OUTPUT_DIR;
  if (override) return path.resolve(projectRoot, override);
  return path.join(projectRoot, 'docs', 'audit', 'generated');
}

function getAuditArtifactPaths(projectRoot, basename) {
  const outputDir = getAuditOutputDir(projectRoot);
  return {
    outputDir,
    jsonPath: path.join(outputDir, `${basename}.json`),
    mdPath: path.join(outputDir, `${basename}.md`)
  };
}

function getAuditArtifactPath(projectRoot, filename) {
  return path.join(getAuditOutputDir(projectRoot), filename);
}

function resolveAuditInputPath(projectRoot, filename) {
  const generatedPath = getAuditArtifactPath(projectRoot, filename);
  if (fs.existsSync(generatedPath)) return generatedPath;
  return path.join(projectRoot, 'docs', filename);
}

function toMarkdownFileLink(filePath, label = path.basename(filePath)) {
  const target = path.resolve(filePath).replace(/\\/g, '/');
  return `[${label}](/${target})`;
}

module.exports = {
  getAuditOutputDir,
  getAuditArtifactPaths,
  getAuditArtifactPath,
  resolveAuditInputPath,
  toMarkdownFileLink
};
