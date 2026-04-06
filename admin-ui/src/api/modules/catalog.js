import request from '@/utils/request'

export const getProducts = (params) => {
  return request({
    url: '/products',
    method: 'get',
    params
  })
}

export const getProductById = (id) => {
  return request({
    url: `/products/${id}`,
    method: 'get'
  })
}

export const createProduct = (data) => {
  return request({
    url: '/products',
    method: 'post',
    data
  })
}

export const updateProduct = (id, data) => {
  return request({
    url: `/products/${id}`,
    method: 'put',
    data
  })
}

export const updateProductStatus = (id, data) => {
  return request({
    url: `/products/${id}/status`,
    method: 'put',
    data
  })
}

export const deleteProduct = (id) => {
  return request({ url: `/products/${id}`, method: 'delete' })
}

export const getCategories = () => {
  return request({
    url: '/categories',
    method: 'get'
  })
}

export const createCategory = (data) => {
  return request({
    url: '/categories',
    method: 'post',
    data
  })
}

export const updateCategory = (id, data) => {
  return request({
    url: `/categories/${id}`,
    method: 'put',
    data
  })
}

export const deleteCategory = (id) => {
  return request({
    url: `/categories/${id}`,
    method: 'delete'
  })
}
