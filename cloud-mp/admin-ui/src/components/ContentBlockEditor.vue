<template>
  <div class="content-block-editor">
    <div v-if="imageSpec" class="editor-spec-box">
      <div class="editor-spec-title">{{ imageSpec.name }}</div>
      <div class="editor-spec-meta">推荐比例：{{ imageSpec.ratio }} · 最低分辨率：{{ imageSpec.minSize }}</div>
      <div class="editor-spec-desc">{{ imageSpec.display }}；{{ imageSpec.note }}</div>
    </div>

    <!-- 内容来源切换 -->
    <el-form-item label="内容来源">
      <el-radio-group v-model="source" @change="onSourceChange">
        <el-radio-button value="product">关联商品</el-radio-button>
        <el-radio-button value="custom">自定义图片</el-radio-button>
        <el-radio-button value="reuse">复用已有</el-radio-button>
      </el-radio-group>
    </el-form-item>

    <!-- 关联商品模式 -->
    <template v-if="source === 'product'">
      <el-form-item label="搜索商品">
        <el-select
          v-model="localData.product_id"
          filterable remote clearable
          :remote-method="searchProducts"
          :loading="searching"
          placeholder="输入商品名搜索"
          style="width:380px"
          @change="onProductPicked"
        >
          <el-option v-for="p in productList" :key="p.id" :label="p.name" :value="p.id">
            <div style="display:flex;align-items:center;gap:8px;">
              <el-image :src="coverOf(p)" style="width:36px;height:36px;border-radius:4px;" fit="cover" />
              <div style="line-height:1.3">
                <div style="font-size:13px">{{ p.name }}</div>
                <div style="font-size:11px;color:#999">¥{{ p.retail_price || p.price || '-' }}{{ p.description ? ' · ' + p.description.slice(0, 16) : '' }}</div>
              </div>
            </div>
          </el-option>
        </el-select>
      </el-form-item>

      <div v-if="pickedProduct" class="picked-card">
        <el-image :src="coverOf(pickedProduct)" style="width:80px;height:80px;border-radius:8px;" fit="cover" />
        <div class="picked-info">
          <div class="picked-name">{{ pickedProduct.name }}</div>
          <div class="picked-price">¥{{ pickedProduct.retail_price || pickedProduct.price }}</div>
          <div class="picked-meta" v-if="pickedProduct.description">{{ pickedProduct.description.slice(0, 40) }}</div>
          <div class="picked-hint">已自动填入：图片、标题、跳转链接</div>
        </div>
      </div>
    </template>

    <!-- 自定义图片模式 -->
    <template v-if="source === 'custom'">
      <el-form-item label="图片">
        <div v-if="resolvedImageUrl" style="margin-bottom:8px;">
          <el-image :src="resolvedImageUrl" fit="contain" style="max-width:300px;max-height:160px;border-radius:8px;border:1px solid #eee;" />
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <el-button type="primary" @click="openMediaPicker('custom')">从素材库选择</el-button>
          <el-tag v-if="localData.file_id" type="success" effect="plain">已绑定素材</el-tag>
          <el-button v-if="localData.image_url" text type="danger" @click="clearSelectedImage">清空</el-button>
        </div>
        <div style="font-size:12px;color:#909399;margin-top:6px;">请先上传到素材库，再从素材库中选择图片</div>
      </el-form-item>
    </template>

    <!-- 复用已有 Banner -->
    <template v-if="source === 'reuse'">
      <el-form-item label="选择已有">
        <el-select
          v-model="reuseId"
          filterable
          placeholder="从已有 Banner 中选择"
          style="width:380px"
          @change="onReusePicked"
        >
          <el-option v-for="b in reusableBanners" :key="b.id" :label="b.title || ('Banner #' + b.id)" :value="b.id">
            <div style="display:flex;align-items:center;gap:8px;">
              <el-image :src="resolveAssetUrl(b)" style="width:48px;height:24px;border-radius:3px;" fit="cover" v-if="resolveAssetUrl(b)" />
              <div>
                <div style="font-size:13px">{{ b.title || '(无标题)' }}</div>
                <div style="font-size:11px;color:#999">{{ posLabel(b.position) }} · {{ b.link_type || 'none' }}</div>
              </div>
            </div>
          </el-option>
        </el-select>
        <div v-if="reusedBanner" style="font-size:12px;color:#67C23A;margin-top:6px;">已复制配置，可在下方微调</div>
      </el-form-item>
    </template>

    <!-- 通用字段（所有模式共用） -->
    <el-form-item label="标题" v-if="showField('title')">
      <el-input v-model="localData.title" placeholder="标题（可选）" @input="emitData" />
    </el-form-item>

    <el-form-item label="副标题" v-if="showField('subtitle')">
      <el-input v-model="localData.subtitle" placeholder="副标题（可选）" @input="emitData" />
    </el-form-item>

    <!-- 跳转（自定义模式或复用模式下可手动改） -->
    <template v-if="source !== 'product'">
      <el-form-item label="跳转类型">
        <el-select v-model="localData.link_type" style="width:240px" @change="handleLinkTypeChange">
          <el-option
            v-for="option in MINI_PROGRAM_LINK_TYPE_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item v-if="shouldShowRecommendedTargets" label="推荐目标">
        <div style="display:flex;flex-direction:column;gap:8px;max-width:420px;">
          <el-select
            v-model="selectedTargetKey"
            clearable
            filterable
            placeholder="从目标库选择，不再手填页面路径"
            @clear="handleTargetSelectClear"
          >
            <el-option-group
              v-for="group in recommendedTargetGroups"
              :key="group.group"
              :label="group.group"
            >
              <el-option
                v-for="target in group.items"
                :key="target.key"
                :label="target.title"
                :value="target.key"
              >
                <div style="display:flex;justify-content:space-between;gap:12px;">
                  <span>{{ target.title }}</span>
                  <span style="font-size:12px;color:#909399;">{{ target.note || target.link_value || '' }}</span>
                </div>
              </el-option>
            </el-option-group>
          </el-select>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:12px;color:#909399;">默认优先使用目标库，减少路径配置错误。</span>
            <el-button
              v-if="!shouldShowManualInput"
              text
              type="primary"
              @click="manualTargetMode = true"
            >
              改为手动填写
            </el-button>
            <el-button
              v-else-if="recommendedTargets.length"
              text
              @click="manualTargetMode = false"
            >
              返回目标库
            </el-button>
          </div>
        </div>
      </el-form-item>
      <el-form-item label="跳转目标" v-if="shouldShowManualInput">
        <el-input v-model="localData.link_value" placeholder="商品ID / 分类ID / 活动ID / 页面路径 / URL" style="width:340px" @input="emitData" />
      </el-form-item>
    </template>

    <!-- 商品模式下可覆盖图片 -->
    <el-form-item label="覆盖图片" v-if="source === 'product' && pickedProduct">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <el-button @click="openMediaPicker('cover')">从素材库选择覆盖图</el-button>
        <el-button v-if="localData.image_url" text type="danger" @click="clearSelectedImage">清空覆盖图</el-button>
      </div>
      <div style="font-size:12px;color:#909399;margin-top:4px;">不填则自动使用商品首图</div>
    </el-form-item>

    <MediaPicker
      v-model:visible="mediaPickerVisible"
      :multiple="false"
      :max="1"
      @confirm="handleMediaConfirm"
    />
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getProducts, getProductById, getBanners } from '@/api'
import MediaPicker from '@/components/MediaPicker.vue'
import { buildPersistentAssetRef } from '@/utils/assetUrlAudit'
import {
  MINI_PROGRAM_LINK_TYPE_OPTIONS,
  findMiniProgramTarget,
  getRecommendedTargetsByLinkType,
  groupMiniProgramTargets
} from '@/config/miniProgramTargets'

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  fields: { type: Array, default: () => ['title', 'subtitle'] },
  imageSpec: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue'])

const source = ref('product')
const searching = ref(false)
const productList = ref([])
const pickedProduct = ref(null)
const reusableBanners = ref([])
const reuseId = ref(null)
const reusedBanner = ref(null)
const mediaPickerVisible = ref(false)
const previewImageUrl = ref('')
const manualTargetMode = ref(false)

const localData = reactive({
  file_id: '',
  image_url: '',
  title: '',
  subtitle: '',
  link_type: 'none',
  link_value: '',
  product_id: null
})

const isCloudFileId = (value) => /^cloud:\/\//i.test(String(value || ''))
const resolveAssetUrl = (item = {}, fallback = '') => {
  const candidates = [fallback, item.image_url, item.url, item.image, item.cover_image]
    .map((value) => String(value || '').trim())
  return candidates.find((value) => value && !isCloudFileId(value)) || ''
}
const resolvedImageUrl = computed(() => resolveAssetUrl(localData, previewImageUrl.value))
const recommendedTargets = computed(() => getRecommendedTargetsByLinkType(localData.link_type))
const recommendedTargetGroups = computed(() => groupMiniProgramTargets(recommendedTargets.value))
const usesUnlistedTarget = computed(() => {
  if (!recommendedTargets.value.length) return false
  return !!String(localData.link_value || '').trim() && !findMiniProgramTarget(localData.link_type, localData.link_value)
})
const shouldShowRecommendedTargets = computed(() => source.value !== 'product' && recommendedTargets.value.length > 0)
const shouldShowManualInput = computed(() => {
  if (source.value === 'product' || localData.link_type === 'none') return false
  return !recommendedTargets.value.length || manualTargetMode.value || usesUnlistedTarget.value
})
const selectedTargetKey = computed({
  get: () => findMiniProgramTarget(localData.link_type, localData.link_value)?.key || '',
  set: (key) => {
    const target = recommendedTargets.value.find((item) => item.key === key)
    if (!target) return
    localData.link_type = target.link_type
    localData.link_value = target.link_value || ''
    manualTargetMode.value = false
    emitData()
  }
})

const showField = (f) => props.fields.includes(f)

const coverOf = (p) => {
  if (!p) return ''
  let imgs = p.images || []
  if (typeof imgs === 'string') try { imgs = JSON.parse(imgs) } catch (_) { imgs = [] }
  return Array.isArray(imgs) ? imgs[0] || '' : ''
}

const posLabel = (pos) => ({ home: '首页轮播', home_mid: '首页中部', home_bottom: '首页底部', category: '分类页', activity: '活动页' }[pos] || pos)

const hydratePickedProduct = async (productId) => {
  if (!productId) {
    pickedProduct.value = null
    return
  }
  try {
    const res = await getProductById(productId)
    const product = res?.data || res
    if (product && product.id) {
      pickedProduct.value = product
      productList.value = [product]
    }
  } catch (_) {
    pickedProduct.value = null
  }
}

watch(() => props.modelValue, (v) => {
  // 只在初始化或外部明确变化时同步，避免 emitData → 父组件更新 → watch 触发 → 覆盖刚上传的 URL
  if (!v) return
  // 仅当数据真正不同时才同步，防止上传后被父组件空值覆盖
  if (v.file_id !== undefined) localData.file_id = v.file_id || ''
  if (v.image_url !== undefined && v.image_url !== localData.image_url) localData.image_url = v.image_url
  if (v.title !== undefined) localData.title = v.title
  if (v.subtitle !== undefined) localData.subtitle = v.subtitle
  if (v.link_type !== undefined) localData.link_type = v.link_type
  if (v.link_value !== undefined) localData.link_value = v.link_value
  if (v.product_id !== undefined) localData.product_id = v.product_id
  // 根据外部数据推断模式（只在初始加载时）
  if (v.product_id && v.link_type === 'product') source.value = 'product'
  else if (resolveAssetUrl(v)) source.value = 'custom'
  manualTargetMode.value = !!(
    v.link_type
    && getRecommendedTargetsByLinkType(v.link_type).length
    && !findMiniProgramTarget(v.link_type, v.link_value)
    && String(v.link_value || '').trim()
  )
  if (v.product_id && String(v.product_id) !== String(pickedProduct.value?.id || '')) {
    hydratePickedProduct(v.product_id)
  }
  if (!v.product_id && pickedProduct.value) {
    pickedProduct.value = null
  }
  const nextPreview = resolveAssetUrl(v)
  if (nextPreview) previewImageUrl.value = nextPreview
}, { immediate: true })

const emitData = () => { emit('update:modelValue', { ...localData }) }

const onSourceChange = () => {
  if (source.value === 'reuse') loadReusableBanners()
}

const handleLinkTypeChange = (linkType) => {
  if (linkType === 'none') {
    localData.link_value = ''
    manualTargetMode.value = false
    emitData()
    return
  }
  const matchedTarget = findMiniProgramTarget(linkType, localData.link_value)
  if (matchedTarget) {
    manualTargetMode.value = false
    emitData()
    return
  }
  const targets = getRecommendedTargetsByLinkType(linkType)
  if (targets.length === 1) {
    localData.link_value = targets[0].link_value || ''
    manualTargetMode.value = false
  } else {
    localData.link_value = ''
    manualTargetMode.value = !targets.length
  }
  emitData()
}

const handleTargetSelectClear = () => {
  if (!recommendedTargets.value.length) return
  localData.link_value = ''
  manualTargetMode.value = true
  emitData()
}

const searchProducts = async (kw) => {
  if (!kw) return
  searching.value = true
  try {
    const res = await getProducts({ keyword: kw, limit: 20 })
    productList.value = Array.isArray(res?.list || res?.data?.list || res) ? (res?.list || res?.data?.list || res) : []
  } catch (_) { productList.value = [] }
  finally { searching.value = false }
}

const onProductPicked = (id) => {
  const previousName = pickedProduct.value?.name || ''
  const p = productList.value.find(x => x.id === id)
  pickedProduct.value = p || null
  if (p) {
    localData.link_type = 'product'
    localData.link_value = String(p.id)
    localData.product_id = p.id
    if (!localData.title || localData.title === previousName) {
      localData.title = p.name || ''
    }
    // 切换关联商品时，清空覆盖图，保存时由后端按关联商品首图回退，避免把临时签名 URL 存进 Banner
    localData.file_id = ''
    localData.image_url = ''
    previewImageUrl.value = ''
    emitData()
  }
}

const loadReusableBanners = async () => {
  try {
    const list = await getBanners()
    reusableBanners.value = Array.isArray(list) ? list : []
  } catch (_) { reusableBanners.value = [] }
}

const onReusePicked = (id) => {
  const b = reusableBanners.value.find(x => x.id === id)
  reusedBanner.value = b || null
  if (b) {
    localData.file_id = b.file_id || ''
    const displayUrl = resolveAssetUrl(b)
    localData.image_url = buildPersistentAssetRef({ url: displayUrl, fileId: b.file_id || '' })
    previewImageUrl.value = displayUrl
    localData.title = b.title || ''
    localData.subtitle = b.subtitle || ''
    localData.link_type = b.link_type || 'none'
    localData.link_value = b.link_value || ''
    localData.product_id = b.product_id || null
    manualTargetMode.value = !!(
      localData.link_type
      && getRecommendedTargetsByLinkType(localData.link_type).length
      && !findMiniProgramTarget(localData.link_type, localData.link_value)
      && String(localData.link_value || '').trim()
    )
    emitData()
  }
}

const openMediaPicker = () => {
  mediaPickerVisible.value = true
}

const clearSelectedImage = () => {
  localData.file_id = ''
  localData.image_url = ''
  previewImageUrl.value = ''
  emitData()
}

const handleMediaConfirm = (persistIds = [], displayUrls = []) => {
  const persist = Array.isArray(persistIds) ? (persistIds[0] || '') : ''
  const display = Array.isArray(displayUrls) ? (displayUrls[0] || '') : ''
  if (!isCloudFileId(persist)) {
    ElMessage.warning('请选择素材库中已托管到云开发的图片')
    return
  }
  localData.file_id = persist
  localData.image_url = buildPersistentAssetRef({ url: display, fileId: persist })
  previewImageUrl.value = display || ''
  emitData()
}

onMounted(async () => {
  if (props.modelValue?.product_id) {
    await hydratePickedProduct(props.modelValue.product_id)
  }
})
</script>

<style scoped>
.content-block-editor { margin-top: 8px; }
.editor-spec-box {
  margin-bottom: 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #faf7f2;
  border: 1px solid #f0e5d8;
}
.editor-spec-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 6px;
}
.editor-spec-meta,
.editor-spec-desc {
  font-size: 12px;
  line-height: 1.7;
}
.editor-spec-meta { color: #8b7460; }
.editor-spec-desc { color: #909399; }

.picked-card {
  display: flex; gap: 14px; padding: 14px;
  background: #fafafa; border-radius: 10px; border: 1px solid #f0f0f0;
  margin: 8px 0 16px;
}
.picked-info { display: flex; flex-direction: column; gap: 3px; }
.picked-name { font-size: 15px; font-weight: 600; color: #303133; }
.picked-price { font-size: 15px; color: #e6563a; font-weight: 600; }
.picked-meta { font-size: 12px; color: #909399; }
.picked-hint { font-size: 11px; color: #67C23A; margin-top: 4px; }
</style>
