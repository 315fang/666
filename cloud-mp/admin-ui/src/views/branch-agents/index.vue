<template>
  <div class="branch-agent-page">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="策略配置" name="policy">
        <el-card>
          <template #header>
            <div class="header-row">
              <span>区域代理策略</span>
              <el-button type="primary" :loading="savingPolicy" @click="savePolicy">保存策略</el-button>
            </div>
          </template>
          <el-form label-width="220px" style="max-width: 860px">
            <el-form-item label="区域代理分佣总开关">
              <el-switch v-model="policy.enabled" active-text="启用" inactive-text="冻结" />
            </el-form-item>
            <el-form-item label="申请最低等级">
              <el-input-number v-model="policy.min_apply_role_level" :min="0" :max="10" />
            </el-form-item>
            <el-divider content-position="left">自提点奖励</el-divider>
            <el-form-item label="核销后补贴开关">
              <el-switch v-model="policy.pickup_station_subsidy_enabled" active-text="启用" inactive-text="关闭" />
            </el-form-item>
            <el-form-item label="自提点奖励比例">
              <el-input-number v-model="policy.pickup_station_reward_rate" :min="0" :max="1" :step="0.001" :precision="3" />
              <div class="form-tip">按订单实付金额计算，PDF 默认值为 2.5%。</div>
            </el-form-item>
            <el-form-item label="备用固定额（元）">
              <el-input-number v-model="policy.pickup_station_subsidy_amount" :min="0" :max="99999" :precision="2" :step="0.5" />
              <div class="form-tip">当比例为 0 时，可用此处金额作为单笔兜底补贴。</div>
            </el-form-item>
            <el-divider content-position="left">区域奖励阶梯</el-divider>
            <div class="form-tip" style="margin-bottom:12px">按收货地址匹配区域，累计当前地区订单实际支付总金额。默认规则：0元=1%，10万=2%，100万=3%。代理自购订单也参与计算。</div>
            <el-table :data="regionRewardTierTableRows" border size="small" style="max-width:720px">
              <el-table-column prop="index" label="档位" width="72" />
              <el-table-column label="累计金额门槛（元）" min-width="220">
                <template #default="{ row }">
                  <el-input-number v-model="policy.region_reward_tiers[row.index].threshold" :min="0" :max="999999999" :step="1000" style="width:180px" />
                </template>
              </el-table-column>
              <el-table-column label="奖励比例（0~1）" min-width="220">
                <template #default="{ row }">
                  <el-input-number v-model="policy.region_reward_tiers[row.index].rate" :min="0" :max="1" :step="0.001" :precision="3" style="width:180px" />
                </template>
              </el-table-column>
              <el-table-column label="说明" min-width="160">
                <template #default="{ row }">
                  <el-input v-model="policy.region_reward_tiers[row.index].label" placeholder="如：10万" />
                </template>
              </el-table-column>
            </el-table>
          </el-form>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="区域归属" name="stations">
        <el-card>
          <template #header>
            <div class="header-row">
              <span>区域代理管理</span>
              <el-button type="primary" @click="openStationDialog()">新增区域代理</el-button>
            </div>
          </template>
          <el-table :data="stations" v-loading="loadingStations" stripe>
            <el-table-column label="ID" width="90">
              <template #default="{ row }">
                <CompactIdCell :value="row.display_id || row.id" :full-value="row.id" />
              </template>
            </el-table-column>
            <el-table-column prop="name" label="区域名称" min-width="160" />
            <el-table-column label="归属层级" width="110">
              <template #default="{ row }">
                <el-tag>{{ branchTypeText(row.branch_type) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="结算范围" min-width="220">
              <template #default="{ row }">
                {{ row.scope_label || [row.province, row.city, row.district].filter(Boolean).join(' / ') || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="认领人" width="130">
              <template #default="{ row }">
                <span>{{ displayUserName(row.claimant) }}</span>
                <el-tag v-if="row.claimant?.is_virtual_settlement" size="small" type="warning" style="margin-left:6px">虚拟结算</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'active' ? 'success' : 'info'">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="160" fixed="right">
              <template #default="{ row }">
                <el-button text type="primary" @click="openStationDialog(row)">编辑</el-button>
                <el-button text type="danger" @click="deleteStation(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="申请审核" name="claims">
        <el-card>
          <template #header><span>区域代理申请</span></template>
          <el-table :data="claims" v-loading="loadingClaims" stripe>
            <el-table-column label="ID" width="90">
              <template #default="{ row }">
                <CompactIdCell :value="row.display_id || row.id" :full-value="row.id" />
              </template>
            </el-table-column>
            <el-table-column label="申请人" width="160">
              <template #default="{ row }">
                {{ displayUserName(row.applicant, row.applicant_id) }} (Lv{{ row.applicant?.role_level ?? '-' }})
              </template>
            </el-table-column>
            <el-table-column label="申请类型" width="120">
              <template #default="{ row }">{{ branchTypeText(row.branch_type) }}</template>
            </el-table-column>
            <el-table-column label="目标区域" min-width="170">
              <template #default="{ row }">{{ row.station?.scope_label || [row.station?.province, row.station?.city, row.station?.district].filter(Boolean).join(' / ') || row.region_name || '-' }}</template>
            </el-table-column>
            <el-table-column prop="real_name" label="姓名" width="110" />
            <el-table-column prop="phone" label="电话" width="130" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'pending' ? 'warning' : row.status === 'approved' ? 'success' : 'danger'">
                  {{ row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="180" fixed="right">
              <template #default="{ row }">
                <template v-if="row.status === 'pending'">
                  <el-button text type="success" @click="reviewClaim(row, 'approve')">通过</el-button>
                  <el-button text type="danger" @click="reviewClaim(row, 'reject')">拒绝</el-button>
                </template>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="stationDialogVisible" :title="stationForm.id ? '编辑区域代理' : '新增区域代理'" width="680px">
      <el-form :model="stationForm" label-width="110px">
        <el-form-item label="区域名称"><el-input v-model="stationForm.name" placeholder="如：浦东新区区域代理" /></el-form-item>
        <el-form-item label="归属层级">
          <el-select v-model="stationForm.branch_type" style="width: 220px">
            <el-option label="区代理" value="district" />
            <el-option label="市代理" value="city" />
            <el-option label="省代理" value="province" />
          </el-select>
        </el-form-item>
        <el-form-item label="省 / 市 / 区">
          <el-row :gutter="8" style="width:100%">
            <el-col :span="8"><el-input v-model="stationForm.province" placeholder="省" /></el-col>
            <el-col :span="8"><el-input v-model="stationForm.city" placeholder="市" /></el-col>
            <el-col :span="8"><el-input v-model="stationForm.district" placeholder="区/县" /></el-col>
          </el-row>
        </el-form-item>
        <el-form-item label="认领人">
          <el-select
            v-model="stationForm.claimant_id"
            filterable
            remote
            reserve-keyword
            clearable
            placeholder="输入昵称 / 手机号 / 用户ID / 会员码搜索"
            :remote-method="searchClaimantUsers"
            :loading="claimantSearching"
            style="width:100%"
          >
            <el-option
              v-for="option in claimantOptions"
              :key="option.id"
              :label="formatClaimantOption(option)"
              :value="option.id"
            />
          </el-select>
          <div class="form-tip">支持按昵称、手机号、用户ID、会员码搜索；选中后自动绑定，不需要手填 OPENID。</div>
        </el-form-item>
        <el-form-item v-if="selectedClaimant" label="认领人信息">
          <div class="claimant-preview">
            <div>{{ displayUserName(selectedClaimant, `用户${selectedClaimant.id}`) }}</div>
            <div class="sub">ID: {{ selectedClaimant.id }} / 会员码: {{ selectedClaimant.invite_code || selectedClaimant.member_no || '—' }}</div>
            <div class="sub" v-if="selectedClaimant.phone">手机号: {{ selectedClaimant.phone }}</div>
          </div>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="stationForm.status" style="width: 220px">
            <el-option label="active" value="active" />
            <el-option label="inactive" value="inactive" />
            <el-option label="pending" value="pending" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="stationDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingStation" @click="saveStation">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import CompactIdCell from '@/components/CompactIdCell.vue'
import {
  getBranchAgentPolicy, updateBranchAgentPolicy,
  getBranchAgentStations, createBranchAgentStation, updateBranchAgentStation, deleteBranchAgentStation,
  getBranchAgentClaims, reviewBranchAgentClaim,
  searchUsersLite
} from '@/api'
import { getUserNickname } from '@/utils/userDisplay'

function defaultRegionRewardTiers() {
  return [
    { threshold: 0, rate: 0.01, label: '0元' },
    { threshold: 100000, rate: 0.02, label: '10万' },
    { threshold: 1000000, rate: 0.03, label: '100万' }
  ]
}

function toSafeNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function mergeRegionRewardTiers(raw) {
  const defaults = defaultRegionRewardTiers()
  const source = Array.isArray(raw) ? raw : []
  return defaults.map((row, index) => ({
    threshold: Math.max(0, toSafeNumber(source[index]?.threshold, row.threshold)),
    rate: Math.min(1, Math.max(0, toSafeNumber(source[index]?.rate, row.rate))),
    label: String(source[index]?.label || row.label)
  }))
}

const regionRewardTierTableRows = [{ index: 0 }, { index: 1 }, { index: 2 }]

const activeTab = ref('policy')
const savingPolicy = ref(false)
const loadingStations = ref(false)
const loadingClaims = ref(false)
const savingStation = ref(false)
const stationDialogVisible = ref(false)
const claimantSearching = ref(false)
const claimantOptions = ref([])

const policy = reactive({
  enabled: true,
  min_apply_role_level: 3,
  pickup_station_subsidy_enabled: true,
  pickup_station_reward_rate: 0.025,
  pickup_station_subsidy_amount: 0,
  region_reward_tiers: defaultRegionRewardTiers()
})
const stations = ref([])
const claims = ref([])
const stationForm = reactive({
  id: null, name: '', branch_type: 'district',
  province: '', city: '', district: '',
  claimant_id: '', status: 'active'
})

const branchTypeText = (v) => ({ district: '区代理', area: '区代理', city: '市代理', province: '省代理', school: '学校代理（停用）' }[v] || v)
const displayUserName = (user, fallback = '-') => getUserNickname(user || {}, fallback)

function buildClaimantOption(user = {}) {
  return {
    ...user,
    id: user.id || user._id || user._legacy_id || user.openid || user.user_id || ''
  }
}

const selectedClaimant = computed(() => {
  const current = String(stationForm.claimant_id || '')
  if (!current) return null
  const matchesCurrent = (user = {}) => [user.id, user._id, user._legacy_id, user.user_id, user.openid]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .some((value) => String(value) === current)
  return claimantOptions.value.find(matchesCurrent)
    || stations.value.find((row) => String(row.claimant_id || '') === current)?.claimant
    || null
})

function formatClaimantOption(user = {}) {
  const displayId = user._legacy_id || user.user_id || user.id || user._id || user.openid || ''
  const nickname = displayUserName(user, `用户${displayId}`)
  const memberNo = user.invite_code || user.member_no || '无会员码'
  const phone = user.phone ? ` / ${user.phone}` : ''
  const role = user.role_name || (user.role_level != null ? `Lv${user.role_level}` : '')
  return `${nickname}${phone} / ID:${displayId} / ${memberNo}${role ? ` / ${role}` : ''}`
}

async function searchClaimantUsers(keyword) {
  const q = String(keyword || '').trim()
  if (!q) {
    claimantOptions.value = selectedClaimant.value ? [buildClaimantOption(selectedClaimant.value)] : []
    return
  }
  claimantSearching.value = true
  try {
    const res = await searchUsersLite({ keyword: q, limit: 20 })
    claimantOptions.value = (res?.list || []).map((item) => buildClaimantOption(item))
  } finally {
    claimantSearching.value = false
  }
}

const loadPolicy = async () => {
  try {
    const res = await getBranchAgentPolicy()
    const d = res?.data || res || {}
    Object.assign(policy, {
      enabled: d.enabled !== false,
      min_apply_role_level: toSafeNumber(d.min_apply_role_level, 3),
      pickup_station_subsidy_enabled: d.pickup_station_subsidy_enabled !== false,
      pickup_station_reward_rate: toSafeNumber(d.pickup_station_reward_rate, 0.025),
      pickup_station_subsidy_amount: toSafeNumber(d.pickup_station_subsidy_amount, 0)
    })
    policy.region_reward_tiers = mergeRegionRewardTiers(d.region_reward_tiers)
  } catch (e) { console.error(e) }
}

const savePolicy = async () => {
  savingPolicy.value = true
  try {
    await updateBranchAgentPolicy({ ...policy })
    ElMessage.success('策略已保存')
  } finally {
    savingPolicy.value = false
  }
}

const loadStations = async () => {
  loadingStations.value = true
  try {
    const res = await getBranchAgentStations()
    stations.value = res?.data || res || []
  } finally {
    loadingStations.value = false
  }
}

const openStationDialog = (row = null) => {
  claimantOptions.value = []
  if (row) {
    Object.assign(stationForm, {
      id: row.id,
      name: row.name || '',
      branch_type: row.branch_type || 'district',
      province: row.province || '',
      city: row.city || '',
      district: row.district || '',
      claimant_id: row.claimant_id || '',
      status: row.status || 'active'
    })
    if (row.claimant) {
      claimantOptions.value = [buildClaimantOption({ ...row.claimant, id: row.claimant_id || row.claimant.id })]
    }
  } else {
    Object.assign(stationForm, {
      id: null, name: '', branch_type: 'district',
      province: '', city: '', district: '',
      claimant_id: '', status: 'active'
    })
  }
  stationDialogVisible.value = true
}

const saveStation = async () => {
  savingStation.value = true
  try {
    const payload = {
      name: stationForm.name,
      branch_type: stationForm.branch_type,
      province: stationForm.province,
      city: stationForm.city,
      district: stationForm.district,
      claimant_id: String(stationForm.claimant_id || '').trim() || null,
      status: stationForm.status
    }
    let resData
    if (stationForm.id) {
      resData = await updateBranchAgentStation(stationForm.id, payload)
    } else {
      resData = await createBranchAgentStation(payload)
    }
    ElMessage.success('保存成功')
    if (resData?.geocode_note) ElMessage.info(resData.geocode_note)
    stationDialogVisible.value = false
    loadStations()
  } finally {
    savingStation.value = false
  }
}

const deleteStation = async (row) => {
  const id = row?.id || row?._id || row?._legacy_id
  if (!id) return
  try {
    await ElMessageBox.confirm(
      `确认删除区域“${row.name || id}”？删除后该区域不再参与订单归属和结算。`,
      '删除区域归属',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch (_) {
    return
  }
  await deleteBranchAgentStation(id)
  ElMessage.success('删除成功')
  loadStations()
}

const loadClaims = async () => {
  loadingClaims.value = true
  try {
    const res = await getBranchAgentClaims()
    claims.value = res?.data || res || []
  } finally {
    loadingClaims.value = false
  }
}

const reviewClaim = async (row, action) => {
  let note = ''
  if (action === 'reject') {
    try {
      const result = await ElMessageBox.prompt('请输入拒绝原因', '拒绝申请', { inputPlaceholder: '可选' })
      note = result.value || ''
    } catch (_) {
      return
    }
  }
  await reviewBranchAgentClaim(row.id, { action, note })
  ElMessage.success(action === 'approve' ? '已通过' : '已拒绝')
  loadClaims()
  loadStations()
}

onMounted(() => {
  loadPolicy()
  loadStations()
  loadClaims()
})
</script>

<style scoped>
.branch-agent-page { padding: 0; }
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.form-tip {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}
.claimant-preview {
  line-height: 1.6;
}
.claimant-preview .sub {
  font-size: 12px;
  color: #909399;
}
</style>
