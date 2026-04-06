/**
 * StorageService - 统一存储文件删除服务
 *
 * 支持与上传层相同的五种 provider：aliyun / tencent / qiniu / minio / local
 *
 * storageConfig 从 adminUploadController 导入（同一内存对象），因此运行时通过
 * updateStorageConfig 动态修改的配置对此模块同样生效。
 *
 * 删除失败时只记录 warn 日志，不向上抛出异常，确保 OSS 侧的错误不阻断数据库记录
 * 的删除流程。
 */
const path = require('path');
const fs = require('fs');
const { warn: logWarn, info: logInfo, error: logError } = require('../utils/logger');

/**
 * 获取当前存储配置。
 * 通过函数延迟 require，避免循环依赖（adminUploadController 在启动时已完整初始化）。
 */
const getConfig = () =>
    require('../routes/admin/controllers/adminUploadController').storageConfig;

/**
 * 从完整 URL 中提取 objectKey（去掉协议 + 域名后的路径，去除前导 /）。
 * 相对路径（本地存储）返回 null，由本地删除函数单独处理。
 */
const extractObjectKey = (fileUrl) => {
    try {
        const urlObj = new URL(fileUrl);
        return urlObj.pathname.replace(/^\/+/, '');
    } catch {
        return null;
    }
};

// ─────────────────── 各 Provider 删除实现 ───────────────────────

const deleteFromAliyun = async (fileUrl, config) => {
    if (!config.accessKeyId || !config.accessKeySecret || !config.bucket) {
        logWarn('STORAGE', '[Aliyun] 配置不完整，跳过删除', { fileUrl });
        return;
    }

    const OSS = require('ali-oss');
    const client = new OSS({
        region: config.region,
        accessKeyId: config.accessKeyId,
        accessKeySecret: config.accessKeySecret,
        bucket: config.bucket,
        endpoint: config.endpoint || undefined
    });

    const objectKey = extractObjectKey(fileUrl);
    if (!objectKey) {
        logWarn('STORAGE', '[Aliyun] 无法解析 objectKey', { fileUrl });
        return;
    }

    await client.delete(objectKey);
};

const deleteFromTencent = async (fileUrl, config) => {
    if (!config.secretId || !config.secretKey || !config.bucket) {
        logWarn('STORAGE', '[Tencent] 配置不完整，跳过删除', { fileUrl });
        return;
    }

    const COS = require('cos-nodejs-sdk-v5');
    const client = new COS({
        SecretId: config.secretId,
        SecretKey: config.secretKey
    });

    const objectKey = extractObjectKey(fileUrl);
    if (!objectKey) {
        logWarn('STORAGE', '[Tencent] 无法解析 objectKey', { fileUrl });
        return;
    }

    await new Promise((resolve, reject) => {
        client.deleteObject(
            { Bucket: config.bucket, Region: config.region, Key: objectKey },
            (err, data) => { if (err) reject(err); else resolve(data); }
        );
    });
};

const deleteFromQiniu = async (fileUrl, config) => {
    if (!config.accessKey || !config.secretKey || !config.bucket) {
        logWarn('STORAGE', '[Qiniu] 配置不完整，跳过删除', { fileUrl });
        return;
    }

    const qiniu = require('qiniu');
    const mac = new qiniu.auth.digest.Mac(config.accessKey, config.secretKey);
    const qConfig = new qiniu.conf.Config();
    const bucketManager = new qiniu.rs.BucketManager(mac, qConfig);

    const objectKey = extractObjectKey(fileUrl);
    if (!objectKey) {
        logWarn('STORAGE', '[Qiniu] 无法解析 objectKey', { fileUrl });
        return;
    }

    await new Promise((resolve, reject) => {
        bucketManager.delete(config.bucket, objectKey, (err, respBody, respInfo) => {
            if (err) return reject(err);
            // 200 = 成功；612 = 对象不存在（已被删除），同样视为成功
            if (respInfo.statusCode === 200 || respInfo.statusCode === 612) {
                resolve(respBody);
            } else {
                reject(new Error(`七牛删除失败: ${respInfo.statusCode}`));
            }
        });
    });
};

const deleteFromMinio = async (fileUrl, config) => {
    if (!config.accessKey || !config.secretKey) {
        logWarn('STORAGE', '[MinIO] 配置不完整，跳过删除', { fileUrl });
        return;
    }

    const Minio = require('minio');
    const client = new Minio.Client({
        endPoint: config.endPoint,
        port: config.port,
        useSSL: config.useSSL,
        accessKey: config.accessKey,
        secretKey: config.secretKey
    });

    // MinIO URL 格式: http(s)://endpoint:port/<bucket>/<objectKey>
    // pathname 形如 /bucket/path/to/file.jpg，需要去掉 bucket 前缀
    const objectKey = extractObjectKey(fileUrl);
    if (!objectKey) {
        logWarn('STORAGE', '[MinIO] 无法解析 objectKey', { fileUrl });
        return;
    }

    const bucket = config.bucket;
    const keyWithoutBucket = objectKey.startsWith(bucket + '/')
        ? objectKey.slice(bucket.length + 1)
        : objectKey;

    await client.removeObject(bucket, keyWithoutBucket);
};

const deleteFromLocal = async (fileUrl, config) => {
    let urlPath;
    try {
        urlPath = new URL(fileUrl).pathname;
    } catch {
        urlPath = fileUrl;
    }

    const baseUrl = (config.baseUrl || '/uploads').replace(/\/+$/, '');
    const uploadDir = path.resolve(process.cwd(), config.uploadDir || 'uploads');

    if (!urlPath.startsWith(baseUrl)) {
        logWarn('STORAGE', '[Local] URL 不匹配 baseUrl，跳过删除', { fileUrl });
        return;
    }

    const relativePath = urlPath.slice(baseUrl.length).replace(/^\/+/, '');
    const absolutePath = path.resolve(uploadDir, relativePath);

    // 防止路径穿越攻击
    if (!absolutePath.startsWith(uploadDir)) {
        logWarn('STORAGE', '[Local] 路径穿越检测，跳过删除', { fileUrl });
        return;
    }

    if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
    }
};

// ─────────────────── 对外导出函数 ───────────────────────────────

/**
 * 根据文件 URL 删除对应存储桶（或本地磁盘）中的文件。
 *
 * 删除失败时只记录 warn 日志，不抛异常，调用方无需处理异常。
 *
 * @param {string} fileUrl  文件完整 URL 或本地相对路径
 */
const deleteFileByUrl = async (fileUrl) => {
    if (!fileUrl || typeof fileUrl !== 'string') return;

    const cfg = getConfig();
    const provider = cfg.provider;

    try {
        switch (provider) {
            case 'aliyun':
                await deleteFromAliyun(fileUrl, cfg.aliyun);
                break;
            case 'tencent':
                await deleteFromTencent(fileUrl, cfg.tencent);
                break;
            case 'qiniu':
                await deleteFromQiniu(fileUrl, cfg.qiniu);
                break;
            case 'minio':
                await deleteFromMinio(fileUrl, cfg.minio);
                break;
            case 'local':
            default:
                await deleteFromLocal(fileUrl, cfg.local);
                break;
        }
        logInfo(`STORAGE`, `文件已从 [${provider}] 删除`, { fileUrl });
    } catch (err) {
        logWarn('STORAGE', `删除文件失败 [${provider}] ${fileUrl}`, { error: err.message });
    }
};

module.exports = { deleteFileByUrl };
