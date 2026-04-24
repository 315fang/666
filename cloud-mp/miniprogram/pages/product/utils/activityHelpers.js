function normalizeActivityList(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.list)) return payload.list;
    if (payload && Array.isArray(payload.data)) return payload.data;
    return [];
}

function pickData(payload) {
    return payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
        ? payload.data
        : null;
}

function hasResumeMessage(message, keywords) {
    const text = message ? String(message) : '';
    return keywords.some((keyword) => text.includes(keyword));
}

function resolveSlashResumePayload(payload) {
    const data = pickData(payload);
    const slashNo = (data && data.slash_no) || (payload && payload.slash_no) || '';
    const existing = Boolean(
        (data && data.existing) ||
        (payload && payload.existing) ||
        (slashNo && hasResumeMessage(payload && payload.message, ['进行中的砍价', '继续进入详情', '继续上次砍价']))
    );

    return {
        resumable: Boolean(slashNo),
        slashNo: slashNo || '',
        existing
    };
}

module.exports = {
    normalizeActivityList,
    resolveSlashResumePayload
};
