'use strict';
process.on('unhandledRejection', (reason) => {
    console.error('[admin-api] unhandledRejection:', reason);
});
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// ==================== 共享模块导入 ====================
const {
    validateAction, validateAmount, validateInteger, validateString,
    validateArray, validateRequiredFields
} = require('./shared/validators');
const {
    CloudBaseError, ERROR_CODES, errorHandler, cloudFunctionWrapper
} = require('./shared/errors');
const {
    success, error, paginated, list, created, updated, deleted,
    badRequest, unauthorized, forbidden, notFound, conflict, serverError
} = require('./shared/response');
const {
    DEFAULT_GROWTH_TIERS, calculateTier, buildGrowthProgress, loadTierConfig
} = require('./shared/growth');
const {
    toNumber, toArray, toString, toBoolean, getDeep, setDeep, deepClone, merge, pick, omit, generateId, delay
} = require('./shared/utils');

// ==================== 云初始化 ====================


process.env.ADMIN_DATA_SOURCE = process.env.ADMIN_DATA_SOURCE
    || (process.env.ADMIN_CLOUDBASE_ENV_ID || process.env.TCB_ENV || process.env.SCF_NAMESPACE ? 'cloudbase' : 'filesystem');
if (!process.env.ADMIN_JWT_SECRET) {
    const crypto = require('crypto');
    process.env.ADMIN_JWT_SECRET = crypto.randomBytes(32).toString('hex');
    console.warn('[admin-api] ADMIN_JWT_SECRET 未配置，已生成临时随机密钥。请在环境变量中配置固定密钥！');
}

const { EventEmitter } = require('events');
const { createRequest, createResponse } = require('node-mocks-http');
const app = require('./src/app');

let isColdStart = true;

function buildTraceId(event) {
    const candidate = event && (
        event.trace_id
        || event.traceId
        || event.request_id
        || event.requestId
        || event.$requestId
    );
    if (candidate) return String(candidate);
    return `admin_api_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseErrorCode(error) {
    if (!error) return 'unknown_error';
    if (error.code) return String(error.code);
    if (error.errCode) return String(error.errCode);
    return 'internal_error';
}

function logPerf(entry) {
    const payload = {
        kind: 'cf_perf',
        metric_version: 'phase1_v1',
        ts: new Date().toISOString(),
        function_name: 'admin-api',
        action: 'http_gateway',
        db_ms: null,
        ...entry
    };
    console.log(JSON.stringify(payload));
}

function normalizeHeaders(headers) {
    return headers && typeof headers === 'object' ? headers : {};
}

function normalizeQuery(event) {
    if (event.multiValueQueryStringParameters && typeof event.multiValueQueryStringParameters === 'object') {
        return event.multiValueQueryStringParameters;
    }
    if (event.queryStringParameters && typeof event.queryStringParameters === 'object') {
        return event.queryStringParameters;
    }
    return {};
}

function normalizePath(event) {
    const rawPath = event.path || event.requestContext?.path || '/';
    if (rawPath === '/health' || rawPath === '/uploads' || rawPath.startsWith('/uploads/')) {
        return rawPath;
    }
    if (rawPath.startsWith('/admin/api')) {
        return rawPath;
    }
    return `/admin/api${rawPath.startsWith('/') ? rawPath : `/${rawPath}`}`;
}

function normalizeBody(event) {
    let body = event.body;
    if (body == null || body === '') return undefined;
    // CloudBase HTTP 函数有时对非文本内容会设置 isBase64Encoded: true
    if (event.isBase64Encoded && typeof body === 'string') {
        try {
            body = Buffer.from(body, 'base64').toString('utf-8');
        } catch (_) {}
    }
    if (typeof body === 'object') return body;
    try {
        return JSON.parse(body);
    } catch (_) {
        return body;
    }
}

exports.main = async (event) => {
    const startedAt = Date.now();
    const coldStart = isColdStart;
    isColdStart = false;
    const traceId = buildTraceId(event || {});
    const method = (event.httpMethod || 'GET').toUpperCase();
    const path = normalizePath(event || {});

    try {
        const ready = app.locals.dataStore?.readyPromise;
        if (ready) {
            await Promise.race([
                Promise.resolve(ready),
                new Promise(r => setTimeout(r, 8000))
            ]);
        }

        const headers = normalizeHeaders(event.headers);
        const query = normalizeQuery(event);
        const body = normalizeBody(event);
        const response = createResponse({ eventEmitter: EventEmitter });
        const request = createRequest({
            method,
            url: path,
            originalUrl: path,
            path,
            headers,
            query,
            body
        });
        request.event = event;

        await new Promise((resolve, reject) => {
            response.on('end', resolve);
            response.on('finish', resolve);
            response.on('error', reject);
            try {
                app.handle(request, response);
            } catch (error) {
                reject(error);
            }
        });

        const result = {
            statusCode: response.statusCode || 200,
            headers: response._getHeaders(),
            body: response._isJSON()
                ? JSON.stringify(response._getJSONData())
                : String(response._getData() || ''),
            isBase64Encoded: false
        };

        logPerf({
            trace_id: traceId,
            cold_start: coldStart,
            method,
            route: path,
            status: 'ok',
            code: 'ok',
            status_code: result.statusCode,
            total_ms: Date.now() - startedAt
        });

        return result;
    } catch (error) {
        logPerf({
            trace_id: traceId,
            cold_start: coldStart,
            method,
            route: path,
            status: 'error',
            code: parseErrorCode(error),
            status_code: 500,
            total_ms: Date.now() - startedAt
        });
        throw error;
    }
};
