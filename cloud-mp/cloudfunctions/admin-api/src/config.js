const path = require('path');
const os = require('os');

const serviceRoot = path.resolve(__dirname, '..');
const isFunctionRuntime = Boolean(process.env.TENCENTCLOUD_RUNENV || process.env.SCF_RUNTIME_API || process.env.TCB_ROUTE_KEY);
const testRoot = path.resolve(serviceRoot, 'test');
function isPathInside(parent, candidate) {
    const relative = path.relative(parent, candidate);
    return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}
const isAdminApiTestRuntime = process.argv
    .map((arg) => {
        try {
            return path.resolve(arg);
        } catch (_) {
            return '';
        }
    })
    .some((candidate) => isPathInside(testRoot, candidate));
const isNodeTestRuntime = process.env.NODE_ENV === 'test'
    || process.execArgv.some((arg) => arg === '--test' || arg.startsWith('--test='))
    || isAdminApiTestRuntime;
const enforceCloudbaseRuntime = isFunctionRuntime || process.env.ADMIN_FORCE_CLOUDBASE === 'true';
const inferredCloudbaseEnvId = process.env.ADMIN_CLOUDBASE_ENV_ID
    || process.env.TCB_ENV
    || process.env.SCF_NAMESPACE
    || '';
const defaultDataSource = process.env.ADMIN_DATA_SOURCE
    ? String(process.env.ADMIN_DATA_SOURCE).toLowerCase()
    : (inferredCloudbaseEnvId ? 'cloudbase' : 'filesystem');
const bundledSeedRoot = path.resolve(serviceRoot, '.runtime', 'overrides');
const projectRoot = path.resolve(serviceRoot, '..', '..');
const dataRoot = process.env.ADMIN_DATA_ROOT
    ? path.resolve(process.env.ADMIN_DATA_ROOT)
    : (isFunctionRuntime ? bundledSeedRoot : path.resolve(projectRoot, 'mysql', 'jsonl'));
const normalizedDataRoot = process.env.ADMIN_NORMALIZED_DATA_ROOT
    ? path.resolve(process.env.ADMIN_NORMALIZED_DATA_ROOT)
    : (isFunctionRuntime ? bundledSeedRoot : path.resolve(projectRoot, 'cloudbase-seed'));
const runtimeRoot = process.env.ADMIN_RUNTIME_ROOT
    ? path.resolve(process.env.ADMIN_RUNTIME_ROOT)
    : (isFunctionRuntime
        ? path.resolve(process.env.TMPDIR || process.env.TMP || '/tmp', 'cloudrun-admin-service-runtime')
        : (isNodeTestRuntime
            ? path.resolve(os.tmpdir(), 'cloudrun-admin-service-test-runtime', String(process.pid))
            : path.resolve(serviceRoot, '.runtime')));
const uploadsRoot = path.resolve(runtimeRoot, 'uploads');
const dataSource = enforceCloudbaseRuntime ? 'cloudbase' : defaultDataSource;
const singletonSource = enforceCloudbaseRuntime
    ? 'cloudbase'
    : (process.env.ADMIN_SINGLETON_SOURCE || 'filesystem').toLowerCase();
const mysql = {
    host: process.env.ADMIN_MYSQL_HOST || process.env.DB_HOST || '',
    port: Number(process.env.ADMIN_MYSQL_PORT || process.env.DB_PORT || 3306),
    user: process.env.ADMIN_MYSQL_USER || process.env.DB_USER || '',
    password: process.env.ADMIN_MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.ADMIN_MYSQL_DATABASE || process.env.DB_NAME || '',
    dialect: 'mysql'
};
const cloudbase = {
    envId: inferredCloudbaseEnvId,
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
    enforceCloudbaseRuntime,
    isFunctionRuntime,
    mysql,
    cloudbase,
    jwtSecret: process.env.ADMIN_JWT_SECRET,
    assetBaseUrl: process.env.ADMIN_UPLOAD_BASE_URL || '',
    preferNormalizedData: process.env.ADMIN_PREFER_NORMALIZED_DATA !== 'false'
};
