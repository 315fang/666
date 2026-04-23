<template>
  <div class="pickup-inventory-page">
    <el-card>
      <template #header>
        <div class="header-row">
          <span>门店库存</span>
          <el-button @click="fetchList" :loading="loading">刷新</el-button>
        </div>
      </template>

      <el-form :inline="true" :model="filters" class="filter-row">
        <el-form-item label="门店">
          <el-select v-model="filters.station_id" clearable placeholder="全部门店" style="width: 220px">
            <el-option v-for="item in stationOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="filters.keyword" clearable placeholder="门店 / 商品 / 规格" style="width: 220px" @keyup.enter="fetchList" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchList">搜索</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column label="门店" min-width="180">
          <template #default="{ row }">
            <div>{{ row.station?.name || '-' }}</div>
            <div class="sub">{{ row.station?.city || '' }} {{ row.station?.district || '' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="商品" min-width="220">
          <template #default="{ row }">
            <div>{{ row.product?.name || '-' }}</div>
            <div class="sub" v-if="row.sku?.name || row.sku?.spec">{{ row.sku?.name || '' }} {{ row.sku?.spec || '' }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="available_qty" label="可用库存" width="120" />
        <el-table-column prop="reserved_qty" label="预占库存" width="120" />
        <el-table-column label="成本价" width="120">
          <template #default="{ row }">¥{{ Number(row.cost_price || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="row.stock_status === 'sufficient' ? 'success' : 'warning'">
              {{ row.stock_status === 'sufficient' ? '库存充足' : '库存紧张' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" @click="openAdjustDialog(row, 'add')">增加</el-button>
            <el-button text type="danger" @click="openAdjustDialog(row, 'subtract')">扣减</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="adjustVisible" :title="adjustForm.type === 'add' ? '增加库存' : '扣减库存'" width="420px">
      <el-form :model="adjustForm" label-width="100px">
        <el-form-item label="库存对象">
          <div>{{ adjustForm.title }}</div>
        </el-form-item>
        <el-form-item label="调整数量">
          <el-input-number v-model="adjustForm.quantity" :min="1" :step="1" />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="adjustForm.reason" type="textarea" :rows="3" maxlength="80" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitAdjust">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adjustPickupStationInventory, getPickupStationInventory, getPickupStations } from '@/api'

const loading = ref(false)
const saving = ref(false)
const list = ref([])
const stationOptions = ref([])
const adjustVisible = ref(false)
const filters = reactive({
  station_id: '',
  keyword: ''
})
const adjustForm = reactive({
  id: '',
  type: 'add',
  quantity: 1,
  reason: '',
  title: ''
})

async function fetchStations() {
  const res = await getPickupStations({ limit: 200 })
  stationOptions.value = res?.data?.list || res?.list || res?.data || []
}

async function fetchList() {
  loading.value = true
  try {
    const res = await getPickupStationInventory({
      station_id: filters.station_id || undefined,
      keyword: filters.keyword || undefined,
      limit: 200
    })
    list.value = res?.data?.list || res?.list || []
  } finally {
    loading.value = false
  }
}

function openAdjustDialog(row, type) {
  adjustForm.id = row.id
  adjustForm.type = type
  adjustForm.quantity = 1
  adjustForm.reason = ''
  adjustForm.title = `${row.station?.name || '-'} / ${row.product?.name || '-'}`
  adjustVisible.value = true
}

async function submitAdjust() {
  saving.value = true
  try {
    await adjustPickupStationInventory(adjustForm.id, {
      type: adjustForm.type,
      quantity: adjustForm.quantity,
      reason: adjustForm.reason
    })
    ElMessage.success('库存已更新')
    adjustVisible.value = false
    fetchList()
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await Promise.all([fetchStations(), fetchList()])
})
</script>

<style scoped>
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.filter-row {
  margin-bottom: 12px;
}

.sub {
  color: #909399;
  font-size: 12px;
}
</style>
