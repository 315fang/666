const TEMP_QUERY_KEYS = [
  'expires',
  'signature',
  'x-amz-algorithm',
  'x-amz-credential',
  'x-amz-date',
  'x-amz-expires',
  'x-amz-security-token',
  'x-amz-signature',
  'x-oss-signature',
  'x-oss-credential',
  'x-oss-date',
  'x-oss-expires',
  'x-cos-algorithm',
  'x-cos-credential',
  'x-cos-date',
  'x-cos-expires',
  'x-cos-security-token',
  'x-cos-signature',
  'token',
  'auth'
]

function analyzeAssetUrl(url) {
  const rawUrl = String(url || '').trim()
  if (!rawUrl) return { isTemporary: false, matchedKeys: [] }

  try {
    const parsed = new URL(rawUrl, 'http://placeholder.local')
    const matchedKeys = []
    for (const [key] of parsed.searchParams.entries()) {
      const normalized = String(key || '').trim().toLowerCase()
      if (TEMP_QUERY_KEYS.includes(normalized)) matchedKeys.push(normalized)
    }
    return {
      isTemporary: matchedKeys.length > 0,
      matchedKeys: Array.from(new Set(matchedKeys))
    }
  } catch (_) {
    return { isTemporary: false, matchedKeys: [] }
  }
}

export function findTemporaryAssetUrls(urls = []) {
  return (Array.isArray(urls) ? urls : [])
    .map((url) => ({ url, ...analyzeAssetUrl(url) }))
    .filter((item) => item.isTemporary)
}

export function warnTemporaryAssetUrls(urls, label = '素材') {
  const flagged = findTemporaryAssetUrls(urls)
  if (!flagged.length) return ''

  const keys = Array.from(new Set(flagged.flatMap((item) => item.matchedKeys)))
  return `${label}包含临时签名链接，请改用稳定素材地址${keys.length ? `（命中参数: ${keys.join(', ')}）` : ''}`
}
