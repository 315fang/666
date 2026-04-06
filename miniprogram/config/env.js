/**
 * 环境配置系统
 * 支持开发、测试、生产环境配置
 */

// 环境类型
const ENV_TYPES = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production'
};

// 当前环境配置
// 通过微信官方 API 自动识别运行环境，无需手动修改
// develop = 开发者工具, trial = 体验版, release = 正式版
function getRuntimeEnvVersion() {
  try {
    const accountInfo = wx.getAccountInfoSync();
    return accountInfo && accountInfo.miniProgram
      ? accountInfo.miniProgram.envVersion
      : 'release';
  } catch (error) {
    console.warn('[ENV] 获取 envVersion 失败，默认按生产环境处理', error);
    return 'release';
  }
}

const envVersion = getRuntimeEnvVersion();
const CURRENT_ENV = {
  develop: ENV_TYPES.DEVELOPMENT,
  trial:   ENV_TYPES.STAGING,
  release: ENV_TYPES.PRODUCTION
}[envVersion] || ENV_TYPES.PRODUCTION;

/**
 * 环境配置
 */
const envConfigs = {
  // 开发环境
  [ENV_TYPES.DEVELOPMENT]: {
    // 默认也走生产，避免审核或预览误命中本地服务。
    // 本地联调时可临时改回 http://127.0.0.1:3001/api
    apiBaseUrl: 'https://api.wenlan.store/api',
    debug: true,
    enableLog: true,
    enableMock: false,
    requestTimeout: 15000,
    cacheEnabled: true,
    imageQuality: 80,
    cdnBaseUrl: 'https://cdn.jxalk.cn',
    version: '2.0.0-dev'
  },

  // 测试环境（体验版，与生产共用同一后端）
  [ENV_TYPES.STAGING]: {
    apiBaseUrl: 'https://api.wenlan.store/api',
    debug: true,
    enableLog: true,
    enableMock: false,
    requestTimeout: 15000,
    cacheEnabled: true,
    imageQuality: 90,
    cdnBaseUrl: 'https://cdn.jxalk.cn',
    version: '2.0.0-rc'
  },

  // 生产环境
  [ENV_TYPES.PRODUCTION]: {
    apiBaseUrl: 'https://api.wenlan.store/api',
    debug: false,
    enableLog: false,
    enableMock: false,
    requestTimeout: 15000,
    cacheEnabled: true,
    imageQuality: 95,
    cdnBaseUrl: 'https://cdn.jxalk.cn',
    version: '2.0.0'
  }
};

/**
 * 获取当前环境配置
 */
function getConfig() {
  return envConfigs[CURRENT_ENV] || envConfigs[ENV_TYPES.PRODUCTION];
}

/**
 * 获取指定环境的配置
 * @param {string} env - 环境类型
 */
function getConfigByEnv(env) {
  return envConfigs[env] || envConfigs[ENV_TYPES.PRODUCTION];
}

/**
 * 是否为开发环境
 */
function isDevelopment() {
  return CURRENT_ENV === ENV_TYPES.DEVELOPMENT;
}

/**
 * 是否为测试环境
 */
function isStaging() {
  return CURRENT_ENV === ENV_TYPES.STAGING;
}

/**
 * 是否为生产环境
 */
function isProduction() {
  return CURRENT_ENV === ENV_TYPES.PRODUCTION;
}

/**
 * 获取 API 基础 URL
 */
function getApiBaseUrl() {
  return getConfig().apiBaseUrl;
}

/**
 * 获取 CDN 基础 URL
 */
function getCdnBaseUrl() {
  return getConfig().cdnBaseUrl;
}

/**
 * 是否启用调试模式
 */
function isDebugEnabled() {
  return getConfig().debug;
}

/**
 * 是否启用日志
 */
function isLogEnabled() {
  return getConfig().enableLog;
}

/**
 * 获取图片质量
 */
function getImageQuality() {
  return getConfig().imageQuality;
}

/**
 * 获取版本号
 */
function getVersion() {
  return getConfig().version;
}

/**
 * 条件日志输出（仅在启用日志时输出）
 */
function log(...args) {
  if (isLogEnabled()) {
    console.log('[ENV]', ...args);
  }
}

/**
 * 条件错误日志输出
 */
function logError(...args) {
  if (isLogEnabled()) {
    console.error('[ENV ERROR]', ...args);
  }
}

/**
 * 条件警告日志输出
 */
function logWarn(...args) {
  if (isLogEnabled()) {
    console.warn('[ENV WARN]', ...args);
  }
}

// 打印当前环境配置（仅开发环境）
if (isDevelopment()) {
  console.log('='.repeat(50));
  console.log('环境配置:');
  console.log('envVersion:', envVersion);
  console.log('当前环境:', CURRENT_ENV);
  console.log('API Base URL:', getApiBaseUrl());
  console.log('配置信息:', getConfig());
  console.log('='.repeat(50));
}

// CommonJS 导出
module.exports = {
  ENV_TYPES,
  CURRENT_ENV,
  getConfig,
  getConfigByEnv,
  isDevelopment,
  isStaging,
  isProduction,
  getApiBaseUrl,
  getCdnBaseUrl,
  isDebugEnabled,
  isLogEnabled,
  getImageQuality,
  getVersion,
  log,
  logError,
  logWarn
};
