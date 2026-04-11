import request from '@/utils/request'
import { normalizeItemResult, normalizeListResult } from '@/api/normalize'

export const getBanners = (params) => {
  return request({
    url: '/banners',
    method: 'get',
    params
  }).then(normalizeListResult)
}

export const createBanner = (data) => {
  return request({
    url: '/banners',
    method: 'post',
    data
  })
}

export const updateBanner = (id, data) => {
  return request({
    url: `/banners/${id}`,
    method: 'put',
    data
  })
}

export const deleteBanner = (id) => {
  return request({
    url: `/banners/${id}`,
    method: 'delete'
  })
}

export const getLogs = (params) => {
  return request({
    url: '/logs',
    method: 'get',
    params
  }).then(normalizeListResult)
}
export const exportLogs = (params) => request({ url: '/logs/export', method: 'get', params, responseType: 'blob' })

export const getMaterials = (params) => request({ url: '/materials', method: 'get', params }).then(normalizeListResult)
export const createMaterial = (data) => request({ url: '/materials', method: 'post', data })
export const updateMaterial = (id, data) => request({ url: `/materials/${id}`, method: 'put', data })
export const deleteMaterial = (id) => request({ url: `/materials/${id}`, method: 'delete' })
export const getMaterialGroups = () => request({ url: '/material-groups', method: 'get' }).then(normalizeListResult)
export const createMaterialGroup = (data) => request({ url: '/material-groups', method: 'post', data })
export const updateMaterialGroup = (id, data) => request({ url: `/material-groups/${id}`, method: 'put', data })
export const deleteMaterialGroup = (id) => request({ url: `/material-groups/${id}`, method: 'delete' })
export const moveMaterials = (data) => request({ url: '/material-groups/move', method: 'post', data })

export const getMassMessages = (params) => request({ url: '/mass-messages', method: 'get', params }).then(normalizeListResult)
export const createMassMessage = (data) => request({ url: '/mass-messages', method: 'post', data })
export const sendMassMessage = (id) => request({ url: `/mass-messages/${id}/send`, method: 'post' })
export const deleteMassMessage = (id) => request({ url: `/mass-messages/${id}`, method: 'delete' })

export const getContents = (params) => request({ url: '/contents', method: 'get', params }).then(normalizeListResult)
export const createContent = (data) => request({ url: '/contents', method: 'post', data })
export const updateContent = (id, data) => request({ url: `/contents/${id}`, method: 'put', data })
export const deleteContent = (id) => request({ url: `/contents/${id}`, method: 'delete' })

export const getReviews = (params) => request({ url: '/reviews', method: 'get', params }).then(normalizeListResult)
export const updateReview = (id, data) => request({ url: `/reviews/${id}`, method: 'put', data })

export const getHomeSections = () => request({ url: '/home-sections', method: 'get' }).then(normalizeListResult)
export const getSectionSchemas = () => request({ url: '/home-sections/schemas', method: 'get' }).then(normalizeItemResult)
export const createHomeSection = (data) => request({ url: '/home-sections', method: 'post', data })
export const updateHomeSection = (id, data) => request({ url: `/home-sections/${id}`, method: 'put', data })
export const toggleSectionVisible = (id) => request({ url: `/home-sections/${id}/toggle`, method: 'put' })
export const deleteHomeSection = (id) => request({ url: `/home-sections/${id}`, method: 'delete' })
export const updateSectionSort = (data) => request({ url: '/home-sections/sort', method: 'post', data })
