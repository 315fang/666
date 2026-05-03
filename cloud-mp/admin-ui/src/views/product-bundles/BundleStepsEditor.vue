<template>
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

    <div v-if="groups.length === 0" class="groups-empty">暂无选择步骤，请先新增至少一个步骤。</div>
    <div v-for="(group, groupIndex) in groups" :key="group.local_key" class="group-editor">
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
</template>

<script setup>
// 2026-05-03 megapage 拆分（P1-2，第二阶段）：
// 从 product-bundles/index.vue 拆出"2. 选择步骤"区块，承担 group/option 全部交互。
// 设计：单 prop（groups 数组），通过 in-place mutation（push/splice）保持 Vue 响应式。
// 必要的纯函数（resolveGroupSelectRule / groupRuleSummary / normalizeOptionQtyRule /
// normalizePositiveInt / deriveSelectionMode）在父组件 validateForm/buildPayload 也会用到，
// 选择 duplicate 而非抽公共模块——5 个小函数 ~35 行，简单直接，与 home-sections 子组件风格一致。
// onMounted 自治：空 groups 自动补 1 个 default group；现有 options 预加载 SKUs。
import { ref, reactive, onMounted, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { getProducts, getProductSkus } from '@/api'

const props = defineProps({
  groups: {
    type: Array,
    required: true
  }
})

const productSelectOptions = ref([])
const skuOptionsMap = reactive({})

// ============ 纯函数（与父组件 validateForm/buildPayload 共用） ============

const normalizePositiveInt = (value, fallback = 1) => {
  const num = Math.floor(Number(value || fallback))
  return Number.isFinite(num) ? Math.max(1, num) : fallback
}

const deriveSelectionMode = (minSelect = 1, maxSelect = 1) => {
  const min = Number(minSelect || 0)
  const max = Number(maxSelect || 1)
  if (min === 1 && max === 1) return 'required_one'
  if (min === 0 && max === 1) return 'optional_one'
  if (min === 1 && max > 1) return 'multi'
  return 'custom'
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

// ============ 工厂 + 交互 helpers（仅 child 使用） ============

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

const addGroup = () => {
  props.groups.push(createGroup())
}

const removeGroup = (groupIndex) => {
  props.groups.splice(groupIndex, 1)
}

const addOption = (groupIndex) => {
  props.groups[groupIndex].options.push(createOption())
}

const removeOption = (groupIndex, optionIndex) => {
  props.groups[groupIndex].options.splice(optionIndex, 1)
}

// ============ Starter templates ============

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

const hasSelectedProducts = () => {
  return (props.groups || []).some((group) => (group.options || []).some((option) => String(option.product_id || '').trim()))
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
  const next = template.map((item, index) => createGroup({
    group_title: item.title,
    group_key: `step_${index + 1}`,
    choice_count: item.count,
    min_select: item.count,
    max_select: item.count,
    sort_order: index,
    options: [createOption()]
  }))
  // 在原数组上 splice 替换，保持父级 form.groups 引用不变
  props.groups.splice(0, props.groups.length, ...next)
}

// ============ Product / SKU 远程搜索与选项展示 ============

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

const onOptionProductChange = async (groupIndex, optionIndex, value) => {
  const option = props.groups[groupIndex]?.options?.[optionIndex]
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
  const option = props.groups[groupIndex]?.options?.[optionIndex]
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

const preloadSkusForGroups = (groups) => {
  groups?.forEach((group) => {
    group.options?.forEach((option) => {
      if (option.product_id) loadSkuOptions(option.product_id)
    })
  })
}

onMounted(() => {
  if (props.groups.length === 0) {
    props.groups.push(createGroup())
  }
  preloadSkusForGroups(props.groups)
})

watch(() => props.groups, (next) => {
  preloadSkusForGroups(next)
})
</script>

<style scoped>
/* parent 的 scoped CSS 不穿透到子组件 DOM，因此与"选择步骤"相关的全部 selectors
   都在本文件 scoped 声明。section-headline / form-section-title / section-note /
   section-actions / advanced-box 与父组件 drawer section 1 重名但各自独立。 */

.simple-section {
  padding: 18px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  margin-bottom: 16px;
}

.section-headline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.form-section-title {
  margin-bottom: 4px;
  font-size: 15px;
  font-weight: 600;
  color: #111827;
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

.advanced-rule-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
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

.option-form-item {
  min-width: 0;
  margin-bottom: 8px;
}

.option-form-item :deep(.el-form-item__content) {
  min-width: 0;
}

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

@media (max-width: 1180px) {
  .section-headline {
    flex-direction: column;
    align-items: stretch;
  }

  .section-actions {
    justify-content: flex-start;
  }

  .advanced-rule-grid,
  .option-form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .option-form-item--enabled {
    width: auto;
    justify-self: start;
  }
}

@media (max-width: 760px) {
  .group-editor {
    padding: 14px;
  }

  .option-editor {
    padding: 12px;
  }

  .advanced-rule-grid,
  .option-form-grid,
  .option-simple-row {
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
}
</style>
