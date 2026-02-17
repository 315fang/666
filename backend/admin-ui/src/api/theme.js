import request from '@/utils/request'

// 获取所有主题
export function getThemes() {
    return request({
        url: '/themes',
        method: 'get'
    })
}

// 获取当前激活主题
export function getActiveTheme() {
    return request({
        url: '/themes/active',
        method: 'get'
    })
}

// 切换主题
export function switchTheme(theme_key) {
    return request({
        url: '/themes/switch',
        method: 'post',
        data: { theme_key }
    })
}

// 创建新主题
export function createTheme(data) {
    return request({
        url: '/themes',
        method: 'post',
        data
    })
}

// 更新主题
export function updateTheme(id, data) {
    return request({
        url: `/themes/${id}`,
        method: 'put',
        data
    })
}

// 删除主题
export function deleteTheme(id) {
    return request({
        url: `/themes/${id}`,
        method: 'delete'
    })
}

// 自动切换主题配置
export function setAutoSwitch(data) {
    return request({
        url: '/themes/auto-switch-config', // 需要后端确认是否有此配置接口，暂时假设更新主题配置即可实现
        method: 'post',
        data
    })
}
