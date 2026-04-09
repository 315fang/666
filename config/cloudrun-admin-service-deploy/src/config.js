const path = require('path');

const serviceRoot = path.resolve(__dirname, '..');
const dataRoot = process.env.ADMIN_DATA_ROOT
    ? path.resolve(process.env.ADMIN_DATA_ROOT)
    : path.resolve(serviceRoot, '..', '..', 'cloud-mp', 'mysql', 'jsonl');
const normalizedDataRoot = process.env.ADMIN_NORMALIZED_DATA_ROOT
    ? path.resolve(process.env.ADMIN_NORMALIZED_DATA_ROOT)
    : path.resolve(serviceRoot, '..', '..', 'cloud-mp', 'cloudbase-seed');
const runtimeRoot = path.resolve(serviceRoot, '.runtime');
const uploadsRoot = path.resolve(runtimeRoot, 'uploads');
const dataSource = (process.env.ADMIN_DATA_SOURCE || 'filesystem').toLowerCase();
const singletonSource = (process.env.ADMIN_SINGLETON_SOURCE || 'filesystem').toLowerCase();
const mysql = {
    host: process.env.ADMIN_MYSQL_HOST || process.env.DB_HOST || '',
    port: Number(process.env.ADMIN_MYSQL_PORT || process.env.DB_PORT || 3306),
    user: process.env.ADMIN_MYSQL_USER || process.env.DB_USER || '',
    password: process.env.ADMIN_MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.ADMIN_MYSQL_DATABASE || process.env.DB_NAME || '',
    dialect: 'mysql'
};
const cloudbase = {
    envId: process.env.ADMIN_CLOUDBASE_ENV_ID || '',
    region: process.env.ADMIN_CLOUDBASE_REGION || '',
    collectionPrefix: process.env.ADMIN_CLOUDBASE_COLLECTION_PREFIX || '',
    secretId: process.env.ADMIN_CLOUDBASE_SECRET_ID || process.env.TENCENTCLOUD_SECRETID || '',
    secretKey: process.env.ADMIN_CLOUDBASE_SECRET_KEY || process.env.TENCENTCLOUD_SECRETKEY || '',
    token: process.env.ADMIN_CLOUDBASE_TOKEN || process.env.TENCENTCLOUD_SESSIONTOKEN || ''
};

module.exports = {
    serviceRoot,
    dataRoot,
    normalizedDataRoot,
    runtimeRoot,
    uploadsRoot,
    dataSource,
    singletonSource,
    mysql,
    cloudbase,
    jwtSecret: process.env.ADMIN_JWT_SECRET || 'cloudrun-admin-local-secret',
    assetBaseUrl: process.env.ADMIN_UPLOAD_BASE_URL || '',
    preferNormalizedData: process.env.ADMIN_PREFER_NORMALIZED_DATA !== 'false'
};
