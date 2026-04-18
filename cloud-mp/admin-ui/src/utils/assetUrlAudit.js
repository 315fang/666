// 这些 query 参数出现在 URL 中，说明是带签名的临时链接（会过期），不能存进数据库
// 注意：
//   CloudBase getTempFileURL 返回的 URL 虽然带 token 参数，但 token 是 CDN 鉴权凭证，
//   并不属于"会过期的签名链接"范畴，因此不列入此处
//   AWS S3 / 阿里云 OSS / 腾讯云 COS 的预签名 URL 使用 x-amz-* / x-oss-* / x-cos-* 参数
const TEMP_QUERY_KEYS = [
  'expires',
  'signature',
  'sign',
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
  'x-cos-signature'
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
    const host = String(parsed.hostname || '').trim().toLowerCase()
    const hasCloudBaseLegacySign = host.endsWith('tcb.qcloud.la')
      && parsed.searchParams.has('sign')
      && parsed.searchParams.has('t')
    if (hasCloudBaseLegacySign) {
      matchedKeys.push('sign', 't')
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
