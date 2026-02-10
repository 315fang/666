import request from '@/utils/request'

// Orders
export function getOrders(params) {
    return request({
        url: '/orders',
        method: 'get',
        params
    })
}

export function getOrderById(id) {
    return request({
        url: `/orders/${id}`,
        method: 'get'
    })
}

export function updateOrderStatus(id, status) {
    return request({
        url: `/orders/${id}/status`,
        method: 'put',
        data: { status }
    })
}

export function shipOrder(id, data) {
    return request({
        url: `/orders/${id}/ship`,
        method: 'put',
        data
    })
}

// Refunds
export function getRefunds(params) {
    return request({
        url: '/refunds',
        method: 'get',
        params
    })
}

export function getRefundById(id) {
    return request({
        url: `/refunds/${id}`,
        method: 'get'
    })
}

export function approveRefund(id) {
    return request({
        url: `/refunds/${id}/approve`,
        method: 'put'
    })
}

export function rejectRefund(id, reason) {
    return request({
        url: `/refunds/${id}/reject`,
        method: 'put',
        data: { reason }
    })
}

export function completeRefund(id) {
    return request({
        url: `/refunds/${id}/complete`,
        method: 'put'
    })
}
