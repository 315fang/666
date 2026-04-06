import request from '@/utils/request'

// 获取日志列表
export function getLogs(params) {
    return request({
        url: '/logs',
        method: 'get',
        params
    })
}

// 获取日志统计
export function getLogStats() {
    return request({
        url: '/logs/statistics',
        method: 'get'
    })
}

// 导出日志
export function exportLogs(params) {
    return request({
        url: '/logs/export',
        method: 'get',
        params,
        responseType: 'blob' // 导出文件需要设置 blob
    })
}

// 清理日志
export function cleanupLogs(days) {
    return request({
        url: '/logs/cleanup',
        method: 'delete',
        data: { days }
    })
}
