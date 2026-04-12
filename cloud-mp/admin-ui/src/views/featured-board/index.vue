<template>
  <div class="featured-board-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>首页精选商品榜</span>
          <div class="header-actions">
            <el-button type="primary" @click="openAddDialog">
              <el-icon><Plus /></el-icon>
              添加上榜商品
            </el-button>
            <el-button :loading="savingSort" @click="saveSort">保存排序</el-button>
          </div>
        </div>
      </template>

      <el-alert
        title="本页仅管理首页“精选商品”列表。拖拽后点击“保存排序”生效。"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px;"
      />

      <div v-loading="loading">
        <div
          v-for="(row, index) in rows"
          :key="row.id"
          class="row-item"
          draggable="true"
          @dragstart="dragStart(index)"
          @dragover.prevent="dragOver(index)"
          @drop.prevent="dragDrop(index)"
        >
          <div class="drag-handle">≡</div>
          <el-image :src="row.product?.cover_image" style="width:48px;height:48px;border-radius:6px;" fit="cover" />
          <div class="info">
            <div class="name">{{ row.product?.name || `商品#${row.product_id}` }}</div>
            <div class="meta">ID: {{ row.product_id }} · 价格: ¥{{ row.product?.retail_price || '-' }}</div>
          </div>
          <el-switch
            v-model="row.is_active"
            :active-value="true"
            :inactive-value="false"
            @change="(val) => toggleActive(row, val)"
          />
          <el-button text type="danger" @click="removeRow(row)">下榜</el-button>
        </div>

        <el-empty v-if="!rows.length && !loading" description="暂无上榜商品，点击右上角添加" />
      </div>
    </el-card>

    <el-dialog v-model="addDialogVisible" title="添加上榜商品" width="560px">
      <el-form label-width="90px">
        <el-form-item label="搜索商品">
          <el-select
            v-model="selectedProducts"
            multiple
            filterable
            remote
            reserve-keyword
            :remote-method="searchProducts"
            :loading="searchLoading"
            style="width:100%;"
            placeholder="输入商品名称搜索后可多选"
          >
            <el-option
              v-for="item in productOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            >
              <div class="option-row">
                <el-image
                  :src="(Array.isArray(item.images) ? item.images[0] : '')"
                  style="width:24px;height:24px;border-radius:4px;"
                  fit="cover"
                />
                <span>{{ item.name }}</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="confirmAdd">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getFeaturedBoard,
  getBoardProducts,
  addBoardProducts,
  updateBoardProduct,
  deleteBoardProduct,
  sortBoardProducts,
  getProducts
} from '@/api'

const loading = ref(false)
const savingSort = ref(false)
const submitting = ref(false)
const addDialogVisible = ref(false)
const searchLoading = ref(false)

const boardId = ref(null)
const rows = ref([])
const productOptions = ref([])
const selectedProducts = ref([])

let dragFrom = -1

const loadBoard = async () => {
  loading.value = true
  try {
    const boardsRes = await getFeaturedBoard()
    const boards = Array.isArray(boardsRes) ? boardsRes : (boardsRes.data || boardsRes.list || [])
    const board = boards[0]
    if (!board?.id) {
      ElMessage.error('未找到首页精选商品榜，请先检查后端初始化')
      return
    }
    boardId.value = board.id
    await loadRows()
  } catch (e) {
    ElMessage.error('读取精选商品榜失败')
  } finally {
    loading.value = false
  }
}

const loadRows = async () => {
  if (!boardId.value) return
  const res = await getBoardProducts(boardId.value)
  rows.value = Array.isArray(res) ? res : (res?.list || [])
}

const openAddDialog = () => {
  selectedProducts.value = []
  productOptions.value = []
  addDialogVisible.value = true
}

const searchProducts = async (keyword) => {
  if (!keyword) return
  searchLoading.value = true
  try {
    const res = await getProducts({ keyword, limit: 20, status: 1 })
    productOptions.value = res?.list || (Array.isArray(res) ? res : [])
  } catch (_) {
    productOptions.value = []
  } finally {
    searchLoading.value = false
  }
}

const confirmAdd = async () => {
  if (!selectedProducts.value.length) {
    ElMessage.warning('请先选择商品')
    return
  }
  submitting.value = true
  try {
    await addBoardProducts(boardId.value, selectedProducts.value)
    ElMessage.success('添加成功')
    addDialogVisible.value = false
    await loadRows()
  } catch (_) {
    ElMessage.error('添加失败')
  } finally {
    submitting.value = false
  }
}

const toggleActive = async (row, val) => {
  try {
    await updateBoardProduct(boardId.value, row.id, { is_active: val })
    ElMessage.success('状态已更新')
  } catch (_) {
    row.is_active = !val
    ElMessage.error('状态更新失败')
  }
}

const removeRow = async (row) => {
  try {
    await ElMessageBox.confirm('确认将该商品下榜？', '提示', { type: 'warning' })
    try {
      await deleteBoardProduct(boardId.value, row.id)
      ElMessage.success('已下榜')
      await loadRows()
    } catch (e) {
      ElMessage.error('下榜失败，请重试')
    }
  } catch (_) {
    // 用户点击取消，不做任何处理
  }
}

const dragStart = (idx) => {
  dragFrom = idx
}

const dragOver = (idx) => {
  if (dragFrom < 0 || dragFrom === idx) return
  const arr = [...rows.value]
  const [moved] = arr.splice(dragFrom, 1)
  arr.splice(idx, 0, moved)
  rows.value = arr
  dragFrom = idx
}

const dragDrop = () => {
  dragFrom = -1
}

const saveSort = async () => {
  if (!rows.value.length) return
  savingSort.value = true
  try {
    const total = rows.value.length
    const orders = rows.value.map((item, idx) => ({
      id: item.id,
      sort_order: total - idx
    }))
    await sortBoardProducts(boardId.value, orders)
    ElMessage.success('排序已保存')
    await loadRows()
  } catch (_) {
    ElMessage.error('排序保存失败')
  } finally {
    savingSort.value = false
  }
}

onMounted(loadBoard)
</script>

<style scoped>
.card-header { display: flex; align-items: center; justify-content: space-between; }
.header-actions { display: flex; gap: 8px; }
.row-item {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: #fff;
}
.drag-handle { color: #999; cursor: move; width: 20px; text-align: center; font-size: 18px; }
.info { flex: 1; }
.name { font-size: 14px; color: #303133; font-weight: 500; }
.meta { font-size: 12px; color: #909399; margin-top: 2px; }
.option-row { display: flex; align-items: center; gap: 8px; }
</style>
