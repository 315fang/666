<template>
  <div class="users-page">
    <!-- 搜索栏 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm">
        <el-form-item label="会员编号">
          <el-input v-model="searchForm.member_no" placeholder="M20260xxxxx" clearable style="width:160px" />
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="searchForm.keyword" placeholder="昵称 / 手机号 / 邀请码" clearable style="width:200px" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="searchForm.role_level" placeholder="全部" clearable style="width:120px">
            <el-option label="普通用户" :value="0" />
            <el-option label="会员" :value="1" />
            <el-option label="团长" :value="2" />
            <el-option label="代理商" :value="3" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部" clearable style="width:100px">
            <el-option label="正常" :value="1" />
            <el-option label="已封禁" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 表格 -->
    <el-card style="margin-top:16px">
      <template #header>
        <div class="card-header">
          <span>用户列表</span>
          <div class="header-actions">
            <template v-if="selectedIds.length > 0">
              <el-select v-model="batchRole" placeholder="批量设置角色" size="small" style="width:130px">
                <el-option label="普通用户" :value="0" />
                <el-option label="会员" :value="1" />
                <el-option label="团长" :value="2" />
                <el-option label="代理商" :value="3" />
              </el-select>
              <el-button size="small" type="primary" @click="handleBatchRole" :disabled="batchRole === null">
                批量升级 ({{ selectedIds.length }})
              </el-button>
              <el-divider direction="vertical" />
            </template>
            <el-button size="small" @click="fetchUsers">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="tableData" v-loading="loading" stripe @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="45" />
        <el-table-column label="头像/昵称" min-width="160">
          <template #default="{ row }">
            <div class="user-cell">
              <el-avatar :src="row.avatar_url" :size="32" />
              <div>
                <div class="user-name">{{ row.nickname || '-' }}</div>
                <div class="member-no">{{ row.member_no || '未生成' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="120">
          <template #default="{ row }">{{ row.phone || '-' }}</template>
        </el-table-column>
        <el-table-column label="角色" width="90">
          <template #default="{ row }">
            <el-tag :type="roleTagType(row.role_level)" size="small">{{ roleText(row.role_level) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="余额" width="100">
          <template #default="{ row }">
            <span class="amount">¥{{ Number(row.balance||0).toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="累计消费" width="110">
          <template #default="{ row }">
            <span>¥{{ Number(row.total_sales||0).toFixed(0) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="直推/成长值" width="100">
          <template #default="{ row }">
            <div>推 {{ row.referee_count || 0 }} 人</div>
            <div class="sub-text">{{ Number(row.growth_value||0).toFixed(0) }}成长值</div>
          </template>
        </el-table-column>
        <el-table-column label="邀请码" width="90">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ row.invite_code || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 0 ? 'danger' : 'success'" size="small">
              {{ row.status === 0 ? '封禁' : '正常' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="注册时间" width="105">
          <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="openDetail(row)">详情</el-button>
            <el-button text type="warning" size="small" @click="openBalance(row)">余额</el-button>
            <el-button text size="small" @click="openRoleEdit(row)">升级</el-button>
            <el-dropdown size="small" @command="(cmd) => handleDropdown(cmd, row)">
              <el-button text size="small">更多<el-icon><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="invite">修改邀请码</el-dropdown-item>
                  <el-dropdown-item command="remark">备注/标签</el-dropdown-item>
                  <el-dropdown-item command="parent">修改上级</el-dropdown-item>
                  <el-dropdown-item :command="row.status === 1 ? 'ban' : 'unban'" :class="row.status === 1 ? 'danger-item' : ''">
                    {{ row.status === 1 ? '封禁账号' : '解封账号' }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page" v-model:page-size="pagination.limit"
        :total="pagination.total" :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="fetchUsers" @current-change="fetchUsers"
        style="margin-top:20px; justify-content:flex-end"
      />
    </el-card>

    <!-- ===== 用户详情抽屉 ===== -->
    <el-drawer v-model="detailVisible" :title="`用户详情 · ${detailUser?.nickname || ''}`" size="600px">
      <template v-if="detailUser">
        <el-tabs v-model="detailTab">
          <el-tab-pane label="基本信息" name="info">
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="会员编号" :span="2">
                <el-tag type="primary">{{ detailUser.member_no || '未生成' }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="昵称">{{ detailUser.nickname }}</el-descriptions-item>
              <el-descriptions-item label="手机号">{{ detailUser.phone || '-' }}</el-descriptions-item>
              <el-descriptions-item label="角色">
                <el-tag :type="roleTagType(detailUser.role_level)">{{ roleText(detailUser.role_level) }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="账号状态">
                <el-tag :type="detailUser.status === 0 ? 'danger' : 'success'">{{ detailUser.status === 0 ? '封禁' : '正常' }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="余额">¥{{ Number(detailUser.balance||0).toFixed(2) }}</el-descriptions-item>
              <el-descriptions-item label="累计消费">¥{{ Number(detailUser.total_sales||0).toFixed(2) }}</el-descriptions-item>
              <el-descriptions-item label="成长值">{{ Number(detailUser.growth_value||0).toFixed(0) }}</el-descriptions-item>
              <el-descriptions-item label="折扣比例">{{ ((detailUser.discount_rate||1) * 10).toFixed(1) }}折</el-descriptions-item>
              <el-descriptions-item label="订单数">{{ detailUser.order_count || 0 }}</el-descriptions-item>
              <el-descriptions-item label="直推人数">{{ detailUser.referee_count || 0 }}</el-descriptions-item>
              <el-descriptions-item label="邀请码">{{ detailUser.invite_code || '-' }}</el-descriptions-item>
              <el-descriptions-item label="上级">{{ detailUser.parent?.nickname || '无' }}</el-descriptions-item>
              <el-descriptions-item label="云库存（代理）">{{ detailUser.stock_count || 0 }}</el-descriptions-item>
              <el-descriptions-item label="欠款">¥{{ Number(detailUser.debt_amount||0).toFixed(2) }}</el-descriptions-item>
              <el-descriptions-item label="注册时间" :span="2">{{ formatDate(detailUser.created_at) }}</el-descriptions-item>
              <el-descriptions-item label="最后登录" :span="2">{{ formatDate(detailUser.last_login) }}</el-descriptions-item>
              <el-descriptions-item label="内部备注" :span="2">{{ detailUser.remark || '-' }}</el-descriptions-item>
            </el-descriptions>

            <div v-if="detailStats" style="margin-top:16px">
              <el-statistic title="总佣金收益" :value="detailStats.totalCommission" prefix="¥" />
            </div>
          </el-tab-pane>

          <el-tab-pane label="直推团队 (下级)" name="team">
            <el-table :data="teamData" stripe size="small" v-loading="teamLoading">
              <el-table-column label="昵称" prop="nickname" />
              <el-table-column label="角色">
                <template #default="{ row }">
                  <el-tag size="small" :type="roleTagType(row.role_level)">{{ roleText(row.role_level) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="加入时间">
                <template #default="{ row }">
                  {{ formatDate(row.joined_team_at || row.created_at) }}
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-drawer>

    <!-- ===== 余额调整 Dialog ===== -->
    <el-dialog v-model="balanceVisible" title="调整用户余额" width="420px">
      <el-form :model="balanceForm" label-width="90px">
        <el-form-item label="当前余额">
          <span class="amount">¥{{ Number(currentUser?.balance||0).toFixed(2) }}</span>
        </el-form-item>
        <el-form-item label="操作类型">
          <el-radio-group v-model="balanceForm.type">
            <el-radio value="add">充值（+）</el-radio>
            <el-radio value="subtract">扣减（-）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="金额">
          <el-input-number v-model="balanceForm.amount" :min="0.01" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="balanceForm.reason" placeholder="请填写操作原因，将记录日志" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="balanceVisible = false">取消</el-button>
        <el-button type="primary" @click="submitBalance" :loading="submitting">确认操作</el-button>
      </template>
    </el-dialog>

    <!-- ===== 角色修改 Dialog ===== -->
    <el-dialog v-model="roleVisible" title="修改用户角色" width="360px">
      <el-form :model="roleForm" label-width="80px">
        <el-form-item label="用户">{{ currentUser?.nickname }}</el-form-item>
        <el-form-item label="当前角色">
          <el-tag :type="roleTagType(currentUser?.role_level)">{{ roleText(currentUser?.role_level) }}</el-tag>
        </el-form-item>
        <el-form-item label="新角色">
          <el-select v-model="roleForm.role_level" style="width:100%">
            <el-option label="普通用户" :value="0" />
            <el-option label="会员" :value="1" />
            <el-option label="团长" :value="2" />
            <el-option label="代理商" :value="3" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleVisible = false">取消</el-button>
        <el-button type="primary" @click="submitRole" :loading="submitting">确认</el-button>
      </template>
    </el-dialog>

    <!-- ===== 备注/标签 Dialog ===== -->
    <el-dialog v-model="remarkVisible" title="备注 / 标签" width="420px">
      <el-form :model="remarkForm" label-width="80px">
        <el-form-item label="内部备注">
          <el-input v-model="remarkForm.remark" type="textarea" :rows="3" placeholder="仅管理员可见" />
        </el-form-item>
        <el-form-item label="内部标签">
          <el-tag
            v-for="tag in remarkForm.tags" :key="tag"
            closable @close="removeTag(tag)"
            style="margin-right:6px; margin-bottom:4px"
          >{{ tag }}</el-tag>
          <el-input
            v-if="tagInputVisible" ref="tagInputRef"
            v-model="tagInputValue" size="small" style="width:100px"
            @keyup.enter="addTag" @blur="addTag"
          />
          <el-button v-else size="small" @click="showTagInput">+ 添加标签</el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="remarkVisible = false">取消</el-button>
        <el-button type="primary" @click="submitRemark" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>

    <!-- ===== 修改邀请码 Dialog ===== -->
    <el-dialog v-model="inviteVisible" title="修改邀请码" width="380px">
      <el-form :model="inviteForm" label-width="90px">
        <el-form-item label="当前邀请码">{{ currentUser?.invite_code || '-' }}</el-form-item>
        <el-form-item label="新邀请码">
          <el-input v-model="inviteForm.code" placeholder="留空则自动生成6位数字码" maxlength="6" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="inviteVisible = false">取消</el-button>
        <el-button type="primary" @click="submitInvite" :loading="submitting">确认</el-button>
      </template>
    </el-dialog>

    <!-- ===== 修改上级 Dialog ===== -->
    <el-dialog v-model="parentVisible" title="修改上级绑定" width="380px">
      <el-alert type="warning" :closable="false" style="margin-bottom:16px">
        修改上级后，原上级直推人数-1，新上级+1，请谨慎操作。
      </el-alert>
      <el-form :model="parentForm" label-width="90px">
        <el-form-item label="当前上级">{{ currentUser?.parent?.nickname || '无' }}</el-form-item>
        <el-form-item label="新上级ID">
          <el-input v-model="parentForm.new_parent_id" placeholder="输入用户ID，留空为解绑" />
        </el-form-item>
        <el-form-item label="操作原因">
          <el-input v-model="parentForm.reason" placeholder="必填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="parentVisible = false">取消</el-button>
        <el-button type="primary" @click="submitParent" :loading="submitting">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, nextTick, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, ArrowDown } from '@element-plus/icons-vue'
import request from '@/utils/request'
import dayjs from 'dayjs'

// ===== 列表 =====
const loading = ref(false)
const tableData = ref([])
const pagination = reactive({ page: 1, limit: 20, total: 0 })
const searchForm = reactive({ keyword: '', member_no: '', role_level: '', status: '' })
const selectedIds = ref([])
const batchRole = ref(null)

const fetchUsers = async () => {
  loading.value = true
  try {
    const params = {
      keyword: searchForm.keyword || undefined,
      member_no: searchForm.member_no || undefined,
      role_level: searchForm.role_level !== '' ? searchForm.role_level : undefined,
      status: searchForm.status !== '' ? searchForm.status : undefined,
      page: pagination.page,
      limit: pagination.limit
    }
    const res = await request({ url: '/users', method: 'get', params })
    tableData.value = res.data?.list || res.list || []
    pagination.total = res.data?.pagination?.total || res.total || 0
  } finally {
    loading.value = false
  }
}

const handleSearch = () => { pagination.page = 1; fetchUsers() }
const handleReset = () => {
  Object.assign(searchForm, { keyword: '', member_no: '', role_level: '', status: '' })
  handleSearch()
}
const handleSelectionChange = (rows) => { selectedIds.value = rows.map(r => r.id) }

// ===== 批量升级 =====
const handleBatchRole = async () => {
  if (batchRole.value === null) return
  await ElMessageBox.confirm(`将 ${selectedIds.value.length} 个用户角色设为「${roleText(batchRole.value)}」？`, '批量操作', { type: 'warning' })
  await request({ url: '/users/batch-role', method: 'post', data: { user_ids: selectedIds.value, role_level: batchRole.value } })
  ElMessage.success('批量更新成功')
  batchRole.value = null
  fetchUsers()
}

// ===== 详情抽屉 =====
const detailVisible = ref(false)
const detailUser = ref(null)
const detailStats = ref(null)
const detailTab = ref('info')

const teamData = ref([])
const teamLoading = ref(false)

// 监听 Tab 切换，如果在查看团队就加载
watch(detailTab, async (val) => {
  if (val === 'team' && detailUser.value && teamData.value.length === 0) {
    teamLoading.value = true
    try {
      const res = await request({ url: `/users/${detailUser.value.id}/team`, method: 'get', params: { page: 1, limit: 100 } })
      teamData.value = res.data?.list || []
    } catch(e) {} finally {
      teamLoading.value = false
    }
  }
})

const openDetail = async (row) => {
  detailUser.value = row
  detailStats.value = null
  detailTab.value = 'info'
  teamData.value = [] // clear loaded team
  detailVisible.value = true
  try {
    const res = await request({ url: `/users/${row.id}`, method: 'get' })
    const data = res.data || res
    detailUser.value = data.user || data
    detailStats.value = data.stats
  } catch (e) { console.error(e) }
}

// ===== 余额调整 =====
const balanceVisible = ref(false)
const submitting = ref(false)
const currentUser = ref(null)
const balanceForm = reactive({ type: 'add', amount: 10, reason: '' })

const openBalance = (row) => {
  currentUser.value = row
  Object.assign(balanceForm, { type: 'add', amount: 10, reason: '' })
  balanceVisible.value = true
}

const submitBalance = async () => {
  if (!balanceForm.reason.trim()) return ElMessage.warning('请填写操作原因')
  submitting.value = true
  try {
    await request({ url: `/users/${currentUser.value.id}/balance`, method: 'put', data: balanceForm })
    ElMessage.success('余额操作成功')
    balanceVisible.value = false
    fetchUsers()
  } finally { submitting.value = false }
}

// ===== 角色修改 =====
const roleVisible = ref(false)
const roleForm = reactive({ role_level: 0 })

const openRoleEdit = (row) => {
  currentUser.value = row
  roleForm.role_level = row.role_level
  roleVisible.value = true
}

const submitRole = async () => {
  submitting.value = true
  try {
    await request({ url: `/users/${currentUser.value.id}/role`, method: 'put', data: { role_level: roleForm.role_level } })
    ElMessage.success('角色更新成功')
    roleVisible.value = false
    fetchUsers()
  } finally { submitting.value = false }
}

// ===== 备注标签 =====
const remarkVisible = ref(false)
const remarkForm = reactive({ remark: '', tags: [] })
const tagInputVisible = ref(false)
const tagInputValue = ref('')
const tagInputRef = ref()

const openRemark = (row) => {
  currentUser.value = row
  let tags = []
  try { tags = row.tags ? JSON.parse(row.tags) : [] } catch {}
  Object.assign(remarkForm, { remark: row.remark || '', tags })
  remarkVisible.value = true
}

const showTagInput = () => {
  tagInputVisible.value = true
  nextTick(() => tagInputRef.value?.focus())
}
const addTag = () => {
  if (tagInputValue.value && !remarkForm.tags.includes(tagInputValue.value)) {
    remarkForm.tags.push(tagInputValue.value)
  }
  tagInputVisible.value = false
  tagInputValue.value = ''
}
const removeTag = (tag) => { remarkForm.tags = remarkForm.tags.filter(t => t !== tag) }

const submitRemark = async () => {
  submitting.value = true
  try {
    await request({ url: `/users/${currentUser.value.id}/remark`, method: 'put', data: { remark: remarkForm.remark, tags: remarkForm.tags } })
    ElMessage.success('备注已保存')
    remarkVisible.value = false
    fetchUsers()
  } finally { submitting.value = false }
}

// ===== 邀请码修改 =====
const inviteVisible = ref(false)
const inviteForm = reactive({ code: '' })

const openInvite = (row) => {
  currentUser.value = row
  inviteForm.code = ''
  inviteVisible.value = true
}
const submitInvite = async () => {
  submitting.value = true
  try {
    await request({ url: `/users/${currentUser.value.id}/invite-code`, method: 'put', data: { invite_code: inviteForm.code || undefined } })
    ElMessage.success('邀请码已更新')
    inviteVisible.value = false
    fetchUsers()
  } finally { submitting.value = false }
}

// ===== 修改上级 =====
const parentVisible = ref(false)
const parentForm = reactive({ new_parent_id: '', reason: '' })

const openParent = (row) => {
  currentUser.value = row
  Object.assign(parentForm, { new_parent_id: '', reason: '' })
  parentVisible.value = true
}
const submitParent = async () => {
  if (!parentForm.reason.trim()) return ElMessage.warning('请填写操作原因')
  submitting.value = true
  try {
    await request({ url: `/users/${currentUser.value.id}/parent`, method: 'put', data: { new_parent_id: parentForm.new_parent_id || null, reason: parentForm.reason } })
    ElMessage.success('上级关系已修改')
    parentVisible.value = false
    fetchUsers()
  } finally { submitting.value = false }
}

// ===== 封禁/解封 =====
const handleBan = async (row, ban) => {
  await ElMessageBox.confirm(`确认${ban ? '封禁' : '解封'}用户「${row.nickname}」？`, '操作确认', { type: 'warning' })
  await request({ url: `/users/${row.id}/status`, method: 'put', data: { status: ban ? 0 : 1, reason: ban ? '管理员封禁' : '管理员解封' } })
  ElMessage.success(ban ? '已封禁' : '已解封')
  fetchUsers()
}

// ===== Dropdown 分发 =====
const handleDropdown = (cmd, row) => {
  if (cmd === 'invite') openInvite(row)
  else if (cmd === 'remark') openRemark(row)
  else if (cmd === 'parent') openParent(row)
  else if (cmd === 'ban') handleBan(row, true)
  else if (cmd === 'unban') handleBan(row, false)
}

// ===== 工具函数 =====
const roleText = (r) => (['普通用户', '会员', '团长', '代理商'][r] ?? '-')
const roleTagType = (r) => (['', 'success', 'warning', 'danger'][r] ?? '')
const formatDate = (d) => d ? dayjs(d).format('MM-DD HH:mm') : '-'

onMounted(fetchUsers)
</script>

<style scoped>
.users-page { display: flex; flex-direction: column; gap: 0; }
.search-card { border-radius: 8px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.header-actions { display: flex; align-items: center; gap: 8px; }

.user-cell { display: flex; align-items: center; gap: 8px; }
.user-name { font-size: 13px; font-weight: 500; color: #1a1a2e; }
.member-no { font-size: 11px; color: #909399; font-family: monospace; margin-top: 1px; }
.sub-text { font-size: 11px; color: #c0c4cc; }
.amount { font-weight: 600; color: #f56c6c; }

:deep(.danger-item) { color: var(--el-color-danger) !important; }
</style>
