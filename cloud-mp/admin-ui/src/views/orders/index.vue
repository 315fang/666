<template>
  <div class="orders-page">
    <el-card>
      <template #header>
        <div class="card-header-row">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span>订单管理</span>
            <el-tag v-if="summaryPendingShip != null" type="warning" size="small">待发货队列 {{ summaryPendingShip }}</el-tag>
          </div>
          <div class="header-actions">
            <span class="sync-text">最后同步：{{ lastSyncedAt ? formatDateTime(lastSyncedAt) : '—' }}</span>
            <el-button size="small" @click="refreshOrders" :loading="loading">刷新</el-button>
          </div>
        </div>
      </template>

      <el-collapse class="tips-collapse">
        <el-collapse-item title="操作提示（点击展开）" name="1">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="订单页是高频处理主工作台。默认仅显示主单（不含拆分子单）；可按订单号、会员、收货人、商品名等多条件筛选。请核对支付方式、履约方式、金额与收货信息后再发货或改价。"
          />
        </el-collapse-item>
      </el-collapse>

      <div class="status-tabs">
        <el-radio-group v-model="searchForm.status_group" size="default" @change="onStatusGroupChange">
          <el-radio-button label="all">全部</el-radio-button>
          <el-radio-button label="pending_pay">待付款</el-radio-button>
          <el-radio-button label="pending_group">待成团</el-radio-button>
          <el-radio-button label="pending_ship">待发货</el-radio-button>
          <el-radio-button label="pending_receive">待收货</el-radio-button>
          <el-radio-button label="completed">已完成</el-radio-button>
          <el-radio-button label="closed">已关闭</el-radio-button>
        </el-radio-group>
      </div>

      <!-- 搜索表单 -->
      <el-form :model="searchForm" label-width="96px" class="filter-form">
        <el-row :gutter="12">
          <el-col :xs="24" :sm="24" :md="14" :lg="12">
            <el-form-item label="订单搜索">
              <div class="search-combo">
                <el-select v-model="searchForm.search_field" style="width: 140px" placeholder="字段">
                  <el-option label="自动匹配" value="auto" />
                  <el-option label="订单编号" value="order_no" />
                  <el-option label="会员昵称" value="buyer_nickname" />
                  <el-option label="会员手机" value="buyer_phone" />
                  <el-option label="会员编号" value="member_no" />
                  <el-option label="收货人姓名" value="receiver_name" />
                  <el-option label="收货人手机" value="receiver_phone" />
                  <el-option label="商品名称" value="product_name" />
                </el-select>
                <el-input v-model="searchForm.search_value" clearable placeholder="输入关键词" style="flex:1; min-width:120px" @keyup.enter="handleSearch" />
              </div>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="10" :lg="6">
            <el-form-item label="商品名称">
              <el-input v-model="searchForm.product_name" placeholder="含该商品的订单" clearable @keyup.enter="handleSearch" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="12" :lg="6">
            <el-form-item label="精确状态">
              <el-select v-model="searchForm.status" placeholder="不选则按上方 Tab" clearable style="width:100%">
                <el-option label="待支付" value="pending" />
                <el-option label="待发货(paid)" value="paid" />
                <el-option label="待核销" value="pickup_pending" />
                <el-option label="代理已确认" value="agent_confirmed" />
                <el-option label="申请发货" value="shipping_requested" />
                <el-option label="已发货" value="shipped" />
                <el-option label="已完成" value="completed" />
                <el-option label="已取消" value="cancelled" />
                <el-option label="已退款" value="refunded" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8" :lg="6">
            <el-form-item label="付款方式">
              <el-select v-model="searchForm.payment_method" placeholder="全部" clearable style="width:100%">
                <el-option label="微信支付" value="wechat" />
                <el-option label="货款支付" value="goods_fund" />
                <el-option label="余额支付" value="wallet" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8" :lg="6">
            <el-form-item label="配送方式">
              <el-select v-model="searchForm.delivery_type" placeholder="全部" clearable style="width:100%">
                <el-option label="快递" value="express" />
                <el-option label="到店自提" value="pickup" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="24" :md="16" :lg="12">
            <el-form-item label="下单时间">
              <el-date-picker
                v-model="dateRange"
                type="daterange"
                range-separator="至"
                start-placeholder="开始"
                end-placeholder="结束"
                value-format="YYYY-MM-DD"
                style="width:100%; max-width:360px"
              />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="24" :md="24" :lg="24">
            <el-form-item label=" ">
              <el-space wrap>
                <el-checkbox v-model="searchForm.include_suborders">含拆分子单</el-checkbox>
                <el-checkbox v-model="searchForm.include_test">含测试订单</el-checkbox>
                <el-checkbox v-model="searchForm.include_hidden">含清理箱订单</el-checkbox>
                <el-checkbox v-model="searchForm.include_cancelled">显示已取消订单</el-checkbox>
                <el-button type="primary" @click="handleSearch">查询</el-button>
                <el-button @click="handleReset">清空条件</el-button>
                <el-button @click="handleExport" :loading="exporting">导出 JSON</el-button>
              </el-space>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <!-- 订单表格 -->
      <OrderTable
        :rows="tableData"
        :loading="loading"
        :can-adjust-order-amount="canAdjustOrderAmount"
        :can-manage-settings="canManageSettings"
        :can-force-complete-order="canForceCompleteOrder"
        :can-force-cancel-order="canForceCancelOrder"
        :order-type-text="orderTypeText"
        :format-date-time="formatDateTime"
        :order-source-text="orderSourceText"
        :delivery-type-text="deliveryTypeText"
        :display-buyer-avatar="displayBuyerAvatar"
        :display-buyer-name="displayBuyerName"
        :role-tag-type="roleTagType"
        :role-text="roleText"
        :list-sku-text="listSkuText"
        :line-unit-price="lineUnitPrice"
        :money="money"
        :get-status-type="getStatusType"
        :refund-status-tag-type="refundStatusTagType"
        :payment-method-tag-type="paymentMethodTagType"
        :detail-payment-method="detailPaymentMethod"
        :fulfillment-text="fulfillmentText"
        :can-view-logistics="canViewLogistics"
        :can-ship-row="canShipRow"
        :can-adjust-amount-row="canAdjustAmountRow"
        @detail="handleDetail"
        @logistics="openLogisticsDrawer"
        @ship="handleShip"
        @dropdown="handleDropdown"
        @user-manage="goUserManage"
        @product-manage="goProductManage"
      />

      <!-- 分页 -->
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.limit"
        :total="pagination.total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="fetchOrders"
        @current-change="fetchOrders"
        style="margin-top: 20px; justify-content: flex-end;"
      />
    </el-card>

    <OrderDetailDrawer
      v-if="detailVisible"
      v-model="detailVisible"
      :detail-data="detailData"
      :detail-line-items="detailLineItems"
      :order-type-text="orderTypeText"
      :get-status-type="getStatusType"
      :cleanup-category-text="cleanupCategoryText"
      :fulfillment-text="fulfillmentText"
      :payment-method-tag-type="paymentMethodTagType"
      :detail-payment-method="detailPaymentMethod"
      :refund-status-tag-type="refundStatusTagType"
      :delivery-type-text="deliveryTypeText"
      :fmt-date-time="fmtDateTime"
      :display-buyer-avatar="displayBuyerAvatar"
      :display-buyer-name="displayBuyerName"
      :role-tag-type="roleTagType"
      :role-text="roleText"
      :money="money"
      :resolved-address="resolvedAddress"
      :agent-fulfillment-profit="agentFulfillmentProfit"
      :referral-commission-total="referralCommissionTotal"
      :fulfillment-profit-note="fulfillmentProfitNote"
      :can-view-logistics="canViewLogistics"
      :detail-timeline="detailTimeline"
      :commission-type-text="commissionTypeText"
      :commission-status-text="commissionStatusText"
      @view-logistics="openLogisticsDrawer"
    />

    <OrderLogisticsDrawer
      v-if="logisticsVisible"
      v-model="logisticsVisible"
      :order="logisticsOrder"
      :data="logisticsData"
      :loading="logisticsLoading"
      :resolved-address="resolvedAddress"
      :display-buyer-name="displayBuyerName"
      :get-logistics-tag-type="getLogisticsTagType"
      @refresh="refreshLogisticsDrawer"
    />

    <OrderMutationDialogs
      v-if="shipDialogVisible || amountVisible || remarkVisible || visibilityVisible || forceVisible"
      :ship-visible="shipDialogVisible"
      :amount-visible="amountVisible"
      :remark-visible="remarkVisible"
      :visibility-visible="visibilityVisible"
      :force-visible="forceVisible"
      :ship-form="shipForm"
      :amount-form="amountForm"
      :visibility-form="visibilityForm"
      :force-form="forceForm"
      :current-order="currentOrder"
      :remark-text="remarkText"
      :force-type="forceType"
      :ship-fulfillment-label="shipFulfillmentLabel"
      :logistics-mode="logisticsMode"
      :shipping-company-options="shippingCompanyOptions"
      :cleanup-category-options="cleanupCategoryOptions"
      :can-manage-settings="canManageSettings"
      :submitting-ship="submittingShip"
      :submitting-amount="submittingAmount"
      :submitting-remark="submittingRemark"
      :submitting-visibility="submittingVisibility"
      :submitting-force="submittingForce"
      :money="money"
      @update:ship-visible="shipDialogVisible = $event"
      @update:amount-visible="amountVisible = $event"
      @update:remark-visible="remarkVisible = $event"
      @update:remark-text="remarkText = $event"
      @update:visibility-visible="visibilityVisible = $event"
      @update:force-visible="forceVisible = $event"
      @submit-ship="submitShip"
      @submit-amount="submitAmount"
      @submit-remark="submitRemark"
      @submit-visibility="submitOrderVisibility"
      @submit-force="submitForce"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch, defineAsyncComponent } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getOrders,
  getOrderDetail,
  shipOrder,
  getAdminOrderLogistics,
  refreshAdminLogistics,
  adjustOrderAmount,
  addOrderRemark,
  updateOrderTestFlag,
  updateOrderVisibility,
  repairOrderFulfillment,
  getMiniProgramConfig,
  updateMiniProgramConfig,
  forceCompleteOrder,
  forceCancelOrder,
  exportOrders
} from '@/api'
import { formatDateTime } from '@/utils/format'
import { buildUserManagementQuery } from '@/utils/userRouting'
import { usePagination } from '@/composables/usePagination'
import { useUserStore } from '@/store/user'
import { extractReadAt, mergeStrongSuccessMessage } from '@/api/consistency'
import {
  money, moneyNumber, normalizeAmount, fmtDateTime,
  activeCommissionRows, commissionAmountByTypes, referralCommissionTotal,
  agentFulfillmentProfit, fulfillmentProfitNote,
  commissionTypeText, commissionStatusText,
  detailPaymentMethod, paymentMethodText, paymentMethodTagType,
  refundStatusTagType, refundDestinationText,
  deliveryTypeText, orderTypeText, orderSourceText,
  listSkuText, lineUnitPrice, detailSkuText, detailTimeline,
  normalizeFulfillmentType, fulfillmentText,
  resolvedAddress, canViewLogistics, getLogisticsTagType,
  getStatusType, getStatusText,
  roleText, roleTagType,
  displayBuyerName, displayBuyerAvatar,
  cleanupCategoryOptions, cleanupCategoryText, inferOrderCleanupCategory,
  canShipRow, canAdjustAmountRow, normalizeOrderDisplay
} from './utils/orderDisplay'
import OrderTable from './components/OrderTable.vue'
const OrderDetailDrawer = defineAsyncComponent(() => import('./components/OrderDetailDrawer.vue'))
const OrderLogisticsDrawer = defineAsyncComponent(() => import('./components/OrderLogisticsDrawer.vue'))
const OrderMutationDialogs = defineAsyncComponent(() => import('./components/OrderMutationDialogs.vue'))

const router = useRouter()
const route = useRoute()

// ===== 列表 =====
const loading = ref(false)
let ordersRequestSeq = 0
const exporting = ref(false)
const summaryPendingShip = ref(null)
const userStore = useUserStore()
const tableData = ref([])
const lastSyncedAt = ref('')
const { pagination, resetPage, applyResponse } = usePagination()
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

const submittingShip = ref(false)
const submittingAmount = ref(false)
const submittingRemark = ref(false)
const submittingForce = ref(false)
const submittingTestFlag = ref(false)
const submittingVisibility = ref(false)
const logisticsMode = ref('third_party')
const logisticsTrackingRequired = ref(true)
const logisticsCompanyRequired = ref(false)
const miniProgramConfigSnapshot = ref(null)
const logisticsVisible = ref(false)
const logisticsLoading = ref(false)
const logisticsOrder = ref(null)
const logisticsData = ref(null)
const canAdjustOrderAmount = computed(() => userStore.hasPermission('order_amount_adjust'))
const canForceCompleteOrder = computed(() => userStore.hasPermission('order_force_complete'))
const canForceCancelOrder = computed(() => userStore.hasPermission('order_force_cancel'))
const canManageSettings = computed(() => userStore.hasPermission('settings_manage'))

const SHIPPING_COMPANY_STORAGE_KEY = 'admin_shipping_company_options'
const DEFAULT_SHIPPING_COMPANY_OPTIONS = [
  '顺丰速运',
  '申通快递',
  '中通快递',
  '圆通速递',
  '韵达速递',
  '京东快递',
  '邮政EMS',
  '极兔速递',
  '德邦快递',
  '同城配送'
]

function normalizeShippingCompanyName(value) {
  return String(value || '').trim()
}

function dedupeStringList(list = []) {
  return [...new Set(
    list
      .map((item) => normalizeShippingCompanyName(item))
      .filter(Boolean)
  )]
}

function mergeShippingCompanyOptions(...groups) {
  return dedupeStringList(groups.flat())
}

function readLocalShippingCompanyOptions() {
  if (typeof window === 'undefined') return []
  try {
    const raw = JSON.parse(localStorage.getItem(SHIPPING_COMPANY_STORAGE_KEY) || '[]')
    return Array.isArray(raw) ? dedupeStringList(raw) : []
  } catch (_) {
    return []
  }
}

function persistLocalShippingCompanyOptions(list) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SHIPPING_COMPANY_STORAGE_KEY, JSON.stringify(dedupeStringList(list)))
  } catch (_) {
    // ignore local cache write failures
  }
}

const shippingCompanyOptions = ref(
  mergeShippingCompanyOptions(DEFAULT_SHIPPING_COMPANY_OPTIONS, readLocalShippingCompanyOptions())
)

/**
 * 构建订单列表查询参数
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

const runOrderMutation = async (loadingRef, task, successMessage, onSuccess) => {
  loadingRef.value = true
  try {
    const result = await task()
    const readAt = extractReadAt(result)
    if (readAt) lastSyncedAt.value = readAt
    const finalMessage = typeof successMessage === 'function' ? successMessage(result) : successMessage
    ElMessage.success(mergeStrongSuccessMessage(result, finalMessage))
    if (typeof onSuccess === 'function') {
      await onSuccess(result)
    }
    await refreshOrders()
    return result
  } catch (e) {
    if (!e?.__handledByRequest) {
      ElMessage.error(e?.message || '操作失败')
    }
  } finally {
    loadingRef.value = false
  }
}


watch(
  () => searchForm.status,
  (v) => {
    if (v) searchForm.status_group = 'all'
  }
)

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

const fetchMiniProgramConfig = async () => {
  if (!canManageSettings.value) {
    miniProgramConfigSnapshot.value = null
    logisticsMode.value = 'third_party'
    logisticsTrackingRequired.value = true
    logisticsCompanyRequired.value = false
    shippingCompanyOptions.value = mergeShippingCompanyOptions(
      DEFAULT_SHIPPING_COMPANY_OPTIONS,
      [],
      readLocalShippingCompanyOptions()
    )
    return
  }
  try {
    const data = await getMiniProgramConfig({ skipErrorMessage: true })
    miniProgramConfigSnapshot.value = data || null
    logisticsMode.value = data?.logistics_config?.shipping_mode || 'third_party'
    logisticsTrackingRequired.value = data?.logistics_config?.shipping_tracking_no_required !== false
    logisticsCompanyRequired.value = !!data?.logistics_config?.shipping_company_name_required
    shippingCompanyOptions.value = mergeShippingCompanyOptions(
      DEFAULT_SHIPPING_COMPANY_OPTIONS,
      data?.logistics_config?.shipping_company_options || [],
      readLocalShippingCompanyOptions()
    )
    persistLocalShippingCompanyOptions(shippingCompanyOptions.value)
  } catch (e) {
    console.error('获取小程序物流配置失败:', e)
  }
}

const rememberShippingCompanyOption = async (value) => {
  const companyName = normalizeShippingCompanyName(value)
  if (!companyName) return

  const nextOptions = mergeShippingCompanyOptions(
    shippingCompanyOptions.value,
    [companyName]
  )
  shippingCompanyOptions.value = nextOptions
  persistLocalShippingCompanyOptions(nextOptions)

  if (!canManageSettings.value || !miniProgramConfigSnapshot.value) return

  const remoteOptions = dedupeStringList(
    miniProgramConfigSnapshot.value?.logistics_config?.shipping_company_options || []
  )
  if (remoteOptions.includes(companyName)) return

  const nextConfig = JSON.parse(JSON.stringify(miniProgramConfigSnapshot.value))
  nextConfig.logistics_config = {
    ...(nextConfig.logistics_config || {}),
    shipping_company_options: mergeShippingCompanyOptions(remoteOptions, [companyName])
  }

  try {
    await updateMiniProgramConfig(nextConfig)
    miniProgramConfigSnapshot.value = nextConfig
  } catch (error) {
    console.error('保存常用快递公司失败:', error)
    ElMessage.warning('快递公司已在当前浏览器记住，未能同步到共享配置')
  }
}

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


const goUserManage = (row) => {
  const query = buildUserManagementQuery(
    row?.buyer || {},
    displayBuyerName(row?.buyer, ''),
    [row?.user_id, row?.buyer_id]
  )
  if (Object.keys(query).length === 0) {
    ElMessage.warning('无会员信息可跳转')
    return
  }
  router.push({ name: 'Users', query })
}

const goProductManage = (row) => {
  const name = row.product?.name
  router.push({ name: 'Products', query: name ? { keyword: name } : {} })
}

function buildManualLogistics(order = {}) {
  return {
    status: 'manual',
    statusText: '手工发货',
    traces: order?.shipped_at
      ? [{ time: fmtDateTime(order.shipped_at), desc: '当前订单走手工发货模式，可查看单号和发货时间' }]
      : []
  }
}

function syncOrderLogistics(orderId, nextData) {
  const normalizedId = String(orderId || '')
  if (!normalizedId) return
  const target = tableData.value.find((row) => String(row.id) === normalizedId || String(row.order_no) === normalizedId)
  if (target) target._logistics = nextData
  if (detailData.value && (String(detailData.value.id) === normalizedId || String(detailData.value.order_no) === normalizedId)) {
    detailData.value._logistics = nextData
  }
}

async function loadLogistics(order, forceRefresh = false) {
  logisticsLoading.value = true
  try {
    if (logisticsMode.value === 'manual') {
      const manual = buildManualLogistics(order)
      logisticsData.value = manual
      syncOrderLogistics(order?.id || order?.order_no, manual)
      return
    }
    const res = forceRefresh
      ? await refreshAdminLogistics(order.id)
      : await getAdminOrderLogistics(order.id)
    const data = res?.data || res || null
    logisticsData.value = data
    syncOrderLogistics(order?.id || order?.order_no, data)
  } catch (error) {
    console.error('加载物流轨迹失败:', error)
    if (!error?.__handledByRequest) {
      ElMessage.error(error?.message || '物流查询失败')
    }
  } finally {
    logisticsLoading.value = false
  }
}

async function openLogisticsDrawer(order) {
  logisticsOrder.value = order
  logisticsData.value = order?._logistics || null
  logisticsVisible.value = true
  await loadLogistics(order, false)
}

async function refreshLogisticsDrawer() {
  if (!logisticsOrder.value) return
  await loadLogistics(logisticsOrder.value, true)
}


// ===== 详情 =====
const detailVisible = ref(false)
const detailData = ref(null)

const detailLineItems = computed(() => {
  const o = detailData.value
  if (!o) return []
  const sourceItems = Array.isArray(o.items) && o.items.length
    ? o.items
    : [{
        snapshot_image: o.product?.images?.[0],
        snapshot_name: o.product?.name || '-',
        snapshot_spec: detailSkuText(o),
        qty: Number(o.qty || o.quantity || 1),
        item_amount: Number(o.total_amount || 0),
        unit_price: Number(o.total_amount || 0) / Math.max(1, Number(o.qty || o.quantity || 1))
      }]
  return sourceItems.map((item) => {
    const qty = Math.max(1, Number(item.qty || item.quantity || 1))
    const itemAmount = Number(item.item_amount ?? item.total_amount ?? item.price ?? 0)
    const unitPrice = Number(item.unit_price ?? (qty > 0 ? itemAmount / qty : itemAmount))
    return {
      image: item.snapshot_image || o.product?.images?.[0],
      name: item.snapshot_name || o.product?.name || '-',
      spec: item.snapshot_spec || detailSkuText(o),
      unitPrice: money(unitPrice),
      qty,
      lineTotal: money(itemAmount)
    }
  })
})

const handleDetail = async (row) => {
  try {
    const res = await getOrderDetail(row.id)
    detailData.value = normalizeOrderDisplay(res?.data || res)
    if (detailData.value?.address_snapshot && !detailData.value.address) {
      detailData.value.address = detailData.value.address_snapshot
    }
    detailVisible.value = true
  } catch (e) {
    console.error(e)
    if (!e?.__handledByRequest) {
      ElMessage.error(e?.message || '加载订单详情失败')
    }
  }
}

// ===== 发货 =====
const shipDialogVisible = ref(false)
const currentOrder = ref(null)
const shipForm = reactive({ fulfillment_type: 'company', tracking_no: '', logistics_company: '' })

const inferFulfillmentType = (row) => {
  const type = normalizeFulfillmentType(row)
  if (type === 'agent' || type === 'agent_pending') return 'agent'
  return 'company'
}

const shipFulfillmentLabel = computed(() => (
  shipForm.fulfillment_type === 'agent'
    ? '代理商履约'
    : (logisticsMode.value === 'manual' ? '平台手工发货' : '平台云仓发货')
))

const handleShip = (row) => {
  currentOrder.value = row
  shipForm.fulfillment_type = inferFulfillmentType(row)
  shipForm.tracking_no = String(row?.tracking_no || '').trim()
  shipForm.logistics_company = normalizeShippingCompanyName(row?.logistics_company)
  shipDialogVisible.value = true
}
const submitShip = async () => {
  const trackingNo = String(shipForm.tracking_no || '').trim()
  const logisticsCompany = normalizeShippingCompanyName(shipForm.logistics_company)

  if (logisticsTrackingRequired.value && !trackingNo) {
    return ElMessage.warning('请输入物流单号')
  }
  if (logisticsCompanyRequired.value && !logisticsCompany) {
    return ElMessage.warning('请输入承运方名称')
  }
  await runOrderMutation(submittingShip, () => shipOrder(currentOrder.value.id, {
      ...shipForm,
      tracking_no: trackingNo,
      logistics_company: logisticsCompany,
      type: shipForm.fulfillment_type === 'agent' ? 'Agent' : 'Company',
      fulfillment_type: shipForm.fulfillment_type
    }, currentOrder.value.order_no), (result) => {
      if (result?.fulfillment_fallback) {
        return result.fulfillment_notice || '代理货款不足，已自动改为平台发货'
      }
      if (Number(result?.deducted_goods_fund_amount || 0) > 0) {
        return `发货成功，已扣代理货款 ¥${money(result.deducted_goods_fund_amount)}`
      }
      return '发货成功'
    }, async () => {
      shipDialogVisible.value = false
      await rememberShippingCompanyOption(logisticsCompany)
    })
}

// ===== 改价 =====
const amountVisible = ref(false)
const amountForm = reactive({ pay_amount: 0, reason: '' })

const handleAmount = (row) => {
  currentOrder.value = row
  amountForm.pay_amount = moneyNumber(row.pay_amount)
  amountForm.reason = ''
  amountVisible.value = true
}
const submitAmount = async () => {
  if (!amountForm.reason.trim()) return ElMessage.warning('请填写调整原因')
  await runOrderMutation(
    submittingAmount,
    () => adjustOrderAmount(currentOrder.value.id, { pay_amount: normalizeAmount(amountForm.pay_amount), reason: amountForm.reason }),
    '金额修改成功',
    () => { amountVisible.value = false }
  )
}

// ===== 备注 =====
const remarkVisible = ref(false)
const remarkText = ref('')

const handleRemarkItem = (row) => {
  currentOrder.value = row
  remarkText.value = ''
  remarkVisible.value = true
}
const submitRemark = async () => {
  if (!remarkText.value.trim()) return ElMessage.warning('请填写备注')
  await runOrderMutation(
    submittingRemark,
    () => addOrderRemark(currentOrder.value.id, { remark: remarkText.value }),
    '备注添加成功',
    () => { remarkVisible.value = false }
  )
}

const submittingRepair = ref(false)
const handleRepairFulfillment = async (row) => {
  currentOrder.value = row
  await runOrderMutation(
    submittingRepair,
    () => repairOrderFulfillment(row.id),
    '履约链修复成功',
    async () => {
      if (detailVisible.value && currentOrder.value) {
        await handleDetail(currentOrder.value)
      }
    }
  )
}

// ===== 强制操作 =====
const forceVisible = ref(false)
const forceType = ref('') // 'complete' | 'cancel'
const forceForm = reactive({ reason: '' })

const handleForce = (row, type) => {
  currentOrder.value = row
  forceType.value = type
  forceForm.reason = ''
  forceVisible.value = true
}
const submitForce = async () => {
  if (!forceForm.reason.trim()) return ElMessage.warning('必填原因')
  const action = forceType.value === 'complete'
    ? () => forceCompleteOrder(currentOrder.value.id, forceForm)
    : () => forceCancelOrder(currentOrder.value.id, forceForm)
  const message = forceType.value === 'complete' ? '订单已强制完成' : '订单已强制取消并退款'
  await runOrderMutation(submittingForce, action, message, () => { forceVisible.value = false })
}

const handleTestFlag = async (row) => {
  const nextFlag = !row.is_test_order
  try {
    await ElMessageBox.confirm(
      nextFlag
        ? `确认将订单「${row.order_no}」标记为测试订单？标记后将默认从业务统计和常规列表中排除。`
        : `确认取消订单「${row.order_no}」的测试订单标记？`,
      nextFlag ? '标记测试订单' : '取消测试订单标记',
      { type: 'warning' }
    )
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.message || '已取消')
    return
  }

  await runOrderMutation(
    submittingTestFlag,
    () => updateOrderTestFlag(row.id, {
      is_test_order: nextFlag,
      reason: nextFlag ? '管理员标记测试订单' : '管理员取消测试订单标记'
    }),
    nextFlag ? '订单已标记为测试订单' : '测试订单标记已取消',
    (result) => {
      if (detailVisible.value && currentOrder.value && String(currentOrder.value.id) === String(row.id)) {
        detailData.value = normalizeOrderDisplay(result?.data || result)
      }
    }
  )
}

const visibilityVisible = ref(false)
const visibilityTarget = ref(null)
const visibilityForm = reactive({
  visibility: 'hidden',
  cleanup_category: 'manual_cleanup',
  reason: ''
})

const handleOrderVisibility = (row) => {
  const hidden = row.order_visibility === 'hidden'
  visibilityTarget.value = row
  visibilityForm.visibility = hidden ? 'visible' : 'hidden'
  visibilityForm.cleanup_category = hidden ? (row.cleanup_category || 'manual_cleanup') : inferOrderCleanupCategory(row)
  visibilityForm.reason = hidden ? '管理员恢复显示' : `管理员移入清理箱：${cleanupCategoryText(visibilityForm.cleanup_category)}`
  visibilityVisible.value = true
}

const submitOrderVisibility = async () => {
  if (!visibilityTarget.value) return
  if (!visibilityForm.reason.trim()) return ElMessage.warning('请填写操作原因')
  await runOrderMutation(
    submittingVisibility,
    () => updateOrderVisibility(visibilityTarget.value.id, {
      visibility: visibilityForm.visibility,
      cleanup_category: visibilityForm.cleanup_category,
      reason: visibilityForm.reason.trim()
    }),
    visibilityForm.visibility === 'hidden' ? '订单已移入清理箱' : '订单已恢复显示',
    (result) => {
      visibilityVisible.value = false
      if (detailVisible.value && visibilityTarget.value && detailData.value && String(detailData.value.id) === String(visibilityTarget.value.id)) {
        detailData.value = normalizeOrderDisplay(result?.data || result)
      }
    }
  )
}

// Dropdown dispatch
const handleDropdown = (cmd, row) => {
  if (cmd === 'amount') handleAmount(row)
  else if (cmd === 'remark') handleRemarkItem(row)
  else if (cmd === 'test_flag') handleTestFlag(row)
  else if (cmd === 'visibility') handleOrderVisibility(row)
  else if (cmd === 'repair_fulfillment') handleRepairFulfillment(row)
  else if (cmd === 'force_complete') handleForce(row, 'complete')
  else if (cmd === 'force_cancel') handleForce(row, 'cancel')
}

watch(
  () => route.query,
  (query) => {
    applyRouteQueryToFilters(query || {})
    resetPage()
    refreshOrders()
  },
  { immediate: true }
)

onMounted(() => {
  fetchMiniProgramConfig()
})
</script>

<style scoped>
.card-header-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sync-text { font-size: 12px; color: #909399; }
.tips-collapse { margin-bottom: 12px; border: none; }
.tips-collapse :deep(.el-collapse-item__header) { font-size: 13px; color: var(--el-color-info); }
.status-tabs { margin-bottom: 16px; }
.filter-form { margin-bottom: 8px; }
.search-combo { display: flex; gap: 8px; width: 100%; align-items: center; flex-wrap: wrap; }
</style>
