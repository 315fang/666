'use strict';

function pickString(value, fallback = '') {
  if (value == null) return fallback;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function dedupeParts(parts = []) {
  const seen = new Set();
  const result = [];
  (Array.isArray(parts) ? parts : []).forEach((part) => {
    const normalized = pickString(part);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
}

function collapseRepeatedTokenSequence(text = '') {
  const tokens = pickString(text).split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return pickString(text);
  for (let size = 1; size <= Math.floor(tokens.length / 2); size += 1) {
    if (tokens.length % size !== 0) continue;
    const pattern = tokens.slice(0, size).join(' ');
    let matched = true;
    for (let index = size; index < tokens.length; index += size) {
      if (tokens.slice(index, index + size).join(' ') !== pattern) {
        matched = false;
        break;
      }
    }
    if (matched) return pattern;
  }
  return pickString(text);
}

function normalizeSpecDisplayText(rawSpec = '') {
  const text = pickString(rawSpec);
  if (!text) return '';

  const hasDelimiter = /[·/、,，;；|]/.test(text);
  if (hasDelimiter) {
    const parts = dedupeParts(text.split(/\s*[·/、,，;；|]+\s*/));
    if (parts.length > 0) return parts.join(' / ');
  }

  return collapseRepeatedTokenSequence(text);
}

function normalizeOrderItemSpec(item = {}) {
  return {
    ...item,
    spec: normalizeSpecDisplayText(item.spec || item.snapshot_spec || '')
  };
}

function normalizeOrderItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => normalizeOrderItemSpec(item));
}

module.exports = {
  normalizeSpecDisplayText,
  normalizeOrderItemSpec,
  normalizeOrderItems
};
