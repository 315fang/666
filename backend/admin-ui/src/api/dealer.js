import request from '@/utils/request'

export function getDealers(params) {
    return request({
        url: '/dealers',
        method: 'get',
        params
    })
}

export function getDealerById(id) {
    return request({
        url: `/dealers/${id}`,
        method: 'get'
    })
}

export function approveDealer(id) {
    return request({
        url: `/dealers/${id}/approve`,
        method: 'put'
    })
}

export function rejectDealer(id) {
    return request({
        url: `/dealers/${id}/reject`,
        method: 'put'
    })
}

export function updateDealerLevel(id, level) {
    return request({
        url: `/dealers/${id}/level`,
        method: 'put',
        data: { level }
    })
}
