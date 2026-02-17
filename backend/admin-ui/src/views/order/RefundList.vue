<template>
  <div class="refund-page">
    <!-- Page Header -->
    <div class="page-header">
      <h2 class="page-title">
        <el-icon><RefreshLeft /></el-icon>
        售后管理
      </h2>
    </div>

    <!-- Stats Cards -->
    <el-row :gutter="16" class="stats-row">
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #ecf5ff; color: #409eff;">
            <el-icon><Document /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.total || 0 }}</div>
            <div class="stat-label">售后总数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #fdf6ec; color: #e6a23c;">
            <el-icon><Timer /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.pending || 0 }}</div>
            <div class="stat-label">待处理</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #f0f9ff; color: #67c23a;">
            <el-icon><CircleCheck /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.approved || 0 }}</div>
            <div class="stat-label">已同意</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #fef0f0; color: #f56c6c;">
            <el-icon><CircleClose /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.rejected || 0 }}</div>
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
            <el-option label="待处理" value="pending">
              <el-icon style="margin-right: 4px;"><Timer /></el-icon>待处理
            </el-option>
            <el-option label="已同意" value="approved">
              <el-icon style="margin-right: 4px;"><Check /></el-icon>已同意
            </el-option>
            <el-option label="已拒绝" value="rejected">
              <el-icon style="margin-right: 4px;"><Close /></el-icon>已拒绝
            </el-option>
            <el-option label="已完成" value="completed">
              <el-icon style="margin-right: 4px;"><CircleCheck /></el-icon>已完成
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
        <el-table-column label="关联订单" min-width="180">
          <template #default="{ row }">
            <div class="order-info">
              <div class="order-no">
                <el-icon><Document /></el-icon>
                {{ row.order?.order_no || '-' }}
              </div>
              <div class="order-product" v-if="row.order?.product">
                <el-avatar :size="32" :src="getProductImage(row.order.product)" shape="square" />
                <span class="product-name">{{ row.order.product.name }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="申请人" width="150">
          <template #default="{ row }">
            <div class="applicant-info">
              <el-avatar :size="32" :src="row.user?.avatar_url" />
              <span>{{ row.user?.nickname || '未知用户' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="退款金额" width="120">
          <template #default="{ row }">
            <span class="amount-highlight">¥{{ Number(row.amount).toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="退款原因" min-width="180">
          <template #default="{ row }">
            <div class="reason-box">
              <el-icon><Warning /></el-icon>
              <span>{{ row.reason }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
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
                  <el-icon><Check /></el-icon>同意
                </el-button>
                <el-button type="danger" size="small" @click="handleReject(row)">
                  <el-icon><Close /></el-icon>拒绝
                </el-button>
              </el-button-group>
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
import { getRefunds, approveRefund, rejectRefund } from '@/api/order'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  RefreshLeft, Document, Timer, CircleCheck, CircleClose, Search, Check, Close,
  View, Warning, Clock
} from '@element-plus/icons-vue'

const list = ref([])
const total = ref(0)
const loading = ref(false)
const stats = ref({
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0
})

const query = reactive({
  page: 1,
  limit: 10,
  status: ''
})

const getStatusText = (status) => {
  const map = { pending: '待处理', approved: '已同意', rejected: '已拒绝', completed: '已完成' }
  return map[status] || status
}

const getStatusType = (status) => {
  const map = { pending: 'warning', approved: 'success', rejected: 'danger', completed: 'info' }
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

const getProductImage = (product) => {
  if (!product?.images) return ''
  const images = typeof product.images === 'string' 
    ? JSON.parse(product.images) 
    : product.images
  return images?.[0] || ''
}

const formatTime = (time) => {
  if (!time) return '-'
  return new Date(time).toLocaleString()
}

const loadData = async () => {
  loading.value = true
  try {
    const res = await getRefunds(query)
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
      <p>确认同意该退款申请吗？</p>
      <p style="color: #f56c6c; font-size: 18px; margin-top: 10px;">¥${Number(row.amount).toFixed(2)}</p>
      <p style="color: #909399; font-size: 13px; margin-top: 8px;">订单号: ${row.order?.order_no || '-'}</p>
    </div>`,
    '同意退款',
    { 
      type: 'warning',
      dangerouslyUseHTMLString: true,
      confirmButtonText: '确认同意',
      cancelButtonText: '取消'
    }
  ).then(async () => {
    try {
      await approveRefund(row.id)
      ElMessage.success('已同意退款申请')
      loadData()
    } catch (error) {
      console.error(error)
    }
  })
}

const handleReject = (row) => {
  ElMessageBox.prompt(
    `<div style="margin-bottom: 10px;">拒绝退款申请</div>
     <div style="color: #f56c6c; margin-bottom: 10px;">金额: ¥${Number(row.amount).toFixed(2)}</div>`,
    '拒绝退款',
    {
      inputPlaceholder: '请输入拒绝原因（必填）',
      inputValidator: (val) => val ? true : '请输入拒绝原因',
      type: 'error',
      dangerouslyUseHTMLString: true,
      confirmButtonText: '确认拒绝',
      cancelButtonText: '取消'
    }
  ).then(async ({ value }) => {
    try {
      await rejectRefund(row.id, value)
      ElMessage.success('已拒绝退款申请')
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
.refund-page {
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

.order-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.order-no {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #409eff;
  font-family: monospace;
}

.order-product {
  display: flex;
  align-items: center;
  gap: 8px;
}

.product-name {
  font-size: 13px;
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 150px;
}

.applicant-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.amount-highlight {
  color: #f56c6c;
  font-weight: 700;
  font-size: 15px;
}

.reason-box {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 6px;
  color: #606266;
  font-size: 13px;
}

.reason-box .el-icon {
  margin-top: 2px;
  color: #e6a23c;
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
