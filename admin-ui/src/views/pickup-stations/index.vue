<template>
  <div class="pickup-stations-page">
    <el-card>
      <template #header>
        <div class="header-row">
          <span>自提门店（service_stations）</span>
          <el-button type="primary" @click="openDialog()">新增门店</el-button>
        </div>
      </template>

      <el-form :inline="true" :model="searchForm" class="filter-container">
        <el-form-item label="关键词">
          <el-input v-model="searchForm.keyword" placeholder="名称/地址/城市/联系人" clearable style="width:200px" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部" clearable style="width:120px">
            <el-option label="运营中" value="active" />
            <el-option label="待审核" value="pending" />
            <el-option label="已停用" value="inactive" />
          </el-select>
        </el-form-item>
        <el-form-item label="自提">
          <el-select v-model="searchForm.is_pickup_point" placeholder="全部" clearable style="width:100px">
            <el-option label="是" :value="1" />
            <el-option label="否" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="search">搜索</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="name" label="门店名称" min-width="140" />
        <el-table-column label="地区" min-width="160">
          <template #default="{ row }">
            {{ row.province }} / {{ row.city }} / {{ row.district || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="自提" width="72">
          <template #default="{ row }">
            <el-tag :type="row.is_pickup_point ? 'success' : 'info'" size="small">
              {{ row.is_pickup_point ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="联系" min-width="130">
          <template #default="{ row }">
            <div>{{ row.contact_name || '-' }}</div>
            <div class="sub">{{ row.contact_phone || row.pickup_contact || '' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="营业" min-width="120">
          <template #default="{ row }">
            <span class="sub">{{ formatDays(row.business_days) }}</span>
            <div class="sub">{{ row.business_time_start || '—' }} - {{ row.business_time_end || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="88">
          <template #default="{ row }">
            <el-tag size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="认领人" width="100">
          <template #default="{ row }">{{ displayUserName(row.claimant) }}</template>
        </el-table-column>
        <el-table-column label="成员" width="90">
          <template #default="{ row }">
            <span>{{ row.staffMembers?.length || 0 }} 人</span>
          </template>
        </el-table-column>
        <el-table-column label="自提档" width="72">
          <template #default="{ row }">{{ row.pickup_commission_tier || 'A' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" @click="openStaffDialog(row)">成员管理</el-button>
            <el-button text type="primary" @click="openDialog(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.limit"
          :total="pagination.total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @size-change="fetchList"
          @current-change="fetchList"
        />
      </div>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑自提门店' : '新增自提门店'" width="720px" destroy-on-close>
      <el-form :model="form" label-width="120px">
        <el-form-item label="门店名称" required>
          <el-input v-model="form.name" placeholder="如：浦东自提点" />
        </el-form-item>
        <el-form-item label="省市区" required>
          <el-row :gutter="8" style="width:100%">
            <el-col :span="8"><el-input v-model="form.province" placeholder="省" /></el-col>
            <el-col :span="8"><el-input v-model="form.city" placeholder="市" /></el-col>
            <el-col :span="8"><el-input v-model="form.district" placeholder="区/县" /></el-col>
          </el-row>
        </el-form-item>
        <el-form-item label="详细地址">
          <el-input v-model="form.address" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="经纬度">
          <el-row :gutter="8" style="width:100%">
            <el-col :span="12"><el-input v-model="form.longitude" placeholder="经度" /></el-col>
            <el-col :span="12"><el-input v-model="form.latitude" placeholder="纬度" /></el-col>
          </el-row>
          <div style="margin-top:8px">
            <el-button type="primary" plain @click="mapPickerVisible = true">地图选点</el-button>
          </div>
          <div class="form-tip">可打开地图搜索或点击标注；留空保存时仍可由服务端按地址自动解析。</div>
        </el-form-item>
        <el-form-item label="支持自提">
          <el-switch v-model="form.is_pickup_point" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item label="LOGO URL">
          <el-input v-model="form.logo_url" placeholder="https://..." />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="form.contact_name" placeholder="姓名" style="width:45%; margin-right:8px" />
          <el-input v-model="form.contact_phone" placeholder="手机" style="width:45%" />
        </el-form-item>
        <el-form-item label="营业周天">
          <el-checkbox-group v-model="form.business_days">
            <el-checkbox v-for="d in weekDays" :key="d.v" :label="d.v">{{ d.l }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="营业时段">
          <el-time-picker v-model="timeStart" format="HH:mm" value-format="HH:mm" placeholder="开始" style="width:140px" />
          <span style="margin:0 8px">—</span>
          <el-time-picker v-model="timeEnd" format="HH:mm" value-format="HH:mm" placeholder="结束" style="width:140px" />
        </el-form-item>
        <el-form-item label="门店简介">
          <el-input v-model="form.intro" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="区域佣金比例">
          <el-input-number v-model="form.commission_rate" :min="0" :max="1" :step="0.001" :precision="3" />
        </el-form-item>
        <el-form-item label="自提核销档位">
          <el-select v-model="form.pickup_commission_tier" style="width:220px">
            <el-option v-for="t in ['A','B','C','D']" :key="t" :label="`${t} 档（分支代理策略中配置）`" :value="t" />
          </el-select>
          <div class="form-tip">核销补贴 = 实付×该档比例 + 该档固定金额；在「分支代理 → 策略配置」中维护各档数值。</div>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width:200px">
            <el-option label="运营中 active" value="active" />
            <el-option label="待审核 pending" value="pending" />
            <el-option label="已停用 inactive" value="inactive" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="staffDialogVisible" :title="staffState.stationName ? `${staffState.stationName} · 门店成员` : '门店成员'" width="860px" destroy-on-close>
      <div class="staff-toolbar">
        <div class="staff-meta">
          <span>认领人：{{ staffState.claimantName || '未设置' }}</span>
          <span>成员数：{{ staffState.list.length }}</span>
        </div>
        <el-button type="primary" @click="openStaffForm()">添加成员</el-button>
      </div>

      <el-table :data="staffState.list" v-loading="staffState.loading" stripe>
        <el-table-column prop="id" label="ID" width="72" />
        <el-table-column label="成员" min-width="180">
          <template #default="{ row }">
            <div>{{ displayUserName(row.user, `用户${row.user_id}`) }}</div>
            <div class="sub">UID: {{ row.user_id }} {{ row.user?.phone ? ` / ${row.user.phone}` : '' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="角色" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.role === 'manager' ? 'warning' : 'info'">
              {{ row.role === 'manager' ? '店长' : '店员' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="核销权限" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="row.can_verify ? 'success' : 'info'">
              {{ row.can_verify ? '可核销' : '不可核销' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small">{{ row.status === 'active' ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="160" />
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" @click="openStaffForm(row)">编辑</el-button>
            <el-button text type="danger" @click="handleRemoveStaff(row)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!staffState.loading && !staffState.list.length" description="当前门店还没有成员" />
    </el-dialog>

    <el-dialog v-model="staffFormVisible" :title="staffForm.id ? '编辑门店成员' : '添加门店成员'" width="520px" destroy-on-close>
      <el-form :model="staffForm" label-width="100px">
        <el-form-item label="用户ID" required>
          <el-input-number v-model="staffForm.user_id" :min="1" :step="1" style="width:220px" :disabled="!!staffForm.id" />
          <div class="form-tip">当前先按用户ID添加成员，适合运营后台快速配置。</div>
        </el-form-item>
        <el-form-item label="门店角色">
          <el-radio-group v-model="staffForm.role">
            <el-radio label="manager">店长</el-radio>
            <el-radio label="staff">店员</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="核销权限">
          <el-switch v-model="staffForm.can_verify" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="staffForm.remark" type="textarea" :rows="3" maxlength="80" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="staffFormVisible = false">取消</el-button>
        <el-button type="primary" :loading="staffSaving" @click="submitStaff">保存</el-button>
      </template>
    </el-dialog>
    <MapPickerDialog v-model="mapPickerVisible" :seed="mapPickerSeed" @confirm="onMapPickerConfirm" />
  </div>
</template>

<script setup>
import { ref, reactive, watch, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getPickupStations,
  getPickupStationById,
  createPickupStation,
  updatePickupStation,
  getPickupStationStaff,
  addPickupStationStaff,
  removePickupStationStaff
} from '@/api'
import { usePagination } from '@/composables/usePagination'
import MapPickerDialog from '@/components/MapPickerDialog.vue'
import { getUserNickname } from '@/utils/userDisplay'

const weekDays = [
  { v: 1, l: '周一' },
  { v: 2, l: '周二' },
  { v: 3, l: '周三' },
  { v: 4, l: '周四' },
  { v: 5, l: '周五' },
  { v: 6, l: '周六' },
  { v: 7, l: '周日' }
]

const searchForm = reactive({
  keyword: '',
  status: '',
  is_pickup_point: ''
})

const { pagination, resetPage, applyResponse } = usePagination({ defaultLimit: 20 })
const list = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const saving = ref(false)
const mapPickerVisible = ref(false)
const staffDialogVisible = ref(false)
const staffFormVisible = ref(false)
const staffSaving = ref(false)

const staffState = reactive({
  stationId: null,
  stationName: '',
  claimantName: '',
  loading: false,
  list: []
})
const displayUserName = (user, fallback = '-') => getUserNickname(user || {}, fallback)

const defaultStaffForm = () => ({
  id: null,
  user_id: null,
  role: 'staff',
  can_verify: 1,
  remark: ''
})

const staffForm = reactive(defaultStaffForm())

const mapPickerSeed = computed(() => ({
  province: form.province,
  city: form.city,
  district: form.district,
  address: form.address,
  longitude: form.longitude,
  latitude: form.latitude
}))

function onMapPickerConfirm(p) {
  form.longitude = String(p.longitude)
  form.latitude = String(p.latitude)
  if (p.province != null && p.province !== '') form.province = String(p.province)
  if (p.city != null && p.city !== '') form.city = String(p.city)
  if (p.district != null && p.district !== '') form.district = String(p.district)
  if (p.address != null && p.address !== '') form.address = String(p.address)
  ElMessage.success('已写入坐标' + (p.city ? '与地址' : ''))
}

const defaultForm = () => ({
  id: null,
  name: '',
  province: '',
  city: '',
  district: '',
  address: '',
  longitude: '',
  latitude: '',
  is_pickup_point: 1,
  logo_url: '',
  contact_name: '',
  contact_phone: '',
  business_days: [],
  business_time_start: '',
  business_time_end: '',
  intro: '',
  commission_rate: 0.05,
  status: 'active',
  pickup_commission_tier: 'A'
})

const form = reactive(defaultForm())
const timeStart = ref(null)
const timeEnd = ref(null)

function normalizeDays(raw) {
  if (raw == null || raw === '') return []
  if (Array.isArray(raw)) return raw.map((x) => parseInt(x, 10)).filter((n) => n >= 1 && n <= 7)
  if (typeof raw === 'string') {
    try {
      const a = JSON.parse(raw)
      return Array.isArray(a) ? a.map((x) => parseInt(x, 10)).filter((n) => n >= 1 && n <= 7) : []
    } catch {
      return []
    }
  }
  return []
}

function formatDays(raw) {
  const arr = normalizeDays(raw)
  if (!arr.length) return '—'
  return arr.map((n) => weekDays.find((d) => d.v === n)?.l || n).join('、')
}

watch([timeStart, timeEnd], () => {
  form.business_time_start = timeStart.value || ''
  form.business_time_end = timeEnd.value || ''
})

async function fetchList() {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      limit: pagination.limit,
      keyword: searchForm.keyword || undefined,
      status: searchForm.status || undefined
    }
    if (searchForm.is_pickup_point !== '' && searchForm.is_pickup_point != null) {
      params.is_pickup_point = searchForm.is_pickup_point
    }
    const data = await getPickupStations(params)
    list.value = data?.list || []
    applyResponse(data)
  } finally {
    loading.value = false
  }
}

function search() {
  resetPage()
  fetchList()
}

function resetSearch() {
  searchForm.keyword = ''
  searchForm.status = ''
  searchForm.is_pickup_point = ''
  search()
}

function openDialog(row) {
  Object.assign(form, defaultForm())
  timeStart.value = null
  timeEnd.value = null
  if (row) {
    form.id = row.id
    form.name = row.name || ''
    form.province = row.province || ''
    form.city = row.city || ''
    form.district = row.district || ''
    form.address = row.address || ''
    form.longitude = row.longitude != null ? String(row.longitude) : ''
    form.latitude = row.latitude != null ? String(row.latitude) : ''
    form.is_pickup_point = row.is_pickup_point ? 1 : 0
    form.logo_url = row.logo_url || ''
    form.contact_name = row.contact_name || ''
    form.contact_phone = row.contact_phone || ''
    form.business_days = normalizeDays(row.business_days)
    form.business_time_start = row.business_time_start || ''
    form.business_time_end = row.business_time_end || ''
    timeStart.value = form.business_time_start || null
    timeEnd.value = form.business_time_end || null
    form.intro = row.intro || ''
    form.commission_rate = row.commission_rate != null ? Number(row.commission_rate) : 0.05
    form.status = row.status || 'active'
    form.pickup_commission_tier = row.pickup_commission_tier || 'A'
  }
  dialogVisible.value = true
}

async function openStaffDialog(row) {
  if (!row?.id) return
  staffDialogVisible.value = true
  staffState.stationId = row.id
  staffState.stationName = row.name || ''
  staffState.claimantName = displayUserName(row.claimant, '')
  await loadStaffList(row.id)
}

function openStaffForm(row) {
  Object.assign(staffForm, defaultStaffForm())
  if (row) {
    staffForm.id = row.id
    staffForm.user_id = Number(row.user_id)
    staffForm.role = row.role || 'staff'
    staffForm.can_verify = Number(row.can_verify) === 1 ? 1 : 0
    staffForm.remark = row.remark || ''
  }
  staffFormVisible.value = true
}

async function loadStaffList(stationId = staffState.stationId) {
  if (!stationId) return
  staffState.loading = true
  try {
    const [staffData, detail] = await Promise.all([
      getPickupStationStaff(stationId),
      getPickupStationById(stationId)
    ])
    staffState.stationName = staffData?.station_name || detail?.name || staffState.stationName
    staffState.claimantName = displayUserName(detail?.claimant, '')
    staffState.list = staffData?.list || []
  } finally {
    staffState.loading = false
  }
}

async function submitStaff() {
  if (!staffState.stationId) return
  if (!Number.isFinite(Number(staffForm.user_id)) || Number(staffForm.user_id) <= 0) {
    ElMessage.warning('请填写有效的用户ID')
    return
  }
  staffSaving.value = true
  try {
    await addPickupStationStaff(staffState.stationId, {
      user_id: Number(staffForm.user_id),
      role: staffForm.role,
      can_verify: Number(staffForm.can_verify) === 1 ? 1 : 0,
      remark: staffForm.remark?.trim() || null
    })
    ElMessage.success(staffForm.id ? '成员已更新' : '成员已添加')
    staffFormVisible.value = false
    await loadStaffList()
    await fetchList()
  } finally {
    staffSaving.value = false
  }
}

async function handleRemoveStaff(row) {
  if (!staffState.stationId || !row?.id) return
  await ElMessageBox.confirm(`确认移除成员 UID ${row.user_id}？移除后将失去该门店核销权限。`, '移除成员', {
    type: 'warning'
  })
  await removePickupStationStaff(staffState.stationId, row.id)
  ElMessage.success('成员已移除')
  await loadStaffList()
  await fetchList()
}

async function submit() {
  if (!form.name?.trim() || !form.province?.trim() || !form.city?.trim()) {
    ElMessage.warning('请填写名称、省、市')
    return
  }
  saving.value = true
  try {
    const payload = {
      name: form.name.trim(),
      province: form.province.trim(),
      city: form.city.trim(),
      district: form.district?.trim() || null,
      address: form.address?.trim() || null,
      longitude: form.longitude === '' ? null : form.longitude,
      latitude: form.latitude === '' ? null : form.latitude,
      is_pickup_point: form.is_pickup_point,
      logo_url: form.logo_url?.trim() || null,
      contact_name: form.contact_name?.trim() || null,
      contact_phone: form.contact_phone?.trim() || null,
      business_days: form.business_days?.length ? [...form.business_days].sort((a, b) => a - b) : null,
      business_time_start: form.business_time_start || null,
      business_time_end: form.business_time_end || null,
      intro: form.intro?.trim() || null,
      commission_rate: form.commission_rate,
      status: form.status,
      pickup_commission_tier: form.pickup_commission_tier || 'A'
    }
    let resData
    if (form.id) {
      resData = await updatePickupStation(form.id, payload)
      ElMessage.success('已更新')
    } else {
      resData = await createPickupStation(payload)
      ElMessage.success('已创建')
    }
    if (resData?.geocode_note) {
      ElMessage.info(resData.geocode_note)
    }
    dialogVisible.value = false
    fetchList()
  } finally {
    saving.value = false
  }
}

fetchList()
</script>

<style scoped>
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.filter-container {
  margin-bottom: 16px;
}
.sub {
  font-size: 12px;
  color: #909399;
}
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.staff-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.staff-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  color: #606266;
  font-size: 14px;
}
.form-tip {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}
</style>
