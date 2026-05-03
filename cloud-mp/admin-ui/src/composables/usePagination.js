// admin-ui/src/composables/usePagination.js
// 统一的分页状态 + 翻页工厂，减少各 view 里的重复 reactive({ page, limit, total })

import { reactive } from 'vue'

/**
 * 全站统一的 page-sizes 选项。
 * 之前各页面散落使用 [10,20,50,100] / [20,50,100] / [10,20,50] 等不一致组合，
 * 在 2026-05-03 admin-ui 实用性体检中统一收口。
 *
 * 调用方：
 *   <el-pagination :page-sizes="DEFAULT_PAGE_SIZES" ... />
 *   或直接用 pagination.pageSizes
 */
export const DEFAULT_PAGE_SIZES = [10, 20, 50, 100]

/**
 * 创建分页状态与辅助方法
 * @param {object} opts
 * @param {number} opts.defaultLimit  每页条数，默认 20
 * @param {number[]} opts.pageSizes   page-sizes 选项数组，默认 DEFAULT_PAGE_SIZES
 * @param {Function} opts.fetchFn     翻页时自动调用的加载函数（可选）
 *
 * @returns {{
 *   pagination: { page: number, limit: number, total: number, pageSizes: number[] },
 *   resetPage: () => void,
 *   applyResponse: (res: any) => void
 * }}
 *
 * 典型用法：
 *   const { pagination, resetPage, applyResponse } = usePagination()
 *
 *   // 在 fetch 函数里：
 *   const res = await getList({ page: pagination.page, limit: pagination.limit })
 *   applyResponse(res)  // 自动写入 total
 *
 *   // 搜索重置时：
 *   resetPage(); fetchList()
 *
 *   // template 里（page-sizes 直接走 pagination.pageSizes 就一致了）：
 *   <el-pagination v-model:current-page="pagination.page" v-model:page-size="pagination.limit"
 *     :total="pagination.total" :page-sizes="pagination.pageSizes"
 *     @size-change="fetchList" @current-change="fetchList" />
 */
export function usePagination({ defaultLimit = 20, pageSizes, fetchFn } = {}) {
    const pagination = reactive({
        page: 1,
        limit: defaultLimit,
        total: 0,
        pageSizes: Array.isArray(pageSizes) && pageSizes.length ? pageSizes : DEFAULT_PAGE_SIZES
    })

    /** 将 page 重置回第 1 页（搜索条件变更时调用） */
    const resetPage = () => { pagination.page = 1 }

    /**
     * 从 API 响应中提取 total 并写入 pagination.total
     * 约定：interceptor 已解包 response.data.data，res 即为 { list, pagination } 或 { list, total }
     */
    const applyResponse = (res) => {
        pagination.total =
            res?.pagination?.total ??
            res?.total ??
            0
    }

    return { pagination, resetPage, applyResponse }
}
