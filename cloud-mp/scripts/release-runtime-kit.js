'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const releaseEvidenceRoot = path.join(projectRoot, 'docs', 'release', 'evidence');
const runtimeEvidenceRoot = path.join(releaseEvidenceRoot, 'runtime');
const templatesRoot = path.join(releaseEvidenceRoot, 'templates');
const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function formatDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}

function getShanghaiDateKey(date = new Date()) {
  const parts = formatDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getShanghaiTimestampKey(date = new Date()) {
  const parts = formatDateParts(date);
  return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}+0800`;
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value, 'utf8');
}

function runtimeFile(name) {
  ensureDir(runtimeEvidenceRoot);
  return path.join(runtimeEvidenceRoot, name);
}

module.exports = {
  projectRoot,
  releaseEvidenceRoot,
  runtimeEvidenceRoot,
  templatesRoot,
  SHANGHAI_TIME_ZONE,
  ensureDir,
  nowIso,
  formatDateParts,
  getShanghaiDateKey,
  getShanghaiTimestampKey,
  readJson,
  writeJson,
  writeText,
  runtimeFile
};
