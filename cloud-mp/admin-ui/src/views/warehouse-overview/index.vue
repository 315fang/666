<template>
  <div class="warehouse-overview-page">
    <el-row :gutter="16" class="summary-row">
      <el-col :span="6" v-for="item in summaryCards" :key="item.label">
        <el-card shadow="hover">
          <div class="summary-card">
            <div class="summary-label">{{ item.label }}</div>
            <div class="summary-value">{{ item.value }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="overview-card">
      <template #header>
        <div class="header-row">
          <span>低库存门店商品</span>
          <el-button @click="fetchData" :loading="loading">刷新</el-button>
        </div>
      </template>

      <el-table :data="lowStockRows" v-loading="loading" stripe>
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
            <el-tag :type="row.stock_status === 'tight' ? 'warning' : 'info'">
              {{ row.stock_status === 'tight' ? '库存紧张' : '待补货' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !lowStockRows.length" description="当前没有低库存门店商品" />
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { getPickupWarehouseOverview } from '@/api'

const loading = ref(false)
const summary = ref({
  station_count: 0,
  station_sku_count: 0,
  available_qty: 0,
  reserved_qty: 0,
  low_stock_count: 0,
  low_stock_station_count: 0
})
const lowStockRows = ref([])

const summaryCards = computed(() => ([
  { label: '门店数', value: summary.value.station_count || 0 },
  { label: '门店库存 SKU', value: summary.value.station_sku_count || 0 },
  { label: '可用库存', value: summary.value.available_qty || 0 },
  { label: '预占库存', value: summary.value.reserved_qty || 0 }
]))

async function fetchData() {
  loading.value = true
  try {
    const res = await getPickupWarehouseOverview()
    const data = res?.data || res || {}
    summary.value = data.summary || summary.value
    lowStockRows.value = data.low_stock || []
  } finally {
    loading.value = false
  }
}

onMounted(fetchData)
</script>

<style scoped>
.summary-row {
  margin-bottom: 16px;
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.summary-label,
.sub {
  color: #909399;
  font-size: 12px;
}

.summary-value {
  font-size: 24px;
  font-weight: 600;
}

.overview-card {
  margin-top: 8px;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
