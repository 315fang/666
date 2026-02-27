<template>
  <div class="distributor-page">
    <!-- Page Header -->
    <div class="page-header">
      <h2 class="page-title">
        <el-icon><Share /></el-icon>
        分销员管理
      </h2>
    </div>

    <!-- Stats Cards -->
    <el-row :gutter="16" class="stats-row">
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #ecf5ff; color: #409eff;">
            <el-icon><User /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.total || 0 }}</div>
            <div class="stat-label">分销员总数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #f0f9ff; color: #67c23a;">
            <el-icon><Medal /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.level1 || 0 }}</div>
            <div class="stat-label">会员(LV1)</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #fdf6ec; color: #e6a23c;">
            <el-icon><Trophy /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.level2 || 0 }}</div>
            <div class="stat-label">团长(LV2)</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #fef0f0; color: #f56c6c;">
            <el-icon><Star /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.level3 || 0 }}</div>
            <div class="stat-label">合伙人(LV3)</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Filters -->
    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" :model="query" class="filter-form">
        <el-form-item>
          <el-select v-model="query.role_level" placeholder="全部等级" clearable style="width: 150px;">
            <el-option label="会员 (LV1)" :value="1">
              <el-tag size="small" type="success" effect="light" style="margin-right: 4px;">LV1</el-tag>
              会员
            </el-option>
            <el-option label="团长 (LV2)" :value="2">
              <el-tag size="small" type="warning" effect="light" style="margin-right: 4px;">LV2</el-tag>
              团长
            </el-option>
            <el-option label="合伙人 (LV3)" :value="3">
              <el-tag size="small" type="danger" effect="light" style="margin-right: 4px;">LV3</el-tag>
              合伙人
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
        <el-table-column label="分销员" min-width="200">
          <template #default="{ row }">
            <div class="distributor-info">
              <el-avatar :src="row.avatar_url" :size="42" class="distributor-avatar" />
              <div class="distributor-detail">
                <div class="name">{{ row.nickname }}</div>
                <el-tag :type="getRoleType(row.role_level)" size="small" effect="light">
                  {{ getRoleText(row.role_level) }}
                </el-tag>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="累计佣金" width="130">
          <template #default="{ row }">
            <div class="commission-text">
              <el-icon><Money /></el-icon>
              ¥{{ Number(row.wallet?.total_income || 0).toFixed(2) }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="可提现余额" width="130">
          <template #default="{ row }">
            <div class="balance-text">
              <el-icon><Wallet /></el-icon>
              ¥{{ Number(row.wallet?.balance || 0).toFixed(2) }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="团队人数" width="100">
          <template #default="{ row }">
            <div class="team-count">
              <el-icon><UserFilled /></el-icon>
              <span>{{ row.team_count || row.team?.length || 0 }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="上级推荐" width="130">
          <template #default="{ row }">
            <div class="parent-info" v-if="row.parent">
              <el-avatar :size="28" :src="row.parent.avatar_url" />
              <span class="name">{{ row.parent.nickname }}</span>
            </div>
            <span v-else class="no-parent">平台直推</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="200">
          <template #default="{ row }">
            <el-button-group>
              <el-button type="primary" size="small" plain @click="showRoleDialog(row)">
                <el-icon><Edit /></el-icon>等级
              </el-button>
              <el-button type="info" size="small" plain @click="showTeam(row)">
                <el-icon><View /></el-icon>团队
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
            <el-avatar :src="currentUser?.avatar_url" :size="44" />
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
            <el-option label="合伙人 (LV3)" :value="3" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleUpdateRole">确认调整</el-button>
      </template>
    </el-dialog>

    <!-- Team Drawer -->
    <el-drawer v-model="teamDrawerVisible" title="团队详情" size="500px">
      <template v-if="currentUser">
        <div class="team-header">
          <el-avatar :src="currentUser.avatar_url" :size="60" />
          <div class="team-header-info">
            <div class="name">{{ currentUser.nickname }}</div>
            <el-tag :type="getRoleType(currentUser.role_level)" size="small" effect="light">
              {{ getRoleText(currentUser.role_level) }}
            </el-tag>
            <div class="team-stats">
              <span>团队人数: <strong>{{ currentUser.team?.length || 0 }}</strong></span>
              <span>累计佣金: <strong>¥{{ Number(currentUser.wallet?.total_income || 0).toFixed(2) }}</strong></span>
            </div>
          </div>
        </div>

        <el-divider />

        <div class="team-list" v-if="currentUser.team && currentUser.team.length > 0">
          <div class="team-item" v-for="member in currentUser.team" :key="member.id">
            <el-avatar :src="member.avatar_url" :size="40" />
            <div class="member-info">
              <div class="name">{{ member.nickname }}</div>
              <el-tag size="small" :type="getRoleType(member.role_level)" effect="plain">
                {{ getRoleText(member.role_level) }}
              </el-tag>
            </div>
            <div class="member-commission">
              贡献: ¥{{ Number(member.total_commission || 0).toFixed(2) }}
            </div>
          </div>
        </div>
        <el-empty v-else description="暂无团队成员" />
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getUsers, updateUserRole } from '@/api/user'
import { ElMessage } from 'element-plus'
import { 
  Share, User, Medal, Trophy, Star, Search, Edit, View, 
  Money, Wallet, UserFilled 
} from '@element-plus/icons-vue'

const list = ref([])
const total = ref(0)
const loading = ref(false)
const stats = ref({
  total: 0,
  level1: 0,
  level2: 0,
  level3: 0
})

const query = reactive({
  page: 1,
  limit: 10,
  role_level: ''
})

const roleDialogVisible = ref(false)
const teamDrawerVisible = ref(false)
const currentUser = ref(null)
const newRoleLevel = ref(0)

const getRoleText = (level) => {
  const map = { 0: '普通用户', 1: '会员', 2: '团长', 3: '合伙人' }
  return map[level] || '未知'
}

const getRoleType = (level) => {
  const map = { 0: 'info', 1: 'success', 2: 'warning', 3: 'danger' }
  return map[level] || ''
}

const loadData = async () => {
  loading.value = true
  try {
    const params = { ...query }
    if (params.role_level === '') {
      params.role_level = '1,2,3'
    }
    const res = await getUsers(params)
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

const showTeam = (row) => {
  currentUser.value = row
  teamDrawerVisible.value = true
}

onMounted(() => {
  query.role_level = '1,2,3'
  loadData()
})
</script>

<style scoped>
.distributor-page {
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

.distributor-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.distributor-avatar {
  flex-shrink: 0;
  border: 2px solid #f0f2f5;
}

.distributor-detail {
  min-width: 0;
}

.distributor-detail .name {
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.commission-text {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #67c23a;
  font-weight: 600;
}

.balance-text {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #e6a23c;
  font-weight: 600;
}

.team-count {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #409eff;
  font-weight: 600;
}

.parent-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.parent-info .name {
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
  font-size: 13px;
}

.pagination-wrapper {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.role-form .current-user {
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

.team-header {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 20px;
}

.team-header-info {
  flex: 1;
}

.team-header-info .name {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}

.team-stats {
  margin-top: 12px;
  display: flex;
  gap: 20px;
  font-size: 13px;
  color: #606266;
}

.team-stats strong {
  color: #303133;
}

.team-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.team-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 8px;
}

.member-info {
  flex: 1;
  min-width: 0;
}

.member-info .name {
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.member-commission {
  color: #67c23a;
  font-weight: 600;
  font-size: 13px;
}
</style>