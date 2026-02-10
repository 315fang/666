import request from '@/utils/request'

// Products
export function getProducts(params) {
    return request({
        url: '/products',
        method: 'get',
        params
    })
}

export function getProductById(id) {
    return request({
        url: `/products/${id}`,
        method: 'get'
    })
}

export function createProduct(data) {
    return request({
        url: '/products',
        method: 'post',
        data
    })
}

export function updateProduct(id, data) {
    return request({
        url: `/products/${id}`,
        method: 'put',
        data
    })
}

export function updateProductStatus(id, status) {
    return request({
        url: `/products/${id}/status`,
        method: 'put',
        data: { status }
    })
}

// Categories
export function getCategories(params) {
    return request({
        url: '/categories',
        method: 'get',
        params
    })
}

export function createCategory(data) {
    return request({
        url: '/categories',
        method: 'post',
        data
    })
}

export function updateCategory(id, data) {
    return request({
        url: `/categories/${id}`,
        method: 'put',
        data
    })
}

export function deleteCategory(id) {
    return request({
        url: `/categories/${id}`,
        method: 'delete'
    })
}
