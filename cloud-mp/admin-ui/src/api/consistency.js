export function withStrongReadParams(params = {}) {
  return {
    ...(params || {}),
    fresh_read: params?.fresh_read ?? 1
  }
}

export const STRONG_WRITE_SUCCESS_MESSAGE = '已保存并刷新最新数据'
export const STRONG_WRITE_STALE_MESSAGE = '已保存，列表可能稍后刷新'

export function normalizeStrongMutationPayload(payload) {
  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    Object.prototype.hasOwnProperty.call(payload, 'data') &&
    payload.write_result &&
    payload.freshness
  ) {
    const data = payload.data
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return {
        ...data,
        write_result: payload.write_result,
        freshness: payload.freshness
      }
    }
    return {
      data,
      write_result: payload.write_result,
      freshness: payload.freshness
    }
  }
  return payload
}

export function extractReadAt(payload) {
  return payload?.freshness?.read_at || null
}

export function resolveStrongSuccessMessage(payload, messages = {}) {
  const readMode = payload?.freshness?.read_mode
  if (readMode && readMode !== 'fresh') {
    return messages.cache || STRONG_WRITE_STALE_MESSAGE
  }
  return messages.fresh || STRONG_WRITE_SUCCESS_MESSAGE
}

export function mergeStrongSuccessMessage(payload, detail, messages = {}) {
  const base = resolveStrongSuccessMessage(payload, messages)
  if (!detail) return base
  return `${detail}；${base}`
}
