function decodeHtmlEntityString(value = '') {
    return String(value || '')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>');
}

function normalizeNewsCoverCandidate(value = '') {
    const raw = decodeHtmlEntityString(value).trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return `https:${raw}`;
    return '';
}

function extractFirstImageFromHtml(html = '') {
    const raw = String(html || '');
    if (!raw) return '';

    const quotedMatch = raw.match(/<img\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/i);
    if (quotedMatch && quotedMatch[2]) {
        return normalizeNewsCoverCandidate(quotedMatch[2]);
    }

    const bareMatch = raw.match(/<img\b[^>]*?\bsrc\s*=\s*([^\s"'<>]+)/i);
    if (bareMatch && bareMatch[1]) {
        return normalizeNewsCoverCandidate(bareMatch[1]);
    }

    return '';
}

function getBrandNewsFallbackCover(record = {}) {
    if (!record || typeof record !== 'object') return '';
    return extractFirstImageFromHtml(record.content_html || '');
}

module.exports = {
    extractFirstImageFromHtml,
    getBrandNewsFallbackCover
};
