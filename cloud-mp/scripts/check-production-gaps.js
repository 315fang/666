const fs = require('fs');
const path = require('path');
const { loadPaymentConfig } = require('../cloudfunctions/payment/config');

const root = path.resolve(__dirname, '..', '..');
const projectRoot = root;

function readText(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function tryReadJson(relativePath) {
  try {
    return JSON.parse(readText(relativePath));
  } catch (_) {
    return null;
  }
}

function hasPattern(relativePath, pattern) {
  try {
    return pattern.test(readText(relativePath));
  } catch (_) {
    return false;
  }
}

function formatMissingKeys(list) {
  return Array.isArray(list) && list.length ? list.join(', ') : 'none';
}

const blockers = [];
const warnings = [];
const paymentConfig = loadPaymentConfig(process.env);

const legacyAudit = tryReadJson('cloud-mp/docs/CLOUDBASE_LEGACY_COMPAT_AUDIT.json');
if (legacyAudit?.summary?.totalMatches > 0) {
  warnings.push(`旧字段兼容残留 ${legacyAudit.summary.totalMatches} 处，仍需继续收口。`);
}

if (paymentConfig.mode === 'disabled') {
  blockers.push('支付模式当前为 disabled，不能视为生产可用。');
} else if (paymentConfig.mode === 'formal' && !paymentConfig.formalConfigured) {
  blockers.push(`支付已切到 formal，但正式配置缺失：${formatMissingKeys(paymentConfig.missingFormalKeys)}`);
} else if (paymentConfig.mode !== 'formal') {
  warnings.push(`支付模式当前为 ${paymentConfig.mode}，正式发布前应切到 formal。`);
}

if (hasPattern('cloud-mp/cloudfunctions/order/index.js', /物流.*暂未接入|正在升级中/)) {
  blockers.push('订单链路仍有物流或营销能力占位逻辑，不能视为完整生产闭环。');
}

if (hasPattern('backend/cloudrun-admin-service/src/app.js', /当前为迁移阶段，支付检测使用占位结果，正式支付尚未接入。/)) {
  blockers.push('后台支付健康检测仍是占位实现，运营侧无法真实校验支付链路。');
}

if (hasPattern('backend/cloudrun-admin-service/src/app.js', /list:\s*\[\]/)) {
  warnings.push('后台仍存在返回空列表的占位接口，需要按页面实际使用情况继续补齐。');
}

if (hasPattern('backend/cloudrun-admin-service/src/app.js', /cloudbase:\/\/local\//) ||
    hasPattern('cloud-mp/cloudfunctions/admin-api/src/app.js', /cloudbase:\/\/local\//)) {
  warnings.push('后台上传仍保留本地 fallback 路径，正式发布前应决定是否禁用本地兜底。');
}

if (hasPattern('cloud-mp/inject.js', /mock|mockData|模拟/i) ||
    hasPattern('cloud-mp/inject2.js', /mock|mockData|模拟/i) ||
    hasPattern('cloud-mp/inject3.js', /mock|mockData|模拟/i)) {
  warnings.push('仓库仍保留注入/模拟脚本，发布前应确认是否归档或移除。');
}

const lines = [];
lines.push(`# Production Gap Check`);
lines.push('');
lines.push(`Generated at: ${new Date().toISOString()}`);
lines.push('');
lines.push(`Payment mode: ${paymentConfig.mode}`);
lines.push(`Payment formal configured: ${paymentConfig.formalConfigured ? 'YES' : 'NO'}`);
lines.push(`Payment missing formal keys: ${formatMissingKeys(paymentConfig.missingFormalKeys)}`);
lines.push('');
lines.push(`P0 blockers: ${blockers.length}`);
lines.push(`Warnings: ${warnings.length}`);
lines.push('');

if (blockers.length) {
  lines.push('## Blockers');
  blockers.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  lines.push('');
}

if (warnings.length) {
  lines.push('## Warnings');
  warnings.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  lines.push('');
}

const outputPath = path.join(projectRoot, 'docs', 'release', 'PRODUCTION_CHECK_REPORT.md');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');

console.log(lines.join('\n'));

if (blockers.length) {
  process.exitCode = 1;
}
