<template>
  <div class="commissions-page">
    <!-- 统计卡片 -->
    <el-row :gutter="16" style="margin-bottom: 20px;">
      <el-col :span="6" :xs="24" :sm="12" v-for="card in statsCards" :key="card.label">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-inner">
            <div>
              <div class="stat-label">{{ card.label }}</div>
              <div class="stat-value">¥{{ card.value }}</div>
            </div>
            <el-icon :size="36" :color="card.color"><component :is="card.icon" /></el-icon>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card>
      <template #header>
        <div class="card-header">
          <span>佣金管理</span>
          <div class="header-actions">
            <el-button
              type="success"
              :disabled="selectedIds.length === 0"
              @click="handleBatchApprove"
            >
              批量审批 ({{ selectedIds.length }})
            </el-button>
            <el-button
              type="danger"
              :disabled="selectedIds.length === 0"
              @click="handleBatchReject"
            >
              批量驳回
            </el-button>
          </div>
        </div>
      </template>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px;"
        title="列表为系统产生的佣金流水。审批前请核对订单与用户身份；批量操作不可撤销，请谨慎。详细规则见仓库 docs/业务规则.md。"
      />

      <!-- 搜索栏 -->
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable style="width:140px">
            <el-option label="冻结中" value="frozen" />
            <el-option label="待审批" value="pending_approval" />
            <el-option label="已审批" value="approved" />
            <el-option label="已结算" value="settled" />
            <el-option label="已撤销" value="cancelled" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="searchForm.type" placeholder="全部类型" clearable style="width:160px">
            <el-option v-for="item in commissionTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="用户ID">
          <el-input v-model="searchForm.user_id" placeholder="用户ID" clearable style="width:120px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 表格 -->
      <el-table
        :data="tableData"
        v-loading="loading"
        stripe
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="50" :selectable="(row) => row.status === 'pending_approval'" />
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="收益人" width="130">
          <template #default="{ row }">
            {{ displayUserName(row.user, row.user_id) }}
          </template>
        </el-table-column>
        <el-table-column label="来源订单" width="180" class-name="hide-mobile">
          <template #default="{ row }">
            <span class="order-no">{{ row.order?.order_no || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="佣金金额" width="120">
          <template #default="{ row }">
            <span class="amount">¥{{ Number(row.amount || 0).toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="130">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ commissionTypeText(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="层级" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.level === 1 ? 'primary' : 'success'">
              L{{ row.level }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">
              {{ statusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="160" class-name="hide-mobile">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="解冻/结算时间" width="160" class-name="hide-mobile">
          <template #default="{ row }">
            {{ formatDate(row.settled_at || row.unfrozen_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'pending_approval'">
              <el-button text type="success" size="small" @click="handleApprove(row)">审批</el-button>
              <el-button text type="danger" size="small" @click="handleReject(row)">驳回</el-button>
            </template>
            <span v-else class="no-action">-</span>
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
        @size-change="fetchData"
        @current-change="fetchData"
        style="margin-top: 20px; justify-content: flex-end;"
      />
    </el-card>

    <!-- 驳回原因对话框 -->
    <el-dialog v-model="rejectDialogVisible" title="驳回原因" width="400px">
      <el-input
        v-model="rejectReason"
        type="textarea"
        :rows="3"
        placeholder="请输入驳回原因"
      />
      <template #footer>
        <el-button @click="rejectDialogVisible = false">取消</el-button>
        <el-button type="danger" @click="submitReject" :loading="submitting">确认驳回</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getCommissions, approveCommissionItem, rejectCommissionItem, batchApproveCommissions, batchRejectCommissions } from '@/api'
import { formatDate } from '@/utils/format'
import { COMMISSION_TYPE_OPTIONS, getCommissionTypeLabel } from '@/utils/commission'
import { usePagination } from '@/composables/usePagination'
import { getUserNickname } from '@/utils/userDisplay'

const loading = ref(false)
const submitting = ref(false)
const rejectDialogVisible = ref(false)
const rejectReason = ref('')
const selectedIds = ref([])
const currentRejectId = ref(null)
const isBatchReject = ref(false)

const statsCards = ref([
  { label: '总佣金金额', value: '0.00', icon: 'Money', color: '#409eff' },
  { label: '待审批金额', value: '0.00', icon: 'Clock', color: '#f59e0b' },
  { label: '已结算金额', value: '0.00', icon: 'SuccessFilled', color: '#67c23a' },
  { label: '已审批金额', value: '0.00', icon: 'TrendCharts', color: '#f56c6c' }
])
const commissionTypeOptions = COMMISSION_TYPE_OPTIONS

const searchForm = reactive({ status: '', type: '', user_id: '' })
const { pagination, resetPage, applyResponse } = usePagination({ defaultLimit: 10 })
const tableData = ref([])
const displayUserName = (user, fallback = '-') => getUserNickname(user || {}, fallback)
const commissionTypeText = (type) => getCommissionTypeLabel(type)

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getCommissions({ ...searchForm, page: pagination.page, limit: pagination.limit })
    tableData.value = res?.list || []
    applyResponse(res)

    // 更新统计卡片
    const stats = res?.stats || res?.data?.stats
    if (stats) {
      statsCards.value[0].value = Number((stats.totalFrozen || 0) + (stats.totalPendingApproval || 0) + (stats.totalApproved || 0) + (stats.totalSettled || 0)).toFixed(2)
      statsCards.value[1].value = Number(stats.totalPendingApproval || 0).toFixed(2)
      statsCards.value[2].value = Number(stats.totalSettled || 0).toFixed(2)
      statsCards.value[3].value = Number(stats.totalApproved || 0).toFixed(2)
    }
  } catch (e) {
    console.error('获取佣金列表失败:', e)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => { resetPage(); fetchData() }
const handleReset = () => { searchForm.status = ''; searchForm.type = ''; searchForm.user_id = ''; handleSearch() }
const handleSelectionChange = (rows) => { selectedIds.value = rows.filter(r => r.status === 'pending_approval').map(r => r.id) }

const handleApprove = async (row) => {
  try {
    await ElMessageBox.confirm(`确认审批通过该笔佣金 ¥${Number(row.amount).toFixed(2)}？`, '审批确认', {
      confirmButtonText: '确认审批',
      cancelButtonText: '取消',
      type: 'success'
    })
    await approveCommissionItem(row.id)
    ElMessage.success('审批成功')
    fetchData()
  } catch (e) {
    if (e !== 'cancel') console.error('审批失败:', e)
  }
}

const handleReject = (row) => {
  currentRejectId.value = row.id
  isBatchReject.value = false
  rejectReason.value = ''
  rejectDialogVisible.value = true
}

const handleBatchApprove = async () => {
  try {
    await ElMessageBox.confirm(`确认批量审批 ${selectedIds.value.length} 条佣金？`, '批量审批', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'success'
    })
    await batchApproveCommissions({ ids: selectedIds.value })
    ElMessage.success('批量审批成功')
    fetchData()
  } catch (e) {
    if (e !== 'cancel') console.error('批量审批失败:', e)
  }
}

const handleBatchReject = () => {
  isBatchReject.value = true
  rejectReason.value = ''
  rejectDialogVisible.value = true
}

const submitReject = async () => {
  if (!rejectReason.value.trim()) {
    ElMessage.warning('请填写驳回原因')
    return
  }
  submitting.value = true
  try {
    if (isBatchReject.value) {
      await batchRejectCommissions({ ids: selectedIds.value, reason: rejectReason.value })
      ElMessage.success('批量驳回成功')
    } else {
      await rejectCommissionItem(currentRejectId.value, { reason: rejectReason.value })
      ElMessage.success('驳回成功')
    }
    rejectDialogVisible.value = false
    fetchData()
  } catch (e) {
    console.error('驳回失败:', e)
  } finally {
    submitting.value = false
  }
}

const statusText = (s) => ({ frozen: '冻结中', pending_approval: '待审批', approved: '已审批', settled: '已结算', cancelled: '已撤销' }[s] || s)
const statusTagType = (s) => ({ frozen: 'info', pending_approval: 'warning', approved: 'primary', settled: 'success', cancelled: 'danger' }[s] || '')

onMounted(fetchData)
</script>

<style scoped>
.commissions-page { padding: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.header-actions { display: flex; gap: 8px; }
.search-form { margin-bottom: 20px; }
.amount { font-weight: 600; color: #f56c6c; }
.order-no { font-size: 12px; color: #909399; font-family: monospace; }
.no-action { color: #c0c4cc; font-size: 12px; }
.stat-card { cursor: default; }
.stat-inner { display: flex; justify-content: space-between; align-items: center; }
.stat-label { font-size: 13px; color: #909399; margin-bottom: 6px; }
.stat-value { font-size: 22px; font-weight: bold; color: #303133; }
</style>
