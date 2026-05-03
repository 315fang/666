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
  shipOrder,
  adjustOrderAmount,
  addOrderRemark,
  updateOrderTestFlag,
  updateOrderVisibility,
  repairOrderFulfillment,
  forceCompleteOrder,
  forceCancelOrder,
} from '@/api'
import { formatDateTime } from '@/utils/format'
import { buildUserManagementQuery } from '@/utils/userRouting'
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
import { useOrderList } from './composables/useOrderList'
import { useOrderLogistics } from './composables/useOrderLogistics'
import { useOrderDetail } from './composables/useOrderDetail'
import OrderTable from './components/OrderTable.vue'
const OrderDetailDrawer = defineAsyncComponent(() => import('./components/OrderDetailDrawer.vue'))
const OrderLogisticsDrawer = defineAsyncComponent(() => import('./components/OrderLogisticsDrawer.vue'))
const OrderMutationDialogs = defineAsyncComponent(() => import('./components/OrderMutationDialogs.vue'))

const router = useRouter()
const route = useRoute()

// ===== 列表（fetch / filter / pagination / export / route sync） =====
// 所有列表侧状态与动作均由 useOrderList 托管，见 ./composables/useOrderList.js
const {
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
} = useOrderList({ route })

const userStore = useUserStore()

const submittingShip = ref(false)
const submittingAmount = ref(false)
const submittingRemark = ref(false)
const submittingForce = ref(false)
const submittingTestFlag = ref(false)
const submittingVisibility = ref(false)
const canAdjustOrderAmount = computed(() => userStore.hasPermission('order_amount_adjust'))
const canForceCompleteOrder = computed(() => userStore.hasPermission('order_force_complete'))
const canForceCancelOrder = computed(() => userStore.hasPermission('order_force_cancel'))
const canManageSettings = computed(() => userStore.hasPermission('settings_manage'))

// ===== 详情（handleDetail / detailLineItems / drawer state） =====
// useOrderDetail 需要先于 useOrderLogistics 调用，因为 syncOrderLogistics 会回写 detailData._logistics
const { detailVisible, detailData, detailLineItems, handleDetail } = useOrderDetail()

// ===== 物流（抽屉 + 小程序 logistics_config + 常用快递公司缓存） =====
const {
  logisticsMode,
  logisticsTrackingRequired,
  logisticsCompanyRequired,
  logisticsVisible,
  logisticsLoading,
  logisticsOrder,
  logisticsData,
  shippingCompanyOptions,
  normalizeShippingCompanyName,
  fetchMiniProgramConfig,
  rememberShippingCompanyOption,
  openLogisticsDrawer,
  refreshLogisticsDrawer
} = useOrderLogistics({ canManageSettings, tableData, detailData })

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
