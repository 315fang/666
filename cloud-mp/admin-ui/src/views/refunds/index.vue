<template>
  <div class="refunds-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>售后管理</span>
          <div class="header-actions">
            <span class="sync-text">最后同步：{{ lastSyncedAt ? formatDateTime(lastSyncedAt) : '—' }}</span>
            <el-button size="small" @click="refreshRefunds" :loading="loading">刷新</el-button>
            <el-button size="small" type="success" :disabled="selectedPendingIds.length === 0" @click="handleBatchApprove">
              批量通过 ({{ selectedPendingIds.length }})
            </el-button>
            <el-button size="small" type="danger" :disabled="selectedIds.length === 0" @click="handleBatchReject">
              批量拒绝
            </el-button>
          </div>
        </div>
      </template>

      <PageHelpTip
        title="售后处理须知"
        message="退款金额由系统按商品实付自动计算；仅退现金，优惠券和积分不返还。审核通过后会自动调用微信支付退款，到账时间一般在 1-3 个工作日内。"
      />

      <!-- 搜索栏 -->
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="用户搜索">
          <el-input v-model="searchForm.keyword" placeholder="昵称/手机号/会员码/订单号" clearable style="width: 220px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable style="width: 130px">
            <el-option label="待审核" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="退款中" value="processing" />
            <el-option label="已拒绝" value="rejected" />
            <el-option label="已退款" value="completed" />
          </el-select>
        </el-form-item>
        <el-form-item label="申请时间">
          <DateRangeQuickFilter v-model="dateFilter" @change="handleSearch" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 表格 -->
      <el-table :data="tableData" v-loading="loading" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="46" :selectable="(row) => ['pending', 'approved'].includes(row.status)" />
        <el-table-column label="ID" width="90">
          <template #default="{ row }">
            <CompactIdCell :value="row.display_id || row.id" :full-value="row.id" />
          </template>
        </el-table-column>
        <el-table-column label="订单号" width="180" class-name="hide-mobile">
          <template #default="{ row }">{{ row.order?.order_no || '-' }}</template>
        </el-table-column>
        <el-table-column label="用户" width="130">
          <template #default="{ row }">{{ displayUserName(row.user, row.user_id) }}</template>
        </el-table-column>
        <el-table-column label="退款商品" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <div v-if="row.order_item || row.items?.length || row.order?.product">
              <span>{{ row.order_item?.product?.name || row.items?.[0]?.product?.name || row.order?.product?.name || '—' }}</span>
              <span v-if="row.order_item?.sku?.spec_value" class="text-gray" style="font-size:12px;margin-left:4px">
                {{ row.order_item.sku.spec_value }}
              </span>
            </div>
            <span v-else class="text-gray">—</span>
          </template>
        </el-table-column>
        <el-table-column label="退款金额" width="110">
          <template #default="{ row }">
            <div>¥{{ row.display_amount }}</div>
            <div v-if="orderPayAmount(row) > 0" class="text-gray" style="font-size:12px;margin-top:4px;">
              实付 ¥{{ orderPayAmount(row).toFixed(2) }}
            </div>
            <div class="text-gray" style="font-size:12px;margin-top:4px;" v-if="row.order?.remaining_refundable_cash >= 0">
              剩余可退 ¥{{ Number.parseFloat(row.order?.remaining_refundable_cash || 0).toFixed(2) }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="计算来源" width="110" class-name="hide-mobile">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.settlement_basis_version === 'snapshot_v1' ? 'snapshot' : 'legacy_estimated' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="支付 / 退款去向" width="180" class-name="hide-mobile">
          <template #default="{ row }">
            <div style="display:flex; flex-direction:column; gap:6px;">
              <el-tag :type="paymentMethodTagType(row.display_payment_method_code || resolvePaymentMethod(row))" effect="plain" size="small">
                {{ row.display_payment_method_text }}
              </el-tag>
              <span class="text-gray">{{ row.display_refund_target_text }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="退款原因" width="150" show-overflow-tooltip class-name="hide-mobile" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ row.display_status_text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="170" class-name="hide-mobile">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <RowActionsMenu :actions="getRefundRowActions(row)" :primary-count="2" />
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.limit"
        :total="pagination.total"
        :page-sizes="pagination.pageSizes"
        layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="fetchRefunds"
        style="margin-top: 20px; justify-content: flex-end;"
      />
    </el-card>

    <!-- 拒绝对话框 -->
    <el-dialog v-model="rejectDialogVisible" title="拒绝售后" width="min(500px, 94vw)">
      <el-form :model="rejectForm" label-width="100px">
        <el-form-item label="拒绝原因">
          <el-input v-model="rejectForm.reason" type="textarea" :rows="4" placeholder="请输入拒绝原因（将通知给用户）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleRejectSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 详情对话框 -->
    <el-dialog v-model="detailDialogVisible" title="售后详情" width="min(520px, 94vw)">
      <el-descriptions :column="1" border v-if="currentRow">
        <el-descriptions-item label="申请 ID">{{ currentRow.id }}</el-descriptions-item>
        <el-descriptions-item label="订单号">{{ currentRow.order?.order_no || '-' }}</el-descriptions-item>
        <el-descriptions-item label="申请用户">{{ displayUserName(currentRow.user, currentRow.user_id) }}</el-descriptions-item>
        <el-descriptions-item label="退款商品">
          <span>{{ currentRow.order_item?.product?.name || currentRow.items?.[0]?.product?.name || currentRow.order?.product?.name || '—' }}</span>
          <span v-if="currentRow.order_item?.sku?.spec_value" class="text-gray" style="font-size:12px;margin-left:4px">
            {{ currentRow.order_item.sku.spec_value }}
          </span>
        </el-descriptions-item>
        <el-descriptions-item label="支付方式">
          <el-tag :type="paymentMethodTagType(currentRow.display_payment_method_code || resolvePaymentMethod(currentRow))" effect="plain" size="small">
            {{ currentRow.display_payment_method_text }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="退款去向">{{ currentRow.display_refund_target_text }}</el-descriptions-item>
        <el-descriptions-item label="退款金额">¥{{ currentRow.display_amount }}</el-descriptions-item>
        <el-descriptions-item label="订单实付" v-if="orderPayAmount(currentRow) > 0">¥{{ orderPayAmount(currentRow).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="累计已退" v-if="currentRow.order?.refunded_cash_total != null">¥{{ Number.parseFloat(currentRow.order?.refunded_cash_total || 0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="剩余可退" v-if="currentRow.order?.remaining_refundable_cash != null">¥{{ Number.parseFloat(currentRow.order?.remaining_refundable_cash || 0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="计算来源">{{ currentRow.settlement_basis_version === 'snapshot_v1' ? 'snapshot' : 'legacy_estimated' }}</el-descriptions-item>
        <el-descriptions-item label="退款原因">{{ currentRow.reason || '-' }}</el-descriptions-item>
        <el-descriptions-item label="退款规则">仅退现金，优惠券和积分不返还</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentRow.status)">{{ currentRow.display_status_text }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="申请时间">{{ formatDateTime(currentRow.created_at) }}</el-descriptions-item>
        <el-descriptions-item label="处理时间" v-if="getProcessedTime(currentRow)">
          {{ formatDateTime(getProcessedTime(currentRow)) }}
        </el-descriptions-item>
        <el-descriptions-item label="微信退款状态" v-if="currentRow.wx_status || currentRow.wx_refund_status">
          {{ currentRow.wx_status || currentRow.wx_refund_status }}
        </el-descriptions-item>
        <el-descriptions-item label="拒绝原因" v-if="currentRow.reject_reason">{{ currentRow.reject_reason }}</el-descriptions-item>
        <el-descriptions-item label="退货快递公司" v-if="currentRow.return_company">{{ currentRow.return_company }}</el-descriptions-item>
        <el-descriptions-item label="退货物流单号" v-if="currentRow.return_tracking_no">{{ currentRow.return_tracking_no }}</el-descriptions-item>
      </el-descriptions>
      <div v-if="currentRow?.refund_items?.length" style="margin-top:16px;">
        <div style="font-weight:600;margin-bottom:8px;">退款计算明细</div>
        <el-table :data="currentRow.refund_items" size="small" border>
          <el-table-column prop="product.name" label="商品" min-width="180">
            <template #default="{ row }">
              <span>{{ row.product?.name || '-' }}</span>
              <span v-if="row.sku?.spec_value" class="text-gray" style="font-size:12px;margin-left:4px;">{{ row.sku.spec_value }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="quantity" label="退款数量" width="90" />
          <el-table-column prop="cash_refund_amount" label="现金退款" width="100">
            <template #default="{ row }">¥{{ Number.parseFloat(row.cash_refund_amount || 0).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column prop="settlement_basis_version" label="来源" width="130">
            <template #default="{ row }">{{ row.settlement_basis_version === 'snapshot_v1' ? 'snapshot' : 'legacy_estimated' }}</template>
          </el-table-column>
        </el-table>
      </div>
      <div v-if="currentRow?.items?.length" style="margin-top:16px;">
        <div style="font-weight:600;margin-bottom:8px;">订单商品结算快照</div>
        <el-table :data="currentRow.items" size="small" border>
          <el-table-column label="商品" min-width="180">
            <template #default="{ row }">
              <span>{{ row.product?.name || '-' }}</span>
              <span v-if="row.sku?.spec_value" class="text-gray" style="font-size:12px;margin-left:4px;">{{ row.sku.spec_value }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="quantity" label="总件数" width="80" />
          <el-table-column label="原价" width="90">
            <template #default="{ row }">¥{{ Number.parseFloat(row.display_original_line_amount || 0).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="分摊优惠券" width="100">
            <template #default="{ row }">¥{{ Number.parseFloat(row.display_coupon_allocated_amount || 0).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="分摊积分" width="100">
            <template #default="{ row }">¥{{ Number.parseFloat(row.display_points_allocated_amount || 0).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="商品实付" width="100">
            <template #default="{ row }">¥{{ Number.parseFloat(row.display_cash_paid_allocated_amount || 0).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="已退现金" width="100">
            <template #default="{ row }">¥{{ Number.parseFloat(row.display_refunded_cash_amount || 0).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="本次最多可退" width="110">
            <template #default="{ row }">¥{{ Number.parseFloat(row.display_refundable_cash_amount || 0).toFixed(2) }}</template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getRefunds, approveRefund, rejectRefund, completeRefund, syncRefundStatus, batchApproveRefunds, batchRejectRefunds } from '@/api'
import { extractReadAt, mergeStrongSuccessMessage } from '@/api/consistency'
import CompactIdCell from '@/components/CompactIdCell.vue'
import { formatDateTime } from '@/utils/format'
import { usePagination } from '@/composables/usePagination'
import { useUrlSyncedFilter } from '@/composables/useUrlSyncedFilter'
import { useDateRangeFilter } from '@/composables/useDateRangeFilter'
import { PageHelpTip, RowActionsMenu, DateRangeQuickFilter } from '@/components/list-toolkit'
import { getUserNickname } from '@/utils/userDisplay'

const loading = ref(false)
const submitting = ref(false)
const rejectDialogVisible = ref(false)
const detailDialogVisible = ref(false)
const currentRow = ref(null)
const lastSyncedAt = ref('')
const selectedRows = ref([])

/**
 * 售后搜索字段说明：
 *  keyword - 后端模糊匹配买家昵称 / 手机号 / 会员码 / 订单号 / 退款单 ID / 商品名
 *  status  - 售后单状态精确筛选（pending/approved/processing/rejected/completed）
 */
const searchForm = reactive({
  status: '',
  keyword: ''
})

const { pagination, resetPage, applyResponse } = usePagination({ defaultLimit: 10 })
const dateFilter = useDateRangeFilter()

// URL ↔ form 双向同步：刷新/分享链接都能还原筛选 + 翻页状态
useUrlSyncedFilter({ searchForm, pagination, fetchFn: () => refreshRefunds(), defaults: { status: '', keyword: '' } })

onMounted(() => refreshRefunds())

const tableData = ref([])
const selectedIds = computed(() => selectedRows.value.map((row) => row.id).filter(Boolean))
const selectedPendingIds = computed(() => selectedRows.value.filter((row) => row.status === 'pending').map((row) => row.id).filter(Boolean))

const rejectForm = reactive({
  id: null,
  reason: ''
})
const displayUserName = (user, fallback = '-') => getUserNickname(user || {}, fallback)
const orderPayAmount = (row = {}) => Number.parseFloat(row.order?.pay_amount || 0)
const refundAmountNumber = (row = {}) => Number.parseFloat(row.amount || 0)
const normalizeRefundDisplay = (row = {}) => {
  const paymentMethodCode = resolvePaymentMethod(row)
  return {
    ...row,
    display_amount: Number.parseFloat(row.amount || 0).toFixed(2),
    display_payment_method_code: paymentMethodCode,
    display_payment_method_text: row.payment_method_text || paymentMethodText(paymentMethodCode),
    display_refund_target_text: row.refund_target_text || ({
      wechat: '原路退回微信支付',
      goods_fund: '退回货款余额',
      wallet: '退回账户余额'
    }[paymentMethodCode] || '-'),
    display_status_text: row.status_text || getStatusText(row.status)
  }
}
const resolvePaymentMethod = (row = {}) => {
  const raw = String(
    row.payment_method
    || row.order?.payment_method
    || ''
  ).trim().toLowerCase()
  if (['wechat', 'wx', 'wxpay', 'jsapi', 'miniapp', 'wechatpay', 'wechat_pay', 'weixin'].includes(raw)) return 'wechat'
  if (['goods_fund', 'goods-fund', 'goodsfund'].includes(raw)) return 'goods_fund'
  if (['wallet', 'wallet_balance', 'account_balance', 'balance', 'credit', 'debt'].includes(raw)) return 'wallet'
  return raw
}
const paymentMethodText = (method) => ({
  wechat: '微信支付',
  goods_fund: '货款支付',
  wallet: '余额支付'
}[method] || (method || '-'))
const paymentMethodTagType = (method) => ({
  wechat: 'success',
  goods_fund: 'warning',
  wallet: 'info'
}[method] || 'info')
const refundPaymentMethodText = (row = {}) => row.payment_method_text || paymentMethodText(resolvePaymentMethod(row))
const refundTargetText = (row = {}) => (
  row.refund_target_text
  || ({
    wechat: '原路退回微信支付',
    goods_fund: '退回货款余额',
    wallet: '退回账户余额'
  }[resolvePaymentMethod(row)] || '-')
)
const refundStatusText = (row = {}) => row.status_text || getStatusText(row.status)

const fetchRefunds = async () => {
  loading.value = true
  try {
    const params = {
      ...searchForm,
      ...dateFilter.params.value,
      page: pagination.page,
      limit: pagination.limit
    }
    const data = await getRefunds(params)
    tableData.value = (data?.list || data?.data?.list || []).map(normalizeRefundDisplay)
    applyResponse(data)
    const readAt = extractReadAt(data)
    if (readAt) lastSyncedAt.value = readAt
  } catch (error) {
    if (!error?.__handledByRequest) {
      ElMessage.error('获取售后列表失败')
    }
    console.error('获取售后列表失败:', error)
  } finally {
    loading.value = false
  }
}

const refreshRefunds = () => fetchRefunds()

const handleSelectionChange = (rows) => {
  selectedRows.value = rows
}

const patchRefundRow = (id, patch) => {
  const applyPatch = (row) => normalizeRefundDisplay({ ...row, ...patch })
  // 用 _id 或 id 都能匹配，兼容不同格式
  const matchId = (row) => row.id === id || row._id === id
  tableData.value = tableData.value
    .map((row) => (matchId(row) ? applyPatch(row) : row))
    .filter((row) => {
      if (!searchForm.status) return true
      return row.status === searchForm.status
    })
  if (currentRow.value && matchId(currentRow.value)) {
    currentRow.value = applyPatch(currentRow.value)
  }
}

const runRefundMutation = async (task, successMessage, onSuccess) => {
  submitting.value = true
  try {
    const result = await task()
    // 直接使用后端 fresh 回读的数据回填本地行，避免旧状态闪回。
    if (result && (result.id || result._id)) {
      const freshId = result.id || result._id
      patchRefundRow(freshId, result)
    }
    const finalMessage = typeof successMessage === 'function' ? successMessage(result) : successMessage
    ElMessage.success(mergeStrongSuccessMessage(result, finalMessage))
    const readAt = extractReadAt(result)
    if (readAt) lastSyncedAt.value = readAt
    await onSuccess?.()
    await refreshRefunds()
  } catch (error) {
    if (!error?.__handledByRequest) {
      ElMessage.error(error?.message || '操作失败')
    }
    console.error('售后操作失败:', error)
  } finally {
    submitting.value = false
  }
}

const handleSearch = () => {
  resetPage()
  refreshRefunds()
}

const handleSizeChange = () => {
  resetPage()
  refreshRefunds()
}

const handleReset = () => {
  searchForm.status = ''
  searchForm.keyword = ''
  dateFilter.clear()
  handleSearch()
}

const handleDetail = (row) => {
  currentRow.value = normalizeRefundDisplay(row)
  detailDialogVisible.value = true
}

const handleApprove = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确认通过该售后申请？\n退款金额：¥${parseFloat(row.amount || 0).toFixed(2)}`,
      '审核确认',
      {
        confirmButtonText: '确定通过',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    await runRefundMutation(
      () => approveRefund(row.id),
      '审核通过，请尽快完成退款'
      // 不再手动 patchRefundRow — runRefundMutation 会用后端返回数据更新
    )
  } catch (error) {
    if (error !== 'cancel') {
      if (!error?.__handledByRequest) {
        ElMessage.error('操作失败')
      }
      console.error('审核失败:', error)
    }
  }
}

const runRefundBatchMutation = async (task, successMessage) => {
  submitting.value = true
  try {
    const result = await task()
    ElMessage.success(mergeStrongSuccessMessage(result, successMessage))
    selectedRows.value = []
    const readAt = extractReadAt(result)
    if (readAt) lastSyncedAt.value = readAt
    await refreshRefunds()
  } catch (error) {
    if (!error?.__handledByRequest) {
      ElMessage.error(error?.message || '批量操作失败')
    }
    console.error('售后批量操作失败:', error)
  } finally {
    submitting.value = false
  }
}

const handleBatchApprove = async () => {
  if (selectedPendingIds.value.length === 0) return
  try {
    await ElMessageBox.confirm(`确认批量通过 ${selectedPendingIds.value.length} 条待审核售后？`, '批量审核', {
      confirmButtonText: '确认通过',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await runRefundBatchMutation(
      () => batchApproveRefunds({ ids: selectedPendingIds.value }),
      `批量通过成功（${selectedPendingIds.value.length} 条）`
    )
  } catch (error) {
    if (error !== 'cancel') console.error('批量通过售后失败:', error)
  }
}

const handleBatchReject = async () => {
  if (selectedIds.value.length === 0) return
  try {
    const { value } = await ElMessageBox.prompt(`确认批量拒绝 ${selectedIds.value.length} 条售后？`, '批量拒绝', {
      confirmButtonText: '确认拒绝',
      cancelButtonText: '取消',
      type: 'warning',
      inputPlaceholder: '请输入拒绝原因',
      inputValidator: (input) => (String(input || '').trim().length >= 2 ? true : '请填写至少 2 个字符的拒绝原因')
    })
    await runRefundBatchMutation(
      () => batchRejectRefunds({ ids: selectedIds.value, reason: value }),
      `批量拒绝成功（${selectedIds.value.length} 条）`
    )
  } catch (error) {
    if (error !== 'cancel') console.error('批量拒绝售后失败:', error)
  }
}

const handleReject = (row) => {
  rejectForm.id = row.id
  rejectForm.reason = ''
  rejectDialogVisible.value = true
}

const handleRejectSubmit = async () => {
  if (!rejectForm.reason) {
    ElMessage.warning('请输入拒绝原因')
    return
  }
  await runRefundMutation(
    () => rejectRefund(rejectForm.id, { reason: rejectForm.reason }),
    '已拒绝',
    () => { rejectDialogVisible.value = false }
  )
}

const handleComplete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `该操作将立即对用户「${displayUserName(row.user, row.user_id)}」发起退款，金额 ¥${row.display_amount || Number.parseFloat(row.amount || 0).toFixed(2)}。\n订单实付：¥${orderPayAmount(row).toFixed(2)}\n剩余可退：¥${Number.parseFloat(row.order?.remaining_refundable_cash || 0).toFixed(2)}\n支付方式：${row.display_payment_method_text || refundPaymentMethodText(row)}\n退款去向：${row.display_refund_target_text || refundTargetText(row)}\n退款规则：仅退现金，优惠券和积分不返还。`,
      '确认发起退款',
      {
        confirmButtonText: '立即退款',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    await runRefundMutation(
      () => completeRefund(row.id),
      (result) => {
        const method = resolvePaymentMethod(result || row)
        if (result?.status === 'completed') {
          if (method === 'goods_fund') return '退款已完成，金额已退回货款余额'
          if (method === 'wallet') return '退款已完成，金额已退回账户余额'
          return '退款已完成'
        }
        if (result?.status === 'failed') return '退款失败，请查看退款状态后重试'
        return '退款请求已提交微信，处理中'
      }
      // runRefundMutation 会用后端返回的最新状态更新本地行
    )
  } catch (error) {
    if (error !== 'cancel') {
      if (!error?.__handledByRequest) {
        ElMessage.error('操作失败')
      }
      console.error('执行退款失败:', error)
    }
  }
}

const handleSyncStatus = async (row) => {
  await runRefundMutation(
    () => syncRefundStatus(row.id),
    (result) => {
      const syncedWechatStatus = result?.sync_result?.wechat_status || result?.wx_refund_status || result?.wx_status || ''
      if (result?.status === 'completed') return '已同步为退款完成'
      if (syncedWechatStatus === 'PROCESSING') return '微信侧仍在处理中'
      return '已同步微信退款状态'
    }
  )
}

const getProcessedTime = (row) => row?.completed_at || row?.processed_at || row?.updated_at || ''

const getStatusType = (status) => {
  const map = { pending: 'warning', approved: 'info', processing: 'primary', rejected: 'danger', completed: 'success', failed: 'danger' }
  return map[status] || 'info'
}

// 操作列按 status 动态生成；前 2 个外露，其它进"更多"下拉
const getRefundRowActions = (row) => [
  { label: '通过', type: 'success', onClick: () => handleApprove(row), visible: row.status === 'pending' },
  { label: '拒绝', type: 'danger', onClick: () => handleReject(row), visible: row.status === 'pending', danger: true },
  { label: '确认退款', type: 'primary', onClick: () => handleComplete(row), visible: row.status === 'approved' },
  { label: '同步状态', type: 'primary', onClick: () => handleSyncStatus(row), visible: row.status === 'processing' },
  { label: '重试退款', type: 'danger', onClick: () => handleComplete(row), visible: row.status === 'failed', danger: true },
  { label: '详情', onClick: () => handleDetail(row) }
]

const getStatusText = (status) => {
  const map = { pending: '待审核', approved: '待退款', processing: '退款处理中（等待微信回调）', rejected: '已拒绝', completed: '已退款', failed: '退款失败' }
  return map[status] || status
}

</script>

<style scoped>
.refunds-page {
  padding: 0;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sync-text {
  font-size: 12px;
  color: #909399;
}

.search-form {
  margin-bottom: 20px;
}

.text-gray {
  color: #aaa;
}
</style>
