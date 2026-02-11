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
// WeChat小程序不支持process.env，这里手动配置环境
// 部署时修改此值：开发环境用 DEVELOPMENT，生产环境用 PRODUCTION
const CURRENT_ENV = ENV_TYPES.PRODUCTION;

/**
 * 环境配置
 */
const envConfigs = {
  // 开发环境
  [ENV_TYPES.DEVELOPMENT]: {
    apiBaseUrl: 'https://api.jxalk.cn/api',
    debug: true,
    enableLog: true,
    enableMock: false,
    requestTimeout: 15000,
    cacheEnabled: true,
    imageQuality: 80,
    cdnBaseUrl: 'https://cdn.jxalk.cn',
    version: '2.0.0-dev'
  },

  // 测试环境
  [ENV_TYPES.STAGING]: {
    apiBaseUrl: 'https://staging-api.jxalk.cn/api',
    debug: true,
    enableLog: true,
    enableMock: false,
    requestTimeout: 15000,
    cacheEnabled: true,
    imageQuality: 90,
    cdnBaseUrl: 'https://staging-cdn.jxalk.cn',
    version: '2.0.0-rc'
  },

  // 生产环境
  [ENV_TYPES.PRODUCTION]: {
    apiBaseUrl: 'https://api.jxalk.cn/api',
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
  return envConfigs[CURRENT_ENV] || envConfigs[ENV_TYPES.DEVELOPMENT];
}

/**
 * 获取指定环境的配置
 * @param {string} env - 环境类型
 */
function getConfigByEnv(env) {
  return envConfigs[env] || envConfigs[ENV_TYPES.DEVELOPMENT];
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
  console.log('当前环境:', CURRENT_ENV);
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
