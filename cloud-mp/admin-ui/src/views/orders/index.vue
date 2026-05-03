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
/**
 * 订单管理页 — 现在是 shell / 路由壳。
 *
 * 所有业务逻辑都下沉到 4 个 composable + 1 个 util：
 *   - utils/orderDisplay.js         纯展示/格式化函数（无响应式状态）
 *   - composables/useOrderList      列表 / 筛选 / 分页 / 导出 / 路由同步
 *   - composables/useOrderDetail    详情抽屉 state + handleDetail + detailLineItems
 *   - composables/useOrderLogistics 物流抽屉 + 小程序 logistics_config + 常用快递缓存
 *   - composables/useOrderMutations 6 个 mutation 弹窗 + runOrderMutation + handleDropdown
 *
 * 弹窗 / 抽屉组件仍保留在 components/ 下：
 *   - components/OrderTable.vue             主表格
 *   - components/OrderDetailDrawer.vue      详情抽屉（异步加载）
 *   - components/OrderLogisticsDrawer.vue   物流抽屉（异步加载）
 *   - components/OrderMutationDialogs.vue   5 个变更弹窗集合（异步加载）
 *
 * Shell 本身的职责：
 *   1) 连接 router / route / userStore 这些全局依赖，组合 4 个 composable
 *   2) 提供 goUserManage / goProductManage 两个路由跳转（只跟 router 强绑定）
 *   3) onMounted 触发一次 fetchMiniProgramConfig 拉小程序物流配置
 */

import { onMounted, computed, defineAsyncComponent } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { formatDateTime } from '@/utils/format'
import { buildUserManagementQuery } from '@/utils/userRouting'
import { useUserStore } from '@/store/user'
import {
  money,
  orderTypeText, orderSourceText,
  deliveryTypeText, listSkuText, lineUnitPrice,
  fulfillmentText, resolvedAddress,
  detailPaymentMethod, paymentMethodTagType, refundStatusTagType,
  getStatusType,
  roleText, roleTagType,
  displayBuyerName, displayBuyerAvatar,
  cleanupCategoryText, cleanupCategoryOptions,
  agentFulfillmentProfit, referralCommissionTotal, fulfillmentProfitNote,
  commissionTypeText, commissionStatusText, detailTimeline,
  canShipRow, canAdjustAmountRow, canViewLogistics,
  fmtDateTime, getLogisticsTagType
} from './utils/orderDisplay'
import { useOrderList } from './composables/useOrderList'
import { useOrderDetail } from './composables/useOrderDetail'
import { useOrderLogistics } from './composables/useOrderLogistics'
import { useOrderMutations } from './composables/useOrderMutations'
import OrderTable from './components/OrderTable.vue'
const OrderDetailDrawer = defineAsyncComponent(() => import('./components/OrderDetailDrawer.vue'))
const OrderLogisticsDrawer = defineAsyncComponent(() => import('./components/OrderLogisticsDrawer.vue'))
const OrderMutationDialogs = defineAsyncComponent(() => import('./components/OrderMutationDialogs.vue'))

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const canAdjustOrderAmount = computed(() => userStore.hasPermission('order_amount_adjust'))
const canForceCompleteOrder = computed(() => userStore.hasPermission('order_force_complete'))
const canForceCancelOrder = computed(() => userStore.hasPermission('order_force_cancel'))
const canManageSettings = computed(() => userStore.hasPermission('settings_manage'))

// ===== 列表 / 筛选 / 分页 / 导出 / 路由同步 =====
const {
  loading,
  exporting,
  summaryPendingShip,
  tableData,
  lastSyncedAt,
  pagination,
  searchForm,
  dateRange,
  fetchOrders,
  refreshOrders,
  handleSearch,
  onStatusGroupChange,
  handleReset,
  handleExport
} = useOrderList({ route })

// ===== 详情抽屉 =====
const { detailVisible, detailData, detailLineItems, handleDetail } = useOrderDetail()

// ===== 物流抽屉 + 小程序 logistics_config + 常用快递公司 =====
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

// ===== 订单操作（发货 / 改价 / 备注 / 履约修复 / 强制 / 测试标记 / 清理箱） =====
const {
  currentOrder,
  shipDialogVisible,
  shipForm,
  shipFulfillmentLabel,
  submittingShip,
  handleShip,
  submitShip,
  amountVisible,
  amountForm,
  submittingAmount,
  submitAmount,
  remarkVisible,
  remarkText,
  submittingRemark,
  submitRemark,
  forceVisible,
  forceType,
  forceForm,
  submittingForce,
  submitForce,
  visibilityVisible,
  visibilityForm,
  submittingVisibility,
  submitOrderVisibility,
  handleDropdown
} = useOrderMutations({
  refreshOrders,
  lastSyncedAt,
  detailVisible,
  detailData,
  handleDetail,
  logisticsMode,
  logisticsTrackingRequired,
  logisticsCompanyRequired,
  normalizeShippingCompanyName,
  rememberShippingCompanyOption
})

// ===== 路由跳转（与 router 强绑定，保留在 shell） =====
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
