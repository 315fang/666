import request from '@/utils/request'
import { normalizeItemResult, normalizeMultiUploadResult, normalizeUploadResult } from '@/api/normalize'

export const uploadFile = async (file, options = {}) => {
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
    data: formData
  }).then(normalizeUploadResult)
}

export const getStorageConfig = () => {
  return request({
    url: '/storage/config',
    method: 'get'
  }).then(normalizeItemResult)
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
  }).then(normalizeItemResult)
}

export const uploadSplashImage = (file) => uploadFile(file)

export const uploadFiles = (files, options = {}) => {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))
  Object.entries(options.params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, String(value))
    }
  })
  return request({
    url: '/upload/multiple',
    method: 'post',
    data: formData
  }).then(normalizeMultiUploadResult)
}
