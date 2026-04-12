import request from '@/utils/request'

// 大文件上传超时：120 秒
const UPLOAD_TIMEOUT = 120000

export const uploadFile = async (file, options = {}) => {
  const formData = new FormData()
  formData.append('file', file, file.name)
  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => formData.append(k, v))
  }
  return request({
    url: '/upload',
    method: 'post',
    data: formData,
    timeout: UPLOAD_TIMEOUT,
    headers: { 'Content-Type': 'multipart/form-data' }
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
