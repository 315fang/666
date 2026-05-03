<template>
  <div class="bundle-page">
    <BundleListSection ref="listRef" @edit="handleEdit" @new="handleNew" />

    <el-drawer
      v-model="formVisible"
      :title="form.id ? '编辑自由选套餐' : '新建自由选套餐'"
      size="min(1120px, 96vw)"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" label-position="top" class="bundle-form">
        <div class="drawer-workbench">
          <div class="bundle-main-panel">
            <section class="simple-section">
              <div class="section-headline">
                <div>
                  <div class="form-section-title">1. 套餐基础</div>
                  <div class="section-note">必填项只保留名称和固定套餐价。</div>
                </div>
                <el-button text type="primary" @click="form.advancedOpen = !form.advancedOpen">
                  {{ form.advancedOpen ? '收起高级设置' : '高级设置' }}
                </el-button>
              </div>
              <div class="base-grid">
                <el-form-item label="套餐名称">
                  <el-input v-model="form.title" maxlength="40" placeholder="如：399 自由选套餐" />
                </el-form-item>
                <el-form-item label="固定套餐价">
                  <el-input-number v-model="form.bundle_price" :min="0.01" :precision="2" controls-position="right" style="width: 100%" />
                </el-form-item>
              </div>
              <div v-if="form.advancedOpen" class="advanced-box">
                <el-form-item label="展示说明">
                  <el-input v-model="form.subtitle" maxlength="80" placeholder="选填，小程序详情页展示的卖点文案" />
                </el-form-item>
                <div class="advanced-grid">
                  <el-form-item label="发布状态">
                    <el-select v-model="form.publish_status" style="width:100%">
                      <el-option label="已发布" value="published" />
                      <el-option label="草稿" value="draft" />
                      <el-option label="已归档" value="archived" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="上架状态">
                    <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="上架" inactive-text="下架" />
                  </el-form-item>
                </div>
                <el-form-item label="套装封面">
                  <div class="cover-row">
                    <el-image v-if="coverPreviewUrl" :src="coverPreviewUrl" class="cover-preview" fit="cover" />
                    <div v-else class="cover-preview cover-preview-placeholder">封面</div>
                    <div class="cover-actions">
                      <el-button @click="openCoverPicker">从素材库选择</el-button>
                      <el-button v-if="form.cover_image" text type="danger" @click="clearCover">清除</el-button>
                    </div>
                  </div>
                </el-form-item>
              </div>
            </section>

            <section class="simple-section">
              <div class="section-headline">
                <div>
                  <div class="form-section-title">2. 选择步骤</div>
                  <div class="section-note">每一步就是一个商品池，用户按“本组选几件”完成选择。</div>
                </div>
                <div class="section-actions">
                  <el-button size="small" plain @click="applyStarterTemplate('single')">单组任选</el-button>
                  <el-button size="small" plain @click="applyStarterTemplate('three')">三步套餐</el-button>
                  <el-button size="small" type="primary" plain @click="addGroup">新增步骤</el-button>
                </div>
              </div>
              <el-alert
                type="info"
                :closable="false"
                show-icon
                class="form-alert"
                title="普通配置只要选商品；规格、同款多件、停用候选等少见规则在每个候选的“高级”里设置。"
              />

              <div v-if="form.groups.length === 0" class="groups-empty">暂无选择步骤，请先新增至少一个步骤。</div>
              <div v-for="(group, groupIndex) in form.groups" :key="group.local_key" class="group-editor">
                <div class="group-editor-head">
                  <div class="group-title-line">
                    <span class="group-index">第 {{ groupIndex + 1 }} 步</span>
                    <el-input v-model="group.group_title" class="group-title-input" :placeholder="`步骤名称，留空则使用“第 ${groupIndex + 1} 组”`" />
                    <span class="group-rule-summary">{{ groupRuleSummary(group) }}</span>
                  </div>
                  <div class="group-actions">
                    <el-button text type="primary" size="small" @click="group.advancedOpen = !group.advancedOpen">
                      {{ group.advancedOpen ? '收起规则' : '高级规则' }}
                    </el-button>
                    <el-button text type="danger" size="small" @click="removeGroup(groupIndex)">删除步骤</el-button>
                  </div>
                </div>

                <div class="simple-rule-row">
                  <span>本组选</span>
                  <el-input-number
                    v-model="group.choice_count"
                    :min="1"
                    :precision="0"
                    controls-position="right"
                    class="choice-count-input"
                    @change="() => onGroupChoiceCountChange(group)"
                  />
                  <span>件</span>
                </div>

                <div v-if="group.advancedOpen" class="advanced-box group-advanced-box">
                  <div class="advanced-rule-grid">
                    <el-form-item label="最少选择">
                      <el-input-number v-model="group.min_select" :min="0" :precision="0" style="width:100%" @change="() => normalizeAdvancedGroupRule(group)" />
                    </el-form-item>
                    <el-form-item label="最多选择">
                      <el-input-number v-model="group.max_select" :min="1" :precision="0" style="width:100%" @change="() => normalizeAdvancedGroupRule(group)" />
                    </el-form-item>
                  </div>
                </div>

                <div class="group-options-head">
                  <div class="group-options-title">
                    <span>候选商品</span>
                    <span class="group-options-note">候选越多，用户自由搭配空间越大。</span>
                  </div>
                  <el-button size="small" plain @click="addOption(groupIndex)">新增候选</el-button>
                </div>
                <div v-if="group.options.length === 0" class="group-options-empty">该步骤还没有候选商品。</div>
                <div v-for="(option, optionIndex) in group.options" :key="option.local_key" class="option-editor">
                  <div class="option-simple-row">
                    <el-select
                      v-model="option.product_id"
                      filterable
                      remote
                      reserve-keyword
                      clearable
                      :remote-method="searchProductOptions"
                      placeholder="搜索并选择商品"
                      class="option-product-select"
                      @change="(value) => onOptionProductChange(groupIndex, optionIndex, value)"
                    >
                      <el-option
                        v-for="item in mergedProductOptions(option)"
                        :key="item.value"
                        :label="item.label"
                        :value="item.value"
                      />
                    </el-select>
                    <div class="option-summary">
                      <span>{{ option.product_name || '未选商品' }}</span>
                      <span v-if="optionSkuDisplay(option)"> / {{ optionSkuDisplay(option) }}</span>
                      <span class="option-rule-text">{{ optionRuleText(option) }}</span>
                    </div>
                    <div class="option-actions">
                      <el-button text type="primary" size="small" @click="option.advancedOpen = !option.advancedOpen">
                        {{ option.advancedOpen ? '收起' : '高级' }}
                      </el-button>
                      <el-button text type="danger" size="small" @click="removeOption(groupIndex, optionIndex)">删除</el-button>
                    </div>
                  </div>
                  <div v-if="option.advancedOpen" class="advanced-box option-advanced-box">
                    <div class="option-form-grid">
                      <el-form-item label="规格" class="option-form-item option-form-item--sku">
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
                      <el-form-item label="默认数量" class="option-form-item option-form-item--qty">
                        <el-input-number
                          v-model="option.default_qty"
                          :min="1"
                          :precision="0"
                          style="width: 100%"
                          @change="() => onOptionDefaultQtyChange(option)"
                        />
                      </el-form-item>
                      <el-form-item label="选择次数" class="option-form-item option-form-item--repeat">
                        <el-select v-model="option.repeatable" style="width: 100%" @change="() => onOptionRepeatableChange(option)">
                          <el-option label="仅选一次" :value="0" />
                          <el-option label="可重复选" :value="1" />
                        </el-select>
                      </el-form-item>
                      <el-form-item v-if="option.repeatable === 1" label="最多数量" class="option-form-item option-form-item--max">
                        <el-input-number
                          v-model="option.max_qty_per_order"
                          :min="Math.max(1, Number(option.default_qty || 1))"
                          :precision="0"
                          style="width: 100%"
                          @change="() => normalizeOptionQtyRule(option)"
                        />
                      </el-form-item>
                      <el-form-item label="候选状态" class="option-form-item option-form-item--enabled">
                        <el-switch v-model="option.enabled" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="停用" />
                      </el-form-item>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <aside class="bundle-summary-panel">
            <div class="summary-card-title">配置摘要</div>
            <div class="summary-metric">
              <span>固定套餐价</span>
              <strong>¥{{ money(form.bundle_price) }}</strong>
            </div>
            <div class="summary-metric">
              <span>选择步骤</span>
              <strong>{{ form.groups.length }} 组</strong>
            </div>
            <div class="summary-metric">
              <span>候选商品</span>
              <strong>{{ totalOptionCount }} 个</strong>
            </div>
            <div class="summary-rule-list">
              <div v-for="(group, index) in form.groups" :key="group.local_key" class="summary-rule-item">
                <span>{{ groupDisplayTitle(group, index) }}</span>
                <em>{{ groupRuleSummary(group) }}</em>
              </div>
            </div>
            <div class="summary-tip">
              保存后，小程序会按固定套餐价结算；优惠券、积分和其他活动仍由后端禁止叠加。
            </div>
          </aside>
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
import MediaPicker from '@/components/MediaPicker.vue'
import BundleListSection from './BundleListSection.vue'
import {
  getProducts,
  getProductSkus,
  getProductBundleById,
  createProductBundle,
  updateProductBundle
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
const FIXED_BUNDLE_COMMISSION_MODE = 'fixed'
const FIXED_BUNDLE_COMMISSION_SOURCE = 'bundle_option_fixed'

const submitting = ref(false)
const formVisible = ref(false)
const formRef = ref(null)
const coverPickerVisible = ref(false)
const productSelectOptions = ref([])
const skuOptionsMap = reactive({})
const imagePreviewCache = reactive({})

const listRef = ref(null)

const handleEdit = (row) => openForm(row)
const handleNew = () => openForm()

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

const deriveSelectionMode = (minSelect = 1, maxSelect = 1) => {
  const min = Number(minSelect || 0)
  const max = Number(maxSelect || 1)
  if (min === 1 && max === 1) return 'required_one'
  if (min === 0 && max === 1) return 'optional_one'
  if (min === 1 && max > 1) return 'multi'
  return 'custom'
}

const normalizePositiveInt = (value, fallback = 1) => {
  const num = Math.floor(Number(value || fallback))
  return Number.isFinite(num) ? Math.max(1, num) : fallback
}

const groupDisplayTitle = (group = {}, groupIndex = 0) => {
  const title = String(group.group_title || '').trim()
  return title || `第 ${groupIndex + 1} 组`
}

const resolveGroupSelectRule = (group = {}) => {
  if (!group.advancedOpen) {
    const count = normalizePositiveInt(group.choice_count ?? group.max_select ?? group.min_select, 1)
    return { min: count, max: count }
  }
  const mode = group.selection_mode || deriveSelectionMode(group.min_select, group.max_select)
  if (mode === 'required_one') return { min: 1, max: 1 }
  if (mode === 'optional_one') return { min: 0, max: 1 }
  if (mode === 'multi') return { min: 1, max: Math.max(2, Number(group.max_select || 2)) }
  return {
    min: Math.max(0, Number(group.min_select || 0)),
    max: Math.max(1, Number(group.max_select || 1))
  }
}

const applyGroupSelectionMode = (group = {}) => {
  const rule = resolveGroupSelectRule(group)
  group.min_select = rule.min
  group.max_select = Math.max(rule.min || 1, rule.max)
  group.choice_count = Math.max(1, rule.max)
}

const onGroupSelectionModeChange = (group = {}) => {
  applyGroupSelectionMode(group)
}

const onGroupChoiceCountChange = (group = {}) => {
  const count = normalizePositiveInt(group.choice_count, 1)
  group.choice_count = count
  group.min_select = count
  group.max_select = count
  group.selection_mode = count === 1 ? 'required_one' : 'custom'
}

const normalizeAdvancedGroupRule = (group = {}) => {
  group.advancedOpen = true
  group.selection_mode = 'custom'
  group.min_select = Math.max(0, Math.floor(Number(group.min_select || 0)))
  group.max_select = Math.max(group.min_select || 1, Math.floor(Number(group.max_select || 1)))
  group.choice_count = Math.max(1, group.max_select)
}

const groupRuleSummary = (group = {}) => {
  const rule = resolveGroupSelectRule(group)
  if (rule.min === rule.max) return `用户必须选 ${rule.min} 件`
  if (rule.min === 0 && rule.max === 1) return '用户可选 0-1 件'
  if (rule.min === 1) return `用户至少选 1 件，最多 ${rule.max} 件`
  return `用户至少选 ${rule.min} 件，最多 ${rule.max} 件`
}

const normalizeOptionQtyRule = (option = {}) => {
  option.default_qty = Math.max(1, Math.floor(Number(option.default_qty || 1)))
  option.repeatable = Number(option.repeatable || 0) === 1 ? 1 : 0
  if (option.repeatable === 1) {
    option.max_qty_per_order = Math.max(
      option.default_qty,
      Math.floor(Number(option.max_qty_per_order || option.default_qty || 1))
    )
  } else {
    option.default_qty = 1
    option.max_qty_per_order = 1
  }
}

const onOptionDefaultQtyChange = (option = {}) => {
  option.default_qty = Math.max(1, Math.floor(Number(option.default_qty || 1)))
  if (option.default_qty > 1) {
    option.repeatable = 1
  }
  normalizeOptionQtyRule(option)
}

const onOptionRepeatableChange = (option = {}) => {
  normalizeOptionQtyRule(option)
}

const optionRuleText = (option = {}) => {
  const defaultQty = Math.max(1, Number(option.default_qty || 1))
  if (Number(option.repeatable || 0) === 1) {
    const maxQty = Math.max(defaultQty, Number(option.max_qty_per_order || defaultQty))
    return `默认 ${defaultQty} 件，用户最多可选 ${maxQty} 件`
  }
  return '用户只能选择 1 件'
}

const buildAutoGroupKey = (group = {}, groupIndex = 0, seen = new Set()) => {
  const base = String(group.group_key || '').trim() || `step_${groupIndex + 1}`
  let key = base
  let suffix = 2
  while (seen.has(key)) {
    key = `${base}_${suffix}`
    suffix += 1
  }
  seen.add(key)
  return key
}

const createOption = (overrides = {}) => ({
  local_key: `option-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  advancedOpen: false,
  product_id: '',
  sku_id: '',
  default_qty: 1,
  repeatable: 0,
  max_qty_per_order: 1,
  sort_order: 0,
  enabled: 1,
  product_name: '',
  sku_name: '',
  sku_spec: '',
  commission_mode: FIXED_BUNDLE_COMMISSION_MODE,
  commission_source: FIXED_BUNDLE_COMMISSION_SOURCE,
  commission_pool_amount: 0,
  solo_commission_fixed_by_role: createEmptyFixedCommissionMap(),
  direct_commission_fixed_by_role: createEmptyFixedCommissionMap(),
  indirect_commission_fixed_by_role: createEmptyFixedCommissionMap(),
  ...overrides
})

const createGroup = (overrides = {}) => ({
  local_key: `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  advancedOpen: false,
  group_title: '',
  group_key: '',
  selection_mode: 'required_one',
  choice_count: 1,
  min_select: 1,
  max_select: 1,
  sort_order: 0,
  options: [createOption()],
  ...overrides
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
  advancedOpen: false,
  groups: [createGroup()]
})

const form = reactive(defaultForm())

const totalOptionCount = computed(() => {
  return (form.groups || []).reduce((sum, group) => sum + (Array.isArray(group.options) ? group.options.length : 0), 0)
})

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

const resetForm = () => {
  Object.assign(form, defaultForm())
}

const hasSelectedProducts = () => {
  return (form.groups || []).some((group) => (group.options || []).some((option) => String(option.product_id || '').trim()))
}

const starterTemplates = {
  single: [
    { title: '任选商品', count: 1 }
  ],
  three: [
    { title: '第 1 步', count: 1 },
    { title: '第 2 步', count: 1 },
    { title: '第 3 步', count: 1 }
  ]
}

const applyStarterTemplate = async (type) => {
  const template = starterTemplates[type] || starterTemplates.single
  if (hasSelectedProducts()) {
    try {
      await ElMessageBox.confirm('套用模板会替换当前步骤和候选商品，是否继续？', '套用模板', { type: 'warning' })
    } catch (_error) {
      return
    }
  }
  form.groups = template.map((item, index) => createGroup({
    group_title: item.title,
    group_key: `step_${index + 1}`,
    choice_count: item.count,
    min_select: item.count,
    max_select: item.count,
    sort_order: index,
    options: [createOption()]
  }))
}

const hydrateBundleForm = async (bundle = {}) => {
  resetForm()
  form.id = bundle.id || null
  form.title = bundle.title || ''
  form.subtitle = bundle.subtitle || ''
  form.hero_title = bundle.title || bundle.hero_title || ''
  form.hero_subtitle = bundle.subtitle || bundle.hero_subtitle || ''
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
    advancedOpen: Number(group.min_select || 1) !== Number(group.max_select || 1),
    group_title: group.group_title || '',
    group_key: group.group_key || '',
    selection_mode: deriveSelectionMode(group.min_select, group.max_select),
    choice_count: Number(group.min_select || 1) === Number(group.max_select || 1)
      ? Number(group.max_select || 1)
      : Math.max(1, Number(group.max_select || 1)),
    min_select: Number(group.min_select || 1),
    max_select: Number(group.max_select || 1),
    sort_order: Number(group.sort_order || groupIndex),
    options: (group.options || []).map((option, optionIndex) => {
      ensureProductSelectOption(option.product_id, option.product_name)
      return {
        local_key: `option-${groupIndex}-${optionIndex}-${Date.now()}`,
        advancedOpen: !!(option.sku_id || Number(option.repeatable || 0) === 1 || Number(option.enabled || 0) === 0 || Number(option.default_qty || 1) > 1),
        product_id: String(option.product_id || ''),
        sku_id: String(option.sku_id || ''),
        default_qty: Number(option.repeatable || 0) === 1 ? Number(option.default_qty || 1) : 1,
        repeatable: Number(option.repeatable || 0) === 1 ? 1 : 0,
        max_qty_per_order: Number(option.repeatable || 0) === 1
          ? Math.max(Number(option.default_qty || 1), Number(option.max_qty_per_order || option.default_qty || 1))
          : 1,
        sort_order: Number(option.sort_order || optionIndex),
        enabled: Number(option.enabled || 0) === 0 ? 0 : 1,
        product_name: option.product_name || '',
        sku_name: option.sku_name || '',
        sku_spec: option.sku_spec || '',
        commission_mode: option.commission_mode || FIXED_BUNDLE_COMMISSION_MODE,
        commission_source: option.commission_source || FIXED_BUNDLE_COMMISSION_SOURCE,
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
  if (!String(form.title || '').trim()) return '套装名称不能为空'
  if (!(Number(form.bundle_price || 0) > 0)) return '套装价必须大于 0'
  if (!Array.isArray(form.groups) || form.groups.length === 0) return '至少需要 1 个选择步骤'
  for (const [groupIndex, group] of form.groups.entries()) {
    applyGroupSelectionMode(group)
    const groupTitle = groupDisplayTitle(group, groupIndex)
    if (!Array.isArray(group.options) || group.options.length === 0) return `步骤「${groupTitle}」至少需要 1 个候选商品`
    if (Number(group.max_select || 0) < Number(group.min_select || 0)) return `步骤「${groupTitle}」的最多数量不能小于最少数量`
    const enabledOptionCount = group.options.filter((option) => Number(option.enabled || 0) !== 0).length
    if (enabledOptionCount === 0) return `步骤「${groupTitle}」至少需要启用 1 个候选商品`
    group.options.forEach(normalizeOptionQtyRule)
    const enabledCapacity = group.options
      .filter((option) => Number(option.enabled || 0) !== 0)
      .reduce((sum, option) => sum + (Number(option.repeatable || 0) === 1 ? Math.max(Number(option.default_qty || 1), Number(option.max_qty_per_order || option.default_qty || 1)) : 1), 0)
    if (Number(group.min_select || 0) > enabledCapacity) return `步骤「${groupTitle}」的必选数量不能超过已启用候选商品上限`
    if (Number(group.max_select || 0) > enabledCapacity) return `步骤「${groupTitle}」的最多数量不能超过已启用候选商品上限`
    for (const option of group.options) {
      if (!String(option.product_id || '').trim()) return `步骤「${groupTitle}」存在未选择商品的候选项`
    }
  }
  return ''
}

const buildOptionCommissionPayload = (option = {}) => ({
  commission_mode: option.commission_mode || FIXED_BUNDLE_COMMISSION_MODE,
  commission_source: option.commission_source || FIXED_BUNDLE_COMMISSION_SOURCE,
  commission_pool_amount: Number(option.commission_pool_amount || 0),
  solo_commission_fixed_by_role: normalizeFixedCommissionMap(option.solo_commission_fixed_by_role),
  direct_commission_fixed_by_role: normalizeFixedCommissionMap(option.direct_commission_fixed_by_role),
  indirect_commission_fixed_by_role: normalizeFixedCommissionMap(option.indirect_commission_fixed_by_role)
})

const buildPayload = () => ({
  title: form.title,
  subtitle: form.subtitle,
  hero_title: form.title,
  hero_subtitle: form.subtitle,
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
  groups: (() => {
    const seenGroupKeys = new Set()
    return form.groups.map((group, groupIndex) => {
      const rule = resolveGroupSelectRule(group)
      return {
        group_title: groupDisplayTitle(group, groupIndex),
        group_key: buildAutoGroupKey(group, groupIndex, seenGroupKeys),
        min_select: rule.min,
        max_select: Math.max(rule.min || 1, rule.max),
        sort_order: Number(group.sort_order || groupIndex),
        options: group.options.map((option, optionIndex) => ({
          product_id: option.product_id,
          sku_id: option.sku_id || '',
          default_qty: Number(option.repeatable || 0) === 1 ? Math.max(1, Number(option.default_qty || 1)) : 1,
          repeatable: Number(option.repeatable || 0) === 1 ? 1 : 0,
          max_qty_per_order: Number(option.repeatable || 0) === 1
            ? Math.max(Number(option.default_qty || 1), Number(option.max_qty_per_order || option.default_qty || 1))
            : 1,
          sort_order: Number(option.sort_order || optionIndex),
          enabled: Number(option.enabled || 0) === 0 ? 0 : 1,
          ...buildOptionCommissionPayload(option)
        }))
      }
    })
  })()
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
      ElMessage.success('自由选套餐已更新')
    } else {
      await createProductBundle(payload)
      ElMessage.success('自由选套餐已创建')
    }
    formVisible.value = false
    listRef.value?.refresh()
  } catch (error) {
    ElMessage.error(error?.message || '保存搭配套装失败')
  } finally {
    submitting.value = false
  }
}

</script>

<style scoped>
.bundle-page {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.form-section-title {
  margin-bottom: 4px;
  font-size: 15px;
  font-weight: 600;
  color: #111827;
}

.section-row,
.section-headline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.section-note {
  font-size: 12px;
  color: #6b7280;
}

.section-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
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

.drawer-workbench {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 18px;
  align-items: flex-start;
}

.bundle-main-panel {
  min-width: 0;
}

.simple-section {
  padding: 18px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  margin-bottom: 16px;
}

.base-grid,
.advanced-grid,
.advanced-rule-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.advanced-box {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f8fafc;
}

.group-advanced-box,
.option-advanced-box {
  margin-top: 12px;
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
  padding: 14px;
  border-radius: 8px;
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

.group-title-line {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
}

.group-index {
  white-space: nowrap;
  color: #374151;
}

.group-title-input {
  max-width: 300px;
}

.group-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.simple-rule-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0 14px;
  color: #374151;
  font-size: 13px;
}

.choice-count-input {
  width: 130px;
}

.group-options-title {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.group-options-note {
  font-size: 12px;
  font-weight: 400;
  color: #6b7280;
}

.group-rule-summary {
  margin-left: 10px;
  font-size: 12px;
  font-weight: 400;
  color: #6b7280;
}

.group-fields-grid {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(430px, 1.6fr) minmax(160px, 0.5fr) minmax(160px, 0.5fr);
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
  grid-template-columns: minmax(300px, 1.6fr) minmax(180px, 0.9fr) minmax(150px, 0.55fr) minmax(150px, 0.6fr) minmax(150px, 0.55fr);
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
  padding: 12px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #eef2f7;
}

.option-simple-row {
  display: grid;
  grid-template-columns: minmax(260px, 1.1fr) minmax(180px, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.option-product-select {
  width: 100%;
}

.option-summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: #6b7280;
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

.option-rule-text {
  margin-left: 10px;
  color: #8a5f14;
}

.option-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
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

.bundle-summary-panel {
  position: sticky;
  top: 0;
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f8fafc;
}

.summary-card-title {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 14px;
}

.summary-metric {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid #e5e7eb;
  font-size: 12px;
  color: #6b7280;
}

.summary-metric strong {
  font-size: 15px;
  color: #111827;
}

.summary-rule-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.summary-rule-item {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: #374151;
}

.summary-rule-item em {
  font-style: normal;
  color: #8a5f14;
  text-align: right;
}

.summary-tip {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
  font-size: 12px;
  line-height: 1.7;
  color: #6b7280;
}

@media (max-width: 1180px) {
  .bundle-toolbar,
  .section-headline {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-actions,
  .section-actions {
    justify-content: flex-start;
  }

  .drawer-workbench {
    grid-template-columns: 1fr;
  }

  .bundle-summary-panel {
    position: static;
  }

  .base-grid,
  .advanced-grid,
  .advanced-rule-grid,
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
  .toolbar-search {
    width: 100%;
  }

  .group-editor {
    padding: 14px;
  }

  .option-editor {
    padding: 12px;
  }

  .base-grid,
  .advanced-grid,
  .advanced-rule-grid,
  .group-fields-grid,
  .option-form-grid,
  .option-simple-row,
  .commission-pool-row,
  .commission-role-list {
    grid-template-columns: 1fr;
  }

  .group-editor-head,
  .group-title-line,
  .group-actions {
    align-items: flex-start;
    flex-direction: column;
  }

  .group-title-input {
    max-width: 100%;
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
