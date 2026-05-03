<template>
  <div class="bundle-list-section">
    <el-card class="search-card">
      <div class="bundle-toolbar">
        <div>
          <div class="page-title">自由选套餐</div>
          <div class="page-subtitle">运营只需要配置固定价、选择步骤和候选商品；高级规则按需展开。</div>
        </div>
        <div class="toolbar-actions">
          <el-input v-model="searchForm.keyword" placeholder="搜索套餐名称" clearable class="toolbar-search" @keyup.enter="handleSearch" />
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="showAdvancedFilters = !showAdvancedFilters">{{ showAdvancedFilters ? '收起筛选' : '更多筛选' }}</el-button>
          <el-button type="success" :icon="Plus" @click="emitNew">新建套餐</el-button>
        </div>
      </div>
      <el-form v-if="showAdvancedFilters" :inline="true" :model="searchForm" class="advanced-filter-row">
        <el-form-item label="上架状态">
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable style="width: 140px">
            <el-option label="上架中" :value="1" />
            <el-option label="已下架" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item label="发布状态">
          <el-select v-model="searchForm.publish_status" placeholder="全部发布状态" clearable style="width: 150px">
            <el-option label="已发布" value="published" />
            <el-option label="草稿" value="draft" />
            <el-option label="已归档" value="archived" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="searchForm.scene_type" placeholder="类型" style="width: 140px">
            <el-option label="自由选套餐" value="flex_bundle" />
            <el-option label="全部类型" value="" />
            <el-option label="历史组合" value="explosive_bundle" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card style="margin-top: 16px">
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column label="搭配套装" min-width="280">
          <template #default="{ row }">
            <div class="bundle-cell">
              <el-image :src="row.cover_preview_url || row.cover_image" class="bundle-thumb" fit="cover">
                <template #error>
                  <div class="bundle-thumb bundle-thumb-placeholder">套装</div>
                </template>
              </el-image>
              <div class="bundle-meta">
                <div class="bundle-title">{{ row.title }}</div>
                <div class="bundle-subtitle">{{ row.subtitle || '—' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.scene_type === 'flex_bundle' ? 'warning' : 'info'">
              {{ row.scene_type === 'flex_bundle' ? '自由选套餐' : '历史组合' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="套装价" width="120" align="right">
          <template #default="{ row }">¥{{ money(row.bundle_price) }}</template>
        </el-table-column>
        <el-table-column label="步骤/候选" width="120" align="center">
          <template #default="{ row }">{{ row.group_count }} / {{ row.option_count }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="Number(row.status) === 1 ? 'success' : 'info'">{{ Number(row.status) === 1 ? '上架中' : '已下架' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发布" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.publish_status === 'published' ? 'success' : (row.publish_status === 'draft' ? 'warning' : 'info')">
              {{ row.publish_status === 'published' ? '已发布' : (row.publish_status === 'draft' ? '草稿' : '已归档') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="180">
          <template #default="{ row }">{{ row.updated_at || row.created_at || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="emitEdit(row)">编辑</el-button>
            <el-button
              text
              :type="Number(row.status) === 1 ? 'warning' : 'success'"
              size="small"
              @click="handleToggleStatus(row)"
            >
              {{ Number(row.status) === 1 ? '下架' : '上架' }}
            </el-button>
            <el-button text type="danger" size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.limit"
        :total="pagination.total"
        :page-sizes="pagination.pageSizes"
        layout="total, sizes, prev, pager, next"
        @size-change="fetchBundles"
        @current-change="fetchBundles"
        style="margin-top:16px; justify-content:flex-end"
      />
    </el-card>
  </div>
</template>

<script setup>
// 2026-05-03 megapage 拆分（P1-2，第一阶段）：
// 从 product-bundles/index.vue 拆出，承担列表+搜索+分页+行操作（编辑/上下架/删除）。
// 设计：自治 onMounted fetch；编辑/新建仅 emit 上交父级，由父级打开 BundleEditDrawer。
// 父级在抽屉保存成功后通过 listRef.value.refresh() 刷新列表（defineExpose）。
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { usePagination } from '@/composables/usePagination'
import {
  getProductBundles,
  updateProductBundle,
  deleteProductBundle
} from '@/api'

const emit = defineEmits(['edit', 'new'])

const loading = ref(false)
const showAdvancedFilters = ref(false)
const tableData = ref([])
const { pagination, resetPage, applyResponse } = usePagination()

const searchForm = reactive({
  keyword: '',
  status: '',
  publish_status: '',
  scene_type: 'flex_bundle'
})

const money = (value) => {
  const num = Number(value || 0)
  return Number.isFinite(num) ? num.toFixed(2) : '0.00'
}

const fetchBundles = async () => {
  loading.value = true
  try {
    const res = await getProductBundles({
      keyword: searchForm.keyword || undefined,
      status: searchForm.status !== '' ? searchForm.status : undefined,
      publish_status: searchForm.publish_status || undefined,
      scene_type: searchForm.scene_type || undefined,
      page: pagination.page,
      limit: pagination.limit
    })
    tableData.value = res?.list || []
    applyResponse(res)
  } catch (error) {
    ElMessage.error(error?.message || '加载组合列表失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  resetPage()
  fetchBundles()
}

const handleReset = () => {
  searchForm.keyword = ''
  searchForm.status = ''
  searchForm.publish_status = ''
  searchForm.scene_type = 'flex_bundle'
  handleSearch()
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(`确认删除「${row.title}」？`, '确认删除', { type: 'warning' })
    await deleteProductBundle(row.id)
    ElMessage.success('已删除')
    fetchBundles()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error?.message || '删除组合失败')
    }
  }
}

const handleToggleStatus = async (row) => {
  const newStatus = Number(row.status) === 1 ? 0 : 1
  const actionText = newStatus === 1 ? '上架' : '下架'
  try {
    await ElMessageBox.confirm(`确认${actionText}「${row.title}」？`, `${actionText}确认`, { type: 'warning' })
    await updateProductBundle(row.id, { status: newStatus })
    ElMessage.success(`已${actionText}`)
    fetchBundles()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error?.message || `${actionText}失败`)
    }
  }
}

const emitEdit = (row) => emit('edit', row)
const emitNew = () => emit('new')

defineExpose({ refresh: fetchBundles })

onMounted(() => {
  fetchBundles()
})
</script>

<style scoped>
.bundle-list-section { display: block; }

.bundle-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 18px;
}

.page-title {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}

.page-subtitle {
  margin-top: 6px;
  font-size: 13px;
  color: #6b7280;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.toolbar-search {
  width: 260px;
}

.advanced-filter-row {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}

.bundle-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bundle-thumb,
.bundle-thumb-placeholder {
  width: 72px;
  height: 72px;
  border-radius: 12px;
  background: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 12px;
}

.bundle-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bundle-title {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.bundle-subtitle {
  font-size: 12px;
  color: #6b7280;
}

@media (max-width: 1180px) {
  .bundle-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 760px) {
  .toolbar-search {
    width: 100%;
  }
}
</style>
