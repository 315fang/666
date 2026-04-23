<template>
  <div class="pickup-procurements-page">
    <el-card>
      <template #header>
        <div class="header-row">
          <span>门店备货采购单</span>
          <el-button type="primary" @click="openCreateDialog">新建采购单</el-button>
        </div>
      </template>

      <el-form :inline="true" :model="filters" class="filter-row">
        <el-form-item label="门店">
          <el-select v-model="filters.station_id" clearable placeholder="全部门店" style="width: 220px">
            <el-option v-for="item in stationOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" clearable placeholder="全部状态" style="width: 180px">
            <el-option label="待入库" value="pending_receive" />
            <el-option label="已入库" value="received" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchList">搜索</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="procurement_no" label="采购单号" width="180" />
        <el-table-column label="门店" min-width="180">
          <template #default="{ row }">
            <div>{{ row.station?.name || row.station_snapshot?.name || '-' }}</div>
            <div class="sub">{{ row.station?.city || row.station_snapshot?.city || '' }} {{ row.station?.district || row.station_snapshot?.district || '' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="商品" min-width="220">
          <template #default="{ row }">
            <div>{{ row.product?.name || row.product_snapshot?.name || '-' }}</div>
            <div class="sub" v-if="row.sku?.name || row.product_snapshot?.sku_name">{{ row.sku?.name || row.product_snapshot?.sku_name || '' }} {{ row.sku?.spec || row.product_snapshot?.sku_spec || '' }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="quantity" label="数量" width="100" />
        <el-table-column label="成本价" width="120">
          <template #default="{ row }">¥{{ Number(row.cost_price || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="总成本" width="120">
          <template #default="{ row }">¥{{ Number(row.total_cost || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="供应商/经办人" min-width="180">
          <template #default="{ row }">
            <div>{{ row.supplier_name || '-' }}</div>
            <div class="sub">{{ row.operator_name || '-' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="预计到货" width="120">
          <template #default="{ row }">{{ row.expected_arrival_date || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="row.status === 'received' ? 'success' : 'warning'">
              {{ row.status === 'received' ? '已入库' : '待入库' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" :disabled="row.status !== 'pending_receive'" @click="handleReceive(row)">确认入库</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" title="新建门店采购单" width="620px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="门店" required>
          <el-select v-model="form.station_id" filterable style="width: 100%" placeholder="请选择门店">
            <el-option v-for="item in stationOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="商品" required>
          <el-select v-model="form.product_id" filterable style="width: 100%" placeholder="请选择商品" @change="onProductChange">
            <el-option v-for="item in productOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="规格">
          <el-select v-model="form.sku_id" clearable style="width: 100%" placeholder="无规格可留空">
            <el-option v-for="item in skuOptions" :key="item.id" :label="buildSkuLabel(item)" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="采购数量" required>
          <el-input-number v-model="form.quantity" :min="1" :step="1" />
        </el-form-item>
        <el-form-item label="成本价">
          <el-input-number v-model="form.cost_price" :min="0" :step="0.01" :precision="2" />
          <span class="sub form-tip">留空时按当前门店认领人的默认供货价计算。</span>
        </el-form-item>
        <el-form-item label="供应商" required>
          <el-input v-model="form.supplier_name" placeholder="请输入供应商" />
        </el-form-item>
        <el-form-item label="经办人" required>
          <el-input v-model="form.operator_name" placeholder="请输入经办人" />
        </el-form-item>
        <el-form-item label="预计到货">
          <el-date-picker v-model="form.expected_arrival_date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="3" maxlength="120" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createPickupProcurement, getPickupProcurements, getPickupStations, getProductById, getProducts, receivePickupProcurement } from '@/api'

const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const list = ref([])
const stationOptions = ref([])
const productOptions = ref([])
const skuOptions = ref([])

const filters = reactive({
  station_id: '',
  status: ''
})

const form = reactive({
  station_id: '',
  product_id: '',
  sku_id: '',
  quantity: 1,
  cost_price: null,
  supplier_name: '',
  operator_name: '',
  expected_arrival_date: '',
  remark: ''
})

function resetForm() {
  form.station_id = ''
  form.product_id = ''
  form.sku_id = ''
  form.quantity = 1
  form.cost_price = null
  form.supplier_name = ''
  form.operator_name = ''
  form.expected_arrival_date = ''
  form.remark = ''
  skuOptions.value = []
}

function buildSkuLabel(item) {
  return [item.name, item.spec || item.spec_value || ''].filter(Boolean).join(' / ')
}

async function fetchBaseOptions() {
  const [stationsRes, productsRes] = await Promise.all([
    getPickupStations({ limit: 200 }),
    getProducts({ limit: 200 })
  ])
  stationOptions.value = stationsRes?.data?.list || stationsRes?.list || []
  productOptions.value = productsRes?.data?.list || productsRes?.list || []
}

async function fetchList() {
  loading.value = true
  try {
    const res = await getPickupProcurements({
      station_id: filters.station_id || undefined,
      status: filters.status || undefined,
      limit: 200
    })
    list.value = res?.data?.list || res?.list || []
  } finally {
    loading.value = false
  }
}

async function onProductChange(productId) {
  form.sku_id = ''
  skuOptions.value = []
  if (!productId) return
  const res = await getProductById(productId)
  const product = res?.data || res || {}
  skuOptions.value = Array.isArray(product.skus) ? product.skus : []
}

function openCreateDialog() {
  resetForm()
  dialogVisible.value = true
}

async function submitCreate() {
  saving.value = true
  try {
    await createPickupProcurement({
      station_id: form.station_id,
      product_id: form.product_id,
      sku_id: form.sku_id || undefined,
      quantity: form.quantity,
      cost_price: form.cost_price || undefined,
      supplier_name: form.supplier_name,
      operator_name: form.operator_name,
      expected_arrival_date: form.expected_arrival_date || undefined,
      remark: form.remark || undefined
    })
    ElMessage.success('采购单已创建')
    dialogVisible.value = false
    fetchList()
  } finally {
    saving.value = false
  }
}

async function handleReceive(row) {
  await ElMessageBox.confirm(`确认将采购单 ${row.procurement_no} 入库到门店库存？`, '确认入库', {
    type: 'warning'
  })
  await receivePickupProcurement(row.id)
  ElMessage.success('已完成门店入库')
  fetchList()
}

onMounted(async () => {
  await Promise.all([fetchBaseOptions(), fetchList()])
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

.form-tip {
  margin-left: 8px;
}
</style>
