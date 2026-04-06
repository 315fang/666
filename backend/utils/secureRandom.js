/**
 * secureRandom — 加密安全随机数工具
 *
 * ★ 安全修复: 统一替代各文件中散布的 Math.random() 调用
 *
 * 使用 crypto.randomBytes 生成密码学安全随机数，
 * 用于订单号、邀请码、自提码、核销码等不可预测场景。
 *
 * 注意：
 * - 纯 UI 动画/展示类随机（如抽奖动画效果）不需要使用此模块
 * - 性能敏感的内部循环中请缓存结果，避免频繁调用
 */
const crypto = require('crypto');

/**
 * 生成加密安全的十六进制随机字符串
 * @param {number} length - 输出字符长度（每个字节 = 2 个 hex 字符）
 * @returns {string} 小写十六进制字符串
 *
 * @example
 * secureRandomHex(6)   // => 'a3f2b1c8e0'
 * secureRandomHex(16)  // => '7d9c2a0e4f8b1a3c'
 */
function secureRandomHex(length) {
    const bytes = Math.ceil(length / 2);
    return crypto.randomBytes(bytes).toString('hex').slice(0, length);
}

/**
 * 生成指定范围内的安全随机整数 [min, max)
 * @param {number} min - 最小值（包含）
 * @param {number} max - 最大值（不包含）
 * @returns {number}
 *
 * @example
 * secureRandomInt(0, 100)  // => 42 (0-99之间的安全随机数)
 */
function secureRandomInt(min, max) {
    const range = max - min;
    if (range <= 0) return min;
    // 对 2 的幂取模会有偏差，这里使用 "reject out-of-range" 方法保证均匀性
    const bytesNeeded = Math.ceil(Math.log2(range));
    const maxValid = 2 ** (bytesNeeded * 8) - (2 ** (bytesNeeded * 8) % range);
    let x;
    do {
        x = crypto.randomBytes(bytesNeeded).readUIntBE(0, bytesNeeded);
    } while (x >= maxValid);
    return min + (x % range);
}

/**
 * 从给定字符集中安全随机选取 n 个字符组成字符串
 * @param {string} charset - 候选字符集
 * @param {number} length - 输出长度
 * @returns {string}
 *
 * @example
 * secureRandomFromCharset('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 16)
 *   // => 'K7M3N9P2Q4R8S1T' (无混淆的自提码风格)
 */
function secureRandomFromCharset(charset, length) {
    const result = [];
    for (let i = 0; i < length; i++) {
        result.push(charset[secureRandomInt(0, charset.length)]);
    }
    return result.join('');
}

module.exports = {
    secureRandomHex,
    secureRandomInt,
    secureRandomFromCharset,
};
