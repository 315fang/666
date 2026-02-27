import request from '@/utils/request'

// Banners
export function getBanners(params) {
    return request({
        url: '/banners',
        method: 'get',
        params
    })
}

export function createBanner(data) {
    return request({
        url: '/banners',
        method: 'post',
        data
    })
}

export function updateBanner(id, data) {
    return request({
        url: `/banners/${id}`,
        method: 'put',
        data
    })
}

export function deleteBanner(id) {
    return request({
        url: `/banners/${id}`,
        method: 'delete'
    })
}

// Materials
export function getMaterials(params) {
    return request({
        url: '/materials',
        method: 'get',
        params
    })
}

export function createMaterial(data) {
    return request({
        url: '/materials',
        method: 'post',
        data
    })
}

export function deleteMaterial(id) {
    return request({
        url: `/materials/${id}`,
        method: 'delete'
    })
}

// Articles (Contents)
export function getContents(params) {
    return request({
        url: '/contents',
        method: 'get',
        params
    })
}

export function createContent(data) {
    return request({
        url: '/contents',
        method: 'post',
        data
    })
}

export function updateContent(id, data) {
    return request({
        url: `/contents/${id}`,
        method: 'put',
        data
    })
}
