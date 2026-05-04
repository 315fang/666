// admin-ui/src/composables/useUrlSyncedFilter.js
//
// 把列表页的 searchForm + pagination 同步到 URL query string，
// 解决"刷新就丢筛选/翻页/Tab"的问题（2026-05-03 实用性体检 #3）。
//
// 设计目标：
//   - 拉远不动现有 fetch 逻辑：你照常 watch handleSearch，只是 URL 跟着变
//   - 浏览器前进/后退会还原状态
//   - 默认值不写进 URL（保持 URL 简洁）
//   - 跨页/跨设备分享链接可直接定位到同一筛选状态
//
// 用法：
//   const searchForm = reactive({ keyword: '', status: '', date_range: null })
//   const { pagination } = usePagination()
//   useUrlSyncedFilter({ searchForm, pagination, fetchFn: fetchData })
//
// 复杂场景（含数组、对象、自定义键名）：
//   useUrlSyncedFilter({
//     searchForm,
//     pagination,
//     fetchFn: fetchData,
//     fields: ['keyword', 'status', 'levels'],   // 限定哪些字段同步
//     defaults: { status: '' }                   // 默认值不写 URL
//   })

import { watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const RESERVED_KEYS = ['page', 'limit']

/**
 * 默认序列化：
 *   - undefined / null / '' → 跳过
 *   - Array 空 → 跳过
 *   - Array → join(',')
 *   - Object → JSON.stringify
 *   - Date → ISO
 *   - Boolean → 'true'/'false'
 *   - 其它 → String(v)
 */
function defaultSerialize(value) {
    if (value === undefined || value === null || value === '') return undefined
    if (Array.isArray(value)) {
        if (!value.length) return undefined
        return value.join(',')
    }
    if (value instanceof Date) return value.toISOString()
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    if (typeof value === 'object') {
        try { return JSON.stringify(value) } catch (_) { return undefined }
    }
    return String(value)
}

/**
 * 默认反序列化：根据 form 里的"原值类型"推断如何解析 query 字符串。
 */
function defaultDeserialize(rawValue, originalValue) {
    if (Array.isArray(originalValue)) {
        return rawValue ? String(rawValue).split(',').filter(Boolean) : []
    }
    if (typeof originalValue === 'number') {
        const n = Number(rawValue)
        return Number.isFinite(n) ? n : originalValue
    }
    if (typeof originalValue === 'boolean') {
        return rawValue === 'true' || rawValue === '1'
    }
    if (originalValue && typeof originalValue === 'object' && !(originalValue instanceof Date)) {
        try { return JSON.parse(rawValue) } catch (_) { return originalValue }
    }
    return rawValue
}

/**
 * @param {object} opts
 * @param {object}   opts.searchForm  必填，reactive 搜索表单
 * @param {object}   opts.pagination  可选，usePagination 返回的 reactive
 * @param {Function} opts.fetchFn     可选，URL 变化（如浏览器后退）后是否重新拉数据
 * @param {string[]} opts.fields      可选，限定同步的字段；不传则同步 searchForm 全部 own keys
 * @param {object}   opts.defaults    可选，默认值字典；与默认值相同时不写入 URL
 * @param {Function} opts.serialize   可选，自定义序列化 (value, key) => string|undefined
 * @param {Function} opts.deserialize 可选，自定义反序列化 (rawValue, originalValue, key) => any
 */
export function useUrlSyncedFilter(opts) {
    const {
        searchForm,
        pagination = null,
        fetchFn = null,
        fields = null,
        defaults = {},
        serialize = defaultSerialize,
        deserialize = defaultDeserialize
    } = opts || {}

    if (!searchForm) {
        console.warn('[useUrlSyncedFilter] searchForm is required')
        return {}
    }

    const route = useRoute()
    const router = useRouter()

    let suppressUrlWrite = false
    const pendingInternalQueryKeys = new Set()
    const initialPagination = pagination ? {
        page: Number.isFinite(Number(pagination.page)) && Number(pagination.page) > 0 ? Number(pagination.page) : 1,
        limit: Number.isFinite(Number(pagination.limit)) && Number(pagination.limit) > 0 ? Number(pagination.limit) : 20
    } : null

    const getQueryKey = (query) => JSON.stringify(query || {})

    const getKeys = () => {
        if (Array.isArray(fields) && fields.length) return fields
        return Object.keys(searchForm).filter((k) => !RESERVED_KEYS.includes(k))
    }

    const buildQuery = () => {
        const q = {}
        getKeys().forEach((k) => {
            const v = searchForm[k]
            if (defaults[k] !== undefined && JSON.stringify(v) === JSON.stringify(defaults[k])) return
            const serialized = serialize(v, k)
            if (serialized !== undefined && serialized !== '') q[k] = serialized
        })
        if (pagination) {
            if (pagination.page !== initialPagination.page) q.page = String(pagination.page)
            // 仅当 limit 不是页面默认值时写入
            if (pagination.limit && pagination.limit !== initialPagination.limit) q.limit = String(pagination.limit)
        }
        return q
    }

    const applyQuery = (query) => {
        getKeys().forEach((k) => {
            if (k in query) {
                const original = searchForm[k]
                searchForm[k] = deserialize(query[k], original, k)
            } else if (defaults[k] !== undefined) {
                searchForm[k] = JSON.parse(JSON.stringify(defaults[k]))
            }
        })
        if (pagination) {
            const p = Number(query.page)
            pagination.page = Number.isFinite(p) && p > 0 ? p : initialPagination.page
            const l = Number(query.limit)
            pagination.limit = Number.isFinite(l) && l > 0 ? l : initialPagination.limit
        }
    }

    // 初始化：URL → form
    if (Object.keys(route.query).length) {
        suppressUrlWrite = true
        applyQuery(route.query)
        nextTick(() => { suppressUrlWrite = false })
    }

    // form / pagination 变化 → URL
    const writeWatchSources = () => {
        const arr = [() => searchForm]
        if (pagination) arr.push(() => pagination.page, () => pagination.limit)
        return arr
    }
    watch(writeWatchSources(), () => {
        if (suppressUrlWrite) return
        const q = buildQuery()
        const queryKey = getQueryKey(q)
        const same = queryKey === getQueryKey(route.query)
        if (same) return
        pendingInternalQueryKeys.add(queryKey)
        router.replace({ path: route.path, query: q }).catch(() => {
            pendingInternalQueryKeys.delete(queryKey)
        })
    }, { deep: true })

    // URL 变化 → form（浏览器前进/后退）
    watch(() => route.query, (newQuery, oldQuery) => {
        if (suppressUrlWrite) return
        // 仅当 path 没变（同一 route）才同步回；切路由不处理
        const newQueryKey = getQueryKey(newQuery)
        if (newQueryKey === getQueryKey(oldQuery)) return
        if (pendingInternalQueryKeys.delete(newQueryKey)) return
        applyQuery(newQuery)
        nextTick(() => {
            if (typeof fetchFn === 'function') fetchFn()
        })
    })

    return {}
}
