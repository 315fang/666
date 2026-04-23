const { resolveCloudImageUrl } = require('./cloudAssetRuntime');

function escapeHtml(value = '') {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function hasHtmlTag(value = '') {
    return /<[^>]+>/.test(String(value || ''));
}

function startsWithBlockTag(value = '') {
    return /^<(p|div|section|article|blockquote|ul|ol|li|h[1-6]|table|figure)\b/i.test(String(value || '').trim());
}

function decodeHtmlEntityString(value = '') {
    return String(value || '')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>');
}

function normalizeHttpCandidate(value = '') {
    const raw = decodeHtmlEntityString(value).trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return `https:${raw}`;
    return '';
}

function isCloudFileId(value = '') {
    return /^cloud:\/\//i.test(String(value || '').trim());
}

function extractAttr(tag = '', name = '') {
    const escapedName = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escapedName) return '';
    const quotedMatch = String(tag || '').match(new RegExp(`\\b${escapedName}\\s*=\\s*([\"'])(.*?)\\1`, 'i'));
    if (quotedMatch && quotedMatch[2]) return decodeHtmlEntityString(quotedMatch[2]);
    const bareMatch = String(tag || '').match(new RegExp(`\\b${escapedName}\\s*=\\s*([^\\s\"'<>]+)`, 'i'));
    return bareMatch && bareMatch[1] ? decodeHtmlEntityString(bareMatch[1]) : '';
}

function replaceAttr(tag = '', name = '', value = '') {
    const rawTag = String(tag || '');
    const escapedName = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nextValue = String(value || '').replace(/"/g, '&quot;');
    if (!escapedName) return rawTag;
    if (new RegExp(`\\b${escapedName}\\s*=`, 'i').test(rawTag)) {
      return rawTag
        .replace(new RegExp(`\\b${escapedName}\\s*=\\s*([\"'])(.*?)\\1`, 'i'), `${name}="${nextValue}"`)
        .replace(new RegExp(`\\b${escapedName}\\s*=\\s*([^\\s\"'<>]+)`, 'i'), `${name}="${nextValue}"`);
    }
    return rawTag.replace(/^<([a-z0-9-]+)/i, `<$1 ${name}="${nextValue}"`);
}

function tryConvertTcbUrlToCloudFileId(url = '') {
    const raw = normalizeHttpCandidate(url);
    if (!raw || !/\.tcb\.qcloud\.la/i.test(raw)) return '';
    try {
        const parsed = new URL(raw);
        const bucket = String(parsed.hostname || '').replace(/\.tcb\.qcloud\.la$/i, '').trim();
        const path = String(parsed.pathname || '').replace(/^\/+/, '').trim();
        if (!bucket || !path) return '';
        const parts = bucket.split('-').filter(Boolean);
        if (parts.length < 3) return '';
        const envId = parts.slice(1, -1).join('-');
        if (!envId) return '';
        return `cloud://${envId}.${bucket}/${decodeURIComponent(path)}`;
    } catch (_error) {
        return '';
    }
}

function mergeStyleAttribute(tag = '', styles = []) {
    const safeStyles = (Array.isArray(styles) ? styles : []).filter(Boolean);
    if (!safeStyles.length) return tag;

    const styleMatch = tag.match(/\sstyle\s*=\s*(["'])(.*?)\1/i);
    if (styleMatch) {
        let styleText = String(styleMatch[2] || '').trim();
        safeStyles.forEach((styleItem) => {
            const key = String(styleItem).split(':')[0].trim().toLowerCase();
            if (!key) return;
            const exists = new RegExp(`${key}\\s*:`, 'i').test(styleText);
            if (!exists) {
                styleText = styleText ? `${styleText}; ${styleItem}` : styleItem;
            }
        });
        return tag.replace(styleMatch[0], ` style=${styleMatch[1]}${styleText}${styleMatch[1]}`);
    }

    return tag.replace(/<([a-z0-9-]+)/i, `<$1 style="${safeStyles.join('; ')}"`);
}

function normalizeImageTag(tag = '') {
    if (!/^<img\b/i.test(String(tag || '').trim())) return tag;
    return mergeStyleAttribute(String(tag || '').trim(), [
        'max-width:100%',
        'height:auto',
        'display:block',
        'margin:1em auto'
    ]);
}

async function normalizeImageTagAsync(tag = '') {
    const rawTag = String(tag || '').trim();
    if (!/^<img\b/i.test(rawTag)) return rawTag;

    const originalSrc = extractAttr(rawTag, 'src');
    const previewUrl = normalizeHttpCandidate(extractAttr(rawTag, 'data-preview-url') || originalSrc);
    const explicitFileId = extractAttr(rawTag, 'data-file-id');
    const inferredFileId = isCloudFileId(originalSrc) ? originalSrc : tryConvertTcbUrlToCloudFileId(originalSrc);
    const fileId = explicitFileId || inferredFileId;

    let renderableSrc = previewUrl || originalSrc;
    if (fileId) {
        renderableSrc = await resolveCloudImageUrl({
            file_id: fileId,
            image: previewUrl || normalizeHttpCandidate(originalSrc) || ''
        }, previewUrl || normalizeHttpCandidate(originalSrc) || '');
    }

    return normalizeImageTag(replaceAttr(rawTag, 'src', renderableSrc || originalSrc));
}

async function replaceImageTagsAsync(source = '') {
    const raw = String(source || '');
    const pattern = /<img\b[^>]*>/gi;
    let result = '';
    let lastIndex = 0;
    let matched = null;
    while ((matched = pattern.exec(raw))) {
        result += raw.slice(lastIndex, matched.index);
        result += await normalizeImageTagAsync(matched[0]);
        lastIndex = matched.index + matched[0].length;
    }
    result += raw.slice(lastIndex);
    return result;
}

async function normalizeParagraphHtmlAsync(html = '') {
    const source = await replaceImageTagsAsync(String(html || ''));
    return source.replace(/<p\b[^>]*>/gi, (tag) => mergeStyleAttribute(tag, [
            'margin:0 0 1em',
            'line-height:1.9',
            'text-indent:2em'
        ]));
}

function buildPlainParagraph(content = '') {
    const body = escapeHtml(String(content || '').trim());
    if (!String(body || '').trim()) return '';
    return `<p style="margin:0 0 1em;line-height:1.9;text-indent:2em;">${body}</p>`;
}

async function buildRichParagraph(content = '') {
    const normalized = await normalizeParagraphHtmlAsync(String(content || '').trim());
    if (!String(normalized || '').trim()) return '';
    if (startsWithBlockTag(content)) return normalized;
    return `<p style="margin:0 0 1em;line-height:1.9;text-indent:2em;">${normalized}</p>`;
}

function buildImageBlock(block = '') {
    return normalizeImageTagAsync(String(block || '').trim())
        .then((imageTag) => imageTag ? `<div style="margin:1em 0;">${imageTag}</div>` : '');
}

function isStandaloneImageBlock(block = '') {
    return /^<img\b[^>]*\/?>$/i.test(String(block || '').trim());
}

async function normalizeBrandNewsContentHtml(raw = '') {
    const source = String(raw || '').replace(/\r\n?/g, '\n').trim();
    if (!source) return '';

    const blocks = source
        .split(/\n+/)
        .map((item) => String(item || '').trim())
        .filter(Boolean);

    const normalizedBlocks = await Promise.all(blocks.map(async (block) => {
        if (isStandaloneImageBlock(block)) {
            return buildImageBlock(block);
        }
        if (startsWithBlockTag(block)) {
            return buildRichParagraph(block);
        }
        if (hasHtmlTag(block)) {
            return buildRichParagraph(block);
        }
        return buildPlainParagraph(block);
    }));

    return normalizedBlocks.join('');
}

module.exports = {
    tryConvertTcbUrlToCloudFileId,
    normalizeBrandNewsContentHtml
};
