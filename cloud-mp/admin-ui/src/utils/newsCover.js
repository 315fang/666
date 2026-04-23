const HTML_ENTITY_MAP = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>'
}

function decodeHtmlEntityString(value = '') {
  return String(value || '').replace(/&(amp|quot|#39|lt|gt);/gi, (matched) => {
    return HTML_ENTITY_MAP[matched.toLowerCase()] || matched
  })
}

export function normalizeNewsCoverCandidate(value = '') {
  const raw = decodeHtmlEntityString(value).trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('//')) return `https:${raw}`
  return ''
}

export function extractFirstImageFromHtml(html = '') {
  const raw = String(html || '')
  if (!raw) return ''

  const quotedMatch = raw.match(/<img\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/i)
  if (quotedMatch && quotedMatch[2]) {
    return normalizeNewsCoverCandidate(quotedMatch[2])
  }

  const bareMatch = raw.match(/<img\b[^>]*?\bsrc\s*=\s*([^\s"'<>]+)/i)
  if (bareMatch && bareMatch[1]) {
    return normalizeNewsCoverCandidate(bareMatch[1])
  }

  return ''
}
