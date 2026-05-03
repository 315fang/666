<template>
  <div class="users-page">
    <UserSearchPanel
      :search-form="searchForm"
      :leader-search-loading="leaderSearchLoading"
      :leader-options="leaderOptions"
      :remote-search-leaders="remoteSearchLeaders"
      :team-level-stats="teamLevelStats"
      :team-level-stats-loading="teamLevelStatsLoading"
      :on-team-level-change="handleTeamLevelChange"
      :on-team-leader-change="handleTeamLeaderChange"
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
      :can-manage-purchase-level="canManagePurchaseLevel"
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
      :last-synced-at="lastSyncedText"
      :on-open-detail="openDetail"
      :on-open-role-edit="openRoleEdit"
      :on-open-purchase-level="openPurchaseLevel"
      :on-dropdown="handleDropdown"
    />

    <UserDetailDrawer
      :visible="detailVisible"
      :detail-user="detailUser"
      :detail-tab="detailTab"
      :detail-stats="detailStats"
      :detail-tag-list="detailTagList"
      :detail-avg-order-amount="detailAvgOrderAmount"
      :commerce-saving="commerceSaving"
      :profile-saving="profileSaving"
      :can-manage-user-portal-password="canManageUserPortalPassword"
      :portal-password-saving="portalPasswordSaving"
      :team-data="teamData"
      :team-loading="teamLoading"
      :role-text="roleText"
      :role-tag-type="roleTagType"
      :purchase-level-text="purchaseLevelText"
      :format-date="formatDate"
      :on-visibility-change="handleDetailVisibilityChange"
      :on-tab-change="handleDetailTabChange"
      :on-commerce-toggle="onCommerceToggle"
      :on-edit-real-name="onEditRealName"
      :on-open-parent-detail="openParentDetail"
      :on-go-team-member-list="goTeamMemberListFromDetail"
      :on-reset-portal-password="onResetPortalPassword"
      :on-unlock-portal-password="onUnlockPortalPassword"
    />

    <UserActionDialogsPrimary
      :current-user="currentUser"
      :submitting="submitting"
      :purchase-level-visible="purchaseLevelVisible"
      :purchase-level-form="purchaseLevelForm"
      :purchase-level-options="purchaseLevelOptions"
      :role-visible="roleVisible"
      :role-form="roleForm"
      :purchase-level-text="purchaseLevelText"
      :role-text="roleText"
      :role-tag-type="roleTagType"
      :on-purchase-level-visibility-change="handlePurchaseLevelVisibilityChange"
      :on-role-visibility-change="handleRoleVisibilityChange"
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

    <el-dialog v-model="visibilityVisible" :title="visibilityForm.visibility === 'hidden' ? '隐藏账号' : '恢复账号显示'" width="440px">
      <el-form :model="visibilityForm" label-width="90px">
        <el-form-item label="清理分类" required>
          <el-select v-model="visibilityForm.cleanup_category" :disabled="visibilityForm.visibility === 'visible'" style="width:100%">
            <el-option v-for="item in cleanupCategoryOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作原因" required>
          <el-input v-model="visibilityForm.reason" type="textarea" :rows="3" maxlength="200" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visibilityVisible = false">取消</el-button>
        <el-button :type="visibilityForm.visibility === 'hidden' ? 'warning' : 'primary'" @click="submitUserVisibility" :loading="submitting">
          {{ visibilityForm.visibility === 'hidden' ? '隐藏账号' : '恢复显示' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, nextTick, onMounted, watch, computed, h } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, ArrowDown } from '@element-plus/icons-vue'
import UserBalanceAdjustDialog from './components/UserBalanceAdjustDialog.vue'
import {
  getUsers,
  searchUsersLite,
  getUserById,
  getUserTeam,
  getMemberTierConfig,
  updateUserRole,
  updateUserPurchaseLevel,
  updateUserStatus,
  updateUsersBatchRole,
  updateUserMemberNo,
  updateUserRemark,
  updateUserProfile,
  updateUserCommerce,
  updateUserVisibility,
  updateUserInviteCode,
  updateUserParent,
  resetUserPortalPassword,
  unlockUserPortalPassword
} from '@/api'
import UserSearchPanel from './components/UserSearchPanel.vue'
import UserListTableCard from './components/UserListTableCard.vue'
import UserDetailDrawer from './components/UserDetailDrawer.vue'
import UserActionDialogsPrimary from './components/UserActionDialogsPrimary.vue'
import UserActionDialogsSecondary from './components/UserActionDialogsSecondary.vue'
import { usePagination } from '@/composables/usePagination'
import { formatDateShort as formatDate } from '@/utils/format'
import { getUserNickname, normalizeUserDisplay } from '@/utils/userDisplay'
import { useUserStore } from '@/store/user'
import { useRoute } from 'vue-router'
import { extractReadAt, mergeStrongSuccessMessage } from '@/api/consistency'

// ===== 列表 =====
const route = useRoute()
const loading = ref(false)
const userStore = useUserStore()
const tableData = ref([])
const lastSyncedAt = ref('')
const { pagination, resetPage, applyResponse } = usePagination()
/**
 * 搜索字段说明：
 *  keyword     - 昵称 / 手机号 / 会员码，后端模糊匹配；支持从订单页跳转时携带 ?keyword=xxx 预填
 *  member_no   - 精确匹配 8 位会员码（比 keyword 优先级高，建议已知会员码时使用）
 *  role_level  - 用户角色等级（0 VIP用户 1 初级会员 … 5 区域合伙人 6 线下实体门店）
 *  status      - 账号状态（active/disabled）
 *  team_leader_id - 按所属负责人 ID 筛选，远程搜索后选择
 *  team_level     - 团队筛选层级：1 一级直推，2 二级扩散
 *  lookup      - 精确匹配任意用户标识（跨页跳转专用，不暴露在表单里）
 */
const searchForm = reactive({ keyword: String(route.query.keyword || ''), member_no: '', role_level: '', status: '', team_leader_id: '', team_level: '1', include_hidden: false })
const routeLookup = ref(String(route.query.lookup || ''))
const leaderOptions = ref([])
const leaderSearchLoading = ref(false)
const teamLevelStats = reactive({ 1: null, 2: null })
const teamLevelStatsLoading = ref(false)
let teamLevelStatsSeq = 0
const displayUser = (user) => normalizeUserDisplay(user || {})
const displayUserName = (user, fallback = '-') => getUserNickname(displayUser(user), fallback)
const selectedIds = ref([])
const batchRole = ref(null)
const canAdjustUserBalance = computed(() => userStore.hasPermission('user_balance_adjust'))
const canManageUserRole = computed(() => userStore.hasPermission('user_role_manage'))
const canManagePurchaseLevel = computed(() => canManageUserRole.value && userStore.hasPermission('settings_manage'))
const canManageUserParent = computed(() => userStore.hasPermission('user_parent_manage'))
const canManageUserStatus = computed(() => userStore.hasPermission('user_status_manage'))
const canManageUserPortalPassword = computed(() => userStore.hasPermission('user_portal_password_manage'))
const purchaseLevelOptions = ref([])
const lastSyncedText = computed(() => lastSyncedAt.value ? formatDate(lastSyncedAt.value) : '')

const fetchPurchaseLevels = async () => {
  if (!canManagePurchaseLevel.value) {
    purchaseLevelOptions.value = []
    return
  }
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
      team_level: searchForm.team_leader_id ? (searchForm.team_level || '1') : undefined,
      include_hidden: searchForm.include_hidden ? '1' : undefined,
      lookup: routeLookup.value || undefined,
      page: pagination.page,
      limit: pagination.limit
    }
    const res = await getUsers(params)
    tableData.value = res?.list || []
    applyResponse(res)
    const readAt = extractReadAt(res)
    if (readAt) lastSyncedAt.value = readAt
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
    const result = await task()
    const readAt = extractReadAt(result)
    if (readAt) lastSyncedAt.value = readAt
    ElMessage.success(mergeStrongSuccessMessage(result, successMessage))
    if (typeof onSuccess === 'function') {
      await onSuccess(result)
    }
    await refreshUsers()
  } catch (e) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

const cleanupCategoryOptions = [
  { label: '游客清理', value: 'visitor_cleanup' },
  { label: '取消未支付噪音', value: 'cancelled_unpaid_noise' },
  { label: '无效用户噪音', value: 'invalid_user_noise' },
  { label: '手动清理', value: 'manual_cleanup' }
]
const cleanupCategoryText = (value) => cleanupCategoryOptions.find((item) => item.value === value)?.label || value || '手动清理'
const inferUserCleanupCategory = (row = {}) => {
  if (row.account_origin === 'auto_login') return 'visitor_cleanup'
  if (Number(row.order_count || 0) > 0 && Number(row.total_sales || 0) <= 0) return 'cancelled_unpaid_noise'
  return 'manual_cleanup'
}

const clearTeamLevelStats = () => {
  teamLevelStats[1] = null
  teamLevelStats[2] = null
}

const loadTeamLevelStats = async () => {
  const leaderId = searchForm.team_leader_id
  const seq = ++teamLevelStatsSeq
  if (!leaderId) {
    clearTeamLevelStats()
    teamLevelStatsLoading.value = false
    return
  }
  teamLevelStatsLoading.value = true
  try {
    const [firstLevel, secondLevel] = await Promise.all([
      getUserTeam(leaderId, { level: 1, page: 1, limit: 1 }),
      getUserTeam(leaderId, { level: 2, page: 1, limit: 1 })
    ])
    if (seq !== teamLevelStatsSeq) return
    teamLevelStats[1] = firstLevel?.total ?? firstLevel?.pagination?.total ?? 0
    teamLevelStats[2] = secondLevel?.total ?? secondLevel?.pagination?.total ?? 0
  } catch (e) {
    if (seq === teamLevelStatsSeq) clearTeamLevelStats()
  } finally {
    if (seq === teamLevelStatsSeq) teamLevelStatsLoading.value = false
  }
}

const handleSearch = () => {
  routeLookup.value = ''
  resetPage()
  loadTeamLevelStats()
  refreshUsers()
}
const handleReset = () => {
  routeLookup.value = ''
  Object.assign(searchForm, { keyword: '', member_no: '', role_level: '', status: '', team_leader_id: '', team_level: '1', include_hidden: false })
  leaderOptions.value = []
  clearTeamLevelStats()
  handleSearch()
}

let leaderSearchTimer = null
let leaderSearchSeq = 0
const remoteSearchLeaders = (query) => {
  if (leaderSearchTimer) clearTimeout(leaderSearchTimer)
  const q = String(query || '').trim()
  if (!q) {
    leaderSearchSeq += 1
    leaderOptions.value = []
    return
  }
  leaderSearchTimer = setTimeout(async () => {
    const seq = ++leaderSearchSeq
    leaderSearchLoading.value = true
    try {
      const res = await searchUsersLite({ keyword: q, limit: 20 })
      if (seq !== leaderSearchSeq) return
      leaderOptions.value = res?.list || []
    } catch {
      if (seq === leaderSearchSeq) leaderOptions.value = []
    } finally {
      if (seq === leaderSearchSeq) leaderSearchLoading.value = false
    }
  }, 300)
}

const handleTeamLevelChange = () => {
  if (!searchForm.team_leader_id) return
  resetPage()
  refreshUsers()
}

const handleTeamLeaderChange = () => {
  routeLookup.value = ''
  searchForm.team_level = searchForm.team_level || '1'
  resetPage()
  loadTeamLevelStats()
  refreshUsers()
}

const goTeamMemberListFromDetail = () => {
  if (!detailUser.value?.id) return
  const u = detailUser.value
  searchForm.team_leader_id = u.id
  searchForm.team_level = '1'
  if (!leaderOptions.value.some((x) => x.id === u.id)) {
    leaderOptions.value = [{ id: u.id, nickname: displayUserName(u, `用户#${u.id}`) }, ...leaderOptions.value]
  }
  detailVisible.value = false
  resetPage()
  loadTeamLevelStats()
  refreshUsers()
  ElMessage.success('已切到该用户的一级团队列表')
}
const handleSelectionChange = (rows) => { selectedIds.value = rows.map(r => r.id) }
const handleBatchRoleChange = (value) => { batchRole.value = value }

// ===== 批量升级 =====
const handleBatchRole = async () => {
  if (batchRole.value === null) return
  try {
    await ElMessageBox.confirm(`将 ${selectedIds.value.length} 个用户角色设为「${roleText(batchRole.value)}」？`, '批量操作', { type: 'warning' })
    const result = await updateUsersBatchRole({ user_ids: selectedIds.value, role_level: batchRole.value })
    const readAt = extractReadAt(result)
    if (readAt) lastSyncedAt.value = readAt
    ElMessage.success(mergeStrongSuccessMessage(result, `批量更新成功（${selectedIds.value.length} 人）`))
    batchRole.value = null
    selectedIds.value = []
    await refreshUsers()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.message || '批量更新失败')
  }
}

// ===== 详情抽屉 =====
const detailVisible = ref(false)
const detailUser = ref(null)
const detailStats = ref(null)
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

const applyDetailUserRecord = (record) => {
  if (!record || typeof record !== 'object') return
  const raw = { ...record }
  const stats = raw.stats ?? null
  delete raw.stats
  detailUser.value = raw
  detailStats.value = stats
}

const loadDetailUser = async (userId) => {
  const full = await getUserById(userId)
  applyDetailUserRecord(full && typeof full === 'object' ? full : {})
}

const handleDetailVisibilityChange = (value) => {
  detailVisible.value = value
}

const handleDetailTabChange = (value) => {
  detailTab.value = value
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
      const res = await getUserTeam(detailUser.value.id, { level: 1, page: 1, limit: 100 })
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
  detailTab.value = 'info'
  teamData.value = []
  detailVisible.value = true
  try {
    await loadDetailUser(row.id)
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
const profileSaving = ref(false)
const portalPasswordSaving = ref(false)
const onCommerceToggle = async (enabled) => {
  if (!detailUser.value?.id) return
  commerceSaving.value = true
  try {
    const result = await updateUserCommerce(detailUser.value.id, { participate_distribution: enabled ? 1 : 0 })
    detailUser.value = { ...detailUser.value, participate_distribution: enabled ? 1 : 0 }
    const readAt = extractReadAt(result)
    if (readAt) lastSyncedAt.value = readAt
    ElMessage.success(mergeStrongSuccessMessage(result, '分销参与状态已更新'))
    await refreshUsers()
  } catch (e) {
    ElMessage.error(e?.message || '更新失败')
  } finally {
    commerceSaving.value = false
  }
}

const onEditRealName = async () => {
  if (!detailUser.value?.id) return
  try {
    const { value } = await ElMessageBox.prompt(
      '请输入用户真实姓名。该字段用于大额微信提现实名校验。',
      '编辑真实姓名',
      {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValue: detailUser.value.real_name || '',
        inputPlaceholder: '2-32 个字符',
        inputValidator: (input) => {
          const text = String(input || '').trim()
          if (!text) return true
          if (text.length < 2 || text.length > 32) return '真实姓名长度需在 2-32 个字符之间'
          return true
        }
      }
    )
    profileSaving.value = true
    const result = await updateUserProfile(detailUser.value.id, { real_name: String(value || '').trim() })
    const readAt = extractReadAt(result)
    if (readAt) lastSyncedAt.value = readAt
    applyDetailUserRecord(result)
    ElMessage.success(mergeStrongSuccessMessage(result, '真实姓名已更新'))
    await refreshUsers()
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error(e?.message || '更新真实姓名失败')
    }
  } finally {
    profileSaving.value = false
  }
}

const copyText = async (text) => {
  const value = String(text || '')
  if (!value) return false
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return true
  }
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', 'readonly')
  textarea.style.position = 'absolute'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!copied) throw new Error('复制失败')
  return true
}

const showPortalPasswordResetResult = async (result) => {
  const nextPassword = String(result?.initial_password || '').trim()
  if (!nextPassword) return
  try {
    await ElMessageBox.confirm(
      h('div', { class: 'portal-password-result' }, [
        h('div', { class: 'portal-password-result__title' }, '新的初始密码'),
        h('div', { class: 'portal-password-result__password' }, nextPassword),
        h('div', { class: 'portal-password-result__hint' }, '该密码只在本次重置结果中展示，请立即复制并通知用户尽快在小程序内修改。')
      ]),
      '业务密码已重置',
      {
        confirmButtonText: '复制密码并关闭',
        cancelButtonText: '关闭',
        distinguishCancelAndClose: true,
        closeOnClickModal: false,
        closeOnPressEscape: false
      }
    )
    try {
      await copyText(nextPassword)
      ElMessage.success('新初始密码已复制')
    } catch (error) {
      ElMessage.error(error?.message || '复制初始密码失败')
    }
  } catch (action) {
    if (action !== 'cancel' && action !== 'close') {
      ElMessage.error(action?.message || '展示重置结果失败')
    }
  }
}

const onResetPortalPassword = async () => {
  if (!detailUser.value?.id) return
  try {
    await ElMessageBox.confirm(
      `确认将「${displayUserName(detailUser.value)}」的业务密码重置为新的初始密码？重置后用户需要重新在小程序中完成修改。`,
      '重置业务密码',
      { type: 'warning', confirmButtonText: '确认重置', cancelButtonText: '取消' }
    )
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.message || '已取消')
    return
  }

  portalPasswordSaving.value = true
  try {
    const result = await resetUserPortalPassword(detailUser.value.id)
    const readAt = extractReadAt(result)
    if (readAt) lastSyncedAt.value = readAt
    if (result?.user) applyDetailUserRecord(result.user)
    ElMessage.success(mergeStrongSuccessMessage(result, '业务密码已重置'))
    await refreshUsers()
    await showPortalPasswordResetResult(result)
  } catch (e) {
    ElMessage.error(e?.message || '重置业务密码失败')
  } finally {
    portalPasswordSaving.value = false
  }
}

const onUnlockPortalPassword = async () => {
  if (!detailUser.value?.id) return
  try {
    await ElMessageBox.confirm(
      `确认解除「${displayUserName(detailUser.value)}」当前的业务密码锁定状态？`,
      '解除业务密码锁定',
      { type: 'warning', confirmButtonText: '确认解锁', cancelButtonText: '取消' }
    )
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.message || '已取消')
    return
  }

  portalPasswordSaving.value = true
  try {
    const result = await unlockUserPortalPassword(detailUser.value.id)
    const readAt = extractReadAt(result)
    if (readAt) lastSyncedAt.value = readAt
    if (result?.user) applyDetailUserRecord(result.user)
    ElMessage.success(mergeStrongSuccessMessage(result, '业务密码锁定已解除'))
    await refreshUsers()
  } catch (e) {
    ElMessage.error(e?.message || '解除业务密码锁定失败')
  } finally {
    portalPasswordSaving.value = false
  }
}

const submitting = ref(false)
const currentUser = ref(null)

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
  await runUserMutation(() => {
    const payload = { role_level: roleForm.role_level }
    if (roleForm.role_level === 3) payload.agent_level = roleForm.agent_level
    return updateUserRole(currentUser.value.id, payload)
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

// ===== 用户ID修改 =====
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
    '用户ID已更新',
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
// 子组件 UserActionDialogsSecondary 已在 7/9 commit 切换为 EntityPicker 自治；
// 父级不再持有 parentSearchOptions / remoteSearchParent 等远程搜索状态。
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
    await runUserMutation(
      () => updateUserStatus(row.id, { status: ban ? 0 : 1, reason: ban ? '管理员封禁' : '管理员解封' }),
      ban ? '已封禁' : '已解封'
    )
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.message || '操作失败')
  }
}

// ===== 隐藏/恢复 =====
const visibilityVisible = ref(false)
const visibilityTarget = ref(null)
const visibilityForm = reactive({
  visibility: 'hidden',
  cleanup_category: 'manual_cleanup',
  reason: ''
})

const handleUserVisibility = (row) => {
  const hidden = row.account_visibility === 'hidden'
  visibilityTarget.value = row
  visibilityForm.visibility = hidden ? 'visible' : 'hidden'
  visibilityForm.cleanup_category = hidden ? (row.cleanup_category || 'manual_cleanup') : inferUserCleanupCategory(row)
  visibilityForm.reason = hidden ? '管理员恢复显示' : `管理员隐藏账号：${cleanupCategoryText(visibilityForm.cleanup_category)}`
  visibilityVisible.value = true
}

const submitUserVisibility = async () => {
  if (!visibilityTarget.value) return
  if (!visibilityForm.reason.trim()) return ElMessage.warning('请填写操作原因')
  await runUserMutation(
    () => updateUserVisibility(visibilityTarget.value.id, {
      visibility: visibilityForm.visibility,
      cleanup_category: visibilityForm.cleanup_category,
      reason: visibilityForm.reason.trim()
    }),
    visibilityForm.visibility === 'hidden' ? '用户已隐藏' : '用户已恢复显示',
    (result) => {
      visibilityVisible.value = false
      if (detailUser.value && String(detailUser.value.id) === String(visibilityTarget.value.id)) {
        applyDetailUserRecord(result)
      }
    }
  )
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
  else if (cmd === 'visibility') handleUserVisibility(row)
  else if (cmd === 'ban') handleBan(row, true)
  else if (cmd === 'unban') handleBan(row, false)
  else if (cmd === 'account_adjust') openAccountAdjust(row)
}

// ===== 工具函数 =====
const roleText = (r) => (['VIP用户', '初级会员', '高级会员', '推广合伙人', '运营合伙人', '区域合伙人', '线下实体门店'][r] ?? '-')
const roleTagType = (r) => (['', 'success', 'warning', 'danger', 'danger', 'danger'][r] ?? '')
const purchaseLevelText = (code) => {
  if (!code) return '未设置'
  const hit = purchaseLevelOptions.value.find(item => item.code === code)
  return hit ? `${hit.name}(${hit.code})` : code
}

onMounted(async () => {
  await Promise.all([refreshUsers(), fetchPurchaseLevels()])
})

watch(
  () => [route.query.keyword, route.query.lookup],
  ([nextKeyword, nextLookup]) => {
    const keyword = String(nextKeyword || '')
    const lookup = String(nextLookup || '')
    if (keyword === searchForm.keyword && lookup === routeLookup.value) return
    searchForm.keyword = keyword
    routeLookup.value = lookup
    resetPage()
    refreshUsers()
  }
)
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

:deep(.portal-password-result__title) {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 10px;
}

:deep(.portal-password-result__password) {
  font-family: ui-monospace, monospace;
  font-size: 20px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--el-fill-color-light);
  word-break: break-all;
}

:deep(.portal-password-result__hint) {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
</style>
