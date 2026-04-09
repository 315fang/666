/**
 * config/env.js — 云开发版（精简）
 *
 * 原版用于切换 API BaseUrl，云开发无需 HTTP BaseUrl。
 * 保留所有导出签名，避免调用方 require 报错。
 */

const CLOUD_ENV_ID = 'cloud1-9gywyqe49638e46f';

function getApiBaseUrl() { return ''; }
function getCdnBaseUrl() { return 'https://cdn.jxalk.cn'; }
function isDebugEnabled() { return false; }
function isLogEnabled() { return false; }
function isDevelopment() { return false; }
function isStaging() { return false; }
function isProduction() { return true; }
function getImageQuality() { return 95; }
function getVersion() { return '3.0.0-cloud'; }
function log() {}
function logError(...args) { console.error('[ENV]', ...args); }
function logWarn(...args) { console.warn('[ENV]', ...args); }
function getConfig() {
    return {
        apiBaseUrl: '',
        debug: false,
        enableLog: false,
        cacheEnabled: true,
        imageQuality: 95,
        cdnBaseUrl: 'https://cdn.jxalk.cn',
        version: '3.0.0-cloud',
        cloudEnvId: CLOUD_ENV_ID
    };
}

const ENV_TYPES = { DEVELOPMENT: 'development', STAGING: 'staging', PRODUCTION: 'production' };
const CURRENT_ENV = ENV_TYPES.PRODUCTION;

module.exports = {
    ENV_TYPES, CURRENT_ENV, CLOUD_ENV_ID,
    getConfig, getApiBaseUrl, getCdnBaseUrl,
    isDebugEnabled, isLogEnabled, isDevelopment, isStaging, isProduction,
    getImageQuality, getVersion, log, logError, logWarn
};
