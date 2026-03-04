const fs = require('fs');
const path = require('path');
const COS = require('cos-nodejs-sdk-v5');

/**
 * Storage Service - Support Local & Tencent Cloud COS Mode
 */
class StorageService {
    constructor() {
        this.mode = process.env.STORAGE_PROVIDER || 'local';

        // 初始化 COS (如果环境变量有配置)
        if (this.mode === 'tencent') {
            this.cos = new COS({
                SecretId: process.env.TENCENT_SECRET_ID,
                SecretKey: process.env.TENCENT_SECRET_KEY,
            });
            this.bucket = process.env.TENCENT_COS_BUCKET;
            this.region = process.env.TENCENT_COS_REGION;
        }
    }

    /**
     * 保存文件
     * @param {Object} file - multer解析出的file对象 { path, originalname, mimetype }
     * @param {String} folder - 目标短路径 (例如 'products', 'avatars')
     * @returns {Promise<String>} - 返回可供公网访问的URL
     */
    async uploadFile(file, folder = 'uploads') {
        if (!file || !file.path) {
            throw new Error('Invalid file object');
        }

        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        const filename = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}${ext}`;
        const targetPath = `${folder}/${filename}`;

        if (this.mode === 'tencent') {
            return this._uploadToCOS(file.path, targetPath);
        } else {
            return this._uploadToLocal(file.path, targetPath);
        }
    }

    /**
     * 上传到腾讯云COS
     */
    _uploadToCOS(sourceFilePath, targetPath) {
        return new Promise((resolve, reject) => {
            if (!this.cos || !this.bucket || !this.region) {
                return reject(new Error('COS configuration is missing.'));
            }

            this.cos.putObject({
                Bucket: this.bucket,
                Region: this.region,
                Key: targetPath, // COS上的路径
                StorageClass: 'STANDARD',
                Body: fs.createReadStream(sourceFilePath)
            }, (err, data) => {
                // 上传完后可以顺手清理本地临时文件
                fs.unlink(sourceFilePath, () => { });

                if (err) {
                    console.error('COS Upload Error:', err);
                    return reject(err);
                }

                if (process.env.TENCENT_COS_CUSTOM_DOMAIN) {
                    resolve(`${process.env.TENCENT_COS_CUSTOM_DOMAIN}/${targetPath}`);
                } else {
                    resolve(`https://${data.Location}`);
                }
            });
        });
    }

    /**
     * 上传到本地
     */
    _uploadToLocal(sourceFilePath, targetPath) {
        return new Promise((resolve, reject) => {
            const publicDir = path.join(__dirname, '..', 'public');
            const destFilePath = path.join(publicDir, targetPath);

            // 确保目录存在
            const destDir = path.dirname(destFilePath);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }

            fs.copyFile(sourceFilePath, destFilePath, (err) => {
                // 清理源临时文件
                fs.unlink(sourceFilePath, () => { });

                if (err) {
                    return reject(err);
                }

                const host = process.env.BASE_URL || 'http://localhost:3000';
                resolve(`${host}/${targetPath}`);
            });
        });
    }
}

module.exports = new StorageService();
