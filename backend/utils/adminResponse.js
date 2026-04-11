function appendExtraFields(target, extra = {}) {
    if (!extra || typeof extra !== 'object') return target;
    Object.entries(extra).forEach(([key, value]) => {
        if (value !== undefined) target[key] = value;
    });
    return target;
}

function ok(res, data, message, extra) {
    const body = { code: 0, data };
    if (message) body.message = message;
    return res.json(appendExtraFields(body, extra));
}

function okList(res, list, pagination, message, extra) {
    const data = {
        list: Array.isArray(list) ? list : []
    };
    if (pagination) {
        data.pagination = pagination;
    }
    return ok(res, data, message, extra);
}

function okAction(res, message, data = { success: true }, extra) {
    const body = { code: 0 };
    if (data !== undefined) body.data = data;
    if (message) body.message = message;
    return res.json(appendExtraFields(body, extra));
}

function fail(res, status, message, data, code = status) {
    const body = { code, message };
    if (data !== undefined) body.data = data;
    return res.status(status).json(body);
}

module.exports = {
    ok,
    okList,
    okAction,
    fail
};
