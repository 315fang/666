function normalizeActivityList(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.list)) return payload.list;
    if (payload && Array.isArray(payload.data)) return payload.data;
    return [];
}

module.exports = {
    normalizeActivityList
};
