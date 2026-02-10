// utils/image.js - 图片处理工具函数

/**
 * 解析图片数据
 * 处理后端返回的图片字段，可能是字符串、JSON字符串或数组
 * @param {string|Array} images - 图片数据
 * @param {string} placeholder - 占位图路径（可选）
 * @returns {Array} - 图片数组
 */
function parseImages(images, placeholder = '') {
    // 如果是字符串，尝试解析为 JSON
    if (typeof images === 'string') {
        // 空字符串返回空数组或占位图
        if (!images || images.trim() === '') {
            return placeholder ? [placeholder] : [];
        }

        // 尝试解析 JSON 字符串
        try {
            const parsed = JSON.parse(images);
            if (Array.isArray(parsed)) {
                return parsed.length > 0 ? parsed : (placeholder ? [placeholder] : []);
            }
            // 解析后不是数组，作为单个图片处理
            return [parsed];
        } catch (e) {
            // 不是 JSON，作为单个图片 URL 处理
            return [images];
        }
    }

    // 如果已经是数组
    if (Array.isArray(images)) {
        return images.length > 0 ? images : (placeholder ? [placeholder] : []);
    }

    // 其他情况返回空数组或占位图
    return placeholder ? [placeholder] : [];
}

/**
 * 获取第一张图片
 * @param {string|Array} images - 图片数据
 * @param {string} placeholder - 占位图路径（可选）
 * @returns {string} - 第一张图片URL或占位图
 */
function getFirstImage(images, placeholder = '/assets/images/placeholder.png') {
    const parsedImages = parseImages(images);
    return parsedImages.length > 0 ? parsedImages[0] : placeholder;
}

/**
 * 验证图片URL是否有效
 * @param {string} url - 图片URL
 * @returns {boolean}
 */
function isValidImageUrl(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }

    // 检查是否是有效的URL格式
    const urlPattern = /^(https?:\/\/|\/|\.\/)/i;
    return urlPattern.test(url);
}

/**
 * 获取图片数量
 * @param {string|Array} images - 图片数据
 * @returns {number}
 */
function getImageCount(images) {
    const parsedImages = parseImages(images);
    return parsedImages.length;
}

/**
 * 为图片URL添加缩略图参数（如果支持）
 * @param {string} url - 原始图片URL
 * @param {number} width - 缩略图宽度
 * @param {number} height - 缩略图高度
 * @returns {string} - 处理后的URL
 */
function getThumbnailUrl(url, width = 200, height = 200) {
    if (!isValidImageUrl(url)) {
        return url;
    }

    // 这里可以根据实际使用的CDN服务添加缩略图参数
    // 例如七牛云: url + '?imageView2/1/w/200/h/200'
    // 例如阿里云OSS: url + '?x-oss-process=image/resize,m_fill,w_200,h_200'

    // 暂时返回原URL，后续可根据实际CDN配置修改
    return url;
}

/**
 * 预加载图片（提升用户体验）
 * @param {string|Array} images - 图片数据
 */
function preloadImages(images) {
    const parsedImages = parseImages(images);

    parsedImages.forEach(url => {
        if (isValidImageUrl(url)) {
            wx.getImageInfo({
                src: url,
                success: () => {
                    console.log('图片预加载成功:', url);
                },
                fail: (err) => {
                    console.error('图片预加载失败:', url, err);
                }
            });
        }
    });
}

module.exports = {
    parseImages,
    getFirstImage,
    isValidImageUrl,
    getImageCount,
    getThumbnailUrl,
    preloadImages
};
