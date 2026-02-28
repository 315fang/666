/**
 * 结构化日志模块（Winston 升级版）
 * 
 * 特性：
 * - 分级：error / warn / info / http / debug
 * - 文件按天轮转，保留 30 天，超 50MB 自动分片
 * - 生产环境不输出 debug，仅 warn+ 输出到控制台
 * - JSON 格式便于 ELK / Loki 等日志系统接入
 * - 向后兼容原有 API（requestLogger, errorTracker, logAuth 等）
 */

const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const isProd = process.env.NODE_ENV === 'production';
const LOG_DIR = path.join(__dirname, '../logs');

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
    // 基础日志方法
    error: (category, message, meta = {}) =>
        winstonLogger.error(message, { category, ...meta }),
    warn: (category, message, meta = {}) =>
        winstonLogger.warn(message, { category, ...meta }),
    info: (category, message, meta = {}) =>
        winstonLogger.info(message, { category, ...meta }),
    debug: (category, message, meta = {}) =>
        winstonLogger.debug(message, { category, ...meta }),

    // 业务快捷方法
    logAuth: (action, meta = {}) =>
        winstonLogger.info(action, { category: 'AUTH', ...meta }),
    logOrder: (action, meta = {}) =>
        winstonLogger.info(action, { category: 'ORDER', ...meta }),
    logCommission: (action, meta = {}) =>
        winstonLogger.info(action, { category: 'COMMISSION', ...meta }),
    logPayment: (action, meta = {}) =>
        winstonLogger.info(action, { category: 'PAYMENT', ...meta }),

    // 定时任务
    cronLog: (taskName, result = {}) =>
        winstonLogger.info(taskName, { category: 'CRON', ...result }),

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
