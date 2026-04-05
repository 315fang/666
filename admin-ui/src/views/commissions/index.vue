<template>
  <div class="commissions-page">
    <!-- 统计卡片 -->
    <el-row :gutter="16" style="margin-bottom: 20px;">
      <el-col :span="6" v-for="card in statsCards" :key="card.label">
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

      <!-- 搜索栏 -->
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable style="width:140px">
            <el-option label="冻结中" value="frozen" />
            <el-option label="待审批" value="pending_approval" />
            <el-option label="已结算" value="settled" />
            <el-option label="已驳回" value="rejected" />
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
        <el-table-column type="selection" width="50" />
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="收益人" width="130">
          <template #default="{ row }">
            {{ row.User?.nickname || row.user_id }}
          </template>
        </el-table-column>
        <el-table-column label="来源订单" width="180">
          <template #default="{ row }">
            <span class="order-no">{{ row.order_no || row.Order?.order_no || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="佣金金额" width="120">
          <template #default="{ row }">
            <span class="amount">¥{{ Number(row.amount || 0).toFixed(2) }}</span>
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
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="解冻/结算时间" width="160">
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
import request from '@/utils/request'
import dayjs from 'dayjs'

const loading = ref(false)
const submitting = ref(false)
const rejectDialogVisible = ref(false)
const rejectReason = ref('')
const selectedIds = ref([])
const currentRejectId = ref(null)
const isBatchReject = ref(false)

const statsCards = ref([
  { label: '总佣金金额', value: '0.00', icon: 'Money', color: '#409eff' },
  { label: '待审批金额', value: '0.00', icon: 'Clock', color: '#e6a23c' },
  { label: '已结算金额', value: '0.00', icon: 'SuccessFilled', color: '#67c23a' },
  { label: '本月新增', value: '0.00', icon: 'TrendCharts', color: '#f56c6c' }
])

const searchForm = reactive({ status: '', user_id: '' })
const pagination = reactive({ page: 1, limit: 10, total: 0 })
const tableData = ref([])

const fetchData = async () => {
  loading.value = true
  try {
    const res = await request({
      url: '/commissions',
      method: 'get',
      params: { ...searchForm, page: pagination.page, limit: pagination.limit }
    })
    tableData.value = res.list || res.data?.list || []
    pagination.total = res.total || res.data?.total || 0

    // 更新统计卡片
    if (res.stats) {
      statsCards.value[0].value = Number(res.stats.total || 0).toFixed(2)
      statsCards.value[1].value = Number(res.stats.pending || 0).toFixed(2)
      statsCards.value[2].value = Number(res.stats.settled || 0).toFixed(2)
      statsCards.value[3].value = Number(res.stats.thisMonth || 0).toFixed(2)
    }
  } catch (e) {
    console.error('获取佣金列表失败:', e)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => { pagination.page = 1; fetchData() }
const handleReset = () => { searchForm.status = ''; searchForm.user_id = ''; handleSearch() }
const handleSelectionChange = (rows) => { selectedIds.value = rows.map(r => r.id) }

const handleApprove = async (row) => {
  try {
    await ElMessageBox.confirm(`确认审批通过该笔佣金 ¥${Number(row.amount).toFixed(2)}？`, '审批确认', {
      confirmButtonText: '确认审批',
      cancelButtonText: '取消',
      type: 'success'
    })
    await request({ url: `/commissions/${row.id}/approve`, method: 'put' })
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
    await request({ url: '/commissions/batch-approve', method: 'post', data: { ids: selectedIds.value } })
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
      await request({ url: '/commissions/batch-reject', method: 'post', data: { ids: selectedIds.value, reason: rejectReason.value } })
      ElMessage.success('批量驳回成功')
    } else {
      await request({ url: `/commissions/${currentRejectId.value}/reject`, method: 'put', data: { reason: rejectReason.value } })
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

const statusText = (s) => ({ frozen: '冻结中', pending_approval: '待审批', settled: '已结算', rejected: '已驳回' }[s] || s)
const statusTagType = (s) => ({ frozen: 'info', pending_approval: 'warning', settled: 'success', rejected: 'danger' }[s] || '')
const formatDate = (d) => d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '-'

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
