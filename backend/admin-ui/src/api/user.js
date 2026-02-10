import request from '@/utils/request'

export function getUsers(params) {
    return request({
        url: '/users',
        method: 'get',
        params
    })
}

export function getUserById(id) {
    return request({
        url: `/users/${id}`,
        method: 'get'
    })
}

export function updateUserRole(id, role_level) {
    return request({
        url: `/users/${id}/role`,
        method: 'put',
        data: { role_level }
    })
}

export function getUserTeam(id) {
    return request({
        url: `/users/${id}/team`,
        method: 'get'
    })
}

// 更新代理商库存
export function updateUserStock(id, stock_change, reason) {
    return request({
        url: `/users/${id}/stock`,
        method: 'put',
        data: { stock_change, reason }
    })
}

// 更新用户邀请码
export function updateUserInviteCode(id, invite_code) {
    return request({
        url: `/users/${id}/invite-code`,
        method: 'put',
        data: { invite_code }
    })
}
