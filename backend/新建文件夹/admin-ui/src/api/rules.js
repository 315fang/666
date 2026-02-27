import request from '@/utils/request'

export function getRules() {
    return request({
        url: '/rules',
        method: 'get'
    })
}

export function updateRules(settings) {
    return request({
        url: '/rules',
        method: 'put',
        data: { settings }
    })
}
