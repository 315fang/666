import request from '@/utils/request'

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result || '')
  reader.onerror = () => reject(reader.error || new Error('文件读取失败'))
  reader.readAsDataURL(file)
})

export const uploadFile = async (file, options = {}) => {
  const contentBase64 = await fileToBase64(file)
  return request({
    url: '/upload',
    method: 'post',
    data: {
      name: file.name,
      mime_type: file.type || 'application/octet-stream',
      content_base64: contentBase64,
      ...(options.params || {})
    }
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
