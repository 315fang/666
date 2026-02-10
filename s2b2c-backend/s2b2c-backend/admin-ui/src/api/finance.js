import request from '@/utils/request'

export function getWithdrawals(params) {
    return request({
        url: '/withdrawals',
        method: 'get',
        params
    })
}

export function approveWithdrawal(id) {
    return request({
        url: `/withdrawals/${id}/approve`,
        method: 'put'
    })
}

export function rejectWithdrawal(id, reason) {
    return request({
        url: `/withdrawals/${id}/reject`,
        method: 'put',
        data: { reason }
    })
}

export function completeWithdrawal(id) {
    return request({
        url: `/withdrawals/${id}/complete`,
        method: 'put'
    })
}
