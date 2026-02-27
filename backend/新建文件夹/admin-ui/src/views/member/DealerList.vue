<template>
  <div class="dealer-page">
    <!-- Page Header -->
    <div class="page-header">
      <h2 class="page-title">
        <el-icon><OfficeBuilding /></el-icon>
        经销商管理
      </h2>
    </div>

    <!-- Stats Cards -->
    <el-row :gutter="16" class="stats-row">
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #ecf5ff; color: #409eff;">
            <el-icon><OfficeBuilding /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.total || 0 }}</div>
            <div class="stat-label">申请总数</div>
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
            <div class="stat-value">{{ stats.approved || 0 }}</div>
            <div class="stat-label">已通过</div>
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
          <el-select v-model="query.status" placeholder="审核状态" clearable style="width: 150px;">
            <el-option label="待审核" value="pending">
              <el-icon style="margin-right: 4px;"><Timer /></el-icon>待审核
            </el-option>
            <el-option label="已通过" value="approved">
              <el-icon style="margin-right: 4px;"><CircleCheck /></el-icon>已通过
            </el-option>
            <el-option label="已拒绝" value="rejected">
              <el-icon style="margin-right: 4px;"><CircleClose /></el-icon>已拒绝
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
        <el-table-column label="公司信息" min-width="220">
          <template #default="{ row }">
            <div class="company-info">
              <div class="company-name">
                <el-icon><OfficeBuilding /></el-icon>
                {{ row.company_name }}
              </div>
              <div class="company-meta">
                <el-tag size="small" type="info" effect="plain">
                  <el-icon><User /></el-icon>
                  {{ row.contact_name }}
                </el-tag>
                <el-tag size="small" type="info" effect="plain">
                  <el-icon><Phone /></el-icon>
                  {{ row.contact_phone }}
                </el-tag>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="申请人" width="150">
          <template #default="{ row }">
            <div class="applicant-info" v-if="row.user">
              <el-avatar :size="32" :src="row.user.avatar_url" />
              <span>{{ row.user.nickname }}</span>
            </div>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="审核状态" width="120">
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
            <template v-else>
              <el-button link type="primary" size="small" @click="showDetail(row)">
                <el-icon><View /></el-icon>查看详情
              </el-button>
            </template>
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

    <!-- Detail Drawer -->
    <el-drawer v-model="detailDrawerVisible" title="经销商详情" size="420px">
      <template v-if="currentDealer">
        <div class="detail-header">
          <div class="detail-title">{{ currentDealer.company_name }}</div>
          <el-tag :type="getStatusType(currentDealer.status)" size="small" effect="light">
            {{ getStatusText(currentDealer.status) }}
          </el-tag>
        </div>
        
        <el-descriptions :column="1" border size="default" class="detail-descriptions">
          <el-descriptions-item label="公司名称">
            {{ currentDealer.company_name }}
          </el-descriptions-item>
          <el-descriptions-item label="联系人">
            <el-icon><User /></el-icon> {{ currentDealer.contact_name }}
          </el-descriptions-item>
          <el-descriptions-item label="联系电话">
            <el-icon><Phone /></el-icon> {{ currentDealer.contact_phone }}
          </el-descriptions-item>
          <el-descriptions-item label="申请时间">
            <el-icon><Clock /></el-icon> {{ formatTime(currentDealer.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="申请状态">
            <el-tag :type="getStatusType(currentDealer.status)" effect="light">
              {{ getStatusText(currentDealer.status) }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <div class="detail-actions" v-if="currentDealer.status === 'pending'">
          <el-button type="success" @click="handleApprove(currentDealer)">
            <el-icon><Check /></el-icon> 通过申请
          </el-button>
          <el-button type="danger" @click="handleReject(currentDealer)">
            <el-icon><Close /></el-icon> 拒绝申请
          </el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getDealers, approveDealer, rejectDealer } from '@/api/dealer'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  OfficeBuilding, Timer, CircleCheck, CircleClose, Search, Check, Close, 
  View, User, Phone, Clock 
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

const detailDrawerVisible = ref(false)
const currentDealer = ref(null)

const getStatusText = (status) => {
  const map = { pending: '待审核', approved: '已通过', rejected: '已拒绝' }
  return map[status] || status
}

const getStatusType = (status) => {
  const map = { pending: 'warning', approved: 'success', rejected: 'danger' }
  return map[status] || ''
}

const getStatusIcon = (status) => {
  const map = { pending: 'Timer', approved: 'CircleCheck', rejected: 'CircleClose' }
  return map[status] || 'InfoFilled'
}

const formatTime = (time) => {
  if (!time) return '-'
  return new Date(time).toLocaleString()
}

const loadData = async () => {
  loading.value = true
  try {
    const res = await getDealers(query)
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

const showDetail = (row) => {
  currentDealer.value = row
  detailDrawerVisible.value = true
}

const handleApprove = (row) => {
  ElMessageBox.confirm(
    `<div style="text-align: center;">
      <p>确认通过 <strong>${row.company_name}</strong> 的经销商申请吗？</p>
      <p style="color: #909399; font-size: 13px; margin-top: 8px;">联系人: ${row.contact_name}</p>
    </div>`,
    '通过申请',
    { 
      type: 'success',
      dangerouslyUseHTMLString: true,
      confirmButtonText: '确认通过',
      cancelButtonText: '取消'
    }
  ).then(async () => {
    try {
      await approveDealer(row.id)
      ElMessage.success('已通过申请')
      detailDrawerVisible.value = false
      loadData()
    } catch (error) {
      console.error(error)
    }
  })
}

const handleReject = (row) => {
  ElMessageBox.confirm(
    `<div style="text-align: center;">
      <p>确认拒绝 <strong>${row.company_name}</strong> 的经销商申请吗？</p>
      <p style="color: #f56c6c; font-size: 13px; margin-top: 8px;">此操作不可撤销</p>
    </div>`,
    '拒绝申请',
    { 
      type: 'error',
      dangerouslyUseHTMLString: true,
      confirmButtonText: '确认拒绝',
      cancelButtonText: '取消'
    }
  ).then(async () => {
    try {
      await rejectDealer(row.id)
      ElMessage.success('已拒绝申请')
      detailDrawerVisible.value = false
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
.dealer-page {
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

.company-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.company-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #303133;
  font-size: 14px;
}

.company-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.company-meta .el-tag {
  display: flex;
  align-items: center;
  gap: 4px;
}

.applicant-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.text-muted {
  color: #c0c4cc;
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

.detail-header {
  text-align: center;
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #ebeef5;
}

.detail-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}

.detail-descriptions {
  margin-bottom: 24px;
}

.detail-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}
</style>