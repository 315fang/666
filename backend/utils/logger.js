/**
 * 结构化日志模块（Winston 升级版）
 *
 * 特性：
 * - 分级：error / warn / info / http / debug
 * - 文件按天轮转，保留 30 天，超 50MB 自动分片
 * - 生产环境不输出 debug，仅 warn+ 输出到控制台
 * - JSON 格式便于 ELK / Loki 等日志系统接入
 * - 向后兼容原有 API（requestLogger, errorTracker, logAuth 等）
 * - 敏感信息脱敏（手机号、身份证等）
 */

const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const isProd = process.env.NODE_ENV === 'production';
const LOG_DIR = path.join(__dirname, '../logs');

// ============================================================
// 敏感信息脱敏工具
// ============================================================

/**
 * 手机号脱敏：138****5678
 * @param {string} phone - 原始手机号
 * @returns {string} 脱敏后的手机号
 */
function maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return phone;
    if (phone.length === 11) {
        return phone.substring(0, 3) + '****' + phone.substring(7);
    }
    return phone;
}

/**
 * 身份证脱敏：330***********1234
 * @param {string} idCard - 原始身份证号
 * @returns {string} 脱敏后的身份证号
 */
function maskIdCard(idCard) {
    if (!idCard || typeof idCard !== 'string') return idCard;
    if (idCard.length >= 18) {
        return idCard.substring(0, 3) + '*'.repeat(11) + idCard.substring(14);
    }
    return idCard;
}

/**
 * 对日志消息和元数据进行敏感信息脱敏
 * @param {string} message - 日志消息
 * @param {object} meta - 日志元数据
 * @returns {{ message: string, meta: object }} 脱敏后的消息和元数据
 */
function sanitizeLogInput(message, meta = {}) {
    // 脱敏消息中的敏感信息
    let sanitizedMessage = message;
    if (typeof message === 'string') {
        // 脱敏手机号（11位数字）
        sanitizedMessage = message.replace(/(\d{3})(\d{4})(\d{4})/g, (match, p1, p2, p3) => {
            // 判断是否为手机号（以1开头的11位数字）
            if (p1.startsWith('1') && message.includes(match)) {
                return p1 + '****' + p3;
            }
            return match;
        });
        // 脱敏身份证号（18位）
        sanitizedMessage = sanitizedMessage.replace(/\b(\d{3})\d{11}(\d{4})\b/g, '$1' + '*'.repeat(11) + '$2');
    }

    // 脱敏元数据中的敏感字段
    const SENSITIVE_FIELDS = [
        'phone', 'mobile', 'tel', 'telephone',
        'id_card', 'idCard', 'identity', 'identity_no',
        'card_no', 'cardNo', 'account_no', 'accountNo',
        'password', 'secret', 'token', 'authorization'
    ];

    let sanitizedMeta = {};
    for (const [key, val] of Object.entries(meta)) {
        if (val === null || val === undefined) {
            sanitizedMeta[key] = val;
            continue;
        }
        const keyLower = key.toLowerCase();
        if (SENSITIVE_FIELDS.some(f => keyLower.includes(f))) {
            if (typeof val === 'string') {
                // 对手机号和身份证进行特殊脱敏
                if (keyLower.includes('phone') || keyLower.includes('mobile') || keyLower.includes('tel')) {
                    sanitizedMeta[key] = maskPhone(val);
                } else if (keyLower.includes('id_card') || keyLower.includes('identity') || keyLower.includes('card_no')) {
                    sanitizedMeta[key] = maskIdCard(val);
                } else {
                    sanitizedMeta[key] = '[REDACTED]';
                }
            } else {
                sanitizedMeta[key] = '[REDACTED]';
            }
        } else if (typeof val === 'string' && val.length > 200) {
            // 超长字符串截断
            sanitizedMeta[key] = val.substring(0, 100) + '...[TRUNCATED]';
        } else if (typeof val === 'object') {
            // 递归脱敏对象
            sanitizedMeta[key] = sanitizeLogInput('', val).meta;
        } else {
            sanitizedMeta[key] = val;
        }
    }

    return { message: sanitizedMessage, meta: sanitizedMeta };
}

// ============================================================
// 格式定义
// ============================================================
const jsonFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.errors({ stack: true }),
    format.json()
);

const prettyFormat = format.combine(
    format.colorize(),
    format.timestamp({ format: 'HH:mm:ss' }),
    format.printf(({ level, message, timestamp, category, ...meta }) => {
        const metaStr = Object.keys(meta).length
            ? ' ' + JSON.stringify(meta)
            : '';
        const cat = category ? `[${category}] ` : '';
        return `${timestamp} [${level}] ${cat}${message}${metaStr}`;
    })
);

// ============================================================
// 轮转文件配置工厂
// ============================================================
function rotateTransport(filename, level = 'debug', maxDays = '30d') {
    return new DailyRotateFile({
        dirname: LOG_DIR,
        filename: `${filename}-%DATE%.log`,
        datePattern: 'YYYY-MM-DD',
        level,
        maxFiles: maxDays,
        maxSize: '50m',
        zippedArchive: true
    });
}

// ============================================================
// 创建 Winston logger
// ============================================================
const winstonLogger = createLogger({
    level: isProd ? 'info' : 'debug',
    format: jsonFormat,
    defaultMeta: { service: 's2b2c-backend' },
    transports: [
        rotateTransport('combined', 'debug', '30d'),     // 所有日志
        rotateTransport('error', 'error', '30d'),        // 仅错误
        rotateTransport('http', 'http', '14d')           // HTTP 访问
    ]
});

// 控制台输出
if (!isProd) {
    winstonLogger.add(new transports.Console({ format: prettyFormat, level: 'debug' }));
} else {
    winstonLogger.add(new transports.Console({ format: prettyFormat, level: 'warn' }));
}

// ============================================================
// 公共 API（向后兼容）
// ============================================================
const logger = {
    // 基础日志方法（自动脱敏）
    error: (category, message, meta = {}) => {
        const { message: safeMsg, meta: safeMeta } = sanitizeLogInput(message, meta);
        winstonLogger.error(safeMsg, { category, ...safeMeta });
    },
    warn: (category, message, meta = {}) => {
        const { message: safeMsg, meta: safeMeta } = sanitizeLogInput(message, meta);
        winstonLogger.warn(safeMsg, { category, ...safeMeta });
    },
    info: (category, message, meta = {}) => {
        const { message: safeMsg, meta: safeMeta } = sanitizeLogInput(message, meta);
        winstonLogger.info(safeMsg, { category, ...safeMeta });
    },
    debug: (category, message, meta = {}) => {
        const { message: safeMsg, meta: safeMeta } = sanitizeLogInput(message, meta);
        winstonLogger.debug(safeMsg, { category, ...safeMeta });
    },

    // 业务快捷方法（自动脱敏）
    logAuth: (action, meta = {}) => {
        const { message: safeMsg, meta: safeMeta } = sanitizeLogInput(action, meta);
        winstonLogger.info(safeMsg, { category: 'AUTH', ...safeMeta });
    },
    logOrder: (action, meta = {}) => {
        const { message: safeMsg, meta: safeMeta } = sanitizeLogInput(action, meta);
        winstonLogger.info(safeMsg, { category: 'ORDER', ...safeMeta });
    },
    logCommission: (action, meta = {}) => {
        const { message: safeMsg, meta: safeMeta } = sanitizeLogInput(action, meta);
        winstonLogger.info(safeMsg, { category: 'COMMISSION', ...safeMeta });
    },
    logPayment: (action, meta = {}) => {
        const { message: safeMsg, meta: safeMeta } = sanitizeLogInput(action, meta);
        winstonLogger.info(safeMsg, { category: 'PAYMENT', ...safeMeta });
    },

    // 定时任务（自动脱敏）
    cronLog: (taskName, result = {}) => {
        const { message: safeMsg, meta: safeMeta } = sanitizeLogInput(taskName, result);
        winstonLogger.info(safeMsg, { category: 'CRON', ...safeMeta });
    },

    // ============================================================
    // Express 中间件：HTTP 请求日志
    // ============================================================
    requestLogger(req, res, next) {
        const startTime = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - startTime;
            const level = res.statusCode >= 500 ? 'error'
                : res.statusCode >= 400 ? 'warn'
                    : 'http';
            winstonLogger.log(level, `${req.method} ${req.originalUrl}`, {
                category: 'HTTP',
                statusCode: res.statusCode,
                responseTime: `${duration}ms`,
                ip: req.ip || req.headers['x-forwarded-for'],
                userId: req.user?.id || null
            });
        });
        next();
    },

    // ============================================================
    // Express 错误中间件（数据脱敏）
    // ============================================================
    errorTracker(err, req, res, next) {
        const SENSITIVE_FIELDS = [
            'phone', 'mobile', 'password', 'secret', 'token',
            'card_no', 'account_no', 'id_card'
        ];
        let sanitizedBody = {};
        if (req.body && typeof req.body === 'object') {
            for (const [key, val] of Object.entries(req.body)) {
                if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f))) {
                    sanitizedBody[key] = '[REDACTED]';
                } else if (typeof val === 'string' && val.length > 200) {
                    sanitizedBody[key] = val.substring(0, 50) + '...[TRUNCATED]';
                } else {
                    sanitizedBody[key] = val;
                }
            }
        }
        winstonLogger.error(err.message, {
            category: 'UNCAUGHT',
            stack: err.stack,
            path: req.path,
            method: req.method,
            body: sanitizedBody,
            userId: req.user?.id || 'anonymous'
        });
        next(err);
    },

    // ============================================================
    // 全局进程异常捕获
    // ============================================================
    setupGlobalHandlers() {
        process.on('unhandledRejection', (reason) => {
            winstonLogger.error('UnhandledRejection', {
                category: 'PROCESS',
                reason: reason instanceof Error ? reason.message : String(reason),
                stack: reason instanceof Error ? reason.stack : undefined
            });
        });
        process.on('uncaughtException', (error) => {
            winstonLogger.error('UncaughtException', {
                category: 'PROCESS',
                message: error.message,
                stack: error.stack
            });
            setTimeout(() => process.exit(1), 2000);
        });
    }
};

module.exports = logger;
