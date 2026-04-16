import request from '@/utils/request'

// 大文件上传超时：120 秒
const UPLOAD_TIMEOUT = 120000
const MAX_IMAGE_BINARY_BYTES = 3 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 2200
const MIN_IMAGE_QUALITY = 0.55
const IMAGE_QUALITY_STEP = 0.08
const EXPECTED_PRODUCTION_UPLOAD_BASE_URL = 'https://jxalk.wenlan.store/admin/api'
const LEGACY_CLOUDBASE_UPLOAD_BASE_URL_PATTERN = /^https:\/\/[^/]+\.service\.tcloudbase\.com\/admin\/api\/?$/

function normalizeBaseUrl(baseURL = '') {
  return String(baseURL || '').replace(/\/$/, '')
}

function buildUploadTargetUrl(baseURL = '') {
  const normalized = normalizeBaseUrl(baseURL)
  return `${normalized || ''}/upload`
}

function assertProductionUploadBaseUrl(baseURL = '') {
  const normalized = normalizeBaseUrl(baseURL)
  if (import.meta.env.PROD && LEGACY_CLOUDBASE_UPLOAD_BASE_URL_PATTERN.test(normalized)) {
    console.error('[media-upload] invalid production upload base url', {
      baseURL: normalized,
      expected: EXPECTED_PRODUCTION_UPLOAD_BASE_URL
    })
    throw new Error('上传入口配置异常，请检查生产域名/API 路由配置')
  }
  return normalized
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('图片解析失败'))
    }
    image.src = objectUrl
  })
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('图片压缩失败'))
    }, type, quality)
  })
}

function buildCompressedName(fileName = '') {
  const baseName = String(fileName || 'upload').replace(/\.[^.]+$/, '')
  return `${baseName}.jpg`
}

async function compressImageIfNeeded(file) {
  if (!file || !String(file.type || '').startsWith('image/')) return file
  if (file.size <= MAX_IMAGE_BINARY_BYTES) return file

  const image = await loadImageElement(file)
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width || 1, image.height || 1))
  const width = Math.max(1, Math.round((image.width || 1) * scale))
  const height = Math.max(1, Math.round((image.height || 1) * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('图片压缩失败')

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(image, 0, 0, width, height)

  let quality = 0.9
  let blob = null
  while (quality >= MIN_IMAGE_QUALITY) {
    blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    if (blob.size <= MAX_IMAGE_BINARY_BYTES) break
    quality -= IMAGE_QUALITY_STEP
  }

  if (!blob || blob.size > MAX_IMAGE_BINARY_BYTES) {
    throw new Error('图片过大，请换一张更小的图片后再上传')
  }

  return new File([blob], buildCompressedName(file.name), {
    type: 'image/jpeg',
    lastModified: Date.now()
  })
}

/**
 * 上传文件到后端。
 * 使用 multipart/binary 直传，避免 CloudBase 文本请求体 100KB 上限。
 */
export const uploadFile = async (file, options = {}) => {
  const resolvedBaseUrl = assertProductionUploadBaseUrl(request?.defaults?.baseURL || '')
  const uploadTargetUrl = buildUploadTargetUrl(resolvedBaseUrl)
  const normalizedFile = await compressImageIfNeeded(file)
  const formData = new FormData()
  formData.append('file', normalizedFile, normalizedFile.name)
  Object.entries(options.params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, String(value))
    }
  })

  const headers = {}
  const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : ''
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  try {
    const response = await fetch(uploadTargetUrl, {
      method: 'POST',
      headers,
      body: formData
    })
    const payload = await response.json().catch(() => ({}))
    if (response.ok && payload?.code === 0) {
      return payload.data
    }
    const error = new Error(payload?.message || `上传失败（HTTP ${response.status}）`)
    error.response = {
      status: response.status,
      data: payload
    }
    throw error
  } catch (error) {
    const status = Number(error?.response?.status || 0)
    console.error('[media-upload] upload failed', {
      targetUrl: uploadTargetUrl,
      fileName: normalizedFile.name,
      originalFileSize: Number(file?.size || 0),
      normalizedFileSize: Number(normalizedFile?.size || 0),
      status,
      responseData: error?.response?.data || null
    })
    if (status === 413) {
      throw new Error('上传入口拒绝请求，请检查生产域名/API 路由配置')
    }
    throw error
  }
}

export const getStorageConfig = (options = {}) => {
  return request({
    url: '/storage/config',
    method: 'get',
    ...options
  })
}

export const testStorageConfig = (provider, options = {}) => {
  return request({
    url: '/storage/test',
    method: 'post',
    data: provider ? { provider } : {},
    ...options
  })
}

export const uploadSplashImage = (file) => uploadFile(file)
