import request from '@/utils/request'

export const uploadFile = (file, options = {}) => {
  const formData = new FormData()
  formData.append('file', file)
  Object.entries(options.params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, String(value))
    }
  })
  return request({
    url: '/upload',
    method: 'post',
    data: formData,
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

export const uploadSplashImage = (file) => {
  const formData = new FormData()
  formData.append('file', file)
  return request({
    url: '/upload',
    method: 'post',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}
