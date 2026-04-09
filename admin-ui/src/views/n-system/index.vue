<template>
  <div class="n-system-page">
    <el-page-header content="N路径代理管理" />

    <el-alert
      type="info"
      :closable="false"
      style="margin: 16px 0"
      title="N路径是独立于 C/B 标准路径的分销体系。大N（role_level=7）招募小n（role_level=6），掌控其货款额度。小n按自己的提货价下单，与大N之间的价差自动结算为大N的可提现佣金。小n满足条件后可升级为大N。"
    />

    <el-tabs v-model="activeTab">

      <!-- Tab 1: 大N 列表 -->
      <el-tab-pane label="大N独立代理" name="leaders">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>大N 独立代理列表（role_level = 7）</span>
              <el-input
                v-model="leaderSearch"
                placeholder="搜索昵称/手机号"
                clearable
                style="width: 240px"
                @change="loadLeaders"
              />
            </div>
          </template>
          <el-table :data="leaders" v-loading="leaderLoading" border>
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column label="用户" min-width="160">
              <template #default="{ row }">
                <div class="user-cell">
                  <el-avatar :src="displayUserAvatar(row)" :size="32" />
                  <span style="margin-left:8px">{{ displayUserName(row) }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="phone" label="手机号" width="130" />
            <el-table-column label="名下小n" width="90" align="center">
              <template #default="{ row }">
                <el-tag type="primary">{{ row.n_member_count || 0 }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="货款余额" width="120" align="right">
              <template #default="{ row }">
                ¥{{ (row.wallet_balance || 0).toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column label="可提现余额" width="120" align="right">
              <template #default="{ row }">
                ¥{{ (row.balance || 0).toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column label="加入时间" width="160">
              <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button text type="primary" @click="viewLeaderMembers(row)">查看小n</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="pagination-wrap">
            <el-pagination
              v-model:current-page="leaderPage"
              v-model:page-size="leaderPageSize"
              :total="leaderTotal"
              layout="total, prev, pager, next"
              @change="loadLeaders"
            />
          </div>
        </el-card>
      </el-tab-pane>

      <!-- Tab 2: 小n 列表 -->
      <el-tab-pane label="小n代理" name="members">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>小n 代理列表（role_level = 6）</span>
              <el-input
                v-model="memberSearch"
                placeholder="搜索昵称/手机号"
                clearable
                style="width: 240px"
                @change="loadMembers"
              />
            </div>
          </template>
          <el-table :data="members" v-loading="memberLoading" border>
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column label="用户" min-width="160">
              <template #default="{ row }">
                <div class="user-cell">
                  <el-avatar :src="displayUserAvatar(row)" :size="32" />
                  <span style="margin-left:8px">{{ displayUserName(row) }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="phone" label="手机号" width="130" />
            <el-table-column label="所属大N" min-width="140">
              <template #default="{ row }">
                {{ row.nLeader ? displayUserName(row.nLeader) : '无' }}
                <el-tag v-if="row.nLeader" size="small" style="margin-left:4px">{{ row.nLeader.id }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="货款余额" width="120" align="right">
              <template #default="{ row }">
                ¥{{ (row.wallet_balance || 0).toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column label="加入时间" width="160">
              <template #default="{ row }">{{ formatDate(row.joined_team_at) }}</template>
            </el-table-column>
          </el-table>
          <div class="pagination-wrap">
            <el-pagination
              v-model:current-page="memberPage"
              v-model:page-size="memberPageSize"
              :total="memberTotal"
              layout="total, prev, pager, next"
              @change="loadMembers"
            />
          </div>
        </el-card>
      </el-tab-pane>

      <!-- Tab 3: 升级申请审核 -->
      <el-tab-pane label="升级申请" name="upgrades">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>N路径升级申请（n_join / n_upgrade）</span>
              <el-select v-model="upgradeStatusFilter" style="width:160px" @change="loadUpgrades">
                <el-option label="全部" value="" />
                <el-option label="待审核" value="pending_review" />
                <el-option label="已通过" value="approved" />
                <el-option label="已驳回" value="rejected" />
              </el-select>
            </div>
          </template>
          <el-table :data="upgrades" v-loading="upgradeLoading" border>
            <el-table-column prop="id" label="申请ID" width="80" />
            <el-table-column label="申请人" min-width="140">
              <template #default="{ row }">
                {{ displayUserName(row.user) }}
                <el-tag size="small" style="margin-left:4px">{{ row.user?.id }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="申请类型" width="120">
              <template #default="{ row }">
                <el-tag :type="row.path_type === 'n_join' ? 'warning' : 'success'">
                  {{ row.path_type === 'n_join' ? '加入小n' : '升级大N' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="升级方式" width="120">
              <template #default="{ row }">
                <span v-if="row.path_type === 'n_upgrade'">
                  {{ row.team_upgrade ? '团队满10人' : `直充 ¥${row.amount}` }}
                </span>
                <span v-else>入场 ¥{{ row.amount }}</span>
              </template>
            </el-table-column>
            <el-table-column label="邀约大N" width="120">
              <template #default="{ row }">
                {{ row.leader_id ? `#${row.leader_id}` : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="申请时间" width="160">
              <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="160" fixed="right">
              <template #default="{ row }">
                <template v-if="row.status === 'pending_review'">
                  <el-button text type="success" @click="reviewUpgrade(row, 'approve')">通过</el-button>
                  <el-button text type="danger" @click="reviewUpgrade(row, 'reject')">驳回</el-button>
                </template>
                <span v-else class="text-muted">已处理</span>
              </template>
            </el-table-column>
          </el-table>
          <div class="pagination-wrap">
            <el-pagination
              v-model:current-page="upgradePage"
              v-model:page-size="upgradePageSize"
              :total="upgradeTotal"
              layout="total, prev, pager, next"
              @change="loadUpgrades"
            />
          </div>
        </el-card>
      </el-tab-pane>

    </el-tabs>

    <!-- 查看大N名下小n弹窗 -->
    <el-dialog v-model="memberDialogVisible" :title="`${displayUserName(selectedLeader, '-') } 的小n团队`" width="720px">
      <el-table :data="dialogMembers" border>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="用户" min-width="160">
          <template #default="{ row }">
            <div class="user-cell">
              <el-avatar :src="displayUserAvatar(row)" :size="28" />
              <span style="margin-left:8px">{{ displayUserName(row) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="130" />
        <el-table-column label="货款余额" width="120" align="right">
          <template #default="{ row }">¥{{ (row.agentWallet?.balance || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="加入时间" width="160">
          <template #default="{ row }">{{ formatDate(row.joined_team_at) }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getNSystemLeaders, getNSystemMembers, getNSystemLeaderMembers, getUpgradeApplications, reviewUpgradeApplication } from '@/api'
import dayjs from 'dayjs'
import { getUserAvatar, getUserNickname } from '@/utils/userDisplay'

const activeTab = ref('leaders')
const displayUserName = (user, fallback = '-') => getUserNickname(user || {}, fallback)
const displayUserAvatar = (user) => getUserAvatar(user || {})

// ── 大N ─────────────────────────────────────────
const leaders = ref([])
const leaderLoading = ref(false)
const leaderSearch = ref('')
const leaderPage = ref(1)
const leaderPageSize = ref(20)
const leaderTotal = ref(0)

async function loadLeaders() {
  leaderLoading.value = true
  try {
    const res = await getNSystemLeaders({
      page: leaderPage.value,
      limit: leaderPageSize.value,
      search: leaderSearch.value
    })
    leaders.value = res.data?.list || []
    leaderTotal.value = res.data?.total || 0
  } catch (e) {
    ElMessage.error('加载大N列表失败')
  } finally {
    leaderLoading.value = false
  }
}

// ── 小n ─────────────────────────────────────────
const members = ref([])
const memberLoading = ref(false)
const memberSearch = ref('')
const memberPage = ref(1)
const memberPageSize = ref(20)
const memberTotal = ref(0)

async function loadMembers() {
  memberLoading.value = true
  try {
    const res = await getNSystemMembers({
      page: memberPage.value,
      limit: memberPageSize.value,
      search: memberSearch.value
    })
    members.value = res.data?.list || []
    memberTotal.value = res.data?.total || 0
  } catch (e) {
    ElMessage.error('加载小n列表失败')
  } finally {
    memberLoading.value = false
  }
}

// ── 升级申请 ─────────────────────────────────────
const upgrades = ref([])
const upgradeLoading = ref(false)
const upgradeStatusFilter = ref('pending_review')
const upgradePage = ref(1)
const upgradePageSize = ref(20)
const upgradeTotal = ref(0)

async function loadUpgrades() {
  upgradeLoading.value = true
  try {
    const res = await getUpgradeApplications({
      page: upgradePage.value,
      limit: upgradePageSize.value,
      status: upgradeStatusFilter.value || undefined,
      path_type: 'n_join,n_upgrade'
    })
    upgrades.value = res.data?.list || []
    upgradeTotal.value = res.data?.total || 0
  } catch (e) {
    ElMessage.error('加载升级申请失败')
  } finally {
    upgradeLoading.value = false
  }
}

async function reviewUpgrade(row, action) {
  const label = action === 'approve' ? '通过' : '驳回'
  try {
    let remark = ''
    if (action === 'reject') {
      const { value } = await ElMessageBox.prompt('请输入驳回原因', '驳回申请', { confirmButtonText: '确认驳回', cancelButtonText: '取消' })
      remark = value
    } else {
      await ElMessageBox.confirm(`确认通过该 ${row.path_type === 'n_join' ? '加入小n' : '升级大N'} 申请？`, '确认操作')
    }
    await reviewUpgradeApplication(row.id, { action, remark })
    ElMessage.success(`已${label}`)
    loadUpgrades()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '操作失败')
  }
}

// ── 弹窗：大N的小n列表 ──────────────────────────
const memberDialogVisible = ref(false)
const selectedLeader = ref(null)
const dialogMembers = ref([])

async function viewLeaderMembers(leader) {
  selectedLeader.value = leader
  memberDialogVisible.value = true
  try {
    const res = await getNSystemLeaderMembers(leader.id)
    dialogMembers.value = res.data?.list || []
  } catch (e) {
    ElMessage.error('加载失败')
  }
}

// ── 工具函数 ─────────────────────────────────────
function formatDate(d) {
  return d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '-'
}

function statusLabel(status) {
  return { pending_payment: '待付款', pending_review: '待审核', approved: '已通过', rejected: '已驳回', cancelled: '已取消' }[status] || status
}

function statusTagType(status) {
  return { pending_review: 'warning', approved: 'success', rejected: 'danger', pending_payment: 'info' }[status] || ''
}

onMounted(() => {
  loadLeaders()
})
</script>

<style scoped>
.n-system-page { padding: 20px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.user-cell { display: flex; align-items: center; }
.pagination-wrap { margin-top: 16px; display: flex; justify-content: flex-end; }
.text-muted { color: #999; font-size: 13px; }
</style>
