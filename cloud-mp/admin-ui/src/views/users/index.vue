<template>
  <div class="users-page">
    <UserSearchPanel
      :search-form="searchForm"
      :leader-search-loading="leaderSearchLoading"
      :leader-options="leaderOptions"
      :remote-search-leaders="remoteSearchLeaders"
      :on-open-team-summary="openTeamSummary"
      :on-search="handleSearch"
      :on-reset="handleReset"
    />

    <UserListTableCard
      :table-data="tableData"
      :loading="loading"
      :selected-ids="selectedIds"
      :batch-role="batchRole"
      :pagination="pagination"
      :can-adjust-user-balance="canAdjustUserBalance"
      :can-manage-user-role="canManageUserRole"
      :can-manage-user-parent="canManageUserParent"
      :can-manage-user-status="canManageUserStatus"
      :role-text="roleText"
      :role-tag-type="roleTagType"
      :purchase-level-text="purchaseLevelText"
      :format-date="formatDate"
      :on-selection-change="handleSelectionChange"
      :on-batch-role-change="handleBatchRoleChange"
      :on-batch-role="handleBatchRole"
      :on-refresh="fetchUsers"
      :on-open-detail="openDetail"
      :on-open-balance="openBalance"
      :on-open-role-edit="openRoleEdit"
      :on-open-purchase-level="openPurchaseLevel"
      :on-dropdown="handleDropdown"
    />

    <TeamSummaryDialog
      :visible="teamSummaryVisible"
      :loading="teamSummaryLoading"
      :data="teamSummaryData"
      :range="teamSummaryRange"
      :on-visibility-change="(value) => { teamSummaryVisible = value }"
      :on-opened="onTeamSummaryOpened"
      :on-closed="onTeamSummaryClosed"
      :on-range-change="(value) => { teamSummaryRange = value; loadTeamSummary() }"
      :on-apply-filter="applyTeamListFilter"
    />

    <UserDetailDrawer
      :visible="detailVisible"
      :detail-user="detailUser"
      :detail-tab="detailTab"
      :detail-stats="detailStats"
      :detail-tag-list="detailTagList"
      :detail-avg-order-amount="detailAvgOrderAmount"
      :detail-team-preview="detailTeamPreview"
      :commerce-saving="commerceSaving"
      :team-data="teamData"
      :team-loading="teamLoading"
      :role-text="roleText"
      :role-tag-type="roleTagType"
      :purchase-level-text="purchaseLevelText"
      :format-date="formatDate"
      :on-visibility-change="handleDetailVisibilityChange"
      :on-tab-change="handleDetailTabChange"
      :on-commerce-toggle="onCommerceToggle"
      :on-open-parent-detail="openParentDetail"
      :on-open-team-summary="openTeamSummaryFromDetail"
      :on-go-team-member-list="goTeamMemberListFromDetail"
    />

    <UserActionDialogsPrimary
      :current-user="currentUser"
      :submitting="submitting"
      :balance-visible="balanceVisible"
      :balance-form="balanceForm"
      :purchase-level-visible="purchaseLevelVisible"
      :purchase-level-form="purchaseLevelForm"
      :purchase-level-options="purchaseLevelOptions"
      :role-visible="roleVisible"
      :role-form="roleForm"
      :purchase-level-text="purchaseLevelText"
      :role-text="roleText"
      :role-tag-type="roleTagType"
      :on-balance-visibility-change="handleBalanceVisibilityChange"
      :on-purchase-level-visibility-change="handlePurchaseLevelVisibilityChange"
      :on-role-visibility-change="handleRoleVisibilityChange"
      :on-submit-balance="submitBalance"
      :on-submit-purchase-level="submitPurchaseLevel"
      :on-submit-role="submitRole"
    />

    <!-- 统一账户调整弹窗 -->
    <UserBalanceAdjustDialog
      v-model:visible="accountAdjustVisible"
      :user="currentUser"
      :init-account="accountAdjustInitType"
      :role-text="roleText"
      :role-tag-type="roleTagType"
      @success="fetchUsers"
    />

    <UserActionDialogsSecondary
      :current-user="currentUser"
      :submitting="submitting"
      :remark-visible="remarkVisible"
      :remark-form="remarkForm"
      :tag-input-visible="tagInputVisible"
      :tag-input-value="tagInputValue"
      :invite-visible="inviteVisible"
      :invite-form="inviteForm"
      :member-no-visible="memberNoVisible"
      :member-no-form="memberNoForm"
      :parent-visible="parentVisible"
      :parent-form="parentForm"
      :on-show-tag-input="showTagInput"
      :on-add-tag="addTag"
      :on-remove-tag="removeTag"
      :on-submit-remark="submitRemark"
      :on-submit-invite="submitInvite"
      :on-submit-member-no="submitMemberNo"
      :on-submit-parent="submitParent"
      @update:remark-visible="(value) => { remarkVisible = value }"
      @update:invite-visible="(value) => { inviteVisible = value }"
      @update:member-no-visible="(value) => { memberNoVisible = value }"
      @update:parent-visible="(value) => { parentVisible = value }"
      @update:tag-input-value="(value) => { tagInputValue = value }"
    />
  </div>
</template>

<script setup>
import { ref, reactive, nextTick, onMounted, watch, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, ArrowDown } from '@element-plus/icons-vue'
import UserBalanceAdjustDialog from './components/UserBalanceAdjustDialog.vue'
import {
  getUsers,
  getUserById,
  getUserTeam,
  getUserTeamSummary,
  getMemberTierConfig,
  updateUserRole,
  updateUserPurchaseLevel,
  adjustUserBalance,
  updateUserStatus,
  updateUsersBatchRole,
  updateUserMemberNo,
  updateUserRemark,
  updateUserCommerce,
  updateUserInviteCode,
  updateUserParent
} from '@/api'
import UserSearchPanel from './components/UserSearchPanel.vue'
import UserListTableCard from './components/UserListTableCard.vue'
import TeamSummaryDialog from './components/TeamSummaryDialog.vue'
import UserDetailDrawer from './components/UserDetailDrawer.vue'
import UserActionDialogsPrimary from './components/UserActionDialogsPrimary.vue'
import UserActionDialogsSecondary from './components/UserActionDialogsSecondary.vue'
import { usePagination } from '@/composables/usePagination'
import { formatDateShort as formatDate } from '@/utils/format'
import { getUserNickname, normalizeUserDisplay } from '@/utils/userDisplay'
import { useUserStore } from '@/store/user'
import { useRoute } from 'vue-router'

// ===== 列表 =====
const route = useRoute()
const loading = ref(false)
const userStore = useUserStore()
const tableData = ref([])
const { pagination, resetPage, applyResponse } = usePagination()
/**
 * 搜索字段说明：
 *  keyword     - 昵称 / 手机号 / 会员码，后端模糊匹配；支持从订单页跳转时携带 ?keyword=xxx 预填
 *  member_no   - 精确匹配 8 位会员码（比 keyword 优先级高，建议已知会员码时使用）
 *  role_level  - 用户角色等级（0普通 1会员 2团长 3代理 4合伙人 5区域代理）
 *  status      - 账号状态（active/disabled）
 *  team_leader_id - 按所属负责人 ID 筛选，远程搜索后选择
 */
const searchForm = reactive({ keyword: String(route.query.keyword || ''), member_no: '', role_level: '', status: '', team_leader_id: '' })
const leaderOptions = ref([])
const leaderSearchLoading = ref(false)
const teamSummaryVisible = ref(false)
const teamSummaryLoading = ref(false)
const teamSummaryData = ref(null)
const teamSummaryRange = ref('all')
/** 弹窗当前针对的负责人 ID（列表筛选或详情进入） */
const teamSummaryActiveId = ref(null)
const displayUser = (user) => normalizeUserDisplay(user || {})
const displayUserName = (user, fallback = '-') => getUserNickname(displayUser(user), fallback)
const selectedIds = ref([])
const batchRole = ref(null)
const canAdjustUserBalance = computed(() => userStore.hasPermission('user_balance_adjust'))
const canManageUserRole = computed(() => userStore.hasPermission('user_role_manage'))
const canManageUserParent = computed(() => userStore.hasPermission('user_parent_manage'))
const canManageUserStatus = computed(() => userStore.hasPermission('user_status_manage'))
const purchaseLevelOptions = ref([])

const fetchPurchaseLevels = async () => {
  try {
    const res = await getMemberTierConfig()
    const list = Array.isArray(res?.purchase_levels) ? res.purchase_levels : []
    purchaseLevelOptions.value = list.filter(item => item.enabled !== false)
  } catch (e) {
    console.warn('加载拿货等级配置失败:', e)
    purchaseLevelOptions.value = []
  }
}

const fetchUsers = async () => {
  loading.value = true
  try {
    const params = {
      keyword: searchForm.keyword || undefined,
      member_no: searchForm.member_no || undefined,
      role_level: searchForm.role_level !== '' ? searchForm.role_level : undefined,
      status: searchForm.status !== '' ? searchForm.status : undefined,
      team_leader_id: searchForm.team_leader_id !== '' && searchForm.team_leader_id != null
        ? searchForm.team_leader_id
        : undefined,
      page: pagination.page,
      limit: pagination.limit
    }
    const res = await getUsers(params)
    tableData.value = res?.list || []
    applyResponse(res)
  } catch (e) {
    ElMessage.error(e?.message || '加载用户列表失败')
  } finally {
    loading.value = false
  }
}

const refreshUsers = () => fetchUsers()

const runUserMutation = async (task, successMessage, onSuccess) => {
  submitting.value = true
  try {
    await task()
    if (successMessage) {
      ElMessage.success(successMessage)
    }
    if (typeof onSuccess === 'function') {
      await onSuccess()
    }
    await refreshUsers()
  } catch (e) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

const handleSearch = () => { resetPage(); refreshUsers() }
const handleReset = () => {
  Object.assign(searchForm, { keyword: '', member_no: '', role_level: '', status: '', team_leader_id: '' })
  leaderOptions.value = []
  handleSearch()
}

let leaderSearchTimer = null
const remoteSearchLeaders = (query) => {
  if (leaderSearchTimer) clearTimeout(leaderSearchTimer)
  const q = String(query || '').trim()
  if (!q) {
    leaderOptions.value = []
    return
  }
  leaderSearchTimer = setTimeout(async () => {
    leaderSearchLoading.value = true
    try {
      const res = await getUsers({ keyword: q, limit: 20, page: 1 })
      leaderOptions.value = res?.list || []
    } catch {
      leaderOptions.value = []
    } finally {
      leaderSearchLoading.value = false
    }
  }, 300)
}

const loadTeamSummary = async () => {
  const id = teamSummaryActiveId.value ?? searchForm.team_leader_id
  if (!id) return
  teamSummaryLoading.value = true
  teamSummaryData.value = null
  try {
    const data = await getUserTeamSummary(id, { range: teamSummaryRange.value })
    teamSummaryData.value = data
  } catch (e) {
    ElMessage.error(e?.message || '加载团队概况失败')
  } finally {
    teamSummaryLoading.value = false
  }
}

const openTeamSummary = () => {
  if (!searchForm.team_leader_id) return
  teamSummaryActiveId.value = searchForm.team_leader_id
  teamSummaryVisible.value = true
}

const onTeamSummaryOpened = () => {
  loadTeamSummary()
}

const onTeamSummaryClosed = () => {
  teamSummaryActiveId.value = null
}

const openTeamSummaryFromDetail = () => {
  if (!detailUser.value?.id) return
  teamSummaryActiveId.value = detailUser.value.id
  teamSummaryVisible.value = true
}

const goTeamMemberListFromDetail = () => {
  if (!detailUser.value?.id) return
  const u = detailUser.value
  searchForm.team_leader_id = u.id
  if (!leaderOptions.value.some((x) => x.id === u.id)) {
    leaderOptions.value = [{ id: u.id, nickname: displayUserName(u, `用户#${u.id}`) }, ...leaderOptions.value]
  }
  detailVisible.value = false
  resetPage()
  refreshUsers()
  ElMessage.success('已按该用户为「团队负责人」筛选列表（全体后代）')
}

const applyTeamListFilter = () => {
  const lid = teamSummaryActiveId.value ?? searchForm.team_leader_id
  if (lid) {
    searchForm.team_leader_id = lid
    if (!leaderOptions.value.some((x) => x.id === lid)) {
      leaderOptions.value = [{ id: lid, nickname: `用户 #${lid}` }, ...leaderOptions.value]
    }
  }
  teamSummaryVisible.value = false
  resetPage()
  refreshUsers()
}
const handleSelectionChange = (rows) => { selectedIds.value = rows.map(r => r.id) }
const handleBatchRoleChange = (value) => { batchRole.value = value }

// ===== 批量升级 =====
const handleBatchRole = async () => {
  if (batchRole.value === null) return
  try {
    await ElMessageBox.confirm(`将 ${selectedIds.value.length} 个用户角色设为「${roleText(batchRole.value)}」？`, '批量操作', { type: 'warning' })
    await updateUsersBatchRole({ user_ids: selectedIds.value, role_level: batchRole.value })
    ElMessage.success('批量更新成功')
    batchRole.value = null
    refreshUsers()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.message || '批量更新失败')
  }
}

// ===== 详情抽屉 =====
const detailVisible = ref(false)
const detailUser = ref(null)
const detailStats = ref(null)
const detailTeamPreview = ref(null)
const detailTab = ref('info')

const teamData = ref([])
const teamLoading = ref(false)

const detailTagList = computed(() => {
  const raw = detailUser.value?.tags
  if (raw == null || raw === '') return []
  try {
    const t = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(t) ? t.map(String) : []
  } catch {
    return []
  }
})

const detailAvgOrderAmount = computed(() => {
  const oc = Number(detailUser.value?.order_count || 0)
  const ts = Number(detailUser.value?.total_sales || 0)
  if (oc <= 0) return '0.00'
  return (ts / oc).toFixed(2)
})

const handleDetailVisibilityChange = (value) => {
  detailVisible.value = value
}

const handleDetailTabChange = (value) => {
  detailTab.value = value
}

const handleBalanceVisibilityChange = (value) => {
  balanceVisible.value = value
}

const handlePurchaseLevelVisibilityChange = (value) => {
  purchaseLevelVisible.value = value
}

const handleRoleVisibilityChange = (value) => {
  roleVisible.value = value
}

// 监听 Tab 切换，如果在查看团队就加载
watch(detailTab, async (val) => {
  if (val === 'team' && detailUser.value && teamData.value.length === 0) {
    teamLoading.value = true
    try {
      const res = await getUserTeam(detailUser.value.id, { page: 1, limit: 100 })
      teamData.value = res?.list || []
    } catch (e) {
      ElMessage.error(e?.message || '加载团队数据失败')
    } finally {
      teamLoading.value = false
    }
  }
})

const openDetail = async (row) => {
  detailUser.value = row
  detailStats.value = null
  detailTeamPreview.value = null
  detailTab.value = 'info'
  teamData.value = []
  detailVisible.value = true
  try {
    const [full, teamSum] = await Promise.all([
      getUserById(row.id),
      getUserTeamSummary(row.id, { range: 'all' }).catch(() => null)
    ])
    const raw = full && typeof full === 'object' ? { ...full } : {}
    const stats = raw.stats
    delete raw.stats
    detailUser.value = raw
    detailStats.value = stats ?? null
    detailTeamPreview.value = teamSum
  } catch (e) {
    ElMessage.error(e?.message || '加载用户详情失败')
  }
}

const openParentDetail = async () => {
  const pid = detailUser.value?.parent?.id
  if (!pid) return
  await openDetail({
    id: pid,
    nickname: displayUserName(detailUser.value.parent, ''),
    member_no: '',
    avatar: '', avatar_url: '',
    phone: '',
    role_level: 0
  })
}

const commerceSaving = ref(false)
const onCommerceToggle = async (enabled) => {
  if (!detailUser.value?.id) return
  commerceSaving.value = true
  try {
    await updateUserCommerce(detailUser.value.id, { participate_distribution: enabled ? 1 : 0 })
    detailUser.value = { ...detailUser.value, participate_distribution: enabled ? 1 : 0 }
    ElMessage.success('已更新')
    refreshUsers()
  } catch (e) {
    ElMessage.error(e?.message || '更新失败')
  } finally {
    commerceSaving.value = false
  }
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
  await runUserMutation(
    () => adjustUserBalance(currentUser.value.id, balanceForm),
    '余额操作成功',
    () => { balanceVisible.value = false }
  )
}

// ===== 角色修改 =====
const roleVisible = ref(false)
const roleForm = reactive({ role_level: 0, agent_level: 1 })
const purchaseLevelVisible = ref(false)
const purchaseLevelForm = reactive({ purchase_level_code: null })

const openRoleEdit = (row) => {
  currentUser.value = row
  roleForm.role_level = row.role_level
  roleForm.agent_level = row.agent_level || 1
  roleVisible.value = true
}

const submitRole = async () => {
  await runUserMutation(async () => {
    const payload = { role_level: roleForm.role_level }
    if (roleForm.role_level === 3) payload.agent_level = roleForm.agent_level
    await updateUserRole(currentUser.value.id, payload)
  }, '角色更新成功', () => { roleVisible.value = false })
}

const openPurchaseLevel = (row) => {
  currentUser.value = row
  purchaseLevelForm.purchase_level_code = row.purchase_level_code || null
  purchaseLevelVisible.value = true
}

const submitPurchaseLevel = async () => {
  await runUserMutation(
    () => updateUserPurchaseLevel(currentUser.value.id, { purchase_level_code: purchaseLevelForm.purchase_level_code || null }),
    '拿货等级更新成功',
    () => { purchaseLevelVisible.value = false }
  )
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
  try { tags = row.tags ? JSON.parse(row.tags) : [] } catch (e) { console.warn('解析标签失败:', e) }
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
  await runUserMutation(
    () => updateUserRemark(currentUser.value.id, { remark: remarkForm.remark, tags: remarkForm.tags }),
    '备注已保存',
    () => { remarkVisible.value = false }
  )
}

// ===== 历史邀请码修改 =====
const inviteVisible = ref(false)
const inviteForm = reactive({ code: '' })

const openInvite = (row) => {
  currentUser.value = row
  inviteForm.code = ''
  inviteVisible.value = true
}
const submitInvite = async () => {
  await runUserMutation(
    () => updateUserInviteCode(currentUser.value.id, { invite_code: inviteForm.code || undefined }),
    '历史邀请码已更新',
    () => { inviteVisible.value = false }
  )
}

// ===== 会员码修改 =====
const memberNoVisible = ref(false)
const memberNoForm = reactive({ member_no: '' })

const openMemberNo = (row) => {
  currentUser.value = row
  memberNoForm.member_no = ''
  memberNoVisible.value = true
}
const submitMemberNo = async () => {
  await runUserMutation(
    () => updateUserMemberNo(currentUser.value.id, { member_no: memberNoForm.member_no || undefined }),
    '会员码已更新',
    () => { memberNoVisible.value = false }
  )
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
  await runUserMutation(
    () => updateUserParent(currentUser.value.id, { new_parent_id: parentForm.new_parent_id || null, reason: parentForm.reason }),
    '上级关系已修改',
    () => { parentVisible.value = false }
  )
}

// ===== 封禁/解封 =====
const handleBan = async (row, ban) => {
  try {
    await ElMessageBox.confirm(`确认${ban ? '封禁' : '解封'}用户「${displayUserName(row)}」？`, '操作确认', { type: 'warning' })
    await updateUserStatus(row.id, { status: ban ? 0 : 1, reason: ban ? '管理员封禁' : '管理员解封' })
    ElMessage.success(ban ? '已封禁' : '已解封')
    refreshUsers()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.message || '操作失败')
  }
}

// ===== 账户调整（货款/佣金/积分/成长值）=====
const accountAdjustVisible = ref(false)
const accountAdjustInitType = ref('goods_fund')

const openAccountAdjust = (row, accountType = 'goods_fund') => {
  currentUser.value = row
  accountAdjustInitType.value = accountType
  accountAdjustVisible.value = true
}

// ===== Dropdown 分发 =====
const handleDropdown = (cmd, row) => {
  if (cmd === 'invite') openInvite(row)
  else if (cmd === 'member_no') openMemberNo(row)
  else if (cmd === 'remark') openRemark(row)
  else if (cmd === 'parent') openParent(row)
  else if (cmd === 'ban') handleBan(row, true)
  else if (cmd === 'unban') handleBan(row, false)
  else if (cmd === 'account_adjust') openAccountAdjust(row)
}

// ===== 工具函数 =====
const roleText = (r) => (['普通用户', '会员', '团长', '代理商', '合伙人', '区域代理'][r] ?? '-')
const roleTagType = (r) => (['', 'success', 'warning', 'danger', 'danger', 'danger'][r] ?? '')
const purchaseLevelText = (code) => {
  if (!code) return '未设置'
  const hit = purchaseLevelOptions.value.find(item => item.code === code)
  return hit ? `${hit.name}(${hit.code})` : code
}

onMounted(async () => {
  await Promise.all([refreshUsers(), fetchPurchaseLevels()])
})
</script>

<style scoped>
.users-page { display: flex; flex-direction: column; gap: 0; }
.search-card { border-radius: 8px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.header-actions { display: flex; align-items: center; gap: 8px; }

.member-no { font-size: 11px; color: #909399; font-family: monospace; margin-top: 1px; }
.sub-text { font-size: 11px; color: #c0c4cc; }
.pagination-bar { margin-top: 20px; justify-content: flex-end; }
.agent-level-hint { margin-top: 4px; }

:deep(.danger-item) { color: var(--el-color-danger) !important; }

.detail-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 10px;
  padding-left: 8px;
  border-left: 3px solid var(--el-color-primary);
}
.sub-hint { font-size: 12px; color: #909399; line-height: 1.5; }
.mono-ellipsis {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, monospace;
  font-size: 12px;
}
.team-preview-row { margin-bottom: 4px; }
.mini-stat-card :deep(.el-card__body) { padding: 12px 14px; }
.mini-stat-label { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 6px; }
.mini-stat-value { font-size: 15px; font-weight: 600; color: var(--el-text-color-primary); word-break: break-all; }
</style>
