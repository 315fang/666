<template>
  <div class="withdrawals-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>提现/存款审核</span>
          <div class="header-actions">
            <span class="sync-text">最后同步：{{ lastSyncedAt ? formatDateTime(lastSyncedAt) : '—' }}</span>
            <el-button size="small" @click="refreshWithdrawals" :loading="loading">刷新</el-button>
          </div>
        </div>
      </template>

      <PageHelpTip
        title="提现审核须知"
        message="审核通过后系统会自动调用微信商户号转账到提现账户；请仔细核对提现金额与到账账号信息。手续费由用户承担，按微信商户号配置自动扣除。"
      />

      <!-- 搜索栏 -->
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="用户搜索">
          <el-input v-model="searchForm.keyword" placeholder="昵称/手机号/会员码/提现账号" clearable style="width: 220px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable style="width: 130px">
            <el-option label="待审核" value="pending" />
            <el-option label="待打款" value="approved" />
            <el-option label="打款中" value="processing" />
            <el-option label="打款失败" value="failed" />
            <el-option label="已拒绝" value="rejected" />
            <el-option label="已到账" value="completed" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 表格 -->
      <el-table :data="tableData" v-loading="loading">
        <el-table-column label="ID" width="90">
          <template #default="{ row }">
            <CompactIdCell :value="row.display_id || row.id" :full-value="row.id" />
          </template>
        </el-table-column>
        <el-table-column label="用户" width="150">
          <template #default="{ row }">{{ displayUserName(row.user, row.user_id) }}</template>
        </el-table-column>
        <el-table-column label="申请类型/账户" min-width="220">
          <template #default="{ row }">
            <div v-if="getWithdrawAccountText(row)">
              <el-tag size="small" :type="getWithdrawAccountType(row) === 'wechat' ? 'success' : 'primary'" style="margin-right:6px">
                {{ getWithdrawAccountLabel(row) }}
              </el-tag>
              <span>{{ getWithdrawAccountText(row) }}</span>
            </div>
            <span v-else class="text-gray">—</span>
          </template>
        </el-table-column>
        <el-table-column label="申请金额" width="110">
          <template #default="{ row }">¥{{ parseFloat(row.amount || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="手续费" width="90" class-name="hide-mobile">
          <template #default="{ row }">¥{{ parseFloat(row.fee || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="实际到账" width="110" class-name="hide-mobile">
          <template #default="{ row }">¥{{ parseFloat(row.actual_amount || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ getStatusText(row) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="170" class-name="hide-mobile">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <RowActionsMenu :actions="getWithdrawalRowActions(row)" :primary-count="2" />
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
        @current-change="fetchWithdrawals"
        style="margin-top: 20px; justify-content: flex-end;"
      />
    </el-card>

    <!-- 拒绝对话框 -->
    <el-dialog v-model="rejectDialogVisible" title="拒绝申请" width="min(500px, 94vw)">
      <el-form :model="rejectForm" label-width="100px">
        <el-form-item label="拒绝原因">
          <el-input v-model="rejectForm.reason" type="textarea" :rows="4" placeholder="请输入拒绝原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleRejectSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 详情对话框 -->
    <el-dialog v-model="detailDialogVisible" title="申请详情" width="min(480px, 94vw)">
      <el-descriptions :column="1" border v-if="currentRow">
        <el-descriptions-item label="申请 ID">{{ currentRow.id }}</el-descriptions-item>
        <el-descriptions-item label="用户">{{ displayUserName(currentRow.user, currentRow.user_id) }}</el-descriptions-item>
        <el-descriptions-item label="申请类型">{{ getApplicationKindLabel(currentRow) }}</el-descriptions-item>
        <el-descriptions-item label="收款/转入账户">
          <template v-if="getWithdrawAccountText(currentRow)">
            <el-tag size="small" style="margin-right:6px">{{ getWithdrawAccountLabel(currentRow) }}</el-tag>
            {{ getWithdrawAccountText(currentRow) }}
          </template>
          <span v-else>—</span>
        </el-descriptions-item>
        <el-descriptions-item label="申请金额">¥{{ parseFloat(currentRow.amount || 0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="手续费">¥{{ parseFloat(currentRow.fee || 0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="实际到账">¥{{ parseFloat(currentRow.actual_amount || 0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentRow.status)">{{ getStatusText(currentRow) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="微信批次" v-if="currentRow.wx_transfer?.batch_id || currentRow.wx_transfer?.out_batch_no">
          {{ currentRow.wx_transfer?.batch_id || '-' }} / {{ currentRow.wx_transfer?.out_batch_no || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="微信明细" v-if="currentRow.wx_transfer?.detail_id || currentRow.wx_transfer?.out_detail_no">
          {{ currentRow.wx_transfer?.detail_id || '-' }} / {{ currentRow.wx_transfer?.out_detail_no || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="微信状态" v-if="currentRow.wx_transfer?.batch_status || currentRow.wx_transfer?.detail_status">
          {{ currentRow.wx_transfer?.batch_status || '-' }} / {{ currentRow.wx_transfer?.detail_status || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="失败原因" v-if="currentRow.fail_reason">{{ currentRow.fail_reason }}</el-descriptions-item>
        <el-descriptions-item label="申请时间">{{ formatDateTime(currentRow.created_at) }}</el-descriptions-item>
        <el-descriptions-item label="备注" v-if="currentRow.remark">{{ currentRow.remark }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getWithdrawals, approveWithdrawal, rejectWithdrawal, completeWithdrawal, syncWithdrawal } from '@/api'
import { extractReadAt, mergeStrongSuccessMessage } from '@/api/consistency'
import CompactIdCell from '@/components/CompactIdCell.vue'
import { formatDateTime } from '@/utils/format'
import { usePagination } from '@/composables/usePagination'
import { useUrlSyncedFilter } from '@/composables/useUrlSyncedFilter'
import { PageHelpTip, RowActionsMenu } from '@/components/list-toolkit'
import { getUserNickname } from '@/utils/userDisplay'

const loading = ref(false)
const submitting = ref(false)
const rejectDialogVisible = ref(false)
const detailDialogVisible = ref(false)
const currentRow = ref(null)
const lastSyncedAt = ref('')

const searchForm = reactive({
  status: '',
  keyword: ''
})

const { pagination, resetPage, applyResponse } = usePagination({ defaultLimit: 10 })

// URL ↔ form 双向同步：刷新/分享链接都能还原筛选 + 翻页状态
useUrlSyncedFilter({ searchForm, pagination, fetchFn: () => refreshWithdrawals(), defaults: { status: '', keyword: '' } })

onMounted(() => refreshWithdrawals())

const tableData = ref([])

const rejectForm = reactive({
  id: null,
  reason: ''
})
const displayUserName = (user, fallback = '-') => getUserNickname(user || {}, fallback)
const isDepositApplication = (row) => row?.source_type === 'upgrade_piggy_bank' || String(row?.application_type || '').startsWith('deposit_')
const isDepositCommissionApplication = (row) => row?.application_type === 'deposit_commission' || getWithdrawAccountType(row) === 'deposit_commission'
const isDepositGoodsFundApplication = (row) => {
  const type = getWithdrawAccountType(row)
  return row?.application_type === 'deposit_goods_fund' || type === 'deposit_goods_fund'
}
const getApplicationKindLabel = (row) => {
  if (isDepositCommissionApplication(row)) return '存款转佣金'
  if (isDepositGoodsFundApplication(row)) return '存款转入金'
  if (isDepositApplication(row)) return '存款提现'
  return '佣金提现'
}
const getCompleteActionText = (row) => {
  if (isDepositCommissionApplication(row)) return '确认转佣金'
  return isDepositGoodsFundApplication(row) ? '确认转入' : '确认打款'
}

const patchWithdrawalRow = (id, patch) => {
  const applyPatch = (row) => ({ ...row, ...patch })
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

const fetchWithdrawals = async () => {
  loading.value = true
  try {
    const params = {
      ...searchForm,
      page: pagination.page,
      limit: pagination.limit
    }
    const data = await getWithdrawals(params)
    tableData.value = data?.list || data?.data?.list || []
    applyResponse(data)
    const readAt = extractReadAt(data)
    if (readAt) lastSyncedAt.value = readAt
  } catch (error) {
    if (!error?.__handledByRequest) {
      ElMessage.error('获取提现列表失败')
    }
    console.error('获取提现列表失败:', error)
  } finally {
    loading.value = false
  }
}

const refreshWithdrawals = () => fetchWithdrawals()

const runWithdrawalMutation = async (task, successMessage, onSuccess) => {
  submitting.value = true
  try {
    const result = await task()
    if (result && (result.id || result._id)) {
      patchWithdrawalRow(result.id || result._id, result)
    }
    const finalMessage = typeof successMessage === 'function' ? successMessage(result) : successMessage
    ElMessage.success(mergeStrongSuccessMessage(result, finalMessage))
    const readAt = extractReadAt(result)
    if (readAt) lastSyncedAt.value = readAt
    await onSuccess?.()
    await refreshWithdrawals()
  } catch (error) {
    if (!error?.__handledByRequest) {
      ElMessage.error(error?.message || '操作失败')
    }
    console.error('提现操作失败:', error)
  } finally {
    submitting.value = false
  }
}

const handleSearch = () => {
  resetPage()
  refreshWithdrawals()
}

const handleSizeChange = () => {
  resetPage()
  refreshWithdrawals()
}

const handleReset = () => {
  searchForm.status = ''
  searchForm.keyword = ''
  handleSearch()
}

const handleDetail = (row) => {
  currentRow.value = row
  detailDialogVisible.value = true
}

const handleApprove = async (row) => {
  try {
    await ElMessageBox.confirm(`确认通过该${getApplicationKindLabel(row)}申请？\n处理金额：¥${parseFloat(row.actual_amount || 0).toFixed(2)}`, '审核确认', {
      confirmButtonText: '确定通过',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await runWithdrawalMutation(
      () => approveWithdrawal(row.id),
      isDepositCommissionApplication(row)
        ? '审核通过，请确认转佣金'
        : (isDepositGoodsFundApplication(row) ? '审核通过，请确认转入金' : '审核通过，请尽快完成打款')
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
  await runWithdrawalMutation(
    () => rejectWithdrawal(rejectForm.id, { reason: rejectForm.reason }),
    '已拒绝',
    () => {
      rejectDialogVisible.value = false
    }
  )
}

const handleComplete = async (row) => {
  try {
    const isGoodsFundTransfer = isDepositGoodsFundApplication(row)
    const isCommissionTransfer = isDepositCommissionApplication(row)
    const actionCopy = isCommissionTransfer
      ? `该操作将把用户「${displayUserName(row.user, row.user_id)}」的存款 ¥${parseFloat(row.actual_amount || 0).toFixed(2)} 转入佣金余额。请确认金额，并填写处理备注。`
      : (isGoodsFundTransfer
        ? `该操作将把用户「${displayUserName(row.user, row.user_id)}」的存款 ¥${parseFloat(row.actual_amount || 0).toFixed(2)} 转入货款账户。请确认金额，并填写处理备注。`
        : `该操作将尝试向用户「${displayUserName(row.user, row.user_id)}」自动打款 ¥${parseFloat(row.actual_amount || 0).toFixed(2)}。仅微信收款方式支持自动打款，请先确认账户信息，并填写打款备注。`)
    const { value } = await ElMessageBox.prompt(
      actionCopy,
      isCommissionTransfer ? '确认转佣金' : (isGoodsFundTransfer ? '确认转入金' : '确认执行打款'),
      {
        confirmButtonText: isCommissionTransfer ? '确认转佣金' : (isGoodsFundTransfer ? '确认转入' : '确认打款'),
        cancelButtonText: '取消',
        type: 'warning',
        inputPlaceholder: isCommissionTransfer
          ? '例如：审核通过，转入佣金余额'
          : (isGoodsFundTransfer ? '例如：审核通过，转入货款账户' : '例如：微信企业付款已执行 / 银行流水号'),
        inputValidator: (input) => {
          if (!input || String(input).trim().length < 2) return '请填写至少 2 个字符的打款备注'
          return true
        }
      }
    )
    await runWithdrawalMutation(
      () => completeWithdrawal(row.id, { remark: value }),
      (result) => {
        if (isCommissionTransfer) return '存款已转入佣金'
        if (isGoodsFundTransfer) return '存款已转入金'
        return result?.status === 'completed' ? '微信提现已完成' : '微信提现已受理，等待微信处理'
      }
    )
  } catch (error) {
    if (error !== 'cancel') {
      if (!error?.__handledByRequest) {
        ElMessage.error('操作失败')
      }
      console.error('执行打款失败:', error)
    }
  }
}

const canAutoCompleteWithdrawal = (row) => ['approved', 'failed'].includes(row?.status) && (getWithdrawAccountType(row) === 'wechat' || isDepositGoodsFundApplication(row))
const canSyncWithdrawal = (row) => ['processing', 'approved'].includes(row?.status) && !!row?.wx_transfer?.batch_id

// 操作列按 status 动态生成；前 2 个外露，其它进"更多"下拉
const getWithdrawalRowActions = (row) => [
  { label: '通过', type: 'success', onClick: () => handleApprove(row), visible: row.status === 'pending' },
  { label: '拒绝', type: 'danger', onClick: () => handleReject(row), visible: row.status === 'pending', danger: true },
  { label: getCompleteActionText(row), type: 'primary', onClick: () => handleComplete(row), visible: canAutoCompleteWithdrawal(row) },
  { label: '同步状态', type: 'warning', onClick: () => handleSync(row), visible: canSyncWithdrawal(row) },
  { label: '详情', onClick: () => handleDetail(row) }
]

const handleSync = async (row) => {
  await runWithdrawalMutation(
    () => syncWithdrawal(row.id),
    (result) => {
      if (result?.status === 'completed') return '微信提现已到账'
      if (result?.status === 'failed') return result?.fail_reason ? `微信提现失败：${result.fail_reason}` : '微信提现失败'
      return '微信提现状态已同步'
    }
  )
}

const getWithdrawAccountType = (row) => row?.withdraw_account?.type || row?.method || ''

const getWithdrawAccountLabel = (row) => {
  const type = getWithdrawAccountType(row)
  if (isDepositCommissionApplication(row)) return '转佣金'
  if (type === 'deposit_goods_fund') return '转入金'
  if (isDepositApplication(row) && type === 'wechat') return '存款提现'
  return type === 'wechat' ? '微信' : type === 'alipay' ? '支付宝' : '银行卡'
}

const getWithdrawAccountText = (row) => {
  const account = row?.withdraw_account
  if (isDepositCommissionApplication(row)) return '转入佣金余额'
  if (isDepositGoodsFundApplication(row)) return '转入货款账户'
  if (account) {
    return account.account || account.name || account.account_no || '-'
  }
  if (row?.method === 'bank') {
    return [row.bank_name, row.account_name, row.account_no].filter(Boolean).join(' / ')
  }
  return row?.account_name || row?.account_no || ''
}

const getStatusType = (status) => {
  const map = { pending: 'warning', approved: 'info', processing: 'warning', rejected: 'danger', failed: 'danger', completed: 'success' }
  return map[status] || 'info'
}

const getStatusText = (rowOrStatus) => {
  const status = typeof rowOrStatus === 'string' ? rowOrStatus : rowOrStatus?.status
  if (typeof rowOrStatus === 'object' && isDepositGoodsFundApplication(rowOrStatus)) {
    if (status === 'approved') return '待转入'
    if (status === 'processing') return '转入中'
    if (status === 'completed') return '已转入金'
  }
  const map = { pending: '待审核', approved: '待打款', processing: '打款中', rejected: '已拒绝', failed: '打款失败', completed: '已到账' }
  return map[status] || status
}

</script>

<style scoped>
.withdrawals-page {
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
