/**
 * Structured logging utility
 * Provides consistent logging format for critical flows
 */

const fs = require('fs');
const path = require('path');

// Log levels
const LOG_LEVELS = {
    ERROR: 'ERROR',
    WARN: 'WARN',
    INFO: 'INFO',
    DEBUG: 'DEBUG'
};

// Current environment
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

// Log directory
const LOG_DIR = path.join(__dirname, '../logs');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Format log message
 */
function formatLog(level, category, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        category,
        message,
        ...meta
    };

    // In production, output JSON for easier parsing
    if (isProduction) {
        return JSON.stringify(logEntry);
    }

    // In development, output readable format
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level} [${category}] ${message}${metaStr}`;
}

/**
 * Write log to file
 */
function writeToFile(level, content) {
    if (!isProduction) return; // Only write to files in production

    const date = new Date().toISOString().split('T')[0];
    const filename = `${date}-${level.toLowerCase()}.log`;
    const filepath = path.join(LOG_DIR, filename);

    fs.appendFile(filepath, content + '\n', (err) => {
        if (err) {
            console.error('Failed to write log:', err);
        }
    });
}

/**
 * Base logging function
 */
function log(level, category, message, meta = {}) {
    const formattedLog = formatLog(level, category, message, meta);

    // Console output
    switch (level) {
        case LOG_LEVELS.ERROR:
            console.error(formattedLog);
            break;
        case LOG_LEVELS.WARN:
            console.warn(formattedLog);
            break;
        default:
            console.log(formattedLog);
    }

    // File output (production only)
    if (level === LOG_LEVELS.ERROR || level === LOG_LEVELS.WARN) {
        writeToFile(level, formattedLog);
    }
}

/**
 * Error logging
 */
function error(category, message, meta = {}) {
    log(LOG_LEVELS.ERROR, category, message, meta);
}

/**
 * Warning logging
 */
function warn(category, message, meta = {}) {
    log(LOG_LEVELS.WARN, category, message, meta);
}

/**
 * Info logging
 */
function info(category, message, meta = {}) {
    log(LOG_LEVELS.INFO, category, message, meta);
}

/**
 * Debug logging (only in development)
 */
function debug(category, message, meta = {}) {
    if (isDevelopment) {
        log(LOG_LEVELS.DEBUG, category, message, meta);
    }
}

/**
 * Log authentication events
 */
function logAuth(action, meta = {}) {
    info('AUTH', action, meta);
}

/**
 * Log order events
 */
function logOrder(action, meta = {}) {
    info('ORDER', action, meta);
}

/**
 * Log commission settlement events
 */
function logCommission(action, meta = {}) {
    info('COMMISSION', action, meta);
}

/**
 * Log payment events
 */
function logPayment(action, meta = {}) {
    info('PAYMENT', action, meta);
}

/**
 * Log API request/response
 */
function logRequest(req, res, duration) {
    const meta = {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        userAgent: req.get('user-agent')
    };

    if (res.statusCode >= 400) {
        warn('API', `${req.method} ${req.path}`, meta);
    } else if (isDevelopment) {
        debug('API', `${req.method} ${req.path}`, meta);
    }
}

/**
 * Express middleware for request logging
 */
function requestLogger(req, res, next) {
    const startTime = Date.now();

    // Capture response finish event
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        logRequest(req, res, duration);
    });

    next();
}

/**
 * Error tracking middleware
 */
function errorTracker(err, req, res, next) {
    error('ERROR', err.message, {
        stack: err.stack,
        path: req.path,
        method: req.method,
        body: req.body,
        query: req.query,
        user: req.user ? req.user.id : 'anonymous'
    });

    next(err);
}

module.exports = {
    LOG_LEVELS,
    error,
    warn,
    info,
    debug,
    logAuth,
    logOrder,
    logCommission,
    logPayment,
    logRequest,
    requestLogger,
    errorTracker
};
