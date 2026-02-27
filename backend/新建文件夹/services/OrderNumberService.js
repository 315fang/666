/**
 * 订单编号生成服务
 * 使用改进的算法生成唯一、可追溯的订单编号
 */

const crypto = require('crypto');

class OrderNumberService {
    constructor() {
        // 机器ID（可从环境变量读取，用于分布式系统）
        this.machineId = process.env.MACHINE_ID || this._generateMachineId();

        // 序列号计数器（每毫秒重置）
        this.sequence = 0;
        this.lastTimestamp = 0;

        // 订单号前缀
        this.PREFIX = 'ORD';
    }

    /**
     * 生成机器ID（基于主机名或随机生成）
     * @private
     */
    _generateMachineId() {
        const hostname = require('os').hostname();
        const hash = crypto.createHash('md5').update(hostname).digest('hex');
        // 取hash的前2位作为机器ID (00-FF)
        return hash.substring(0, 2).toUpperCase();
    }

    /**
     * 生成订单号
     * 格式: ORD + YYYYMMDD + HHMMSS + 机器ID(2位) + 序列号(4位) + 随机数(2位)
     * 示例: ORD20260210143025A100012F
     *
     * @returns {string} 订单号
     */
    generateOrderNumber() {
        const now = new Date();
        const timestamp = now.getTime();

        // 如果在同一毫秒内，序列号递增
        if (timestamp === this.lastTimestamp) {
            this.sequence = (this.sequence + 1) % 10000; // 4位序列号，最大9999

            // 如果序列号溢出，等待下一毫秒
            if (this.sequence === 0) {
                while (Date.now() <= timestamp) {
                    // 空循环等待
                }
            }
        } else {
            this.sequence = 0;
            this.lastTimestamp = timestamp;
        }

        // 格式化日期时间部分
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const second = String(now.getSeconds()).padStart(2, '0');

        // 序列号（4位）
        const seqStr = String(this.sequence).padStart(4, '0');

        // 随机数（2位，防止序列号冲突）
        const random = crypto.randomBytes(1).toString('hex').toUpperCase();

        // 组合订单号
        const orderNumber = `${this.PREFIX}${year}${month}${day}${hour}${minute}${second}${this.machineId}${seqStr}${random}`;

        return orderNumber;
    }

    /**
     * 生成简化版订单号（无前缀，更短）
     * 格式: YYYYMMDDHHMMSS + 机器ID(2位) + 序列号(3位)
     * 示例: 20260210143025A1001
     *
     * @returns {string} 简化订单号
     */
    generateShortOrderNumber() {
        const now = new Date();
        const timestamp = now.getTime();

        if (timestamp === this.lastTimestamp) {
            this.sequence = (this.sequence + 1) % 1000;
            if (this.sequence === 0) {
                while (Date.now() <= timestamp) {
                    // 等待下一毫秒
                }
            }
        } else {
            this.sequence = 0;
            this.lastTimestamp = timestamp;
        }

        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const second = String(now.getSeconds()).padStart(2, '0');
        const seqStr = String(this.sequence).padStart(3, '0');

        return `${year}${month}${day}${hour}${minute}${second}${this.machineId}${seqStr}`;
    }

    /**
     * 解析订单号获取时间信息
     * @param {string} orderNumber - 订单号
     * @returns {Object|null} 解析结果
     */
    parseOrderNumber(orderNumber) {
        if (!orderNumber || typeof orderNumber !== 'string') {
            return null;
        }

        try {
            // 移除前缀
            let numPart = orderNumber;
            if (orderNumber.startsWith(this.PREFIX)) {
                numPart = orderNumber.substring(this.PREFIX.length);
            }

            // 解析各部分
            const year = numPart.substring(0, 4);
            const month = numPart.substring(4, 6);
            const day = numPart.substring(6, 8);
            const hour = numPart.substring(8, 10);
            const minute = numPart.substring(10, 12);
            const second = numPart.substring(12, 14);
            const machineId = numPart.substring(14, 16);
            const sequence = numPart.substring(16, 20);

            return {
                timestamp: new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`),
                machineId,
                sequence: parseInt(sequence, 10),
                dateString: `${year}-${month}-${day} ${hour}:${minute}:${second}`
            };
        } catch (error) {
            console.error('解析订单号失败:', error.message);
            return null;
        }
    }

    /**
     * 验证订单号格式
     * @param {string} orderNumber - 订单号
     * @returns {boolean} 是否有效
     */
    isValidOrderNumber(orderNumber) {
        if (!orderNumber || typeof orderNumber !== 'string') {
            return false;
        }

        // 检查前缀
        if (!orderNumber.startsWith(this.PREFIX)) {
            return false;
        }

        // 检查长度（ORD + 14位日期时间 + 2位机器ID + 4位序列号 + 2位随机数 = 25位）
        if (orderNumber.length !== 25) {
            return false;
        }

        // 尝试解析
        const parsed = this.parseOrderNumber(orderNumber);
        return parsed !== null && !isNaN(parsed.timestamp.getTime());
    }

    /**
     * 批量生成订单号
     * @param {number} count - 数量
     * @returns {Array<string>} 订单号数组
     */
    generateBatch(count) {
        const orderNumbers = [];
        for (let i = 0; i < count; i++) {
            orderNumbers.push(this.generateOrderNumber());
        }
        return orderNumbers;
    }

    /**
     * 生成退款单号
     * 格式: RFD + 时间戳 + 机器ID + 序列号 + 随机数
     * @returns {string} 退款单号
     */
    generateRefundNumber() {
        const orderNum = this.generateOrderNumber();
        return orderNum.replace(this.PREFIX, 'RFD');
    }

    /**
     * 生成提现单号
     * 格式: WDR + 时间戳 + 机器ID + 序列号 + 随机数
     * @returns {string} 提现单号
     */
    generateWithdrawalNumber() {
        const orderNum = this.generateOrderNumber();
        return orderNum.replace(this.PREFIX, 'WDR');
    }
}

// 导出单例
const orderNumberService = new OrderNumberService();

module.exports = orderNumberService;
