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
        <el-input v-model="localData.image_url" placeholder="输入图片URL" @input="emitData">
          <template #append>
            <el-upload :show-file-list="false" :http-request="handleUpload" :before-upload="beforeUpload" accept="image/*">
              <el-button>上传</el-button>
            </el-upload>
          </template>
        </el-input>
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
        <el-select v-model="localData.link_type" style="width:200px" @change="emitData">
          <el-option label="无跳转" value="none" />
          <el-option label="商品详情" value="product" />
          <el-option label="活动页面" value="activity" />
          <el-option label="分类页定位" value="category" />
          <el-option label="拼团活动" value="group_buy" />
          <el-option label="砍价活动" value="slash" />
          <el-option label="抽奖转盘" value="lottery" />
          <el-option label="小程序页面" value="page" />
          <el-option label="外部链接" value="url" />
        </el-select>
      </el-form-item>
      <el-form-item label="跳转目标" v-if="localData.link_type !== 'none'">
        <el-input v-model="localData.link_value" placeholder="商品ID / 分类ID / 活动ID / 页面路径 / URL" style="width:340px" @input="emitData" />
      </el-form-item>
    </template>

    <!-- 商品模式下可覆盖图片 -->
    <el-form-item label="覆盖图片" v-if="source === 'product' && pickedProduct">
      <el-input v-model="localData.image_url" placeholder="留空使用商品图，填URL覆盖" @input="emitData" />
      <div style="font-size:12px;color:#909399;margin-top:4px;">不填则自动使用商品首图</div>
    </el-form-item>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getProducts, getProductById, getBanners, uploadFile } from '@/api'

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

const localData = reactive({
  file_id: '',
  image_url: '',
  title: '',
  subtitle: '',
  link_type: 'none',
  link_value: '',
  product_id: null
})

const resolveAssetUrl = (item = {}) => item.image_url || item.url || item.file_id || ''
const resolvedImageUrl = computed(() => resolveAssetUrl(localData))

const showField = (f) => props.fields.includes(f)

const coverOf = (p) => {
  if (!p) return ''
  let imgs = p.images || []
  if (typeof imgs === 'string') try { imgs = JSON.parse(imgs) } catch (_) { imgs = [] }
  return Array.isArray(imgs) ? imgs[0] || '' : ''
}

const posLabel = (pos) => ({ home: '首页轮播', home_mid: '首页中部', home_bottom: '首页底部', category: '分类页', activity: '活动页' }[pos] || pos)

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
}, { immediate: true })

const emitData = () => { emit('update:modelValue', { ...localData }) }

const onSourceChange = () => {
  if (source.value === 'reuse') loadReusableBanners()
}

const searchProducts = async (kw) => {
  if (!kw) return
  searching.value = true
  try {
    const res = await getProducts({ keyword: kw, limit: 20 })
    productList.value = res.list
  } catch (_) { productList.value = [] }
  finally { searching.value = false }
}

const onProductPicked = (id) => {
  const p = productList.value.find(x => x.id === id)
  pickedProduct.value = p || null
  if (p) {
    localData.link_type = 'product'
    localData.link_value = String(p.id)
    localData.product_id = p.id
    localData.title = localData.title || p.name
    if (!localData.image_url) localData.image_url = coverOf(p)
    emitData()
  }
}

const loadReusableBanners = async () => {
  try {
    const list = await getBanners()
    reusableBanners.value = list.list
  } catch (_) { reusableBanners.value = [] }
}

const onReusePicked = (id) => {
  const b = reusableBanners.value.find(x => x.id === id)
  reusedBanner.value = b || null
  if (b) {
    localData.file_id = b.file_id || ''
    localData.image_url = resolveAssetUrl(b)
    localData.title = b.title || ''
    localData.subtitle = b.subtitle || ''
    localData.link_type = b.link_type || 'none'
    localData.link_value = b.link_value || ''
    localData.product_id = b.product_id || null
    emitData()
  }
}

const beforeUpload = (file) => {
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.warning('图片不能超过10MB')
    return false
  }
  return true
}

const handleUpload = async ({ file }) => {
  try {
    const res = await uploadFile(file)
    const payload = res.file || res || {}
    const url = payload.url || payload.image_url || ''
    if (!url) {
      ElMessage.error('上传成功但未返回图片地址，请检查存储配置')
      return
    }
    syncUploadedAsset(payload)
    ElMessage.success('图片上传成功')
    // 强制 emit，让父组件同步最新 image_url
    emitData()
  } catch (e) {
    ElMessage.error(e?.message || '图片上传失败')
  }
}

const syncUploadedAsset = (payload = {}) => {
  localData.file_id = payload.file_id || payload.url || payload.object_key || ''
  localData.image_url = payload.url || payload.image_url || ''
}

onMounted(async () => {
  if (props.modelValue?.product_id) {
    try {
      const res = await getProductById(props.modelValue.product_id)
      const product = res
      if (product && product.id) {
        productList.value = [product]
        onProductPicked(product.id)
      }
    } catch (_) {}
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
