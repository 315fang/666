// admin-ui/src/composables/withErrorToast.js
//
// 统一错误提示包装。
// 对应 2026-05-03 实用性体检 #10：很多 view 里 catch 只 console.error 不 toast，
// 用户感受是"什么都没发生"。
//
// 用法：
//
//   const fetchData = withErrorToast(async () => {
//     loading.value = true
//     try {
//       const res = await getList(params)
//       tableData.value = res.list
//     } finally {
//       loading.value = false
//     }
//   }, '获取列表失败')
//
// 不想抛出可以传 silent: true：
//   const refresh = withErrorToast(load, '刷新失败', { silent: true })

import { ElMessage } from 'element-plus'

/**
 * 提取后端 error 里的可读信息。约定优先级：
 *   axios error.response.data.message > error.message > fallback
 */
export function extractErrorMessage(error, fallback = '操作失败') {
    if (!error) return fallback
    if (typeof error === 'string') return error
    return (
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        fallback
    )
}

/**
 * @param {Function} asyncFn  原始 async 函数
 * @param {string}   fallback 默认错误文案
 * @param {object}   opts
 * @param {boolean}  opts.silent     true 表示不抛出（仅 toast），默认 false 会继续抛出
 * @param {Function} opts.onError    自定义错误处理（拿到原始 error），可选
 */
export function withErrorToast(asyncFn, fallback = '操作失败', opts = {}) {
    const { silent = false, onError = null } = opts
    return async (...args) => {
        try {
            return await asyncFn(...args)
        } catch (error) {
            const msg = extractErrorMessage(error, fallback)
            ElMessage.error(msg)
            console.error(`[withErrorToast] ${fallback}:`, error)
            if (typeof onError === 'function') {
                try { onError(error) } catch (_) { /* swallow */ }
            }
            if (!silent) throw error
            return undefined
        }
    }
}
