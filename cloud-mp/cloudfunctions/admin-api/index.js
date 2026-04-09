'use strict';

process.env.ADMIN_DATA_SOURCE = process.env.ADMIN_DATA_SOURCE
    || (process.env.ADMIN_CLOUDBASE_ENV_ID || process.env.TCB_ENV || process.env.SCF_NAMESPACE ? 'cloudbase' : 'filesystem');
process.env.ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'admin-api-function-secret';

const { EventEmitter } = require('events');
const { createRequest, createResponse } = require('node-mocks-http');
const app = require('./src/app');

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
    const body = event.body;
    if (body == null || body === '') return undefined;
    if (typeof body === 'object') return body;
    try {
        return JSON.parse(body);
    } catch (_) {
        return body;
    }
}

exports.main = async (event) => {
    await Promise.resolve(app.locals.dataStore?.readyPromise);

    const headers = normalizeHeaders(event.headers);
    const path = normalizePath(event);
    const query = normalizeQuery(event);
    const body = normalizeBody(event);
    const response = createResponse({ eventEmitter: EventEmitter });
    const request = createRequest({
        method: event.httpMethod || 'GET',
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

    return {
        statusCode: response.statusCode || 200,
        headers: response._getHeaders(),
        body: response._isJSON()
            ? JSON.stringify(response._getJSONData())
            : String(response._getData() || ''),
        isBase64Encoded: false
    };
};
