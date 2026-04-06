/**
 * 文件上传控制器
 *
 * 支持多种对象存储服务：
 * - 阿里云 OSS
 * - 腾讯云 COS
 * - 七牛云 Qiniu
 * - MinIO (自建)
 * - 本地存储 (开发/备用)
 *
 * 上传成功后自动将素材记录写入素材库（临时素材分组），
 * 管理员可在素材库中统一整理归档。
 * 若调用方不希望入库（如素材库内部上传），可在请求体中
 * 传递 skip_library=1 跳过自动入库。
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const isProduction = process.env.NODE_ENV === 'production';

// 懒加载：避免循环依赖（模型文件在服务启动后才完全初始化）
let _Material = null;
let _MaterialGroup = null;
const getModels = () => {
    if (!_Material) _Material = require('../../../models/Material');
    if (!_MaterialGroup) _MaterialGroup = require('../../../models/MaterialGroup');
    return { Material: _Material, MaterialGroup: _MaterialGroup };
};

/** 获取或创建"临时素材"系统分组（首次调用自动建立） */
const getOrCreateTempGroup = async () => {
    const { MaterialGroup } = getModels();
    const [group] = await MaterialGroup.findOrCreate({
        where: { name: '临时素材' },
        defaults: {
            name: '临时素材',
            description: '系统自动归档 — 各页面上传后未分类的素材，可在此整理移入正式分组',
            sort_order: -999,   // 固定排最后
            status: 1
        }
    });
    return group;
};

/** 根据 MIME 类型推断素材类型 */
const inferMaterialType = (mimetype = '') => {
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    return 'image';
};

const normalizeDomain = (domain = '') => String(domain || '').trim().replace(/\/+$/, '');

const joinDomainPath = (domain, objectKey) => {
    const safeDomain = normalizeDomain(domain);
    const safeKey = String(objectKey || '').replace(/^\/+/, '');
    return `${safeDomain}/${safeKey}`;
};

/**
 * 腾讯 COS 公网访问 URL 统一生成：
 * 1) 配置 customDomain 时强制走 CDN 域名
 * 2) 未配置时回退 COS 源站直链，并在生产环境给出强告警
 */
const buildTencentPublicUrl = (config, objectKey) => {
    if (config.customDomain) {
        return joinDomainPath(config.customDomain, objectKey);
    }

    const fallback = `https://${config.bucket}.cos.${config.region}.myqcloud.com/${objectKey}`;
    const warnMsg = '[Upload][Tencent] 未配置 TENCENT_COS_CUSTOM_DOMAIN，当前返回 COS 源站地址，建议尽快切换 CDN 域名';
    if (isProduction) {
        console.error(warnMsg);
    } else {
        console.warn(warnMsg);
    }
    return fallback;
};

// 存储配置（可从数据库读取）
let storageConfig = {
    provider: process.env.STORAGE_PROVIDER || 'local',  // local | aliyun | tencent | qiniu | minio

    // 阿里云 OSS
    aliyun: {
        accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
        accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || '',
        bucket: process.env.ALIYUN_OSS_BUCKET || '',
        region: process.env.ALIYUN_OSS_REGION || 'oss-cn-hangzhou',
        endpoint: process.env.ALIYUN_OSS_ENDPOINT || '',
        customDomain: process.env.ALIYUN_OSS_CUSTOM_DOMAIN || ''
    },

    // 腾讯云 COS
    tencent: {
        secretId: process.env.TENCENT_SECRET_ID || '',
        secretKey: process.env.TENCENT_SECRET_KEY || '',
        bucket: process.env.TENCENT_COS_BUCKET || '',
        region: process.env.TENCENT_COS_REGION || 'ap-guangzhou',
        customDomain: process.env.TENCENT_COS_CUSTOM_DOMAIN || ''
    },

    // 七牛云
    qiniu: {
        accessKey: process.env.QINIU_ACCESS_KEY || '',
        secretKey: process.env.QINIU_SECRET_KEY || '',
        bucket: process.env.QINIU_BUCKET || '',
        domain: process.env.QINIU_DOMAIN || ''
    },

    // MinIO (自建对象存储)
    minio: {
        endPoint: process.env.MINIO_ENDPOINT || 'localhost',
        port: parseInt(process.env.MINIO_PORT) || 9000,
        useSSL: process.env.MINIO_USE_SSL === 'true',
        accessKey: process.env.MINIO_ACCESS_KEY || '',
        secretKey: process.env.MINIO_SECRET_KEY || '',
        bucket: process.env.MINIO_BUCKET || 'uploads'
    },

    // 本地存储
    local: {
        uploadDir: process.env.LOCAL_UPLOAD_DIR || 'uploads',
        baseUrl: process.env.LOCAL_BASE_URL || '/uploads'
    }
};

/**
 * 生成唯一文件名
 */
const generateFileName = (originalName) => {
    const ext = path.extname(originalName);
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    return `${timestamp}_${random}${ext}`;
};

/**
 * 获取文件MIME类型
 */
const getMimeType = (filename) => {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf',
        '.mp4': 'video/mp4',
        '.mp3': 'audio/mpeg'
    };
    return mimeTypes[ext] || 'application/octet-stream';
};

/**
 * 规范化上传目录，防止路径穿越
 */
const normalizeFolder = (folder = 'images') => {
    const raw = String(folder || 'images').trim();
    // 只允许字母数字/下划线/中划线/斜杠
    if (!/^[A-Za-z0-9_/-]+$/.test(raw)) {
        throw new Error('上传目录格式不正确');
    }
    const normalized = path.posix.normalize(raw).replace(/^\/+/, '');
    if (!normalized || normalized.includes('..')) {
        throw new Error('上传目录非法');
    }
    return normalized;
};

const toPublicUrl = (req, rawUrl = '') => {
    const url = String(rawUrl || '');
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/')) {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        return `${protocol}://${req.get('host')}${url}`;
    }
    return url;
};

const isUserAvatarUploadRequest = (req) => {
    const originalUrl = String(req.originalUrl || '');
    return originalUrl.includes('/api/user/upload');
};

/**
 * 本地存储上传
 */
const uploadToLocal = async (file, folder = 'images') => {
    const safeFolder = normalizeFolder(folder);
    const baseUploadDir = path.resolve(process.cwd(), storageConfig.local.uploadDir);
    const uploadDir = path.resolve(baseUploadDir, safeFolder);
    if (!uploadDir.startsWith(baseUploadDir)) {
        throw new Error('上传目录越界');
    }

    // 确保目录存在
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const fileName = generateFileName(file.originalname);
    const filePath = path.join(uploadDir, fileName);

    // 写入文件
    fs.writeFileSync(filePath, file.buffer);

    const url = `${storageConfig.local.baseUrl}/${safeFolder}/${fileName}`;
    return { url, fileName, provider: 'local' };
};

/**
 * 阿里云 OSS 上传
 */
const uploadToAliyun = async (file, folder = 'images') => {
    const config = storageConfig.aliyun;

    if (!config.accessKeyId || !config.accessKeySecret || !config.bucket) {
        throw new Error('阿里云OSS配置不完整，请在系统设置中配置');
    }

    // 动态引入 SDK
    let OSS;
    try {
        OSS = require('ali-oss');
    } catch (e) {
        throw new Error('请安装阿里云OSS SDK: npm install ali-oss');
    }

    const client = new OSS({
        region: config.region,
        accessKeyId: config.accessKeyId,
        accessKeySecret: config.accessKeySecret,
        bucket: config.bucket,
        endpoint: config.endpoint || undefined
    });

    const fileName = generateFileName(file.originalname);
    const objectKey = `${folder}/${fileName}`;

    const result = await client.put(objectKey, file.buffer, {
        mime: getMimeType(file.originalname)
    });

    const url = config.customDomain
        ? joinDomainPath(config.customDomain, objectKey)
        : result.url;

    return { url, fileName, provider: 'aliyun', objectKey };
};

/**
 * 腾讯云 COS 上传
 */
const uploadToTencent = async (file, folder = 'images') => {
    const config = storageConfig.tencent;

    if (!config.secretId || !config.secretKey || !config.bucket) {
        throw new Error('腾讯云COS配置不完整，请在系统设置中配置');
    }

    // 动态引入 SDK
    let COS;
    try {
        COS = require('cos-nodejs-sdk-v5');
    } catch (e) {
        throw new Error('请安装腾讯云COS SDK: npm install cos-nodejs-sdk-v5');
    }

    const client = new COS({
        SecretId: config.secretId,
        SecretKey: config.secretKey
    });

    const fileName = generateFileName(file.originalname);
    const objectKey = `${folder}/${fileName}`;

    await new Promise((resolve, reject) => {
        client.putObject({
            Bucket: config.bucket,
            Region: config.region,
            Key: objectKey,
            Body: file.buffer,
            ContentType: getMimeType(file.originalname)
        }, (err, data) => {
            if (err) reject(err);
            else resolve(data);
        });
    });

    const url = buildTencentPublicUrl(config, objectKey);

    return { url, fileName, provider: 'tencent', objectKey };
};

/**
 * 七牛云上传
 */
const uploadToQiniu = async (file, folder = 'images') => {
    const config = storageConfig.qiniu;

    if (!config.accessKey || !config.secretKey || !config.bucket || !config.domain) {
        throw new Error('七牛云配置不完整，请在系统设置中配置');
    }

    // 动态引入 SDK
    let qiniu;
    try {
        qiniu = require('qiniu');
    } catch (e) {
        throw new Error('请安装七牛云SDK: npm install qiniu');
    }

    const mac = new qiniu.auth.digest.Mac(config.accessKey, config.secretKey);
    const putPolicy = new qiniu.rs.PutPolicy({ scope: config.bucket });
    const uploadToken = putPolicy.uploadToken(mac);

    const formUploader = new qiniu.form_up.FormUploader(new qiniu.conf.Config());
    const putExtra = new qiniu.form_up.PutExtra();

    const fileName = generateFileName(file.originalname);
    const objectKey = `${folder}/${fileName}`;

    await new Promise((resolve, reject) => {
        formUploader.put(uploadToken, objectKey, file.buffer, putExtra, (err, body, info) => {
            if (err) reject(err);
            else if (info.statusCode !== 200) reject(new Error(`上传失败: ${info.statusCode}`));
            else resolve(body);
        });
    });

    const url = joinDomainPath(config.domain, objectKey);
    return { url, fileName, provider: 'qiniu', objectKey };
};

/**
 * MinIO 上传
 */
const uploadToMinio = async (file, folder = 'images') => {
    const config = storageConfig.minio;

    if (!config.accessKey || !config.secretKey) {
        throw new Error('MinIO配置不完整，请在系统设置中配置');
    }

    // 动态引入 SDK
    let Minio;
    try {
        Minio = require('minio');
    } catch (e) {
        throw new Error('请安装MinIO SDK: npm install minio');
    }

    const client = new Minio.Client({
        endPoint: config.endPoint,
        port: config.port,
        useSSL: config.useSSL,
        accessKey: config.accessKey,
        secretKey: config.secretKey
    });

    // 确保bucket存在
    const bucketExists = await client.bucketExists(config.bucket);
    if (!bucketExists) {
        await client.makeBucket(config.bucket);
    }

    const fileName = generateFileName(file.originalname);
    const objectKey = `${folder}/${fileName}`;

    await client.putObject(config.bucket, objectKey, file.buffer, file.size, {
        'Content-Type': getMimeType(file.originalname)
    });

    const protocol = config.useSSL ? 'https' : 'http';
    const url = `${protocol}://${config.endPoint}:${config.port}/${config.bucket}/${objectKey}`;

    return { url, fileName, provider: 'minio', objectKey };
};

/**
 * 根据配置选择上传方式
 */
const uploadFile = async (file, folder = 'images') => {
    const provider = storageConfig.provider;

    switch (provider) {
        case 'aliyun':
            return await uploadToAliyun(file, folder);
        case 'tencent':
            return await uploadToTencent(file, folder);
        case 'qiniu':
            return await uploadToQiniu(file, folder);
        case 'minio':
            return await uploadToMinio(file, folder);
        case 'local':
        default:
            return await uploadToLocal(file, folder);
    }
};

/**
 * 单文件上传接口
 * POST /admin/api/upload
 */
const upload = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ code: -1, message: '请选择要上传的文件' });
        }

        // 文件大小限制 (10MB)
        const maxSize = 10 * 1024 * 1024;
        if (req.file.size > maxSize) {
            return res.status(400).json({ code: -1, message: '文件大小不能超过10MB' });
        }

        // 文件类型校验（MIME + 扩展名双重校验）
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
        const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
        const ext = path.extname(req.file.originalname || '').toLowerCase();
        if (!allowedTypes.includes(req.file.mimetype) || !allowedExts.includes(ext)) {
            return res.status(400).json({ code: -1, message: '仅支持 jpg/png/gif/webp/svg 格式' });
        }

        const defaultFolder = isUserAvatarUploadRequest(req) ? 'users/avatars' : 'products';
        const folder = normalizeFolder(req.body.folder || defaultFolder);
        const result = await uploadFile(req.file, folder);
        const publicUrl = toPublicUrl(req, result.url);
        const publicResult = { ...result, url: publicUrl };

        // ── 自动入素材库（临时素材分组）──────────────────────────
        // skip_library=1 时跳过（素材库内部上传自行处理，避免重复写入）
        let materialId = null;
        const shouldSkipLibrary = req.body.skip_library === '1' || isUserAvatarUploadRequest(req);
        if (!shouldSkipLibrary) {
            try {
                const { Material } = getModels();
                const tempGroup = await getOrCreateTempGroup();
                const title = path.parse(req.file.originalname).name || 'untitled';
                const mat = await Material.create({
                    type: inferMaterialType(req.file.mimetype),
                    title,
                    url: publicUrl,
                    group_id: tempGroup.id,
                    status: 1
                });
                materialId = mat.id;
            } catch (libErr) {
                // 入库失败不影响上传响应，记录日志即可
                console.warn('[Upload] 素材自动入库失败:', libErr.message);
            }
        }

        res.json({
            code: 0,
            data: { ...publicResult, material_id: materialId },
            message: '上传成功'
        });
    } catch (error) {
        console.error('文件上传失败:', error);
        res.status(500).json({ code: -1, message: error.message || '上传失败' });
    }
};

/**
 * 多文件上传接口
 * POST /admin/api/upload/multiple
 */
const uploadMultiple = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ code: -1, message: '请选择要上传的文件' });
        }

        const folder = normalizeFolder(req.body.folder || 'products');
        const results = [];
        const errors = [];

        // 是否跳过自动入库
        const skipLibrary = req.body.skip_library === '1';
        let tempGroup = null;
        if (!skipLibrary) {
            try { tempGroup = await getOrCreateTempGroup(); } catch (_) {}
        }

        for (const file of req.files) {
            try {
                // 校验每个文件
                if (file.size > 10 * 1024 * 1024) {
                    errors.push({ name: file.originalname, error: '文件过大' });
                    continue;
                }
                const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
                const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
                const fileExt = path.extname(file.originalname || '').toLowerCase();
                if (!allowedTypes.includes(file.mimetype) || !allowedExts.includes(fileExt)) {
                    errors.push({ name: file.originalname, error: '文件类型不支持' });
                    continue;
                }

                const result = await uploadFile(file, folder);
                const publicUrl = toPublicUrl(req, result.url);
                const publicResult = { ...result, url: publicUrl };

                // 自动入库
                let materialId = null;
                if (tempGroup) {
                    try {
                        const { Material } = getModels();
                        const title = path.parse(file.originalname).name || 'untitled';
                        const mat = await Material.create({
                            type: inferMaterialType(file.mimetype),
                            title,
                            url: publicUrl,
                            group_id: tempGroup.id,
                            status: 1
                        });
                        materialId = mat.id;
                    } catch (libErr) {
                        console.warn('[Upload] 批量素材入库失败:', libErr.message);
                    }
                }

                results.push({ ...publicResult, material_id: materialId });
            } catch (e) {
                errors.push({ name: file.originalname, error: e.message });
            }
        }

        res.json({
            code: 0,
            data: { uploaded: results, failed: errors },
            message: `成功上传 ${results.length} 个文件`
        });
    } catch (error) {
        console.error('批量上传失败:', error);
        res.status(500).json({ code: -1, message: '上传失败' });
    }
};

/**
 * 获取存储配置（脱敏）
 * GET /admin/api/storage/config
 */
const getStorageConfig = async (req, res) => {
    try {
        // 脱敏处理：隐藏敏感信息中间部分
        const maskSecret = (str) => {
            if (!str || str.length < 8) return str ? '***' : '';
            return str.slice(0, 4) + '****' + str.slice(-4);
        };

        const safeConfig = {
            provider: storageConfig.provider,
            aliyun: {
                accessKeyId: maskSecret(storageConfig.aliyun.accessKeyId),
                accessKeySecret: maskSecret(storageConfig.aliyun.accessKeySecret),
                bucket: storageConfig.aliyun.bucket,
                region: storageConfig.aliyun.region,
                endpoint: storageConfig.aliyun.endpoint,
                customDomain: storageConfig.aliyun.customDomain,
                configured: !!(storageConfig.aliyun.accessKeyId && storageConfig.aliyun.accessKeySecret)
            },
            tencent: {
                secretId: maskSecret(storageConfig.tencent.secretId),
                secretKey: maskSecret(storageConfig.tencent.secretKey),
                bucket: storageConfig.tencent.bucket,
                region: storageConfig.tencent.region,
                customDomain: storageConfig.tencent.customDomain,
                configured: !!(storageConfig.tencent.secretId && storageConfig.tencent.secretKey)
            },
            qiniu: {
                accessKey: maskSecret(storageConfig.qiniu.accessKey),
                secretKey: maskSecret(storageConfig.qiniu.secretKey),
                bucket: storageConfig.qiniu.bucket,
                domain: storageConfig.qiniu.domain,
                configured: !!(storageConfig.qiniu.accessKey && storageConfig.qiniu.secretKey)
            },
            minio: {
                endPoint: storageConfig.minio.endPoint,
                port: storageConfig.minio.port,
                useSSL: storageConfig.minio.useSSL,
                accessKey: maskSecret(storageConfig.minio.accessKey),
                secretKey: maskSecret(storageConfig.minio.secretKey),
                bucket: storageConfig.minio.bucket,
                configured: !!(storageConfig.minio.accessKey && storageConfig.minio.secretKey)
            },
            local: storageConfig.local
        };

        res.json({ code: 0, data: safeConfig });
    } catch (error) {
        console.error('获取存储配置失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * 更新存储配置
 * PUT /admin/api/storage/config
 */
const updateStorageConfig = async (req, res) => {
    try {
        const { provider, aliyun, tencent, qiniu, minio, local } = req.body;

        if (provider) {
            if (!['local', 'aliyun', 'tencent', 'qiniu', 'minio'].includes(provider)) {
                return res.status(400).json({ code: -1, message: '无效的存储服务商' });
            }
            storageConfig.provider = provider;
        }

        // 更新各服务商配置
        if (aliyun) {
            Object.assign(storageConfig.aliyun, aliyun);
        }
        if (tencent) {
            Object.assign(storageConfig.tencent, tencent);
        }
        if (qiniu) {
            Object.assign(storageConfig.qiniu, qiniu);
        }
        if (minio) {
            Object.assign(storageConfig.minio, minio);
        }
        if (local) {
            Object.assign(storageConfig.local, local);
        }

        res.json({
            code: 0,
            message: '存储配置更新成功（仅内存生效，重启后需重新配置。如需持久化请配置环境变量）'
        });
    } catch (error) {
        console.error('更新存储配置失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

/**
 * 测试存储配置
 * POST /admin/api/storage/test
 */
const testStorageConfig = async (req, res) => {
    try {
        const { provider } = req.body;
        const testProvider = provider || storageConfig.provider;

        // 创建测试文件
        const testFile = {
            originalname: 'test.txt',
            buffer: Buffer.from('Storage test file - ' + new Date().toISOString()),
            size: 50,
            mimetype: 'text/plain'
        };

        // 临时切换provider测试
        const originalProvider = storageConfig.provider;
        storageConfig.provider = testProvider;

        try {
            const result = await uploadFile(testFile, 'test');
            storageConfig.provider = originalProvider;

            res.json({
                code: 0,
                message: `${testProvider} 配置测试成功`,
                data: result
            });
        } catch (e) {
            storageConfig.provider = originalProvider;
            throw e;
        }
    } catch (error) {
        console.error('存储测试失败:', error);
        res.status(500).json({ code: -1, message: `测试失败: ${error.message}` });
    }
};

/**
 * 获取上传签名（用于前端直传）
 * GET /admin/api/storage/signature
 */
const getUploadSignature = async (req, res) => {
    try {
        const provider = storageConfig.provider;
        const folder = normalizeFolder(req.query.folder || 'products');

        if (provider === 'aliyun') {
            const config = storageConfig.aliyun;
            if (!config.accessKeyId || !config.accessKeySecret) {
                return res.status(400).json({ code: -1, message: '阿里云OSS未配置' });
            }

            // 生成Policy和签名（用于前端直传）
            const expiration = new Date(Date.now() + 30 * 60 * 1000).toISOString();
            const policyText = {
                expiration,
                conditions: [
                    ['content-length-range', 0, 10485760],  // 10MB
                    ['starts-with', '$key', folder + '/']
                ]
            };

            const policy = Buffer.from(JSON.stringify(policyText)).toString('base64');
            const signature = crypto
                .createHmac('sha1', config.accessKeySecret)
                .update(policy)
                .digest('base64');

            const host = config.endpoint || `https://${config.bucket}.${config.region}.aliyuncs.com`;

            return res.json({
                code: 0,
                data: {
                    provider: 'aliyun',
                    host,
                    accessId: config.accessKeyId,
                    policy,
                    signature,
                    dir: folder + '/',
                    expire: Math.floor(Date.now() / 1000) + 1800
                }
            });
        }

        // 其他服务商暂不支持前端直传签名，返回服务端上传模式标记
        res.json({
            code: 0,
            data: {
                provider,
                mode: 'server',
                uploadUrl: '/admin/api/upload'
            }
        });
    } catch (error) {
        console.error('获取上传签名失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

// 导出配置对象供其他模块使用
module.exports = {
    upload,
    uploadMultiple,
    getStorageConfig,
    updateStorageConfig,
    testStorageConfig,
    getUploadSignature,
    // 供其他模块调用的上传函数
    uploadFile,
    storageConfig
};
