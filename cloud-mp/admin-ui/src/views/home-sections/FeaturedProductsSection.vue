<template>
  <div>
    <el-card>
      <template #header>
        <div class="card-header">
          <span>首页商品分组</span>
          <div class="header-actions">
            <el-select v-model="boardId" placeholder="选择分组" style="width:220px">
              <el-option v-for="board in productBoards" :key="board.id" :label="board.section_name || board.board_name" :value="board.id" />
            </el-select>
            <el-button @click="openBoardDialog">新增分组</el-button>
            <el-button type="primary" @click="openAddDialog">
              <el-icon><Plus /></el-icon>
              添加关联商品
            </el-button>
            <el-button :loading="savingSort" @click="saveSort">保存排序</el-button>
          </div>
        </div>
      </template>

      <el-alert
        title="这里管理首页按分组编排的商品内容。建议一个分组对应一个首页分类区块。"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px;"
      />

      <el-empty v-if="!productBoards.length && !featuredLoading" description="暂无商品分组，点击右上角新增分组" />

      <el-form v-if="currentBoard" inline class="board-meta-form">
        <el-form-item label="分组标题">
          <el-input v-model="boardDraft.section_name" style="width:220px" />
        </el-form-item>
        <el-form-item label="分组Key">
          <el-input v-model="boardDraft.section_key" style="width:240px" disabled />
        </el-form-item>
        <el-form-item label="显示">
          <el-switch v-model="boardDraft.is_visible" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" plain :loading="boardSaving" @click="saveBoardMeta">保存分组</el-button>
          <el-button :disabled="currentBoardIndex <= 0" @click="moveBoard(-1)">上移分组</el-button>
          <el-button :disabled="currentBoardIndex === -1 || currentBoardIndex >= productBoards.length - 1" @click="moveBoard(1)">下移分组</el-button>
          <el-button type="danger" plain @click="removeBoard">删除分组</el-button>
        </el-form-item>
      </el-form>

      <div v-loading="featuredLoading">
        <div
          v-for="(row, index) in featuredRows"
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

        <el-empty v-if="currentBoard && !featuredRows.length && !featuredLoading" description="当前分组暂无关联商品，点击右上角添加" />
      </div>
    </el-card>

    <el-dialog v-model="addDialogVisible" title="添加关联商品" width="600px">
      <el-form label-width="90px">
        <el-form-item label="挑选商品">
          <div style="width:100%;">
            <div style="display:flex; align-items:center; gap:10px;">
              <el-button @click="productPickerVisible = true">点击挑选商品</el-button>
              <span style="color:#606266; font-size:13px;">已挑选 <b>{{ selectedProductItems.length }}</b> 件</span>
              <el-button v-if="selectedProductItems.length" text type="danger" size="small" @click="clearPickedProducts">清空</el-button>
            </div>
            <div v-if="selectedProductItems.length" style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px; max-height:140px; overflow-y:auto;">
              <el-tag
                v-for="item in selectedProductItems"
                :key="item.id"
                closable
                @close="removeSelectedProduct(item.id)"
              >{{ item.name || `商品#${item.id}` }}</el-tag>
            </div>
            <div style="font-size:12px; color:#909399; margin-top:6px;">
              EntityPicker 仅支持按商品列表 ID 挑选，已挑选项跨页保留勾选；不再保留按 SKU/编码兜底输入框。
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="confirmAdd">添加</el-button>
      </template>
    </el-dialog>

    <EntityPicker
      v-model:visible="productPickerVisible"
      v-model="selectedProducts"
      entity="product"
      :multiple="true"
      :preselected-items="selectedProductItems"
      dialog-width="1000px"
      @confirm="onProductsPicked"
    />

    <el-dialog v-model="boardDialogVisible" title="新增商品分组" width="420px">
      <el-form label-width="90px">
        <el-form-item label="分组标题">
          <el-input v-model="boardForm.section_name" placeholder="如：新品专区 / 护肤精选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="boardDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="boardSaving" @click="saveBoard">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
// 2026-05-03 megapage 拆分（P1-2，最后一个 section）：
// 从 home-sections/index.vue 拆出。承担 "商品分组编排"（榜单 + dialog）的全部职责。
// 设计：与同目录 3 个 sibling 同模板——零 props/emits、onMounted 自治。
//
// 顺手 fix：原 parent <el-icon><Plus /></el-icon> 缺少 import { Plus }（其他 14 个
// admin-ui 文件都有正确 import），导致按钮图标渲染为空元素。本组件加上 import 修复。
//
// 详见 cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md §P1-2
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import {
  getHomeSections,
  createHomeSection,
  updateHomeSection,
  deleteHomeSection,
  updateSectionSort,
  getBoardProducts,
  addBoardProducts,
  updateBoardProduct,
  deleteBoardProduct,
  sortBoardProducts
} from '@/api/index'
import EntityPicker from '@/components/entity-picker'

const featuredLoading = ref(false)
const savingSort = ref(false)
const addDialogVisible = ref(false)
const submitting = ref(false)
const boardId = ref(null)
const productBoards = ref([])
const boardDialogVisible = ref(false)
const boardSaving = ref(false)
const boardForm = reactive({ section_name: '' })
const boardDraft = reactive({
  id: null,
  section_name: '',
  section_key: '',
  is_visible: true,
  sort_order: 0
})
const featuredRows = ref([])
const selectedProducts = ref([])      // EntityPicker 选出的商品 id 数组
const selectedProductItems = ref([])  // EntityPicker 选出的完整商品对象（仅前端用于 chip 显示 / 跨页回填）
const productPickerVisible = ref(false)
let dragFrom = -1

const productBoardLookup = computed(() => {
  const lookup = new Map()
  productBoards.value.forEach((item, index) => {
    lookup.set(String(item.id), { item, index })
  })
  return lookup
})
const currentBoardEntry = computed(() => productBoardLookup.value.get(String(boardId.value)) || null)
const currentBoard = computed(() => currentBoardEntry.value?.item || null)
const currentBoardIndex = computed(() => currentBoardEntry.value?.index ?? -1)

const syncBoardDraft = () => {
  const board = currentBoard.value
  Object.assign(boardDraft, {
    id: board?.id || null,
    section_name: board?.section_name || board?.board_name || '',
    section_key: board?.section_key || board?.board_key || '',
    is_visible: board ? board.is_visible !== 0 : true,
    sort_order: Number(board?.sort_order || 0)
  })
}

const loadFeaturedRows = async () => {
  if (!boardId.value) return
  const res = await getBoardProducts(boardId.value)
  featuredRows.value = Array.isArray(res) ? res : (res?.list || [])
}

const loadProductBoards = async () => {
  featuredLoading.value = true
  try {
    const boardsRes = await getHomeSections()
    const source = Array.isArray(boardsRes)
      ? boardsRes
      : (boardsRes?.list || boardsRes?.data?.list || boardsRes?.data || [])
    productBoards.value = (Array.isArray(source) ? source : [])
      .filter((item) => (item.section_type || item.board_type || 'product_board') === 'product_board')
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    if (!productBoards.value.length) {
      boardId.value = null
      featuredRows.value = []
      return
    }
    if (!boardId.value || !productBoardLookup.value.has(String(boardId.value))) {
      boardId.value = productBoards.value[0].id
    }
    syncBoardDraft()
    await loadFeaturedRows()
  } catch (_) {
    ElMessage.error('读取首页商品分组失败')
  } finally {
    featuredLoading.value = false
  }
}

const openBoardDialog = () => {
  boardForm.section_name = ''
  boardDialogVisible.value = true
}

const createBoardKey = (name) => `home.category.${Date.now()}`

const saveBoard = async () => {
  if (!boardForm.section_name.trim()) {
    ElMessage.warning('请先填写分组标题')
    return
  }
  boardSaving.value = true
  try {
    const sectionKey = createBoardKey(boardForm.section_name)
    const res = await createHomeSection({
      section_name: boardForm.section_name.trim(),
      board_name: boardForm.section_name.trim(),
      section_key: sectionKey,
      board_key: sectionKey,
      section_type: 'product_board',
      board_type: 'product_board',
      is_visible: 1,
      sort_order: productBoards.value.length * 10 + 10
    })
    boardDialogVisible.value = false
    await loadProductBoards()
    boardId.value = res?.id || productBoards.value.at(-1)?.id || boardId.value
    syncBoardDraft()
    ElMessage.success('商品分组已创建')
  } catch (_) {
    ElMessage.error('创建分组失败')
  } finally {
    boardSaving.value = false
  }
}

const saveBoardMeta = async () => {
  if (!boardDraft.id) return
  boardSaving.value = true
  try {
    await updateHomeSection(boardDraft.id, {
      section_name: boardDraft.section_name.trim(),
      board_name: boardDraft.section_name.trim(),
      section_key: boardDraft.section_key,
      board_key: boardDraft.section_key,
      is_visible: boardDraft.is_visible ? 1 : 0,
      sort_order: boardDraft.sort_order,
      section_type: 'product_board',
      board_type: 'product_board'
    })
    await loadProductBoards()
    ElMessage.success('分组信息已保存')
  } catch (_) {
    ElMessage.error('分组保存失败')
  } finally {
    boardSaving.value = false
  }
}

const moveBoard = async (delta) => {
  if (currentBoardIndex.value < 0) return
  const nextIndex = currentBoardIndex.value + delta
  if (nextIndex < 0 || nextIndex >= productBoards.value.length) return
  const arr = [...productBoards.value]
  const [current] = arr.splice(currentBoardIndex.value, 1)
  arr.splice(nextIndex, 0, current)
  productBoards.value = arr
  try {
    await updateSectionSort({
      orders: arr.map((item, index) => ({
        id: item.id,
        sort_order: index * 10,
        is_visible: item.is_visible
      }))
    })
    await loadProductBoards()
  } catch (_) {
    ElMessage.error('分组排序失败')
  }
}

const removeBoard = async () => {
  if (!currentBoard.value) return
  try {
    await ElMessageBox.confirm(`确认删除分组「${currentBoard.value.section_name || currentBoard.value.board_name}」？`, '提示', { type: 'warning' })
    await deleteHomeSection(currentBoard.value.id)
    boardId.value = null
    await loadProductBoards()
    ElMessage.success('分组已删除')
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('删除分组失败')
  }
}

const openAddDialog = () => {
  if (!boardId.value) {
    ElMessage.warning('请先选择或创建商品分组')
    return
  }
  selectedProducts.value = []
  selectedProductItems.value = []
  addDialogVisible.value = true
}

const onProductsPicked = (ids, items) => {
  selectedProducts.value = ids
  selectedProductItems.value = items || []
}

const removeSelectedProduct = (id) => {
  selectedProducts.value = selectedProducts.value.filter((x) => x !== id)
  selectedProductItems.value = selectedProductItems.value.filter((x) => x.id !== id)
}

const clearPickedProducts = () => {
  selectedProducts.value = []
  selectedProductItems.value = []
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
    await loadFeaturedRows()
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
    await deleteBoardProduct(boardId.value, row.id)
    ElMessage.success('已下榜')
    await loadFeaturedRows()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('下榜失败，请重试')
  }
}

const dragStart = (idx) => {
  dragFrom = idx
}

const dragOver = (idx) => {
  if (dragFrom < 0 || dragFrom === idx) return
  const arr = [...featuredRows.value]
  const [moved] = arr.splice(dragFrom, 1)
  arr.splice(idx, 0, moved)
  featuredRows.value = arr
  dragFrom = idx
}

const dragDrop = () => {
  dragFrom = -1
}

const saveSort = async () => {
  if (!featuredRows.value.length) return
  savingSort.value = true
  try {
    const total = featuredRows.value.length
    const orders = featuredRows.value.map((item, idx) => ({
      id: item.id,
      sort_order: total - idx
    }))
    await sortBoardProducts(boardId.value, orders)
    ElMessage.success('排序已保存')
    await loadFeaturedRows()
  } catch (_) {
    ElMessage.error('排序保存失败')
  } finally {
    savingSort.value = false
  }
}

watch(boardId, async (value, oldValue) => {
  if (!value || value === oldValue) return
  syncBoardDraft()
  await loadFeaturedRows()
})

onMounted(() => {
  loadProductBoards()
})
</script>

<style scoped>
/* 子组件需要重复 .card-header：parent 的 scoped .card-header 无法穿透到子组件 DOM。 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-actions {
  display: flex;
  gap: 8px;
}

.board-meta-form {
  margin-bottom: 16px;
  padding: 16px 16px 0;
  border-radius: 10px;
  background: #fafafa;
  border: 1px solid #ebeef5;
}

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
