// admin-ui/src/composables/useConfirm.js
//
// 危险操作的二次确认助手。
// 对应 2026-05-03 实用性体检 #5：el-switch 直接 emit API、删除按钮直接执行
// 一旦手抖就批量下架/误删，必须二次确认。
//
// 三个常用 helper：
//
// 1) withConfirm(actualFn, opts) —— 包一层 confirm，常用于"删除/拒绝/重置"按钮
//      const handleDelete = withConfirm(
//        async (row) => { await deleteX(row.id); ... },
//        { title: '删除商品', message: '此操作不可恢复', type: 'warning', confirmButtonText: '删除' }
//      )
//      <el-button @click="handleDelete(row)">删除</el-button>
//
// 2) confirmSwitch(row, key, oldVal, newVal, action, opts) —— 包 el-switch 的 change
//      <el-switch v-model="row.status" :active-value="1" :inactive-value="0"
//        @change="(v) => confirmSwitch(row, 'status', v === 1 ? 0 : 1, v,
//          (next) => updateProductStatus(row.id, next),
//          { message: `确认${v === 1 ? '上架' : '下架'}该商品？` })" />
//
// 3) confirmDanger(message, opts) —— 仅返回 confirm Promise，自己手动 then
//      await confirmDanger('确认清空所有缓存？')
//      doSomething()

import { ElMessageBox } from 'element-plus'

/**
 * @param {string|object} messageOrOpts  文案 或 完整 opts
 * @param {object} opts                  当第一个参数是 string 时使用
 * @returns {Promise<void>}              确认 resolve；取消 reject
 */
export function confirmDanger(messageOrOpts, opts = {}) {
    const config = typeof messageOrOpts === 'string'
        ? { message: messageOrOpts, ...opts }
        : { ...messageOrOpts }

    return ElMessageBox.confirm(
        config.message || '确认执行该操作？',
        config.title || '确认',
        {
            type: config.type || 'warning',
            confirmButtonText: config.confirmButtonText || '确认',
            cancelButtonText: config.cancelButtonText || '取消',
            confirmButtonClass: config.confirmButtonClass || (config.type === 'warning' ? 'el-button--danger' : ''),
            distinguishCancelAndClose: true
        }
    )
}

/**
 * 包一层 confirm。用户取消则不执行 action，且静默 swallow（不抛错）。
 */
export function withConfirm(action, opts = {}) {
    return async (...args) => {
        try {
            await confirmDanger(opts)
        } catch (_) {
            return undefined
        }
        return action(...args)
    }
}

/**
 * 包 el-switch 的 change 回调。用户取消会回滚 row[key] 到 oldVal。
 *
 * @param {object}    row       该行数据（v-model 直接挂在它的 key 上）
 * @param {string}    key       switch 绑定的字段名（如 'status'）
 * @param {any}       oldVal    切换前的值（用于取消回滚）
 * @param {any}       newVal    切换后的值（用户当前选择）
 * @param {Function}  action    确认后调用的实际请求函数：(newVal) => Promise
 * @param {object}    opts      confirm 文案
 */
export async function confirmSwitch(row, key, oldVal, newVal, action, opts = {}) {
    try {
        await confirmDanger(opts)
    } catch (_) {
        row[key] = oldVal
        return undefined
    }
    try {
        return await action(newVal)
    } catch (e) {
        row[key] = oldVal
        throw e
    }
}
