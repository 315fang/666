// admin-ui/src/composables/useDateRangeFilter.js
//
// 统一的"时间范围筛选"composable，用于列表页搜索栏。
// 解决之前 refunds / withdrawals / commissions / products 等列表只能按 keyword + status
// 找不到"上周退款"的问题（2026-05-03 实用性体检 #4）。
//
// 用法：
//   import { useDateRangeFilter } from '@/composables/useDateRangeFilter'
//   const dateFilter = useDateRangeFilter()
//
//   // 在 fetch 时把 params 合进去：
//   const params = { ...searchForm, ...dateFilter.params.value, page, limit }
//
//   // 在 template 里用配套组件 DateRangeQuickFilter:
//   <DateRangeQuickFilter v-model="dateFilter" @change="handleSearch" />

import { ref, computed } from 'vue'
import dayjs from 'dayjs'

/**
 * 内置快捷区间。新增/调整在这里改一处即可。
 * key 用于内部识别；label 是 UI 显示。
 */
export const QUICK_RANGES = Object.freeze([
    { key: 'today', label: '今日' },
    { key: 'yesterday', label: '昨日' },
    { key: 'week7', label: '近 7 天' },
    { key: 'month30', label: '近 30 天' },
    { key: 'this_month', label: '本月' },
    { key: 'last_month', label: '上月' }
])

/**
 * 把 quick range key 解析成 [startDate, endDate]（YYYY-MM-DD）。
 * 未识别 key 返回 null。
 */
export function resolveQuickRange(key) {
    const today = dayjs().startOf('day')
    switch (key) {
        case 'today':
            return [today.format('YYYY-MM-DD'), today.format('YYYY-MM-DD')]
        case 'yesterday': {
            const y = today.subtract(1, 'day')
            return [y.format('YYYY-MM-DD'), y.format('YYYY-MM-DD')]
        }
        case 'week7':
            return [today.subtract(6, 'day').format('YYYY-MM-DD'), today.format('YYYY-MM-DD')]
        case 'month30':
            return [today.subtract(29, 'day').format('YYYY-MM-DD'), today.format('YYYY-MM-DD')]
        case 'this_month':
            return [today.startOf('month').format('YYYY-MM-DD'), today.format('YYYY-MM-DD')]
        case 'last_month': {
            const lastMonth = today.subtract(1, 'month')
            return [
                lastMonth.startOf('month').format('YYYY-MM-DD'),
                lastMonth.endOf('month').format('YYYY-MM-DD')
            ]
        }
        default:
            return null
    }
}

/**
 * @param {object} opts
 * @param {string} opts.startKey  请求体里"开始日期"字段名，默认 start_date
 * @param {string} opts.endKey    请求体里"结束日期"字段名，默认 end_date
 * @param {string|null} opts.defaultQuick  初始化时默认应用的 quick key（如 'month30'）
 *
 * @returns {{
 *   dateRange: Ref<[string, string] | null>,
 *   activeQuick: Ref<string | null>,
 *   setQuickRange: (key: string) => void,
 *   onCustomChange: () => void,
 *   clear: () => void,
 *   params: ComputedRef<object>
 * }}
 */
export function useDateRangeFilter({ startKey = 'start_date', endKey = 'end_date', defaultQuick = null } = {}) {
    const dateRange = ref(null)
    const activeQuick = ref(null)

    const setQuickRange = (key) => {
        const range = resolveQuickRange(key)
        if (range) {
            dateRange.value = range
            activeQuick.value = key
        }
    }

    const onCustomChange = () => {
        // 用户手动改 datepicker 后，清掉快捷区间高亮（不再属于任何固定快捷）
        activeQuick.value = null
    }

    const clear = () => {
        dateRange.value = null
        activeQuick.value = null
    }

    const params = computed(() => {
        if (!dateRange.value || !dateRange.value.length) return {}
        return {
            [startKey]: dateRange.value[0],
            [endKey]: dateRange.value[1]
        }
    })

    if (defaultQuick) setQuickRange(defaultQuick)

    return { dateRange, activeQuick, setQuickRange, onCustomChange, clear, params }
}
