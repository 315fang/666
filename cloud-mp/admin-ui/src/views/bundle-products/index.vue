<template>
  <div class="bundle-products-page">
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm">
        <el-form-item>
          <el-input v-model="searchForm.keyword" placeholder="组合商品 / 原商品名称" clearable style="width: 220px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item>
          <el-select v-model="searchForm.category_id" placeholder="全部分类" clearable style="width: 150px">
            <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable style="width: 120px">
            <el-option label="启用" :value="1" />
            <el-option label="停用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
          <el-button type="success" :icon="Plus" @click="openForm()">加入组合库</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card">
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column label="组合商品" min-width="280">
          <template #default="{ row }">
            <div class="product-cell">
              <el-image :src="row.image" class="product-img" fit="cover" />
              <div class="product-copy">
                <div class="product-name">
                  <span>{{ row.name }}</span>
                  <el-tag size="small" type="success" effect="plain">特惠随心选</el-tag>
                </div>
                <div class="product-sub">原商品：{{ row.product_name || row.source_product_id }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="category_name" label="组合分类" width="150">
          <template #default="{ row }">{{ row.category_name || '未分类' }}</template>
        </el-table-column>
        <el-table-column label="价格 / 库存" width="130">
          <template #default="{ row }">
            <div class="metric-stack">
              <span>¥{{ row.retail_price || 0 }}</span>
              <small>库存 {{ row.stock || 0 }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="sort_order" label="排序" width="90" align="center" />
        <el-table-column label="启用" width="90" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.status" :active-value="1" :inactive-value="0" @change="(v) => handleStatusChange(row, v)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="openForm(row)">编辑</el-button>
            <el-button text type="danger" size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.limit"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        class="pagination"
        @size-change="fetchBundleProducts"
        @current-change="fetchBundleProducts"
      />
    </el-card>

    <el-drawer
      v-model="formVisible"
      :title="form.id ? '编辑组合商品' : '加入特惠随心选'"
      size="560px"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="原商品" prop="source_product_id">
          <el-select
            v-model="form.source_product_id"
            filterable
            remote
            reserve-keyword
            clearable
            :remote-method="searchSourceProducts"
            placeholder="搜索普通商品并加入组合库"
            style="width: 100%"
            @change="onSourceProductChange"
          >
            <el-option
              v-for="item in mergedSourceProductOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            >
              <div class="source-option">
                <span>{{ item.label }}</span>
                <small>{{ item.category_name || '未分类' }}</small>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="组合库展示名称" prop="name">
          <el-input v-model="form.name" maxlength="50" placeholder="默认使用原商品名称，可单独命名" />
        </el-form-item>
        <el-form-item label="组合分类">
          <el-select v-model="form.category_id" clearable placeholder="可沿用原商品分类，也可重新标记" style="width: 100%" @change="onCategoryChange">
            <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort_order" :precision="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="停用" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="3" maxlength="120" placeholder="内部备注，选填" />
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="drawer-footer">
          <el-button @click="formVisible = false">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="submitForm">保存</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import {
  getProducts,
  getCategories,
  getBundleProducts,
  createBundleProduct,
  updateBundleProduct,
  updateBundleProductStatus,
  deleteBundleProduct
} from '@/api'

const loading = ref(false)
const submitting = ref(false)
const formVisible = ref(false)
const formRef = ref(null)
const tableData = ref([])
const categories = ref([])
const sourceProductOptions = ref([])

const searchForm = reactive({
  keyword: '',
  category_id: '',
  status: ''
})

const pagination = reactive({
  page: 1,
  limit: 20,
  total: 0
})

const defaultForm = () => ({
  id: null,
  source_product_id: '',
  source_product_name: '',
  name: '',
  category_id: '',
  category_name: '',
  sort_order: 0,
  status: 1,
  remark: ''
})

const form = reactive(defaultForm())

const rules = {
  source_product_id: [{ required: true, message: '请选择原商品', trigger: 'change' }],
  name: [{ required: true, message: '请填写组合库展示名称', trigger: 'blur' }]
}

const mergedSourceProductOptions = computed(() => {
  const current = form.source_product_id
    ? [{
        value: String(form.source_product_id),
        label: form.source_product_name || String(form.source_product_id),
        category_name: form.category_name
      }]
    : []
  const seen = new Set()
  return [...current, ...sourceProductOptions.value].filter((item) => {
    const key = String(item.value || '').trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
})

function applyResponse(res = {}) {
  pagination.total = Number(res?.total ?? res?.pagination?.total ?? 0)
}

async function loadCategories() {
  try {
    const res = await getCategories()
    categories.value = res?.data || res?.list || res || []
  } catch (error) {
    ElMessage.error(error?.message || '加载分类失败')
  }
}

async function fetchBundleProducts() {
  loading.value = true
  try {
    const res = await getBundleProducts({
      keyword: searchForm.keyword || undefined,
      category_id: searchForm.category_id || undefined,
      status: searchForm.status !== '' ? searchForm.status : undefined,
      page: pagination.page,
      limit: pagination.limit
    })
    tableData.value = res?.list || res?.data?.list || []
    applyResponse(res)
  } catch (error) {
    if (!error?.__handledByRequest) {
      ElMessage.error(error?.message || '加载特惠随心选失败')
    }
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  pagination.page = 1
  fetchBundleProducts()
}

function handleReset() {
  Object.assign(searchForm, { keyword: '', category_id: '', status: '' })
  handleSearch()
}

function resetForm() {
  Object.assign(form, defaultForm())
}

function openForm(row = null) {
  resetForm()
  if (row) {
    Object.assign(form, {
      id: row.id,
      source_product_id: row.source_product_id || row.product_id || '',
      source_product_name: row.product_name || row.source_product_id || '',
      name: row.name || '',
      category_id: row.category_id || '',
      category_name: row.category_name || '',
      sort_order: Number(row.sort_order || 0),
      status: Number(row.status || 0) === 0 ? 0 : 1,
      remark: row.remark || ''
    })
  }
  formVisible.value = true
}

function onCategoryChange(value) {
  const matched = categories.value.find((item) => String(item.id) === String(value))
  form.category_name = matched?.name || ''
}

async function searchSourceProducts(keyword) {
  const query = String(keyword || '').trim()
  if (!query) return
  try {
    const res = await getProducts({ keyword: query, status: 1, limit: 20 })
    const list = res?.list || res?.data?.list || []
    sourceProductOptions.value = list.map((item) => ({
      value: String(item.id || item._id || ''),
      label: item.name || String(item.id || item._id || ''),
      category_id: item.category_id || '',
      category_name: item.category?.name || item.category_name || ''
    }))
  } catch (_error) {}
}

function onSourceProductChange(value) {
  const matched = sourceProductOptions.value.find((item) => item.value === String(value || ''))
  if (!matched) return
  form.source_product_name = matched.label
  if (!form.name) form.name = matched.label
  form.category_id = matched.category_id || form.category_id
  form.category_name = matched.category_name || form.category_name
}

async function handleStatusChange(row, value) {
  const oldValue = value === 1 ? 0 : 1
  try {
    await updateBundleProductStatus(row.id, { status: value })
    ElMessage.success(value === 1 ? '已启用' : '已停用')
    await fetchBundleProducts()
  } catch (error) {
    row.status = oldValue
    if (!error?.__handledByRequest) {
      ElMessage.error(error?.message || '状态更新失败')
    }
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(`确认删除组合商品「${row.name}」？`, '确认删除', { type: 'warning' })
    await deleteBundleProduct(row.id)
    ElMessage.success('已删除')
    await fetchBundleProducts()
  } catch (error) {
    if (error !== 'cancel' && !error?.__handledByRequest) {
      ElMessage.error(error?.message || '删除失败')
    }
  }
}

async function submitForm() {
  try {
    await formRef.value?.validate()
  } catch {
    ElMessage.warning('请检查必填项')
    return
  }

  submitting.value = true
  try {
    const payload = {
      source_product_id: form.source_product_id,
      product_id: form.source_product_id,
      name: form.name,
      category_id: form.category_id,
      category_name: form.category_name,
      sort_order: Number(form.sort_order || 0),
      status: Number(form.status || 0) === 0 ? 0 : 1,
      remark: form.remark
    }
    if (form.id) {
      await updateBundleProduct(form.id, payload)
      ElMessage.success('组合商品已更新')
    } else {
      await createBundleProduct(payload)
      ElMessage.success('组合商品已加入')
    }
    formVisible.value = false
    await fetchBundleProducts()
  } catch (error) {
    if (!error?.__handledByRequest) {
      ElMessage.error(error?.message || '保存失败')
    }
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadCategories()
  fetchBundleProducts()
})
</script>

<style scoped>
.bundle-products-page {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.table-card {
  margin-top: 16px;
}

.product-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.product-img {
  width: 56px;
  height: 56px;
  border-radius: 6px;
  background: #f5f7fa;
  flex-shrink: 0;
}

.product-copy {
  min-width: 0;
}

.product-name {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.product-sub {
  font-size: 12px;
  color: #6b7280;
}

.metric-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  color: #111827;
}

.metric-stack small {
  color: #6b7280;
}

.pagination {
  margin-top: 16px;
  justify-content: flex-end;
}

.source-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.source-option small {
  color: #909399;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
