import { ref, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getOrders, exportOrders } from '@/api'
import { extractReadAt } from '@/api/consistency'
import { usePagination } from '@/composables/usePagination'
import { normalizeOrderDisplay } from '../utils/orderDisplay'

/**
 * 订单列表/筛选/导出 / 路由同步 composable。
 *
 * 抽离自原 `orders/index.vue` 中约 130 行的列表相关逻辑：
 *   - searchForm + dateRange + pagination 状态
 *   - buildListQueryParams / fetchOrders / refreshOrders
 *   - handleSearch / onStatusGroupChange / handleReset / handleExport
 *   - applyRouteQueryToFilters + watch(route.query) 路由同步
 *
 * 依赖注入：
 *   - route: 由 parent `useRoute()` 传入（保持 composable 可测试；避免在内部再次
 *     调用 useRoute() 耦合 Vue Router 实例）
 *
 * 返回：
 *   - 响应式状态（搜索表单、表格数据、分页、加载中标志、最后同步时间等）
 *   - 查询/重置/导出等方法
 *
 * 跨模块接入点：
 *   - `refreshOrders` 由 useOrderMutations 在每次成功操作后调用
 *   - `lastSyncedAt` 由 useOrderMutations.runOrderMutation 额外回写
 *   - `tableData` 由 useOrderLogistics.syncOrderLogistics 写入 `_logistics`
 */
export function useOrderList({ route }) {
  const loading = ref(false)
  const exporting = ref(false)
  const summaryPendingShip = ref(null)
  const tableData = ref([])
  const lastSyncedAt = ref('')
  const { pagination, resetPage, applyResponse } = usePagination()

  // 用于防止后发请求被先完成请求覆盖（竞态保护）。
  let ordersRequestSeq = 0

  const searchForm = reactive({
    status_group: 'all',
    status: '',
    search_field: 'auto',
    search_value: '',
    product_name: '',
    payment_method: '',
    delivery_type: '',
    include_suborders: false,
    include_test: false,
    include_hidden: false,
    include_cancelled: false
  })
  const dateRange = ref([])

  function applyRouteQueryToFilters(query = {}) {
    searchForm.status = query?.status ? String(query.status) : ''
    searchForm.status_group = searchForm.status
      ? 'all'
      : (query?.status_group ? String(query.status_group) : 'all')
    searchForm.search_field = query?.search_field ? String(query.search_field) : 'auto'
    searchForm.search_value = query?.search_value ? String(query.search_value) : ''
    searchForm.product_name = query?.product_name ? String(query.product_name) : ''
    searchForm.payment_method = query?.payment_method ? String(query.payment_method) : ''
    searchForm.delivery_type = query?.delivery_type ? String(query.delivery_type) : ''
    searchForm.include_suborders = ['1', 'true', 'yes'].includes(String(query?.include_suborders || '').toLowerCase())
    searchForm.include_test = ['1', 'true', 'yes'].includes(String(query?.include_test || '').toLowerCase())
    searchForm.include_hidden = ['1', 'true', 'yes'].includes(String(query?.include_hidden || '').toLowerCase())
    searchForm.include_cancelled = ['1', 'true', 'yes'].includes(String(query?.include_cancelled || '').toLowerCase())
    if (query?.start_date && query?.end_date) {
      dateRange.value = [String(query.start_date), String(query.end_date)]
    } else {
      dateRange.value = []
    }
  }

  /**
   * 构建订单列表查询参数。
   *
   * search_field 枚举（对应 UI 下拉"搜索方式"）：
   *   auto        - 自动识别（后端按值格式判断是订单号、手机号还是昵称）
   *   order_no    - 精确匹配订单号
   *   phone       - 精确匹配买家手机号
   *   nickname    - 模糊匹配买家昵称
   *   member_no   - 精确匹配会员码（8位大写字母/数字）
   *   invite_code - 精确匹配用户ID（用于追踪推广来源订单）
   *
   * product_name  - 独立字段，按订单中包含的商品名称模糊匹配（与 search_value 互不干扰）
   * status_group  - Tab 级粗筛（all/pending/shipped/completed/cancelled），与精确 status 互斥
   * status        - 精确订单状态，由精确状态下拉选中时设置，优先级高于 status_group
   */
  const buildListQueryParams = (forExport = false) => {
    const params = {}
    if (!forExport) {
      params.page = pagination.page
      params.limit = pagination.limit
    }
    if (searchForm.status) {
      params.status = searchForm.status
    } else if (searchForm.status_group && searchForm.status_group !== 'all') {
      params.status_group = searchForm.status_group
    }
    const sv = searchForm.search_value?.trim()
    if (sv) {
      params.search_field = searchForm.search_field || 'auto'
      params.search_value = sv
    }
    if (searchForm.product_name?.trim()) {
      params.product_name = searchForm.product_name.trim()
    }
    if (searchForm.payment_method) params.payment_method = searchForm.payment_method
    if (searchForm.delivery_type) params.delivery_type = searchForm.delivery_type
    if (dateRange.value && dateRange.value.length === 2) {
      params.start_date = dateRange.value[0]
      params.end_date = dateRange.value[1]
    }
    if (searchForm.include_suborders) params.include_suborders = '1'
    if (searchForm.include_test) params.include_test = '1'
    if (searchForm.include_hidden) params.include_hidden = '1'
    if (searchForm.include_cancelled || searchForm.status === 'cancelled') params.include_cancelled = '1'
    return params
  }

  const fetchOrders = async () => {
    const requestSeq = ++ordersRequestSeq
    loading.value = true
    try {
      const res = await getOrders(buildListQueryParams(false))
      if (requestSeq !== ordersRequestSeq) return
      tableData.value = (res?.list || []).map(normalizeOrderDisplay)
      applyResponse(res)
      const readAt = extractReadAt(res)
      if (readAt) lastSyncedAt.value = readAt
      const pShip = res?.pendingShip ?? res?.pending_ship ?? res?.summary?.pending_ship
      if (pShip != null) summaryPendingShip.value = pShip
    } catch (error) {
      if (requestSeq !== ordersRequestSeq) return
      console.error(error)
      if (!error?.__handledByRequest) {
        ElMessage.error(error?.message || '加载订单列表失败')
      }
    } finally {
      if (requestSeq === ordersRequestSeq) {
        loading.value = false
      }
    }
  }

  const refreshOrders = () => fetchOrders()

  const handleSearch = () => {
    resetPage()
    refreshOrders()
  }

  const onStatusGroupChange = () => {
    searchForm.status = ''
    handleSearch()
  }

  const handleReset = () => {
    searchForm.status_group = 'all'
    searchForm.status = ''
    searchForm.search_field = 'auto'
    searchForm.search_value = ''
    searchForm.product_name = ''
    searchForm.payment_method = ''
    searchForm.delivery_type = ''
    searchForm.include_suborders = false
    searchForm.include_test = false
    searchForm.include_hidden = false
    searchForm.include_cancelled = false
    dateRange.value = []
    handleSearch()
  }

  const handleExport = async () => {
    exporting.value = true
    try {
      const blob = await exportOrders({ ...buildListQueryParams(true), limit: 2000 })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `orders-export-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
      ElMessage.success('已导出订单 JSON')
    } catch (e) {
      if (!e?.__handledByRequest) {
        ElMessage.error(e?.message || '导出失败')
      }
    } finally {
      exporting.value = false
    }
  }

  // 精确 status 与 status_group 互斥：用户一旦选精确状态，自动把 Tab 重置为 all
  watch(
    () => searchForm.status,
    (v) => {
      if (v) searchForm.status_group = 'all'
    }
  )

  // 路由 query 变化时同步筛选条件并重新查询（immediate 触发首屏加载）。
  watch(
    () => route.query,
    (query) => {
      applyRouteQueryToFilters(query || {})
      resetPage()
      refreshOrders()
    },
    { immediate: true }
  )

  return {
    loading,
    exporting,
    summaryPendingShip,
    tableData,
    lastSyncedAt,
    pagination,
    searchForm,
    dateRange,
    resetPage,
    fetchOrders,
    refreshOrders,
    handleSearch,
    onStatusGroupChange,
    handleReset,
    handleExport
  }
}
