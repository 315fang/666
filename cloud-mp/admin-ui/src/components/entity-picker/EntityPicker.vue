<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="(v) => emit('update:visible', v)"
    :title="adapter.title"
    :width="dialogWidth"
    :close-on-click-modal="false"
    @close="handleCancel"
    destroy-on-close
    class="entity-picker-dialog"
  >
    <div class="entity-picker">
      <div class="entity-picker__main">
        <div class="entity-picker__toolbar">
          <el-input
            v-model="keyword"
            :placeholder="adapter.searchPlaceholder || '输入关键字搜索'"
            clearable
            style="width:240px"
            :prefix-icon="Search"
            @keyup.enter="reload(true)"
            @clear="reload(true)"
          />
          <template v-for="filter in adapter.filterSchema || []" :key="filter.field">
            <el-select
              v-if="filter.type === 'select'"
              v-model="filterValues[filter.field]"
              :placeholder="filter.label"
              clearable
              :style="{ width: filter.width || '140px' }"
              @change="reload(true)"
            >
              <el-option v-for="opt in filter.options" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </template>
          <el-button @click="reload(true)" :loading="loading">查询</el-button>
        </div>

        <el-table
          ref="tableRef"
          :data="rows"
          v-loading="loading"
          :row-key="adapter.itemKey"
          highlight-current-row
          height="420"
          @row-click="onRowClick"
          @row-dblclick="onRowDblClick"
          @cell-mouse-enter="onCellEnter"
          @selection-change="onSelectionChange"
          stripe
        >
          <el-table-column v-if="multiple" type="selection" width="44" :selectable="isSelectable" />
          <el-table-column v-else width="44" align="center">
            <template #default="{ row }">
              <el-radio :model-value="singleId" :label="row[adapter.itemKey]" @click.stop="onRowClick(row)">
                <span></span>
              </el-radio>
            </template>
          </el-table-column>
          <el-table-column
            v-for="col in adapter.columns"
            :key="col.prop"
            :prop="col.prop"
            :label="col.label"
            :width="col.width"
            :min-width="col.minWidth"
            :formatter="col.formatter"
            :show-overflow-tooltip="col.showOverflowTooltip !== false"
          />
          <template #empty>
            <el-empty :description="loading ? '加载中…' : '没有匹配的数据'" :image-size="80" />
          </template>
        </el-table>

        <div class="entity-picker__pagination">
          <el-pagination
            v-model:current-page="page"
            v-model:page-size="limit"
            :total="total"
            :page-sizes="[10, 20, 50, 100]"
            small
            background
            layout="total, sizes, prev, pager, next, jumper"
            @current-change="reload(false)"
            @size-change="reload(true)"
          />
        </div>
      </div>

      <div v-if="previewPanel" class="entity-picker__preview">
        <div v-if="hoverItem" class="preview-content">
          <div class="preview-title">{{ hoverItem[adapter.previewTitleKey || 'name'] || `#${hoverItem[adapter.itemKey]}` }}</div>
          <div v-if="adapter.renderPreview" class="preview-body" v-html="adapter.renderPreview(hoverItem)" />
          <div v-else class="preview-fallback">
            <div v-for="col in (adapter.previewFields || adapter.columns)" :key="col.prop" class="preview-row">
              <span class="preview-label">{{ col.label }}</span>
              <span class="preview-value">{{ col.formatter ? col.formatter(hoverItem, col, hoverItem[col.prop]) : (hoverItem[col.prop] ?? '-') }}</span>
            </div>
          </div>
        </div>
        <el-empty v-else description="hover 行查看详情" :image-size="60" />
      </div>
    </div>

    <template #footer>
      <div class="entity-picker__footer">
        <span class="entity-picker__status">
          <template v-if="multiple">
            已选 <b>{{ selectedItems.length }}</b><template v-if="max"> / {{ max }}</template>
          </template>
          <template v-else>
            <span v-if="singleSelectedItem">已选：<b>{{ singleSelectedItem[adapter.previewTitleKey || 'name'] }}</b></span>
            <span v-else style="color:#909399">未选择</span>
          </template>
        </span>
        <div>
          <el-button @click="handleCancel">取消</el-button>
          <el-button type="primary" :disabled="!canConfirm" @click="handleConfirm">确认</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
/**
 * EntityPicker —— 通用「分页列表选择器」对话框
 *
 * 替代 admin-ui 各处分散的 `el-select filterable remote :remote-method` 模式（不输入不显示、
 * 没分页、看不全字段、单击即生效）。设计契约见
 * cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md §P1-2-followup
 *
 * 用法（单选）：
 *   <EntityPicker
 *     v-model:visible="show"
 *     v-model="form.product_id"
 *     entity="product"
 *     :preselected-items="form.product ? [form.product] : []"
 *     @confirm="(id, [item]) => { form.product = item }"
 *   />
 *
 * 用法（多选 + 上限）：
 *   <EntityPicker
 *     v-model:visible="show"
 *     v-model="selectedIds"
 *     entity="product"
 *     :multiple="true"
 *     :max="10"
 *     :preselected-items="currentRows"
 *     @confirm="(ids, items) => { ... }"
 *   />
 *
 * 交互：
 *   - 弹窗 mount 后立即拉首页（无需输入）
 *   - 单击行 = 切换勾选（保留弹窗）
 *   - 双击行 = 切换勾选 + 立即确认关窗（双击快捷键）
 *   - 底部"确认" = 提交当前已勾选 + 关窗
 *   - 底部"取消" = 不变更 + 关窗
 *   - 跨页保留勾选；翻页/筛选/搜索都不清掉已选
 *   - hover 行 → 右侧详情预览
 *
 * 添加新 entity：在 adapters/ 下加 .js 文件 + 在 ADAPTERS 里注册
 */
import { ref, reactive, computed, watch, nextTick, shallowRef } from 'vue'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import productAdapter from './adapters/product.js'
import userAdapter from './adapters/user.js'

const ADAPTERS = {
  product: productAdapter,
  user: userAdapter
}

const props = defineProps({
  visible: { type: Boolean, default: false },
  modelValue: { type: [String, Number, Array], default: null },
  entity: { type: String, required: true },
  multiple: { type: Boolean, default: false },
  max: { type: Number, default: 0 },
  filters: { type: Object, default: () => ({}) },
  preselectedItems: { type: Array, default: () => [] },
  dialogWidth: { type: String, default: '960px' },
  previewPanel: { type: Boolean, default: true }
})

const emit = defineEmits(['update:visible', 'update:modelValue', 'confirm', 'cancel'])

const adapter = computed(() => {
  const a = ADAPTERS[props.entity]
  if (!a) throw new Error(`[EntityPicker] Unknown entity: ${props.entity}. 已注册：${Object.keys(ADAPTERS).join(', ')}`)
  return a
})

const tableRef = ref(null)
const rows = ref([])
const total = ref(0)
const loading = ref(false)

const keyword = ref('')
const filterValues = reactive({})
const page = ref(1)
const limit = ref(20)

// 跨页保留已选项；map 用 itemKey 做主键，value 是完整 item 对象
const selectedMap = ref(new Map())
const singleId = ref(null)
const hoverItem = shallowRef(null)

const selectedItems = computed(() => Array.from(selectedMap.value.values()))
const singleSelectedItem = computed(() => singleId.value != null ? selectedMap.value.get(singleId.value) : null)

const canConfirm = computed(() => {
  if (props.multiple) return selectedItems.value.length > 0
  return singleId.value != null && singleId.value !== ''
})

async function reload(resetPage = false) {
  if (resetPage) page.value = 1
  loading.value = true
  try {
    const res = await adapter.value.fetchPage({
      keyword: keyword.value,
      page: page.value,
      limit: limit.value,
      filters: { ...props.filters, ...filterValues }
    })
    rows.value = Array.isArray(res?.list) ? res.list : []
    total.value = Number(res?.total || rows.value.length || 0)
    await nextTick()
    syncTableSelection()
  } catch (e) {
    console.error('[EntityPicker] fetchPage failed:', e)
    ElMessage.error(`加载${adapter.value.title}失败`)
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function syncTableSelection() {
  if (!props.multiple || !tableRef.value) return
  // 翻页/搜索后，需要把已选项在新一页 rows 上重新打勾
  rows.value.forEach((row) => {
    const key = row[adapter.value.itemKey]
    if (selectedMap.value.has(key)) {
      tableRef.value.toggleRowSelection(row, true)
    }
  })
}

function onRowClick(row) {
  const key = row[adapter.value.itemKey]
  if (props.multiple) {
    if (selectedMap.value.has(key)) {
      selectedMap.value.delete(key)
      tableRef.value?.toggleRowSelection(row, false)
    } else {
      if (props.max && selectedMap.value.size >= props.max) {
        ElMessage.warning(`最多选 ${props.max} 个`)
        return
      }
      selectedMap.value.set(key, row)
      tableRef.value?.toggleRowSelection(row, true)
    }
    selectedMap.value = new Map(selectedMap.value) // 触发 computed 更新
  } else {
    singleId.value = key
    selectedMap.value = new Map([[key, row]])
  }
}

function onRowDblClick(row) {
  // 双击 = 单击勾选 + 立即确认（快捷键）
  // 但要先确保这一行处于"已选"状态
  const key = row[adapter.value.itemKey]
  if (props.multiple) {
    if (!selectedMap.value.has(key)) {
      // 触发勾选；如果超 max 会被拦
      onRowClick(row)
      if (!selectedMap.value.has(key)) return
    }
  } else {
    singleId.value = key
    selectedMap.value = new Map([[key, row]])
  }
  handleConfirm()
}

function onCellEnter(row) {
  hoverItem.value = row
}

// el-table 自带 selection 触发的事件（用户点 checkbox 区域而不是 row）
function onSelectionChange(selection) {
  if (!props.multiple) return
  // 把 table 的当前可见 selection 跟 selectedMap 同步：
  //   - 当前页未在 selection 里、但 selectedMap 里有的 → 不动（跨页保留）
  //   - 当前页 row 在 selection 里 → 加入 selectedMap
  //   - 当前页 row 不在 selection 里、但 selectedMap 有 → 取消（来自用户主动 uncheck）
  const visibleKeys = new Set(rows.value.map(r => r[adapter.value.itemKey]))
  const selectionKeys = new Set(selection.map(r => r[adapter.value.itemKey]))
  const next = new Map(selectedMap.value)
  visibleKeys.forEach((k) => {
    if (selectionKeys.has(k)) {
      const row = rows.value.find(r => r[adapter.value.itemKey] === k)
      if (row) {
        if (!next.has(k)) {
          if (props.max && next.size >= props.max) {
            // 超上限，回滚 table 状态
            ElMessage.warning(`最多选 ${props.max} 个`)
            tableRef.value?.toggleRowSelection(row, false)
            return
          }
          next.set(k, row)
        }
      }
    } else if (next.has(k)) {
      next.delete(k)
    }
  })
  selectedMap.value = next
}

function isSelectable(row) {
  if (!props.multiple || !props.max) return true
  const key = row[adapter.value.itemKey]
  if (selectedMap.value.has(key)) return true
  return selectedMap.value.size < props.max
}

function handleConfirm() {
  if (props.multiple) {
    const ids = Array.from(selectedMap.value.keys())
    const items = Array.from(selectedMap.value.values())
    emit('update:modelValue', ids)
    emit('confirm', ids, items)
  } else {
    const item = singleId.value != null ? selectedMap.value.get(singleId.value) : null
    emit('update:modelValue', singleId.value)
    emit('confirm', singleId.value, item ? [item] : [])
  }
  emit('update:visible', false)
}

function handleCancel() {
  emit('cancel')
  emit('update:visible', false)
}

function hydrateFromPreselected() {
  selectedMap.value = new Map()
  singleId.value = null
  if (props.multiple) {
    const ids = Array.isArray(props.modelValue) ? props.modelValue : []
    if (!ids.length) return
    props.preselectedItems.forEach((item) => {
      if (!item || typeof item !== 'object') return
      const key = item[adapter.value.itemKey]
      if (ids.includes(key)) selectedMap.value.set(key, item)
    })
  } else if (props.modelValue != null && props.modelValue !== '') {
    const found = props.preselectedItems.find((item) => item && item[adapter.value.itemKey] === props.modelValue)
    if (found) selectedMap.value.set(props.modelValue, found)
    singleId.value = props.modelValue
  }
}

// 弹窗每次打开重置 + 拉首页
watch(() => props.visible, (v) => {
  if (!v) return
  keyword.value = ''
  Object.keys(filterValues).forEach((k) => delete filterValues[k])
  page.value = 1
  hoverItem.value = null
  hydrateFromPreselected()
  reload(false)
})
</script>

<style scoped>
.entity-picker { display: flex; gap: 16px; min-height: 540px; }
.entity-picker__main { flex: 1; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.entity-picker__toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.entity-picker__pagination { display: flex; justify-content: flex-end; }
.entity-picker__preview {
  width: 280px;
  flex-shrink: 0;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 12px;
  background: #fafbfc;
  overflow-y: auto;
  max-height: 540px;
}
.entity-picker__footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.entity-picker__status { color: #606266; font-size: 13px; }
.entity-picker__status b { color: #303133; font-size: 14px; }

.preview-title { font-weight: 600; font-size: 14px; margin-bottom: 12px; color: #303133; word-break: break-all; }
.preview-body { font-size: 13px; line-height: 1.6; color: #606266; }
.preview-fallback .preview-row { display: flex; gap: 8px; padding: 4px 0; font-size: 13px; border-bottom: 1px dashed #ebeef5; }
.preview-fallback .preview-row:last-child { border-bottom: none; }
.preview-label { color: #909399; min-width: 64px; flex-shrink: 0; }
.preview-value { color: #303133; word-break: break-all; flex: 1; }
</style>
