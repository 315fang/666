function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizePagination(result) {
  if (isPlainObject(result?.pagination)) return result.pagination
  if (isPlainObject(result?.data?.pagination)) return result.data.pagination
  if (
    isPlainObject(result) &&
    (result.total !== undefined || result.page !== undefined || result.limit !== undefined)
  ) {
    return {
      total: Number(result.total ?? 0),
      ...(result.page !== undefined ? { page: Number(result.page) } : {}),
      ...(result.limit !== undefined ? { limit: Number(result.limit) } : {})
    }
  }
  return undefined
}

export function normalizeListResult(result) {
  if (Array.isArray(result)) {
    return { list: result }
  }
  if (Array.isArray(result?.list)) {
    return result
  }
  if (Array.isArray(result?.rows)) {
    return { list: result.rows, pagination: normalizePagination(result) }
  }
  if (Array.isArray(result?.data?.list)) {
    return result.data
  }
  if (Array.isArray(result?.data)) {
    return { list: result.data, pagination: normalizePagination(result) }
  }
  return {
    ...(isPlainObject(result) ? result : {}),
    list: []
  }
}

export function normalizeItemResult(result) {
  if (
    isPlainObject(result) &&
    Object.prototype.hasOwnProperty.call(result, 'data') &&
    Object.keys(result).every((key) => ['data', 'message', 'geocode_note'].includes(key))
  ) {
    return result.data
  }
  return result
}

function normalizeUploadFile(file = {}) {
  const objectKey = file.object_key || file.objectKey
  const fileName = file.file_name || file.fileName || ''
  return {
    url: file.url || '',
    file_name: fileName,
    fileName,
    provider: file.provider || '',
    material_id: file.material_id ?? null,
    ...(objectKey ? { object_key: objectKey, objectKey } : {})
  }
}

export function normalizeUploadResult(result) {
  const file = normalizeUploadFile(result?.file || result?.data?.file || result || {})
  return {
    file,
    ...file
  }
}

export function normalizeMultiUploadResult(result) {
  const rawFiles = Array.isArray(result?.files)
    ? result.files
    : Array.isArray(result?.uploaded)
      ? result.uploaded
      : []
  return {
    files: rawFiles.map(normalizeUploadFile),
    failed: Array.isArray(result?.failed) ? result.failed : []
  }
}
