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

            <BundleStepsEditor :groups="form.groups" />
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
import { ElMessage } from 'element-plus'
import MediaPicker from '@/components/MediaPicker.vue'
import BundleListSection from './BundleListSection.vue'
import BundleStepsEditor from './BundleStepsEditor.vue'
import {
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
  groups: []
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

const resetForm = () => {
  Object.assign(form, defaultForm())
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
}

const openForm = async (row = null) => {
  resetForm()
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
.advanced-grid {
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
  .section-headline {
    flex-direction: column;
    align-items: stretch;
  }

  .drawer-workbench {
    grid-template-columns: 1fr;
  }

  .bundle-summary-panel {
    position: static;
  }
}

@media (max-width: 760px) {
  .base-grid,
  .advanced-grid {
    grid-template-columns: 1fr;
  }
}
</style>
