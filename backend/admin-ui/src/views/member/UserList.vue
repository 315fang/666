<template>
  <div class="user-list-page">
    <!-- Page Header -->
    <div class="page-header">
      <h2 class="page-title">
        <el-icon><User /></el-icon>
        用户管理
      </h2>
    </div>

    <!-- Filters -->
    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" :model="query" class="filter-form">
        <el-form-item>
          <el-input 
            v-model="query.keyword" 
            placeholder="昵称/邀请码/OpenID" 
            clearable
            style="width: 220px;"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-select v-model="query.role_level" placeholder="角色筛选" clearable style="width: 140px;">
            <el-option label="普通用户" value="0" />
            <el-option label="会员" value="1" />
            <el-option label="团长" value="2" />
            <el-option label="代理商" value="3" />
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

    <!-- Stats Cards -->
    <el-row :gutter="16" class="stats-row">
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #ecf5ff; color: #409eff;">
            <el-icon><User /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.total || 0 }}</div>
            <div class="stat-label">总用户数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #f0f9ff; color: #67c23a;">
            <el-icon><Star /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.members || 0 }}</div>
            <div class="stat-label">会员用户</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #fdf6ec; color: #e6a23c;">
            <el-icon><Trophy /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.leaders || 0 }}</div>
            <div class="stat-label">团长</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #fef0f0; color: #f56c6c;">
            <el-icon><Medal /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.agents || 0 }}</div>
            <div class="stat-label">代理商</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Table -->
    <el-card class="table-card" shadow="never">
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="用户信息" min-width="200">
          <template #default="{ row }">
            <div class="user-info">
              <el-avatar :src="row.avatar_url" :size="40" class="user-avatar" />
              <div class="user-detail">
                <div class="user-name">{{ row.nickname || '微信用户' }}</div>
                <div class="user-code" v-if="row.invite_code">
                  <el-tag size="small" type="info" effect="plain">邀请码: {{ row.invite_code }}</el-tag>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="角色" width="100">
          <template #default="{ row }">
            <el-tag :type="getRoleType(row.role_level)" size="small" effect="light">
              {{ getRoleText(row.role_level) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="余额" width="120">
          <template #default="{ row }">
            <span class="amount-text">¥{{ Number(row.balance || 0).toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="云库存" width="100">
          <template #default="{ row }">
            <el-tag 
              :type="row.role_level >= 3 ? 'warning' : 'info'" 
              size="small"
              effect="plain"
            >
              {{ row.stock_count || 0 }} 件
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="订单/业绩" width="150">
          <template #default="{ row }">
            <div class="order-stats">
              <div class="order-count">
                <el-icon><ShoppingBag /></el-icon>
                {{ row.order_count || 0 }}
              </div>
              <div class="sales-amount">
                业绩: ¥{{ Number(row.total_sales || 0).toFixed(2) }}
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="上级推荐" width="130">
          <template #default="{ row }">
            <div v-if="row.parent" class="parent-info">
              <el-avatar :src="row.parent.avatar_url" :size="24" />
              <span class="parent-name">{{ row.parent.nickname }}</span>
            </div>
            <span v-else class="no-parent">无</span>
          </template>
        </el-table-column>
        <el-table-column label="注册时间" width="170">
          <template #default="{ row }">
            <div class="time-info">
              <el-icon><Clock /></el-icon>
              {{ formatTime(row.created_at || row.createdAt) }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="220">
          <template #default="{ row }">
            <el-button-group>
              <el-button type="primary" size="small" plain @click="showRoleDialog(row)">
                <el-icon><Edit /></el-icon>等级
              </el-button>
              <el-button 
                type="warning" 
                size="small" 
                plain 
                @click="showStockDialog(row)" 
                v-if="row.role_level >= 3"
              >
                <el-icon><Box /></el-icon>库存
              </el-button>
              <el-button type="info" size="small" plain @click="showDetailDrawer(row)">
                <el-icon><View /></el-icon>详情
              </el-button>
            </el-button-group>
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

    <!-- Role Dialog -->
    <el-dialog v-model="roleDialogVisible" title="调整分销等级" width="420px" destroy-on-close>
      <el-form label-width="90px" class="role-form">
        <el-form-item label="当前用户">
          <div class="current-user">
            <el-avatar :src="currentUser?.avatar_url" :size="40" />
            <div class="user-meta">
              <div class="name">{{ currentUser?.nickname }}</div>
              <div class="id">ID: {{ currentUser?.id }}</div>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="当前等级">
          <el-tag :type="getRoleType(currentUser?.role_level)" size="large" effect="light">
            {{ getRoleText(currentUser?.role_level) }}
          </el-tag>
        </el-form-item>
        <el-form-item label="调整为">
          <el-select v-model="newRoleLevel" style="width: 100%;">
            <el-option label="普通用户" :value="0" />
            <el-option label="会员 (LV1)" :value="1" />
            <el-option label="团长 (LV2)" :value="2" />
            <el-option label="代理商 (LV3)" :value="3" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleUpdateRole">确认调整</el-button>
      </template>
    </el-dialog>

    <!-- Stock Dialog -->
    <el-dialog v-model="stockDialogVisible" title="代理商库存管理" width="480px" destroy-on-close>
      <el-form label-width="100px" class="stock-form">
        <el-form-item label="代理商">
          <div class="stock-user">
            <el-avatar :src="stockUser?.avatar_url" :size="40" />
            <div class="user-meta">
              <div class="name">{{ stockUser?.nickname }}</div>
              <div class="id">ID: {{ stockUser?.id }}</div>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="当前库存">
          <el-tag type="warning" size="large" effect="dark">
            {{ stockUser?.stock_count || 0 }} 件
          </el-tag>
        </el-form-item>
        <el-form-item label="操作类型">
          <el-radio-group v-model="stockAction">
            <el-radio-button label="add">
              <el-icon><Plus /></el-icon> 补充库存
            </el-radio-button>
            <el-radio-button label="reduce">
              <el-icon><Minus /></el-icon> 扣减库存
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="调整数量">
          <el-input-number v-model="stockAmount" :min="1" :max="99999" style="width: 150px;" />
        </el-form-item>
        <el-form-item label="操作备注">
          <el-input 
            v-model="stockReason" 
            placeholder="选填，如：打款补货、退货扣减等" 
            maxlength="100"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="stockDialogVisible = false">取消</el-button>
        <el-button :type="stockAction === 'add' ? 'primary' : 'danger'" @click="handleUpdateStock">
          确认{{ stockAction === 'add' ? '补充' : '扣减' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- User Detail Drawer -->
    <el-drawer v-model="detailDrawerVisible" title="用户详情" size="460px" destroy-on-close>
      <template v-if="detailUser">
        <div class="detail-header">
          <el-avatar :src="detailUser.avatar_url" :size="80" class="detail-avatar" />
          <div class="detail-title">
            <h3>{{ detailUser.nickname || '微信用户' }}</h3>
            <el-tag :type="getRoleType(detailUser.role_level)" size="small" effect="light">
              {{ getRoleText(detailUser.role_level) }}
            </el-tag>
          </div>
        </div>
        
        <el-descriptions :column="1" border size="default" class="detail-descriptions">
          <el-descriptions-item label="用户ID">
            <el-tag type="info" effect="plain" size="small">{{ detailUser.id }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="邀请码">
            <span v-if="detailUser.invite_code">{{ detailUser.invite_code }}</span>
            <span v-else class="text-muted">未设置</span>
          </el-descriptions-item>
          <el-descriptions-item label="OpenID">
            <el-tag type="info" effect="plain" size="small" class="openid-tag">{{ detailUser.openid }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="账户余额">
            <span class="amount-highlight">¥{{ Number(detailUser.balance || 0).toFixed(2) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="云库存">
            <el-tag type="warning" effect="light" size="small">{{ detailUser.stock_count || 0 }} 件</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="订单统计">
            <div class="stat-inline">
              <span class="stat-item">
                <el-icon><ShoppingBag /></el-icon> 订单: {{ detailUser.order_count || 0 }}
              </span>
              <span class="stat-item">
                <el-icon><Money /></el-icon> 业绩: ¥{{ Number(detailUser.total_sales || 0).toFixed(2) }}
              </span>
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="上级推荐">
            <div v-if="detailUser.parent" class="parent-detail">
              <el-avatar :src="detailUser.parent.avatar_url" :size="28" />
              <span>{{ detailUser.parent.nickname }}</span>
              <el-tag type="info" size="small" effect="plain">ID: {{ detailUser.parent_id }}</el-tag>
            </div>
            <span v-else class="text-muted">无</span>
          </el-descriptions-item>
          <el-descriptions-item label="注册时间">
            <el-icon><Clock /></el-icon> {{ formatTime(detailUser.created_at || detailUser.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="加入团队" v-if="detailUser.joined_team_at">
            <el-icon><Calendar /></el-icon> {{ formatTime(detailUser.joined_team_at) }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="detail-actions">
          <el-button type="primary" @click="showRoleDialog(detailUser)">
            <el-icon><Edit /></el-icon> 调整等级
          </el-button>
          <el-button type="warning" @click="showStockDialog(detailUser)" v-if="detailUser.role_level >= 3">
            <el-icon><Box /></el-icon> 库存管理
          </el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getUsers, updateUserRole, updateUserStock } from '@/api/user'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  User, Search, Star, Trophy, Medal, ShoppingBag, Clock, Edit, Box, View, 
  Plus, Minus, Money, Calendar 
} from '@element-plus/icons-vue'

const list = ref([])
const total = ref(0)
const loading = ref(false)
const stats = ref({ total: 0, members: 0, leaders: 0, agents: 0 })

// Role Dialog
const roleDialogVisible = ref(false)
const currentUser = ref(null)
const newRoleLevel = ref(0)

// Stock Dialog
const stockDialogVisible = ref(false)
const stockUser = ref(null)
const stockAction = ref('add')
const stockAmount = ref(100)
const stockReason = ref('')

// Detail Drawer
const detailDrawerVisible = ref(false)
const detailUser = ref(null)

const query = reactive({
  page: 1,
  limit: 10,
  keyword: '',
  role_level: ''
})

const getRoleText = (level) => {
  const map = { 0: '普通用户', 1: '会员', 2: '团长', 3: '代理商' }
  return map[level] || '未知'
}

const getRoleType = (level) => {
  const map = { 0: 'info', 1: 'success', 2: 'warning', 3: 'danger' }
  return map[level] || ''
}

const formatTime = (time) => {
  if (!time) return '-'
  return new Date(time).toLocaleString()
}

const loadData = async () => {
  loading.value = true
  try {
    const params = { ...query }
    if (params.role_level === '') delete params.role_level
    const res = await getUsers(params)
    list.value = res.list
    total.value = res.pagination.total
    // Update stats if provided by API
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
  query.keyword = ''
  query.role_level = ''
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

// --- Role Management ---
const showRoleDialog = (row) => {
  currentUser.value = row
  newRoleLevel.value = row.role_level
  roleDialogVisible.value = true
}

const handleUpdateRole = async () => {
  try {
    await updateUserRole(currentUser.value.id, newRoleLevel.value)
    ElMessage.success('等级调整成功')
    roleDialogVisible.value = false
    loadData()
  } catch (error) {
    console.error(error)
  }
}

// --- Stock Management ---
const showStockDialog = (row) => {
  stockUser.value = row
  stockAction.value = 'add'
  stockAmount.value = 100
  stockReason.value = ''
  stockDialogVisible.value = true
}

const handleUpdateStock = async () => {
  const change = stockAction.value === 'add' ? stockAmount.value : -stockAmount.value
  const actionText = stockAction.value === 'add' ? '补充' : '扣减'

  try {
    await ElMessageBox.confirm(
      `确认为 ${stockUser.value.nickname} ${actionText} ${stockAmount.value} 件库存？`,
      '确认操作',
      { type: stockAction.value === 'add' ? 'info' : 'warning' }
    )
    const res = await updateUserStock(stockUser.value.id, change, stockReason.value)
    ElMessage.success(`${actionText}成功！当前库存: ${res.new_stock} 件`)
    stockDialogVisible.value = false
    loadData()
  } catch (error) {
    if (error !== 'cancel') console.error(error)
  }
}

// --- User Detail ---
const showDetailDrawer = (row) => {
  detailUser.value = row
  detailDrawerVisible.value = true
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.user-list-page {
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

.filter-card {
  margin-bottom: 20px;
}

.filter-form {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
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
  font-size: 24px;
  font-weight: 700;
  color: #303133;
  line-height: 1.2;
}

.stat-label {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
}

.table-card {
  margin-bottom: 20px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-avatar {
  flex-shrink: 0;
  border: 2px solid #f0f2f5;
}

.user-detail {
  min-width: 0;
}

.user-name {
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.user-code {
  font-size: 12px;
}

.amount-text {
  color: #f56c6c;
  font-weight: 600;
}

.order-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.order-count {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  color: #409eff;
}

.sales-amount {
  font-size: 12px;
  color: #909399;
}

.parent-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.parent-name {
  font-size: 13px;
  color: #606266;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.no-parent {
  color: #c0c4cc;
  font-style: italic;
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

.role-form .current-user,
.stock-form .stock-user {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 8px;
}

.user-meta .name {
  font-weight: 600;
  color: #303133;
}

.user-meta .id {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.detail-header {
  text-align: center;
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #ebeef5;
}

.detail-avatar {
  border: 3px solid #f0f2f5;
  box-shadow: 0 2px 12px rgba(0,0,0,0.1);
}

.detail-title {
  margin-top: 12px;
}

.detail-title h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
}

.detail-descriptions {
  margin-bottom: 24px;
}

.text-muted {
  color: #c0c4cc;
}

.amount-highlight {
  color: #f56c6c;
  font-weight: 700;
  font-size: 16px;
}

.stat-inline {
  display: flex;
  gap: 16px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.parent-detail {
  display: flex;
  align-items: center;
  gap: 8px;
}

.openid-tag {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}
</style>