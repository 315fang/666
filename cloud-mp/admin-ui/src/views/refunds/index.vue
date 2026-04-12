<template>
  <div class="refunds-page">
    <el-card>
      <template #header>
        售后管理
      </template>

      <!-- 搜索栏 -->
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="用户搜索">
          <el-input v-model="searchForm.keyword" placeholder="昵称/订单号" clearable style="width: 180px" @keyup.enter="handleSearch" />
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
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 表格 -->
      <el-table :data="tableData" v-loading="loading">
        <el-table-column prop="id" label="ID" width="70" />
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
          <template #default="{ row }">¥{{ parseFloat(row.amount || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="reason" label="退款原因" width="150" show-overflow-tooltip class-name="hide-mobile" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="170" class-name="hide-mobile">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'pending'" text type="success" size="small" @click="handleApprove(row)">通过</el-button>
            <el-button v-if="row.status === 'pending'" text type="danger" size="small" @click="handleReject(row)">拒绝</el-button>
            <el-button v-if="row.status === 'approved'" text type="primary" size="small" @click="handleComplete(row)">确认退款</el-button>
            <el-button v-if="row.status === 'processing'" text type="warning" size="small" disabled>退款中...</el-button>
            <el-button v-if="row.status === 'failed'" text type="danger" size="small" @click="handleComplete(row)">重试退款</el-button>
            <el-button text size="small" @click="handleDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.limit"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
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
        <el-descriptions-item label="退款金额">¥{{ parseFloat(currentRow.amount || 0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="退款原因">{{ currentRow.reason || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentRow.status)">{{ getStatusText(currentRow.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="申请时间">{{ formatDateTime(currentRow.created_at) }}</el-descriptions-item>
        <el-descriptions-item label="处理时间" v-if="getProcessedTime(currentRow)">
          {{ formatDateTime(getProcessedTime(currentRow)) }}
        </el-descriptions-item>
        <el-descriptions-item label="拒绝原因" v-if="currentRow.reject_reason">{{ currentRow.reject_reason }}</el-descriptions-item>
        <el-descriptions-item label="退货快递公司" v-if="currentRow.return_company">{{ currentRow.return_company }}</el-descriptions-item>
        <el-descriptions-item label="退货物流单号" v-if="currentRow.return_tracking_no">{{ currentRow.return_tracking_no }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getRefunds, approveRefund, rejectRefund, completeRefund } from '@/api'
import { formatDateTime } from '@/utils/format'
import { usePagination } from '@/composables/usePagination'
import { getUserNickname } from '@/utils/userDisplay'

const route = useRoute()
const loading = ref(false)
const submitting = ref(false)
const rejectDialogVisible = ref(false)
const detailDialogVisible = ref(false)
const currentRow = ref(null)

/**
 * 售后搜索字段说明：
 *  keyword - 后端模糊匹配买家昵称或订单号（不支持手机号/会员码）
 *  status  - 售后单状态精确筛选（pending/approved/processing/rejected/completed）
 */
const searchForm = reactive({
  status: '',
  keyword: ''
})

const { pagination, resetPage, applyResponse } = usePagination({ defaultLimit: 10 })

const tableData = ref([])

const rejectForm = reactive({
  id: null,
  reason: ''
})
const displayUserName = (user, fallback = '-') => getUserNickname(user || {}, fallback)

const fetchRefunds = async () => {
  loading.value = true
  try {
    const params = {
      ...searchForm,
      page: pagination.page,
      limit: pagination.limit
    }
    const data = await getRefunds(params)
    tableData.value = data?.list || data?.data?.list || []
    applyResponse(data)
  } catch (error) {
    ElMessage.error('获取售后列表失败')
    console.error('获取售后列表失败:', error)
  } finally {
    loading.value = false
  }
}

const refreshRefunds = () => fetchRefunds()

const patchRefundRow = (id, patch) => {
  const applyPatch = (row) => ({ ...row, ...patch })
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
    // 先用后端返回的最新数据乐观更新本地行（避免等 refresh 期间闪烁）
    if (result && (result.id || result._id)) {
      const freshId = result.id || result._id
      patchRefundRow(freshId, result)
    }
    ElMessage.success(successMessage)
    await onSuccess?.()
    // 延迟一点点再刷新，给 CloudBase 写入一点余量
    await new Promise(resolve => setTimeout(resolve, 300))
    await refreshRefunds()
  } catch (error) {
    ElMessage.error(error?.message || '操作失败')
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
  handleSearch()
}

const handleDetail = (row) => {
  currentRow.value = row
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
      ElMessage.error('操作失败')
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
  await runRefundMutation(
    () => rejectRefund(rejectForm.id, { reason: rejectForm.reason }),
    '已拒绝',
    () => { rejectDialogVisible.value = false }
  )
}

const handleComplete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `该操作将立即对用户「${displayUserName(row.user, row.user_id)}」发起退款，金额 ¥${parseFloat(row.amount || 0).toFixed(2)}。请确认当前售后单已审核无误。`,
      '确认发起退款',
      {
        confirmButtonText: '立即退款',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    await runRefundMutation(
      () => completeRefund(row.id),
      '退款请求已提交微信，处理中'
      // runRefundMutation 会用后端返回的最新状态更新本地行
    )
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败')
      console.error('执行退款失败:', error)
    }
  }
}

const getProcessedTime = (row) => row?.completed_at || row?.processed_at || row?.updated_at || ''

const getStatusType = (status) => {
  const map = { pending: 'warning', approved: 'info', processing: 'primary', rejected: 'danger', completed: 'success', failed: 'danger' }
  return map[status] || 'info'
}

const getStatusText = (status) => {
  const map = { pending: '待审核', approved: '待退款', processing: '退款处理中（等待微信回调）', rejected: '已拒绝', completed: '已退款', failed: '退款失败' }
  return map[status] || status
}

onMounted(() => {
  const st = route.query?.status
  if (st) searchForm.status = String(st)
  refreshRefunds()
})
</script>

<style scoped>
.refunds-page {
  padding: 0;
}

.search-form {
  margin-bottom: 20px;
}

.text-gray {
  color: #aaa;
}
</style>
