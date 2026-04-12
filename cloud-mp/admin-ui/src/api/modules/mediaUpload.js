import request from '@/utils/request'

// 大文件上传超时：120 秒
const UPLOAD_TIMEOUT = 120000

/**
 * 读取 File 对象为 base64 data URL
 */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

/**
 * 上传文件到后端。
 * 使用 JSON + base64 格式，兼容 CloudBase HTTP 函数环境
 * （CloudBase 函数运行时 req.event 存在，multer 会被跳过，无法解析 multipart；
 *   后端已支持 content_base64 字段回退路径）
 */
export const uploadFile = async (file, options = {}) => {
  const dataUrl = await readFileAsBase64(file)
  const payload = {
    name: file.name,
    mime_type: file.type || 'application/octet-stream',
    content_base64: dataUrl,
    ...(options.params || {})
  }
  return request({
    url: '/upload',
    method: 'post',
    data: payload,
    timeout: UPLOAD_TIMEOUT
  })
}

export const getStorageConfig = () => {
  return request({
    url: '/storage/config',
    method: 'get'
  })
}

export const updateStorageConfig = (data) => {
  return request({
    url: '/storage/config',
    method: 'put',
    data
  })
}

export const testStorageConfig = (provider) => {
  return request({
    url: '/storage/test',
    method: 'post',
    data: provider ? { provider } : {}
  })
}

export const uploadSplashImage = (file) => uploadFile(file)
