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

export const getProductSkus = (productId) => {
  return request({
    url: `/products/${productId}/skus`,
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

export const getBundleProducts = (params) => {
  return request({
    url: '/bundle-products',
    method: 'get',
    params
  })
}

export const getBundleProductById = (id) => {
  return request({
    url: `/bundle-products/${id}`,
    method: 'get'
  })
}

export const createBundleProduct = (data) => {
  return request({
    url: '/bundle-products',
    method: 'post',
    data
  })
}

export const updateBundleProduct = (id, data) => {
  return request({
    url: `/bundle-products/${id}`,
    method: 'put',
    data
  })
}

export const updateBundleProductStatus = (id, data) => {
  return request({
    url: `/bundle-products/${id}/status`,
    method: 'put',
    data
  })
}

export const deleteBundleProduct = (id) => {
  return request({
    url: `/bundle-products/${id}`,
    method: 'delete'
  })
}

export const getProductBundles = (params) => {
  return request({
    url: '/product-bundles',
    method: 'get',
    params
  })
}

export const getProductBundleById = (id) => {
  return request({
    url: `/product-bundles/${id}`,
    method: 'get'
  })
}

export const createProductBundle = (data) => {
  return request({
    url: '/product-bundles',
    method: 'post',
    data
  })
}

export const updateProductBundle = (id, data) => {
  return request({
    url: `/product-bundles/${id}`,
    method: 'put',
    data
  })
}

export const deleteProductBundle = (id) => {
  return request({
    url: `/product-bundles/${id}`,
    method: 'delete'
  })
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
