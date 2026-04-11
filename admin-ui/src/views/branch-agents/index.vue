<template>
  <div class="branch-agent-page">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="策略配置" name="policy">
        <el-card>
          <template #header>
            <div class="header-row">
              <span>分支代理策略</span>
              <el-button type="primary" :loading="savingPolicy" @click="savePolicy">保存策略</el-button>
            </div>
          </template>
          <el-form label-width="220px" style="max-width: 860px">
            <el-form-item label="区域代理分佣总开关">
              <el-switch v-model="policy.enabled" active-text="启用" inactive-text="冻结" />
            </el-form-item>
            <el-form-item label="申请最低等级（role_level）">
              <el-input-number v-model="policy.min_apply_role_level" :min="0" :max="10" />
            </el-form-item>
            <el-form-item label="学校代理佣金比例">
              <el-input-number v-model="policy.type_commission_rate.school" :min="0" :max="1" :step="0.001" :precision="3" />
            </el-form-item>
            <el-form-item label="区域代理佣金比例">
              <el-input-number v-model="policy.type_commission_rate.area" :min="0" :max="1" :step="0.001" :precision="3" />
            </el-form-item>
            <el-form-item label="市代理佣金比例">
              <el-input-number v-model="policy.type_commission_rate.city" :min="0" :max="1" :step="0.001" :precision="3" />
            </el-form-item>
            <el-form-item label="省代理佣金比例">
              <el-input-number v-model="policy.type_commission_rate.province" :min="0" :max="1" :step="0.001" :precision="3" />
            </el-form-item>
            <el-divider content-position="left">自提门店补贴金（与运费无关）</el-divider>
            <el-form-item label="核销后补贴开关">
              <el-switch v-model="policy.pickup_station_subsidy_enabled" active-text="启用" inactive-text="关闭" />
            </el-form-item>
            <el-form-item label="兼容固定额（元）">
              <el-input-number v-model="policy.pickup_station_subsidy_amount" :min="0" :max="99999" :precision="2" :step="0.5" />
              <div class="form-tip">当某档位「比例+固定」合计为 0 时，仍可用此处金额作为单笔补贴（旧数据兼容）。</div>
            </el-form-item>
            <el-divider content-position="left">自提核销分佣档位（每站点可选 A~D）</el-divider>
            <div class="form-tip" style="margin-bottom:12px">核销入账 = 订单实付 × 比例 + 固定金额（元）；比例填写 0~1（如 0.01 表示 1%）。</div>
            <el-table :data="pickupTierTableRows" border size="small" style="max-width:720px">
              <el-table-column prop="key" label="档位" width="72" />
              <el-table-column label="比例（0~1）" min-width="200">
                <template #default="{ row }">
                  <el-input-number v-model="policy.pickup_tiers[row.key].rate" :min="0" :max="1" :step="0.0005" :precision="4" style="width:160px" />
                </template>
              </el-table-column>
              <el-table-column label="固定金额（元）" min-width="200">
                <template #default="{ row }">
                  <el-input-number v-model="policy.pickup_tiers[row.key].fixed_yuan" :min="0" :max="99999" :precision="2" :step="0.5" style="width:160px" />
                </template>
              </el-table-column>
            </el-table>
          </el-form>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="分支代理地图点" name="stations">
        <el-card>
          <template #header>
            <div class="header-row">
              <span>网点/点位管理</span>
              <el-button type="primary" @click="openStationDialog()">新增点位</el-button>
            </div>
          </template>
          <el-table :data="stations" v-loading="loadingStations" stripe>
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="name" label="点位名称" min-width="160" />
            <el-table-column label="代理类型" width="110">
              <template #default="{ row }">
                <el-tag>{{ branchTypeText(row.branch_type) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="区域" min-width="180">
              <template #default="{ row }">
                {{ row.province }} / {{ row.city }} / {{ row.district || '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="region_name" label="匹配关键区域" width="140" />
            <el-table-column label="自提档" width="76">
              <template #default="{ row }">{{ row.pickup_commission_tier || 'A' }}</template>
            </el-table-column>
            <el-table-column prop="commission_rate" label="佣金比例" width="110" />
            <el-table-column label="认领人" width="130">
              <template #default="{ row }">{{ displayUserName(row.claimant) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'active' ? 'success' : 'info'">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="110" fixed="right">
              <template #default="{ row }">
                <el-button text type="primary" @click="openStationDialog(row)">编辑</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="申请审核" name="claims">
        <el-card>
          <template #header><span>分支代理申请</span></template>
          <el-table :data="claims" v-loading="loadingClaims" stripe>
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column label="申请人" width="160">
              <template #default="{ row }">
                {{ displayUserName(row.applicant, row.applicant_id) }} (Lv{{ row.applicant?.role_level ?? '-' }})
              </template>
            </el-table-column>
            <el-table-column label="申请类型" width="120">
              <template #default="{ row }">{{ branchTypeText(row.branch_type) }}</template>
            </el-table-column>
            <el-table-column label="目标区域" min-width="170">
              <template #default="{ row }">{{ row.region_name || row.station?.city || '-' }}</template>
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

    <el-dialog v-model="stationDialogVisible" :title="stationForm.id ? '编辑点位' : '新增点位'" width="680px">
      <el-form :model="stationForm" label-width="110px">
        <el-form-item label="点位名称"><el-input v-model="stationForm.name" /></el-form-item>
        <el-form-item label="代理类型">
          <el-select v-model="stationForm.branch_type" style="width: 220px">
            <el-option label="学校代理" value="school" />
            <el-option label="区域代理" value="area" />
            <el-option label="市代理" value="city" />
            <el-option label="省代理" value="province" />
          </el-select>
        </el-form-item>
        <el-form-item label="省市区">
          <el-row :gutter="8" style="width:100%">
            <el-col :span="8"><el-input v-model="stationForm.province" placeholder="省" /></el-col>
            <el-col :span="8"><el-input v-model="stationForm.city" placeholder="市" /></el-col>
            <el-col :span="8"><el-input v-model="stationForm.district" placeholder="区/县/学校" /></el-col>
          </el-row>
        </el-form-item>
        <el-form-item label="匹配关键区域"><el-input v-model="stationForm.region_name" placeholder="如：浦东新区 / 某某大学" /></el-form-item>
        <el-form-item label="详细地址"><el-input v-model="stationForm.address" placeholder="可选，用于地图自动解析坐标" /></el-form-item>
        <el-form-item label="经纬度">
          <el-row :gutter="8" style="width:100%">
            <el-col :span="12"><el-input v-model="stationForm.longitude" placeholder="longitude" /></el-col>
            <el-col :span="12"><el-input v-model="stationForm.latitude" placeholder="latitude" /></el-col>
          </el-row>
          <div style="margin-top:8px">
            <el-button type="primary" plain @click="mapPickerVisible = true">地图选点</el-button>
          </div>
          <div class="form-tip">地图搜索/点击标点，或可留空由保存时服务端解析。</div>
        </el-form-item>
        <el-form-item label="佣金比例">
          <el-input-number v-model="stationForm.commission_rate" :min="0" :max="1" :step="0.001" :precision="3" />
        </el-form-item>
        <el-form-item label="自提核销档位">
          <el-select v-model="stationForm.pickup_commission_tier" style="width: 220px">
            <el-option v-for="t in ['A','B','C','D']" :key="t" :label="`${t} 档（策略里配置比例+固定）`" :value="t" />
          </el-select>
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
    <MapPickerDialog v-model="mapPickerVisible" :seed="branchMapPickerSeed" @confirm="onBranchMapPickerConfirm" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getBranchAgentPolicy, updateBranchAgentPolicy,
  getBranchAgentStations, createBranchAgentStation, updateBranchAgentStation,
  getBranchAgentClaims, reviewBranchAgentClaim
} from '@/api'
import MapPickerDialog from '@/components/MapPickerDialog.vue'
import { getUserNickname } from '@/utils/userDisplay'

function defaultPickupTiers() {
  return {
    A: { rate: 0, fixed_yuan: 2 },
    B: { rate: 0.005, fixed_yuan: 1 },
    C: { rate: 0.01, fixed_yuan: 0 },
    D: { rate: 0.015, fixed_yuan: 1 }
  }
}

function toSafeNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function mergePolicyPickupTiers(raw) {
  const d = defaultPickupTiers()
  const src = raw && typeof raw === 'object' ? raw : {}
  for (const k of ['A', 'B', 'C', 'D']) {
    const r = src[k]
    d[k] = {
      rate: Math.min(1, Math.max(0, toSafeNumber(r?.rate, d[k].rate))),
      fixed_yuan: Math.max(0, toSafeNumber(r?.fixed_yuan, d[k].fixed_yuan))
    }
  }
  return d
}

const pickupTierTableRows = [{ key: 'A' }, { key: 'B' }, { key: 'C' }, { key: 'D' }]

const activeTab = ref('policy')
const savingPolicy = ref(false)
const loadingStations = ref(false)
const loadingClaims = ref(false)
const savingStation = ref(false)
const stationDialogVisible = ref(false)
const mapPickerVisible = ref(false)

const branchMapPickerSeed = computed(() => ({
  province: stationForm.province,
  city: stationForm.city,
  district: stationForm.district,
  address: stationForm.address,
  longitude: stationForm.longitude,
  latitude: stationForm.latitude
}))

function onBranchMapPickerConfirm(p) {
  stationForm.longitude = String(p.longitude)
  stationForm.latitude = String(p.latitude)
  if (p.province != null && p.province !== '') stationForm.province = String(p.province)
  if (p.city != null && p.city !== '') stationForm.city = String(p.city)
  if (p.district != null && p.district !== '') stationForm.district = String(p.district)
  if (p.address != null && p.address !== '') stationForm.address = String(p.address)
  ElMessage.success('已写入坐标' + (p.city ? '与地址' : ''))
}

const policy = reactive({
  enabled: false,
  min_apply_role_level: 3,
  type_commission_rate: { school: 0.01, area: 0.015, city: 0.02, province: 0.03 },
  pickup_station_subsidy_enabled: false,
  pickup_station_subsidy_amount: 0,
  pickup_tiers: defaultPickupTiers()
})
const stations = ref([])
const claims = ref([])
const stationForm = reactive({
  id: null, name: '', branch_type: 'city',
  province: '', city: '', district: '', region_name: '', address: '',
  longitude: '', latitude: '', commission_rate: 0.02, status: 'active',
  pickup_commission_tier: 'A'
})

const branchTypeText = (v) => ({ school: '学校代理', area: '区域代理', city: '市代理', province: '省代理' }[v] || v)
const displayUserName = (user, fallback = '-') => getUserNickname(user || {}, fallback)

const loadPolicy = async () => {
  try {
    const d = await getBranchAgentPolicy()
    Object.assign(policy, {
      enabled: d.enabled === true,
      min_apply_role_level: toSafeNumber(d.min_apply_role_level, 3),
      pickup_station_subsidy_enabled: d.pickup_station_subsidy_enabled === true,
      pickup_station_subsidy_amount: toSafeNumber(d.pickup_station_subsidy_amount, 0),
      type_commission_rate: {
        school: toSafeNumber(d.type_commission_rate?.school, 0.01),
        area: toSafeNumber(d.type_commission_rate?.area, 0.015),
        city: toSafeNumber(d.type_commission_rate?.city, 0.02),
        province: toSafeNumber(d.type_commission_rate?.province, 0.03)
      }
    })
    policy.pickup_tiers = mergePolicyPickupTiers(d.pickup_tiers)
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
    stations.value = res.list
  } finally {
    loadingStations.value = false
  }
}

const openStationDialog = (row = null) => {
  if (row) {
    Object.assign(stationForm, {
      id: row.id,
      name: row.name || '',
      branch_type: row.branch_type || 'city',
      province: row.province || '',
      city: row.city || '',
      district: row.district || '',
      region_name: row.region_name || '',
      address: row.address || '',
      longitude: row.longitude ?? '',
      latitude: row.latitude ?? '',
      commission_rate: toSafeNumber(row.commission_rate, 0.02),
      status: row.status || 'active',
      pickup_commission_tier: row.pickup_commission_tier || 'A'
    })
  } else {
    Object.assign(stationForm, {
      id: null, name: '', branch_type: 'city',
      province: '', city: '', district: '', region_name: '', address: '',
      longitude: '', latitude: '', commission_rate: 0.02, status: 'active',
      pickup_commission_tier: 'A'
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
      region_name: stationForm.region_name,
      address: stationForm.address?.trim() || null,
      longitude: stationForm.longitude === '' ? null : stationForm.longitude,
      latitude: stationForm.latitude === '' ? null : stationForm.latitude,
      commission_rate: stationForm.commission_rate,
      status: stationForm.status,
      pickup_commission_tier: stationForm.pickup_commission_tier || 'A'
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

const loadClaims = async () => {
  loadingClaims.value = true
  try {
    const res = await getBranchAgentClaims()
    claims.value = res.list
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
</style>
