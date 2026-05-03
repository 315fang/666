<template>
  <div class="limited-sales-page">
    <el-alert
      title="限时商品已从活动卡片里的专享商品配置中独立出来。活动页继续保留入口卡，这里负责真正的档期与商品售卖规则。"
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    />

    <div class="limited-sales-grid">
      <el-card class="slot-card">
        <template #header>
          <div class="card-header">
            <div>
              <div class="card-title">限时档期</div>
              <div class="card-subtitle">配置具体日期时间，不支持启用中的重叠档期</div>
            </div>
            <el-button type="primary" @click="openSlotDialog()">新增档期</el-button>
          </div>
        </template>

        <el-table
          :data="slotRows"
          v-loading="slotLoading"
          stripe
          highlight-current-row
          @current-change="handleSlotRowChange"
        >
          <el-table-column prop="title" label="档期标题" min-width="160" />
          <el-table-column label="时间窗" min-width="220">
            <template #default="{ row }">
              <div>{{ formatDateTime(row.start_time) }}</div>
              <div class="table-secondary">{{ formatDateTime(row.end_time) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="120">
            <template #default="{ row }">
              <el-tag :type="runtimeTagType(row.runtime_status)">{{ runtimeLabel(row.runtime_status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="sort_order" label="排序" width="80" />
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button text type="primary" size="small" @click.stop="openSlotDialog(row)">编辑</el-button>
              <el-button text type="danger" size="small" @click.stop="handleDeleteSlot(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card class="item-card">
        <template #header>
          <div class="card-header">
            <div>
              <div class="card-title">档期商品</div>
              <div class="card-subtitle">
                {{ activeSlot ? `${activeSlot.title} · ${runtimeLabel(activeSlot.runtime_status)}` : '先选择一个档期，再配置商品' }}
              </div>
            </div>
            <el-button type="primary" :disabled="!activeSlot" @click="openItemDialog()">添加商品</el-button>
          </div>
        </template>

        <el-empty v-if="!activeSlot && !slotLoading" description="请选择左侧档期" />
        <template v-else>
          <el-alert
            type="warning"
            :closable="false"
            show-icon
            style="margin-bottom: 12px"
            title="时间窗外不会启用限时价/积分价，但商品本身仍可按普通商品逻辑售卖。"
          />
          <el-table :data="itemRows" v-loading="itemLoading" stripe>
            <el-table-column label="商品" min-width="220">
              <template #default="{ row }">
                <div class="product-cell">
                  <el-image v-if="row.product?.image_url" :src="row.product.image_url" fit="cover" class="product-thumb" />
                  <div>
                    <div>{{ row.product_name || '未命名商品' }}</div>
                    <div class="table-secondary" v-if="row.sku_name">{{ row.sku_name }}</div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="现金价" width="120">
              <template #default="{ row }">
                <span v-if="row.enable_money">¥{{ Number(row.money_price || 0).toFixed(2) }}</span>
                <span v-else class="table-secondary">关闭</span>
              </template>
            </el-table-column>
            <el-table-column label="积分价" width="120">
              <template #default="{ row }">
                <span v-if="row.enable_points">{{ row.points_price || 0 }} 积分</span>
                <span v-else class="table-secondary">关闭</span>
              </template>
            </el-table-column>
            <el-table-column prop="stock_limit" label="名额" width="90" />
            <el-table-column prop="sort_order" label="排序" width="80" />
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="row.status ? 'success' : 'info'">{{ row.status ? '启用' : '关闭' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="openItemDialog(row)">编辑</el-button>
                <el-button text type="danger" size="small" @click="handleDeleteItem(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </el-card>
    </div>

    <el-dialog v-model="slotDialogVisible" :title="slotEditing ? '编辑档期' : '新增档期'" width="640px">
      <el-form label-width="96px">
        <el-form-item label="档期标题">
          <el-input v-model="slotForm.title" placeholder="如：早场限时购" />
        </el-form-item>
        <el-form-item label="副标题">
          <el-input v-model="slotForm.subtitle" placeholder="如：08:00-14:00 限时开售" />
        </el-form-item>
        <el-form-item label="开始时间">
          <el-date-picker v-model="slotForm.start_time" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" style="width:100%" />
        </el-form-item>
        <el-form-item label="结束时间">
          <el-date-picker v-model="slotForm.end_time" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" style="width:100%" />
        </el-form-item>
        <el-form-item label="档期封面">
          <div class="slot-cover-editor">
            <el-image v-if="slotCoverPreview" :src="slotCoverPreview" fit="cover" class="slot-cover-preview" />
            <div v-else class="slot-cover-empty">未选择封面</div>
            <div class="slot-cover-actions">
              <el-button type="primary" @click="slotMediaPickerVisible = true">从素材库选择</el-button>
              <el-button v-if="slotCoverPreview" text type="danger" @click="clearSlotCover">清空封面</el-button>
              <div class="table-secondary">优先使用素材库托管图片，避免临时签名地址。</div>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="slotForm.sort_order" :min="0" :max="99999" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="slotForm.status" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="slotDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="slotSaving" @click="submitSlot">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="itemDialogVisible" :title="itemEditing ? '编辑限时商品' : '新增限时商品'" width="720px">
      <el-form label-width="96px">
        <el-form-item label="关联商品">
          <div style="display:flex; align-items:center; gap:12px; width:100%;">
            <div v-if="itemForm.product" style="flex:1; display:flex; align-items:center; gap:10px; padding:6px 10px; border:1px solid #ebeef5; border-radius:6px; background:#fafbfc;">
              <el-image v-if="itemForm.product.cover_image || itemForm.product.image_url || (Array.isArray(itemForm.product.images) ? itemForm.product.images[0] : '')" fit="cover" style="width:36px;height:36px;border-radius:4px;" :src="itemForm.product.cover_image || itemForm.product.image_url || (Array.isArray(itemForm.product.images) ? itemForm.product.images[0] : '')" />
              <div style="flex:1; min-width:0;">
                <div style="font-size:13px; color:#303133; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{{ itemForm.product.name || itemForm.product.product_name || `商品#${itemForm.product_id}` }}</div>
                <div style="font-size:12px; color:#909399;">ID: {{ itemForm.product_id }}<span v-if="itemForm.product.retail_price"> · ¥{{ itemForm.product.retail_price }}</span></div>
              </div>
            </div>
            <div v-else style="flex:1; padding:6px 10px; border:1px dashed #dcdfe6; border-radius:6px; color:#909399; font-size:13px;">尚未选择商品</div>
            <el-button @click="productPickerVisible = true">{{ itemForm.product ? '更换' : '选择商品' }}</el-button>
          </div>
        </el-form-item>
        <el-form-item label="SKU ID">
          <el-input v-model="itemForm.sku_id" placeholder="可选，留空表示商品默认规格" />
        </el-form-item>
        <el-form-item label="现金购买">
          <el-switch v-model="itemForm.enable_money" active-text="开启" inactive-text="关闭" />
          <el-input-number v-model="itemForm.money_price" :min="0.01" :precision="2" :step="1" :disabled="!itemForm.enable_money" style="margin-left:12px" />
          <span class="inline-unit">元</span>
        </el-form-item>
        <el-form-item label="积分兑换">
          <el-switch v-model="itemForm.enable_points" active-text="开启" inactive-text="关闭" />
          <el-input-number v-model="itemForm.points_price" :min="1" :step="10" :disabled="!itemForm.enable_points" style="margin-left:12px" />
          <span class="inline-unit">积分</span>
        </el-form-item>
        <el-form-item label="活动名额">
          <el-input-number v-model="itemForm.stock_limit" :min="1" :max="999999" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="itemForm.sort_order" :min="0" :max="99999" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="itemForm.status" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="itemDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="itemSaving" @click="submitItem">保存</el-button>
      </template>
    </el-dialog>

    <MediaPicker
      v-model:visible="slotMediaPickerVisible"
      :multiple="false"
      :max="1"
      @confirm="handleSlotMediaConfirm"
    />

    <EntityPicker
      v-model:visible="productPickerVisible"
      v-model="itemForm.product_id"
      entity="product"
      :preselected-items="itemForm.product ? [itemForm.product] : []"
      @confirm="onProductPicked"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createLimitedSaleItem,
  createLimitedSaleSlot,
  deleteLimitedSaleItem,
  deleteLimitedSaleSlot,
  getLimitedSaleItems,
  getLimitedSaleSlots,
  updateLimitedSaleItem,
  updateLimitedSaleSlot
} from '@/api'
import MediaPicker from '@/components/MediaPicker.vue'
import EntityPicker from '@/components/entity-picker'
import { buildPersistentAssetRef } from '@/utils/assetUrlAudit'

const CHINA_TIME_ZONE = 'Asia/Shanghai'
const HAS_TIME_ZONE_SUFFIX_RE = /(?:Z|[+-]\d{2}:\d{2})$/i
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/
const CHINA_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: CHINA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
})

const slotLoading = ref(false)
const slotSaving = ref(false)
const itemLoading = ref(false)
const itemSaving = ref(false)
const slotRows = ref([])
const itemRows = ref([])
const activeSlotId = ref(null)

const slotDialogVisible = ref(false)
const slotEditing = ref(false)
const itemDialogVisible = ref(false)
const itemEditing = ref(false)
const slotMediaPickerVisible = ref(false)
const productPickerVisible = ref(false)

const slotForm = reactive({
  id: null,
  title: '',
  subtitle: '',
  file_id: '',
  cover_image: '',
  start_time: '',
  end_time: '',
  sort_order: 0,
  status: true
})

const itemForm = reactive({
  id: null,
  product_id: '',
  product: null, // 完整商品对象，仅前端用于 EntityPicker 预览/回填，提交时剥离
  sku_id: '',
  enable_points: true,
  enable_money: true,
  points_price: 100,
  money_price: 9.9,
  stock_limit: 10,
  sort_order: 0,
  status: true
})

const activeSlot = computed(() => slotRows.value.find((item) => String(item.id) === String(activeSlotId.value)) || null)
const slotCoverPreview = computed(() => slotForm.cover_image || '')

const runtimeLabel = (status) => ({
  running: '进行中',
  upcoming: '未开始',
  ended: '已结束',
  disabled: '已关闭',
  invalid: '配置异常'
}[status] || status || '未知')

const runtimeTagType = (status) => ({
  running: 'success',
  upcoming: 'warning',
  ended: 'info',
  disabled: 'info',
  invalid: 'danger'
}[status] || 'info')

const parseChinaDateTime = (value) => {
  if (!value) return null
  const raw = String(value).trim()
  if (!raw) return null
  const normalized = DATE_ONLY_RE.test(raw)
    ? `${raw}T00:00:00+08:00`
    : (HAS_TIME_ZONE_SUFFIX_RE.test(raw) ? raw : `${raw}+08:00`)
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

const getChinaDateTimeParts = (value) => {
  const date = parseChinaDateTime(value)
  if (!date) return null
  const parts = CHINA_DATE_TIME_FORMATTER.formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  const hour = parts.find((part) => part.type === 'hour')?.value
  const minute = parts.find((part) => part.type === 'minute')?.value
  const second = parts.find((part) => part.type === 'second')?.value
  if (!year || !month || !day || !hour || !minute || !second) return null
  return { year, month, day, hour, minute, second }
}

const toChinaNaiveDateTime = (value) => {
  const parts = getChinaDateTimeParts(value)
  if (!parts) return value ? String(value) : ''
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
}

const formatDateTime = (value) => {
  if (!value) return '-'
  const parts = getChinaDateTimeParts(value)
  if (!parts) return String(value)
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}

const resetSlotForm = () => {
  Object.assign(slotForm, {
    id: null,
    title: '',
    subtitle: '',
    file_id: '',
    cover_image: '',
    start_time: '',
    end_time: '',
    sort_order: 0,
    status: true
  })
}

const resetItemForm = () => {
  Object.assign(itemForm, {
    id: null,
    product_id: '',
    product: null,
    sku_id: '',
    enable_points: true,
    enable_money: true,
    points_price: 100,
    money_price: 9.9,
    stock_limit: 10,
    sort_order: 0,
    status: true
  })
}

const fetchSlots = async () => {
  slotLoading.value = true
  try {
    const res = await getLimitedSaleSlots({ page: 1, limit: 200 })
    slotRows.value = Array.isArray(res?.list) ? res.list : (Array.isArray(res) ? res : [])
    if (!slotRows.value.length) {
      activeSlotId.value = null
      itemRows.value = []
      return
    }
    if (!activeSlotId.value || !slotRows.value.some((item) => String(item.id) === String(activeSlotId.value))) {
      activeSlotId.value = slotRows.value[0].id
    }
    await fetchItems()
  } catch (e) {
    ElMessage.error(e?.message || '读取限时档期失败')
  } finally {
    slotLoading.value = false
  }
}

const fetchItems = async () => {
  if (!activeSlotId.value) {
    itemRows.value = []
    return
  }
  itemLoading.value = true
  try {
    const res = await getLimitedSaleItems(activeSlotId.value)
    itemRows.value = Array.isArray(res?.list) ? res.list : []
  } catch (e) {
    ElMessage.error(e?.message || '读取档期商品失败')
  } finally {
    itemLoading.value = false
  }
}

const handleSlotRowChange = async (row) => {
  activeSlotId.value = row?.id || null
  await fetchItems()
}

const openSlotDialog = (row = null) => {
  slotEditing.value = !!row
  resetSlotForm()
  if (row) {
    Object.assign(slotForm, {
      id: row.id,
      title: row.title || '',
      subtitle: row.subtitle || '',
      file_id: row.file_id || '',
      cover_image: row.cover_image || '',
      start_time: toChinaNaiveDateTime(row.start_time),
      end_time: toChinaNaiveDateTime(row.end_time),
      sort_order: Number(row.sort_order || 0),
      status: row.status !== 0
    })
  } else if (activeSlot.value) {
    slotForm.sort_order = Number(activeSlot.value.sort_order || 0) + 10
  }
  slotDialogVisible.value = true
}

const openItemDialog = (row = null) => {
  if (!activeSlot.value) return
  itemEditing.value = !!row
  resetItemForm()
  if (row) {
    Object.assign(itemForm, {
      id: row.id,
      product_id: row.product_id || '',
      product: row.product
        ? { ...row.product, id: row.product.id || row.product_id, name: row.product.name || row.product_name }
        : (row.product_name ? { id: row.product_id, name: row.product_name } : null),
      sku_id: row.sku_id || '',
      enable_points: row.enable_points !== false,
      enable_money: row.enable_money !== false,
      points_price: Number(row.points_price || 0),
      money_price: Number(row.money_price || 0),
      stock_limit: Number(row.stock_limit || 1),
      sort_order: Number(row.sort_order || 0),
      status: row.status !== 0
    })
  } else {
    itemForm.sort_order = (itemRows.value.at(-1)?.sort_order || 0) + 10
  }
  itemDialogVisible.value = true
}

const onProductPicked = (id, items) => {
  itemForm.product_id = id
  itemForm.product = items?.[0] || null
}

const clearSlotCover = () => {
  slotForm.file_id = ''
  slotForm.cover_image = ''
}

const handleSlotMediaConfirm = (persistIds = [], displayUrls = []) => {
  const fileId = Array.isArray(persistIds) ? (persistIds[0] || '') : ''
  const display = Array.isArray(displayUrls) ? (displayUrls[0] || '') : ''
  slotForm.file_id = fileId
  slotForm.cover_image = buildPersistentAssetRef({ url: display, fileId })
}

const submitSlot = async () => {
  if (!slotForm.title.trim()) return ElMessage.warning('请输入档期标题')
  if (!slotForm.start_time || !slotForm.end_time) return ElMessage.warning('请填写开始和结束时间')
  slotSaving.value = true
  try {
    const payload = {
      title: slotForm.title,
      subtitle: slotForm.subtitle,
      file_id: slotForm.file_id,
      cover_image: slotForm.cover_image,
      start_time: toChinaNaiveDateTime(slotForm.start_time),
      end_time: toChinaNaiveDateTime(slotForm.end_time),
      sort_order: slotForm.sort_order,
      status: slotForm.status
    }
    if (slotEditing.value) {
      await updateLimitedSaleSlot(slotForm.id, payload)
      ElMessage.success('档期已更新')
    } else {
      await createLimitedSaleSlot(payload)
      ElMessage.success('档期已创建')
    }
    slotDialogVisible.value = false
    await fetchSlots()
  } catch (e) {
    ElMessage.error(e?.message || '保存档期失败')
  } finally {
    slotSaving.value = false
  }
}

const submitItem = async () => {
  if (!activeSlot.value) return
  if (!itemForm.product_id) return ElMessage.warning('请选择商品')
  if (!itemForm.enable_points && !itemForm.enable_money) return ElMessage.warning('积分价 / 现金价至少启用一种')
  itemSaving.value = true
  try {
    const payload = {
      product_id: itemForm.product_id,
      sku_id: itemForm.sku_id,
      enable_points: itemForm.enable_points,
      enable_money: itemForm.enable_money,
      points_price: itemForm.points_price,
      money_price: itemForm.money_price,
      stock_limit: itemForm.stock_limit,
      sort_order: itemForm.sort_order,
      status: itemForm.status
    }
    if (itemEditing.value) {
      await updateLimitedSaleItem(itemForm.id, payload)
      ElMessage.success('档期商品已更新')
    } else {
      await createLimitedSaleItem(activeSlot.value.id, payload)
      ElMessage.success('档期商品已添加')
    }
    itemDialogVisible.value = false
    await fetchItems()
  } catch (e) {
    ElMessage.error(e?.message || '保存档期商品失败')
  } finally {
    itemSaving.value = false
  }
}

const handleDeleteSlot = async (row) => {
  await ElMessageBox.confirm(`确认删除档期「${row.title}」？该档期下商品将一并移除。`, '提示', { type: 'warning' })
  await deleteLimitedSaleSlot(row.id)
  ElMessage.success('档期已删除')
  if (String(activeSlotId.value) === String(row.id)) {
    activeSlotId.value = null
  }
  await fetchSlots()
}

const handleDeleteItem = async (row) => {
  await ElMessageBox.confirm(`确认删除「${row.product_name || '档期商品'}」？`, '提示', { type: 'warning' })
  await deleteLimitedSaleItem(row.id)
  ElMessage.success('档期商品已删除')
  await fetchItems()
}

onMounted(async () => {
  await fetchSlots()
})
</script>

<style scoped>
.limited-sales-page { padding: 0; }
.limited-sales-grid { display: grid; grid-template-columns: minmax(360px, 0.95fr) minmax(420px, 1.25fr); gap: 16px; }
.card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.card-title { font-size: 15px; font-weight: 600; color: #303133; }
.card-subtitle,.table-secondary { font-size: 12px; color: #909399; }
.product-cell { display: flex; align-items: center; gap: 10px; }
.product-thumb { width: 44px; height: 44px; border-radius: 8px; flex-shrink: 0; }
.slot-cover-editor { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.slot-cover-preview { width: 140px; height: 92px; border-radius: 10px; border: 1px solid #ebeef5; }
.slot-cover-empty { width: 140px; height: 92px; display: flex; align-items: center; justify-content: center; border: 1px dashed #dcdfe6; border-radius: 10px; color: #c0c4cc; }
.slot-cover-actions { display: flex; flex-direction: column; gap: 8px; }
.inline-unit { margin-left: 8px; font-size: 12px; color: #909399; }
@media (max-width: 1100px) {
  .limited-sales-grid { grid-template-columns: 1fr; }
}
</style>
