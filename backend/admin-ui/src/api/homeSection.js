import request from '@/utils/request'

export function getHomeSections() {
    return request({
        url: '/home-sections',
        method: 'get'
    })
}

export function updateHomeSection(id, data) {
    return request({
        url: `/home-sections/${id}`,
        method: 'put',
        data
    })
}

export function updateSortOrder(orders) {
    return request({
        url: '/home-sections/sort',
        method: 'post',
        data: { orders }
    })
}
