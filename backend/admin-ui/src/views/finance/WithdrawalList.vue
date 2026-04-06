<template>
  <div class="withdrawal-page">
    <!-- Page Header -->
    <div class="page-header">
      <h2 class="page-title">
        <el-icon><Money /></el-icon>
        提现管理
      </h2>
    </div>

    <!-- Stats Cards -->
    <el-row :gutter="16" class="stats-row">
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #ecf5ff; color: #409eff;">
            <el-icon><Wallet /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">¥{{ stats.totalAmount || '0.00' }}</div>
            <div class="stat-label">提现总额</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #fdf6ec; color: #e6a23c;">
            <el-icon><Timer /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.pendingCount || 0 }}</div>
            <div class="stat-label">待审核</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #f0f9ff; color: #67c23a;">
            <el-icon><CircleCheck /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.completedCount || 0 }}</div>
            <div class="stat-label">已完成</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #fef0f0; color: #f56c6c;">
            <el-icon><CircleClose /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.rejectedCount || 0 }}</div>
            <div class="stat-label">已拒绝</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Filters -->
    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" :model="query" class="filter-form">
        <el-form-item>
          <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 150px;">
            <el-option label="待审核" value="pending">
              <el-icon style="margin-right: 4px;"><Timer /></el-icon>待审核
            </el-option>
            <el-option label="已通过" value="approved">
              <el-icon style="margin-right: 4px;"><Check /></el-icon>已通过
            </el-option>
            <el-option label="已拒绝" value="rejected">
              <el-icon style="margin-right: 4px;"><Close /></el-icon>已拒绝
            </el-option>
            <el-option label="已打款" value="completed">
              <el-icon style="margin-right: 4px;"><CircleCheck /></el-icon>已打款
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon> 搜索
          </el-button>
          <el-button @click="resetFilter">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Table -->
    <el-card class="table-card" shadow="never">
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column type="index" label="序号" width="60" align="center" />
        <el-table-column label="申请人" min-width="180">
          <template #default="{ row }">
            <div class="applicant-info">
              <el-avatar :size="36" :src="row.user?.avatar_url" />
              <div class="applicant-detail">
                <div class="name">{{ row.user?.nickname || '未知用户' }}</div>
                <div class="id">ID: {{ row.user_id }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="提现金额" width="130">
          <template #default="{ row }">
            <span class="amount-highlight">¥{{ Number(row.amount).toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="提现方式" width="120">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" :type="getMethodType(row.method)">
              {{ row.method }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="账户信息" min-width="180">
          <template #default="{ row }">
            <div class="account-info">
              <el-icon><User /></el-icon>
              <span>{{ row.account_info }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small" effect="light">
              <el-icon style="margin-right: 4px;"><component :is="getStatusIcon(row.status)" /></el-icon>
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="170">
          <template #default="{ row }">
            <div class="time-info">
              <el-icon><Clock /></el-icon>
              {{ formatTime(row.createdAt) }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="200">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button-group>
                <el-button type="success" size="small" @click="handleApprove(row)">
                  <el-icon><Check /></el-icon>通过
                </el-button>
                <el-button type="danger" size="small" @click="handleReject(row)">
                  <el-icon><Close /></el-icon>拒绝
                </el-button>
              </el-button-group>
            </template>
            <template v-else-if="row.status === 'approved'">
              <el-button type="primary" size="small" @click="handleComplete(row)">
                <el-icon><Check /></el-icon>确认打款
              </el-button>
            </template>
            <el-button v-else link type="info" size="small">
              <el-icon><View /></el-icon>查看详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- Pagination -->
      <div class="pagination-wrapper">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          :page-size="query.limit"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getWithdrawals, approveWithdrawal, rejectWithdrawal, completeWithdrawal } from '@/api/finance'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  Money, Wallet, Timer, CircleCheck, CircleClose, Search, Check, Close, 
  View, User, Clock 
} from '@element-plus/icons-vue'

const list = ref([])
const total = ref(0)
const loading = ref(false)
const stats = ref({
  totalAmount: 0,
  pendingCount: 0,
  completedCount: 0,
  rejectedCount: 0
})

const query = reactive({
  page: 1,
  limit: 10,
  status: ''
})

const getStatusText = (status) => {
  const map = { pending: '待审核', approved: '待打款', rejected: '已拒绝', completed: '已打款' }
  return map[status] || status
}

const getStatusType = (status) => {
  const map = { pending: 'warning', approved: 'primary', rejected: 'danger', completed: 'success' }
  return map[status] || ''
}

const getStatusIcon = (status) => {
  const map = { 
    pending: 'Timer', 
    approved: 'Check', 
    rejected: 'Close', 
    completed: 'CircleCheck' 
  }
  return map[status] || 'InfoFilled'
}

const getMethodType = (method) => {
  const map = { 
    '微信': 'success', 
    '支付宝': 'primary', 
    '银行卡': 'warning' 
  }
  return map[method] || ''
}

const formatTime = (time) => {
  if (!time) return '-'
  return new Date(time).toLocaleString()
}

const loadData = async () => {
  loading.value = true
  try {
    const res = await getWithdrawals(query)
    list.value = res.list
    total.value = res.pagination.total
    if (res.stats) {
      stats.value = res.stats
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  query.page = 1
  loadData()
}

const resetFilter = () => {
  query.status = ''
  query.page = 1
  loadData()
}

const handlePageChange = (val) => {
  query.page = val
  loadData()
}

const handleSizeChange = (val) => {
  query.limit = val
  query.page = 1
  loadData()
}

const handleApprove = (row) => {
  ElMessageBox.confirm(
    `<div style="text-align: center;">
      <p>确认通过 <strong>${row.user?.nickname}</strong> 的提现申请吗？</p>
      <p style="color: #f56c6c; font-size: 18px; margin-top: 10px;">¥${Number(row.amount).toFixed(2)}</p>
    </div>`,
    '审核通过',
    { 
      type: 'success',
      dangerouslyUseHTMLString: true,
      confirmButtonText: '确认通过',
      cancelButtonText: '取消'
    }
  ).then(async () => {
    try {
      await approveWithdrawal(row.id)
      ElMessage.success('已通过申请')
      loadData()
    } catch (error) {
      console.error(error)
    }
  })
}

const handleReject = (row) => {
  ElMessageBox.prompt(
    `<div style="margin-bottom: 10px;">拒绝 <strong>${row.user?.nickname}</strong> 的提现申请</div>
     <div style="color: #f56c6c; margin-bottom: 10px;">金额: ¥${Number(row.amount).toFixed(2)}</div>`,
    '拒绝提现',
    {
      inputPlaceholder: '请输入拒绝原因（必填）',
      inputValidator: (val) => val ? true : '请输入拒绝原因',
      type: 'warning',
      dangerouslyUseHTMLString: true,
      confirmButtonText: '确认拒绝',
      cancelButtonText: '取消'
    }
  ).then(async ({ value }) => {
    try {
      await rejectWithdrawal(row.id, value)
      ElMessage.success('已拒绝申请')
      loadData()
    } catch (error) {
      console.error(error)
    }
  })
}

const handleComplete = (row) => {
  ElMessageBox.confirm(
    `<div style="text-align: center;">
      <p>确认已向 <strong>${row.user?.nickname}</strong> 打款？</p>
      <p style="color: #67c23a; font-size: 18px; margin-top: 10px;">¥${Number(row.amount).toFixed(2)}</p>
    </div>`,
    '确认打款',
    { 
      type: 'success',
      dangerouslyUseHTMLString: true,
      confirmButtonText: '确认已打款',
      cancelButtonText: '取消'
    }
  ).then(async () => {
    try {
      await completeWithdrawal(row.id)
      ElMessage.success('打款完成')
      loadData()
    } catch (error) {
      console.error(error)
    }
  })
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.withdrawal-page {
  padding: 20px;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  display: flex;
  align-items: center;
  padding: 16px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  margin-right: 12px;
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: #303133;
  line-height: 1.2;
}

.stat-label {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
}

.filter-card {
  margin-bottom: 20px;
}

.filter-form {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.table-card {
  margin-bottom: 20px;
}

.applicant-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.applicant-detail {
  min-width: 0;
}

.applicant-detail .name {
  font-weight: 600;
  color: #303133;
}

.applicant-detail .id {
  font-size: 12px;
  color: #909399;
}

.amount-highlight {
  color: #f56c6c;
  font-weight: 700;
  font-size: 15px;
}

.account-info {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #606266;
}

.time-info {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #606266;
  font-size: 13px;
}

.pagination-wrapper {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>