const fs = require('fs');
const path = require('path');
const { loadPaymentConfig } = require('../cloudfunctions/payment/config');

const root = path.resolve(__dirname, '..', '..');
const projectRoot = root;

function readText(relativePath) {
  try {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
  } catch (err) {
    return '';
  }
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
    const content = readText(relativePath);
    return content && pattern.test(content);
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

// ✅ P1-3 修复：安全读取字段（添加类型检查）
const legacyAudit = tryReadJson('cloud-mp/docs/CLOUDBASE_LEGACY_COMPAT_AUDIT.json');
if (legacyAudit && 
    typeof legacyAudit === 'object' &&
    legacyAudit.summary &&
    typeof legacyAudit.summary === 'object' &&
    Number.isFinite(legacyAudit.summary.totalMatches) &&
    legacyAudit.summary.totalMatches > 0) {
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

// ✅ P1-3 修复：添加云函数部署检查
function checkCloudFunctionExistence() {
  const requiredFunctions = [
    'login',
    'user',
    'products',
    'cart',
    'order',
    'payment',
    'config',
    'distribution',
    'admin-api',
    'order-timeout-cancel',
    'commission-deadline-process',
    'order-auto-confirm'
  ];
  const basePath = 'cloud-mp/cloudfunctions';
  const missing = [];
  
  requiredFunctions.forEach(fnName => {
    const fnPath = `${basePath}/${fnName}/index.js`;
    try {
      const content = readText(fnPath);
      if (!content || content.trim().length === 0) {
        missing.push(fnName);
      }
    } catch (_) {
      missing.push(fnName);
    }
  });
  
  return { missing, count: missing.length };
}

function checkTimerTriggers() {
  const timerFunctions = ['order-timeout-cancel', 'commission-deadline-process', 'order-auto-confirm'];
  const missing = [];
  timerFunctions.forEach(fnName => {
    const packagePath = `cloud-mp/cloudfunctions/${fnName}/package.json`;
    const packageJson = tryReadJson(packagePath);
    const triggers = Array.isArray(packageJson?.triggers) ? packageJson.triggers : [];
    const hasTimer = triggers.some(trigger => trigger && trigger.type === 'timer' && trigger.config);
    if (!hasTimer) missing.push(fnName);
  });
  return { missing, count: missing.length };
}

function checkAdminRuntimeCollections() {
  const seedSummary = tryReadJson('cloud-mp/cloudbase-seed/_summary.json') || {};
  const importSummary = tryReadJson('cloud-mp/cloudbase-import/_summary.json') || {};
  const collectionNames = new Set([
    ...Object.keys(seedSummary).filter(name => Number(seedSummary[name]) >= 0),
    ...Object.keys(importSummary).filter(name => Number(importSummary[name]) >= 0)
  ]);
  const recommendedCollections = [
    'coupon_auto_rules',
    'stations',
    'station_staff',
    'content_boards',
    'content_board_products',
    'agent_exit_applications',
    'dividend_executions',
    'lottery_prizes',
    'slash_activities',
    'splash_screens'
  ];
  const missing = recommendedCollections.filter(name => !collectionNames.has(name));
  return { missing, count: missing.length };
}

// ✅ P1-3 修复：添加数据库集合检查
function checkCloudBaseSeed() {
  try {
    const seedSummary = tryReadJson('cloud-mp/cloudbase-seed/_summary.json');
    const importSummary = tryReadJson('cloud-mp/cloudbase-import/_summary.json');
    if ((!seedSummary || typeof seedSummary !== 'object') && (!importSummary || typeof importSummary !== 'object')) {
      return { collections: [], count: 0 };
    }
    const requiredCollections = ['users', 'products', 'orders', 'cart_items', 'categories'];
    const summaryCollectionNames = summary => {
      if (!summary || typeof summary !== 'object') return [];
      return Array.isArray(summary.collections)
        ? summary.collections.map(c => c && c.name).filter(Boolean)
        : Object.keys(summary).filter(name => Number(summary[name]) >= 0);
    };
    const collectionNames = [
      ...summaryCollectionNames(seedSummary),
      ...summaryCollectionNames(importSummary)
    ];
    const existing = collectionNames.filter(name => requiredCollections.includes(name));
    const uniqueExisting = [...new Set(existing)];
    return { collections: uniqueExisting, count: uniqueExisting.length };
  } catch (_) {
    return { collections: [], count: 0 };
  }
}

// ✅ P1-3 修复：检查配置环境变量
function checkAuthConfiguration() {
  const projectConfig = tryReadJson('cloud-mp/project.config.json');
  const cloudbaseEnv = projectConfig?.cloudbaseEnv;
  
  return {
    hasEnv: !!cloudbaseEnv,
    env: cloudbaseEnv || 'undefined'
  };
}

// 执行所有检查
const cloudFunctionCheck = checkCloudFunctionExistence();
const timerTriggerCheck = checkTimerTriggers();
const cloudBaseSeedCheck = checkCloudBaseSeed();
const adminRuntimeCollectionsCheck = checkAdminRuntimeCollections();
const authCheck = checkAuthConfiguration();

if (cloudFunctionCheck.count > 0) {
  blockers.push(`缺失云函数：${cloudFunctionCheck.missing.join(', ')}`);
}

if (timerTriggerCheck.count > 0) {
  blockers.push(`定时云函数缺少 timer 触发器声明：${timerTriggerCheck.missing.join(', ')}`);
}

if (cloudBaseSeedCheck.count < 5) {
  blockers.push(`云数据库集合不完整，仅有 ${cloudBaseSeedCheck.count}/5 个必需集合：${cloudBaseSeedCheck.collections.join(', ')}`);
}

if (!authCheck.hasEnv) {
  blockers.push('CloudBase 环境未配置，检查 project.config.json 的 cloudbaseEnv 字段');
}

if (adminRuntimeCollectionsCheck.count > 0) {
  warnings.push(`后台新增运行集合尚未出现在 seed/import 摘要中，云端首次写入可创建，但建议发布前预建：${adminRuntimeCollectionsCheck.missing.join(', ')}`);
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
