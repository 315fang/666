<template>
  <div class="bundle-page">
    <el-card class="search-card">
        <el-form :inline="true" :model="searchForm">
          <el-form-item>
          <el-input v-model="searchForm.keyword" placeholder="自由组合标题" clearable style="width: 220px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item>
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable style="width: 140px">
            <el-option label="上架中" :value="1" />
            <el-option label="已下架" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="searchForm.publish_status" placeholder="发布状态" clearable style="width: 140px">
            <el-option label="已发布" value="published" />
            <el-option label="草稿" value="draft" />
            <el-option label="已归档" value="archived" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="searchForm.scene_type" placeholder="类型" style="width: 140px">
            <el-option label="自由组合" value="flex_bundle" />
            <el-option label="全部类型" value="" />
            <el-option label="历史组合" value="explosive_bundle" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
          <el-button type="success" :icon="Plus" @click="openForm()">新建自由组合</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card style="margin-top: 16px">
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column label="自由组合" min-width="280">
          <template #default="{ row }">
            <div class="bundle-cell">
              <el-image :src="row.cover_preview_url || row.cover_image" class="bundle-thumb" fit="cover">
                <template #error>
                  <div class="bundle-thumb bundle-thumb-placeholder">自由组合</div>
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
              {{ row.scene_type === 'flex_bundle' ? '自由组合' : '历史组合' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="组合价" width="120" align="right">
          <template #default="{ row }">¥{{ money(row.bundle_price) }}</template>
        </el-table-column>
        <el-table-column label="分组/候选" width="120" align="center">
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
        <el-table-column label="操作" width="140" fixed="right">
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
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        @size-change="fetchBundles"
        @current-change="fetchBundles"
        style="margin-top:16px; justify-content:flex-end"
      />
    </el-card>

    <el-drawer
      v-model="formVisible"
      :title="form.id ? '编辑自由组合' : '新建自由组合'"
      size="min(1120px, 96vw)"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" label-width="92px" class="bundle-form">
        <div class="form-section-title">基础信息</div>
        <el-form-item label="组合标题">
          <el-input v-model="form.title" maxlength="40" placeholder="如：399 自由选套餐一" />
        </el-form-item>
        <el-form-item label="组合副标题">
          <el-input v-model="form.subtitle" maxlength="80" placeholder="选填，给小程序详情页展示套餐卖点" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="主视觉标题">
              <el-input v-model="form.hero_title" maxlength="40" placeholder="默认沿用自由组合标题" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="主视觉副标题">
              <el-input v-model="form.hero_subtitle" maxlength="80" placeholder="默认沿用副标题" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="10">
            <el-form-item label="渠道标签">
              <el-input v-model="form.channel_tags_text" placeholder="逗号分隔，如：自由组合,套餐专区" />
            </el-form-item>
          </el-col>
          <el-col :span="7">
            <el-form-item label="场景">
              <el-select v-model="form.scene_type" style="width:100%" disabled>
                <el-option label="自由组合" value="flex_bundle" />
                <el-option label="历史组合" value="explosive_bundle" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="7">
            <el-form-item label="发布状态">
              <el-select v-model="form.publish_status" style="width:100%">
                <el-option label="已发布" value="published" />
                <el-option label="草稿" value="draft" />
                <el-option label="已归档" value="archived" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="组合价">
              <el-input-number v-model="form.bundle_price" :min="0.01" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="排序">
              <el-input-number v-model="form.sort_order" :min="0" :precision="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="权重">
              <el-input-number v-model="form.sort_weight" :min="0" :precision="0" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="状态">
              <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="上架" inactive-text="下架" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="组合封面">
          <div class="cover-row">
            <el-image v-if="coverPreviewUrl" :src="coverPreviewUrl" class="cover-preview" fit="cover" />
            <div v-else class="cover-preview cover-preview-placeholder">封面</div>
            <div class="cover-actions">
              <el-button @click="openCoverPicker">从素材库选择</el-button>
              <el-button v-if="form.cover_image" text type="danger" @click="clearCover">清除</el-button>
            </div>
          </div>
        </el-form-item>

        <div class="form-section-title section-row">
          <span>选择分组</span>
          <el-button size="small" type="primary" plain @click="addGroup">新增分组</el-button>
        </div>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          class="form-alert"
          title="自由组合只引用现有商品，不继承商品管理里的佣金。每个候选商品独立配置佣金池、单上级独享额和双上级拆分额。"
        />

        <div v-if="form.groups.length === 0" class="groups-empty">暂无选择分组，请先新增至少一个分组。</div>
        <div v-for="(group, groupIndex) in form.groups" :key="group.local_key" class="group-editor">
          <div class="group-editor-head">
            <span>分组 {{ groupIndex + 1 }}</span>
            <el-button text type="danger" size="small" @click="removeGroup(groupIndex)">删除分组</el-button>
          </div>
          <div class="group-fields-grid">
            <el-form-item label="分组标题" label-width="72px" class="group-field">
              <el-input v-model="group.group_title" placeholder="如：洁面" />
            </el-form-item>
            <el-form-item label="分组键" label-width="72px" class="group-field">
              <el-input v-model="group.group_key" placeholder="如：cleanser" />
            </el-form-item>
            <el-form-item label="最少" label-width="48px" class="group-field group-field--number">
              <el-input-number v-model="group.min_select" :min="0" :precision="0" style="width:100%" />
            </el-form-item>
            <el-form-item label="最多" label-width="48px" class="group-field group-field--number">
              <el-input-number v-model="group.max_select" :min="1" :precision="0" style="width:100%" />
            </el-form-item>
          </div>

          <div class="group-options-head">
            <span>候选商品</span>
            <el-button size="small" plain @click="addOption(groupIndex)">新增候选</el-button>
          </div>
          <div v-if="group.options.length === 0" class="group-options-empty">该分组还没有候选商品。</div>
          <div v-for="(option, optionIndex) in group.options" :key="option.local_key" class="option-editor">
            <div class="option-form-grid">
              <el-form-item label="商品" label-width="56px" class="option-form-item option-form-item--product">
                <el-select
                  v-model="option.product_id"
                  filterable
                  remote
                  reserve-keyword
                  clearable
                  :remote-method="searchProductOptions"
                  placeholder="搜索商品名称"
                  style="width: 100%"
                  @change="(value) => onOptionProductChange(groupIndex, optionIndex, value)"
                >
                  <el-option
                    v-for="item in mergedProductOptions(option)"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="规格" label-width="56px" class="option-form-item option-form-item--sku">
                <el-select
                  v-model="option.sku_id"
                  clearable
                  fit-input-width
                  placeholder="默认规格"
                  style="width: 100%"
                  @change="(value) => onOptionSkuChange(groupIndex, optionIndex, value)"
                >
                  <el-option label="默认规格" value="" />
                  <el-option
                    v-for="sku in skuOptionsForProduct(option.product_id, option)"
                    :key="sku.value"
                    :label="sku.label"
                    :value="sku.value"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="数量" label-width="44px" class="option-form-item option-form-item--qty">
                <el-input-number v-model="option.default_qty" :min="1" :precision="0" style="width: 100%" />
              </el-form-item>
              <el-form-item label="启用" label-width="44px" class="option-form-item option-form-item--enabled">
                <el-switch v-model="option.enabled" :active-value="1" :inactive-value="0" />
              </el-form-item>
            </div>
            <div class="option-meta-row">
              <div class="option-meta-text">
                <span>{{ option.product_name || '未选商品' }}</span>
                <span v-if="optionSkuDisplay(option)"> / {{ optionSkuDisplay(option) }}</span>
              </div>
              <el-button text type="danger" size="small" @click="removeOption(groupIndex, optionIndex)">删除候选</el-button>
            </div>
            <div class="commission-editor">
              <div class="commission-editor-title">佣金池配置</div>
              <div class="commission-pool-row">
                <div class="commission-pool-control">
                  <span class="commission-role-label">总佣金池</span>
                  <el-input-number
                    v-model="option.commission_pool_amount"
                    :min="0"
                    :precision="2"
                    controls-position="right"
                    style="width: 100%"
                  />
                </div>
                <div class="commission-pool-hint">订单创建时按实际上下级关系快照佣金；配置总额会作为封顶。</div>
              </div>
              <div class="commission-grid">
                <div class="commission-group">
                  <div class="commission-group-title">单上级独享</div>
                  <div class="commission-role-list">
                    <div class="commission-role-item" v-for="role in COMMISSION_ROLE_OPTIONS" :key="`solo-${role.value}`">
                      <span class="commission-role-label">{{ role.label }}</span>
                      <el-input-number
                        v-model="option.solo_commission_fixed_by_role[role.value]"
                        :min="0"
                        :precision="2"
                        controls-position="right"
                        style="width: 100%"
                      />
                    </div>
                  </div>
                </div>
                <div class="commission-group">
                  <div class="commission-group-title">双上级：直推</div>
                  <div class="commission-role-list">
                    <div class="commission-role-item" v-for="role in COMMISSION_ROLE_OPTIONS" :key="`direct-${role.value}`">
                      <span class="commission-role-label">{{ role.label }}</span>
                      <el-input-number
                        v-model="option.direct_commission_fixed_by_role[role.value]"
                        :min="0"
                        :precision="2"
                        controls-position="right"
                        style="width: 100%"
                      />
                    </div>
                  </div>
                </div>
                <div class="commission-group">
                  <div class="commission-group-title">双上级：上上级</div>
                  <div class="commission-role-list">
                    <div class="commission-role-item" v-for="role in COMMISSION_ROLE_OPTIONS" :key="`indirect-${role.value}`">
                      <span class="commission-role-label">{{ role.label }}</span>
                      <el-input-number
                        v-model="option.indirect_commission_fixed_by_role[role.value]"
                        :min="0"
                        :precision="2"
                        controls-position="right"
                        style="width: 100%"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-form>

      <template #footer>
        <div class="drawer-footer">
          <el-button @click="formVisible = false">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="submitForm">保存</el-button>
        </div>
      </template>
    </el-drawer>

    <MediaPicker
      v-model:visible="coverPickerVisible"
      :multiple="false"
      :max="1"
      @confirm="onCoverConfirm"
    />
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import MediaPicker from '@/components/MediaPicker.vue'
import { usePagination } from '@/composables/usePagination'
import {
  getProducts,
  getProductSkus,
  getProductBundles,
  getProductBundleById,
  createProductBundle,
  updateProductBundle,
  deleteProductBundle
} from '@/api'

const COMMISSION_ROLE_OPTIONS = [
  { value: 0, label: 'VIP' },
  { value: 1, label: 'C1' },
  { value: 2, label: 'C2' },
  { value: 3, label: 'B1' },
  { value: 4, label: 'B2' },
  { value: 5, label: 'B3' },
  { value: 6, label: '店长' }
]

const loading = ref(false)
const submitting = ref(false)
const formVisible = ref(false)
const formRef = ref(null)
const coverPickerVisible = ref(false)
const tableData = ref([])
const productSelectOptions = ref([])
const { pagination, resetPage, applyResponse } = usePagination()
const skuOptionsMap = reactive({})
const imagePreviewCache = reactive({})

const searchForm = reactive({
  keyword: '',
  status: '',
  publish_status: '',
  scene_type: 'flex_bundle'
})

const createEmptyFixedCommissionMap = () => COMMISSION_ROLE_OPTIONS.reduce((result, item) => {
  result[item.value] = 0
  return result
}, {})

const normalizeFixedCommissionMap = (source = {}) => COMMISSION_ROLE_OPTIONS.reduce((result, item) => {
  const rawValue = source?.[item.value] ?? source?.[String(item.value)] ?? 0
  const amount = Number(rawValue || 0)
  result[item.value] = Number.isFinite(amount) ? Math.max(0, amount) : 0
  return result
}, {})

const createOption = () => ({
  local_key: `option-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  product_id: '',
  sku_id: '',
  default_qty: 1,
  sort_order: 0,
  enabled: 1,
  product_name: '',
  sku_name: '',
  sku_spec: '',
  commission_pool_amount: 0,
  solo_commission_fixed_by_role: createEmptyFixedCommissionMap(),
  direct_commission_fixed_by_role: createEmptyFixedCommissionMap(),
  indirect_commission_fixed_by_role: createEmptyFixedCommissionMap()
})

const createGroup = () => ({
  local_key: `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  group_title: '',
  group_key: '',
  min_select: 1,
  max_select: 1,
  sort_order: 0,
  options: [createOption()]
})

const defaultForm = () => ({
  id: null,
  title: '',
  subtitle: '',
  hero_title: '',
  hero_subtitle: '',
  channel_tags_text: '',
  scene_type: 'flex_bundle',
  cover_image: '',
  cover_file_id: '',
  bundle_price: 0,
  sort_order: 0,
  sort_weight: 0,
  status: 1,
  publish_status: 'published',
  groups: [createGroup()]
})

const form = reactive(defaultForm())

const money = (value) => {
  const num = Number(value || 0)
  return Number.isFinite(num) ? num.toFixed(2) : '0.00'
}

const isCloudId = (value) => /^cloud:\/\//i.test(String(value || ''))

const coverPreviewUrl = computed(() => {
  const ref = String(form.cover_image || form.cover_file_id || '').trim()
  if (!ref) return ''
  if (isCloudId(ref)) return imagePreviewCache[ref] || ''
  return ref
})

const ensureProductSelectOption = (productId, label) => {
  const value = String(productId || '').trim()
  if (!value) return
  if (!productSelectOptions.value.some((item) => item.value === value)) {
    productSelectOptions.value.push({ value, label: label || value })
  }
}

const FALLBACK_SKU_PATTERN = /^fallback-sku-/i

const isGeneratedFallbackSku = (item = {}) => {
  if (item?._generated === true) return true
  return [item.id, item._id, item._legacy_id, item.value, item.sku_id, item.name, item.label]
    .some((value) => FALLBACK_SKU_PATTERN.test(String(value || '').trim()))
}

const normalizeSkuLabel = (item = {}) => {
  if (isGeneratedFallbackSku(item)) return '默认规格'
  if (Array.isArray(item.specs) && item.specs.length) {
    const specText = item.specs
      .map((row) => String(row?.value || row?.spec_value || row?.spec || '').trim())
      .filter(Boolean)
      .join(' / ')
    if (specText) return specText
  }
  const specValue = String(item.spec_value || '').trim()
  const spec = String(item.spec || '').trim()
  const name = String(item.name || item.label || '').trim()
  if (specValue) return specValue
  if (spec) return spec
  return name || String(item.id || item._id || '')
}

const normalizeSkuOption = (item = {}) => ({
  value: String(item.id || item._id || ''),
  label: normalizeSkuLabel(item)
})

const dedupeSelectOptions = (items = []) => {
  const seen = new Set()
  return items.filter((item) => {
    const key = String(item?.value ?? '').trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const loadSkuOptions = async (productId, preferredRows = []) => {
  const key = String(productId || '').trim()
  if (!key) return
  if (skuOptionsMap[key]) return
  if (preferredRows.length) {
    skuOptionsMap[key] = preferredRows.map(normalizeSkuOption)
  }
  try {
    const res = await getProductSkus(key)
    const list = res?.data?.list || res?.list || []
    skuOptionsMap[key] = list.map(normalizeSkuOption)
  } catch (_error) {
    skuOptionsMap[key] = skuOptionsMap[key] || []
  }
}

const mergedProductOptions = (option) => {
  const current = option?.product_id ? [{ value: String(option.product_id), label: option.product_name || String(option.product_id) }] : []
  return dedupeSelectOptions([...current, ...productSelectOptions.value])
}

const skuOptionsForProduct = (productId, option) => {
  const key = String(productId || '').trim()
  const resolved = option?.sku_id ? (skuOptionsMap[key] || []).find((item) => item.value === String(option.sku_id)) : null
  const current = option?.sku_id
    ? [{
        value: String(option.sku_id),
        label: normalizeSkuLabel({
          id: option.sku_id,
          value: option.sku_id,
          name: option.sku_name,
          spec: option.sku_spec,
          spec_value: option.sku_spec,
          label: resolved?.label
        })
      }]
    : []
  return dedupeSelectOptions([...current, ...(skuOptionsMap[key] || [])])
}

const optionSkuDisplay = (option = {}) => {
  const skuId = String(option.sku_id || '').trim()
  const label = normalizeSkuLabel({
    id: skuId,
    value: skuId,
    name: option.sku_name,
    spec: option.sku_spec,
    spec_value: option.sku_spec
  })
  return skuId || option.sku_name || option.sku_spec ? label : ''
}

const searchProductOptions = async (keyword) => {
  const query = String(keyword || '').trim()
  if (!query) return
  try {
    const res = await getProducts({ keyword: query, status: 1, limit: 20 })
    const list = res?.list || res?.data?.list || []
    productSelectOptions.value = list.map((item) => ({
      value: String(item.id || item._id || ''),
      label: item.name || String(item.id || item._id || '')
    }))
  } catch (_error) {}
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

const resetForm = () => {
  Object.assign(form, defaultForm())
}

const hydrateBundleForm = async (bundle = {}) => {
  resetForm()
  form.id = bundle.id || null
  form.title = bundle.title || ''
  form.subtitle = bundle.subtitle || ''
  form.hero_title = bundle.hero_title || bundle.title || ''
  form.hero_subtitle = bundle.hero_subtitle || bundle.subtitle || ''
  form.channel_tags_text = Array.isArray(bundle.channel_tags) ? bundle.channel_tags.join(',') : ''
  form.scene_type = bundle.scene_type || 'flex_bundle'
  form.cover_image = bundle.cover_file_id || bundle.cover_image || ''
  form.cover_file_id = bundle.cover_file_id || ''
  if (bundle.cover_preview_url && isCloudId(form.cover_image)) {
    imagePreviewCache[form.cover_image] = bundle.cover_preview_url
  }
  form.bundle_price = Number(bundle.bundle_price || 0)
  form.sort_order = Number(bundle.sort_order || 0)
  form.sort_weight = Number(bundle.sort_weight || bundle.sort_order || 0)
  form.status = Number(bundle.status || 0) === 0 ? 0 : 1
  form.publish_status = bundle.publish_status || 'published'
  form.groups = (bundle.groups || []).map((group, groupIndex) => ({
    local_key: `group-${groupIndex}-${Date.now()}`,
    group_title: group.group_title || '',
    group_key: group.group_key || '',
    min_select: Number(group.min_select || 1),
    max_select: Number(group.max_select || 1),
    sort_order: Number(group.sort_order || groupIndex),
    options: (group.options || []).map((option, optionIndex) => {
      ensureProductSelectOption(option.product_id, option.product_name)
      return {
        local_key: `option-${groupIndex}-${optionIndex}-${Date.now()}`,
        product_id: String(option.product_id || ''),
        sku_id: String(option.sku_id || ''),
        default_qty: Number(option.default_qty || 1),
        sort_order: Number(option.sort_order || optionIndex),
        enabled: Number(option.enabled || 0) === 0 ? 0 : 1,
        product_name: option.product_name || '',
        sku_name: option.sku_name || '',
        sku_spec: option.sku_spec || '',
        commission_pool_amount: Number(option.commission_pool_amount || 0),
        solo_commission_fixed_by_role: normalizeFixedCommissionMap(option.solo_commission_fixed_by_role),
        direct_commission_fixed_by_role: normalizeFixedCommissionMap(option.direct_commission_fixed_by_role),
        indirect_commission_fixed_by_role: normalizeFixedCommissionMap(option.indirect_commission_fixed_by_role)
      }
    })
  }))
  await Promise.all(
    form.groups.flatMap((group) => group.options.map((option) => option.product_id ? loadSkuOptions(option.product_id) : Promise.resolve()))
  )
}

const openForm = async (row = null) => {
  resetForm()
  productSelectOptions.value = []
  Object.keys(skuOptionsMap).forEach((key) => { delete skuOptionsMap[key] })
  if (row && row.id) {
    try {
      const res = await getProductBundleById(row.id)
      await hydrateBundleForm(res?.data || res || {})
    } catch (error) {
      ElMessage.error(error?.message || '加载组合详情失败')
      return
    }
  }
  formVisible.value = true
}

const addGroup = () => {
  form.groups.push(createGroup())
}

const removeGroup = (groupIndex) => {
  form.groups.splice(groupIndex, 1)
}

const addOption = (groupIndex) => {
  form.groups[groupIndex].options.push(createOption())
}

const removeOption = (groupIndex, optionIndex) => {
  form.groups[groupIndex].options.splice(optionIndex, 1)
}

const onOptionProductChange = async (groupIndex, optionIndex, value) => {
  const option = form.groups[groupIndex]?.options?.[optionIndex]
  if (!option) return
  const productId = String(value || '').trim()
  option.product_id = productId
  option.sku_id = ''
  const matched = productSelectOptions.value.find((item) => item.value === productId)
  option.product_name = matched?.label || ''
  option.sku_name = ''
  option.sku_spec = ''
  if (productId) {
    await loadSkuOptions(productId)
  }
}

const onOptionSkuChange = (groupIndex, optionIndex, value) => {
  const option = form.groups[groupIndex]?.options?.[optionIndex]
  if (!option) return
  const skuId = String(value || '').trim()
  option.sku_id = skuId
  if (!skuId) {
    option.sku_name = ''
    option.sku_spec = '默认规格'
    return
  }
  const matched = skuOptionsForProduct(option.product_id, option).find((item) => item.value === skuId)
  option.sku_name = matched?.label || ''
  option.sku_spec = matched?.label || ''
}

const openCoverPicker = () => {
  coverPickerVisible.value = true
}

const clearCover = () => {
  form.cover_image = ''
  form.cover_file_id = ''
}

const onCoverConfirm = (persistIds, displayUrls = []) => {
  const id = Array.isArray(persistIds) && persistIds[0] ? persistIds[0] : ''
  if (!id) return
  form.cover_image = id
  form.cover_file_id = isCloudId(id) ? id : ''
  if (isCloudId(id) && displayUrls[0]) {
    imagePreviewCache[id] = displayUrls[0]
  }
}

const validateForm = () => {
  if (!String(form.title || '').trim()) return '自由组合标题不能为空'
  if (!(Number(form.bundle_price || 0) > 0)) return '组合价必须大于 0'
  if (!Array.isArray(form.groups) || form.groups.length === 0) return '至少需要 1 个选择分组'
  for (const group of form.groups) {
    if (!String(group.group_title || '').trim()) return '分组标题不能为空'
    if (!String(group.group_key || '').trim()) return '分组键不能为空'
    if (!Array.isArray(group.options) || group.options.length === 0) return `分组「${group.group_title}」至少需要 1 个候选商品`
    for (const option of group.options) {
      if (!String(option.product_id || '').trim()) return `分组「${group.group_title}」存在未选择商品的候选项`
    }
  }
  return ''
}

const buildPayload = () => ({
  title: form.title,
  subtitle: form.subtitle,
  hero_title: form.hero_title,
  hero_subtitle: form.hero_subtitle,
  channel_tags: String(form.channel_tags_text || '')
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean),
  scene_type: form.scene_type || 'flex_bundle',
  cover_image: form.cover_image,
  cover_file_id: form.cover_file_id,
  bundle_price: Number(form.bundle_price || 0),
  sort_order: Number(form.sort_order || 0),
  sort_weight: Number(form.sort_weight || 0),
  status: Number(form.status || 0) === 0 ? 0 : 1,
  publish_status: form.publish_status || 'published',
  groups: form.groups.map((group, groupIndex) => ({
    group_title: group.group_title,
    group_key: group.group_key,
    min_select: Number(group.min_select || 0),
    max_select: Number(group.max_select || 1),
    sort_order: Number(group.sort_order || groupIndex),
    options: group.options.map((option, optionIndex) => ({
      product_id: option.product_id,
      sku_id: option.sku_id || '',
      default_qty: Number(option.default_qty || 1),
      sort_order: Number(option.sort_order || optionIndex),
      enabled: Number(option.enabled || 0) === 0 ? 0 : 1,
      commission_pool_amount: Number(option.commission_pool_amount || 0),
      solo_commission_fixed_by_role: normalizeFixedCommissionMap(option.solo_commission_fixed_by_role),
      direct_commission_fixed_by_role: normalizeFixedCommissionMap(option.direct_commission_fixed_by_role),
      indirect_commission_fixed_by_role: normalizeFixedCommissionMap(option.indirect_commission_fixed_by_role)
    }))
  }))
})

const submitForm = async () => {
  const message = validateForm()
  if (message) {
    ElMessage.warning(message)
    return
  }
  submitting.value = true
  try {
    const payload = buildPayload()
    if (form.id) {
      await updateProductBundle(form.id, payload)
      ElMessage.success('自由组合已更新')
    } else {
      await createProductBundle(payload)
      ElMessage.success('自由组合已创建')
    }
    formVisible.value = false
    fetchBundles()
  } catch (error) {
    ElMessage.error(error?.message || '保存自由组合失败')
  } finally {
    submitting.value = false
  }
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

fetchBundles()
</script>

<style scoped>
.bundle-page {
  display: flex;
  flex-direction: column;
  gap: 0;
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

.form-section-title {
  margin-bottom: 16px;
  font-size: 15px;
  font-weight: 600;
  color: #111827;
}

.section-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.form-alert {
  margin-bottom: 16px;
}

:deep(.el-drawer__body) {
  overflow-x: hidden;
}

.bundle-form {
  min-width: 0;
}

.cover-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.cover-preview,
.cover-preview-placeholder {
  width: 120px;
  height: 120px;
  border-radius: 14px;
  background: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
}

.cover-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.groups-empty,
.group-options-empty {
  padding: 16px 0;
  color: #94a3b8;
  font-size: 13px;
}

.group-editor {
  margin-bottom: 18px;
  padding: 18px;
  border-radius: 16px;
  border: 1px solid #e5e7eb;
  background: #fafafa;
}

.group-editor-head,
.group-options-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.group-fields-grid {
  display: grid;
  grid-template-columns: minmax(260px, 1.3fr) minmax(220px, 1fr) minmax(172px, 0.55fr) minmax(172px, 0.55fr);
  gap: 12px;
  align-items: flex-start;
}

.group-field,
.option-form-item {
  min-width: 0;
  margin-bottom: 8px;
}

.group-field :deep(.el-form-item__content),
.option-form-item :deep(.el-form-item__content) {
  min-width: 0;
}

.group-field--number :deep(.el-input-number),
.option-form-item--qty :deep(.el-input-number) {
  min-width: 118px;
}

.option-form-grid {
  display: grid;
  grid-template-columns: minmax(280px, 1.8fr) minmax(190px, 1fr) minmax(170px, 0.6fr) minmax(96px, auto);
  gap: 12px;
  align-items: flex-start;
}

.option-form-item :deep(.el-select__wrapper),
.option-form-item :deep(.el-input__wrapper) {
  min-width: 0;
}

.option-form-item--enabled {
  width: 96px;
  justify-self: end;
}

.option-editor {
  margin-top: 12px;
  padding: 14px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #eef2f7;
}

.option-meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.option-meta-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: #6b7280;
}

.commission-editor {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed #e5e7eb;
}

.commission-editor-title {
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.commission-pool-row {
  display: grid;
  grid-template-columns: minmax(180px, 240px) 1fr;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.commission-pool-control {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.commission-pool-hint {
  min-width: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #64748b;
}

.commission-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.commission-group {
  min-width: 0;
  padding: 12px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
}

.commission-group-title {
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 600;
  color: #111827;
}

.commission-role-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.commission-role-item {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.commission-role-label {
  font-size: 12px;
  color: #6b7280;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

@media (max-width: 1180px) {
  .group-fields-grid,
  .option-form-grid,
  .commission-pool-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .option-form-item--enabled {
    width: auto;
    justify-self: start;
  }

  .commission-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .group-editor {
    padding: 14px;
  }

  .option-editor {
    padding: 12px;
  }

  .group-fields-grid,
  .option-form-grid,
  .commission-pool-row,
  .commission-role-list {
    grid-template-columns: 1fr;
  }

  .option-meta-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .option-meta-text {
    max-width: 100%;
  }
}
</style>
