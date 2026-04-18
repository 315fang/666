<template>
  <div class="content-page">
    <el-alert
      title="内容中心只负责内容资源本身，例如 Banner、图文、素材规范；首页和活动页的最终呈现顺序，请到页面装修里管理。"
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    />
    <el-card class="image-spec-card">
      <template #header>
        <div class="card-header">
          <span>前端图片组件规范</span>
        </div>
      </template>
      <div class="image-spec-tip">
        统一策略：前端容器固定比例，图片按对应图位规范上传，前端默认满铺填充展示；不要依赖容器跟随素材自由伸缩。
      </div>
      <div class="image-spec-grid">
        <div v-for="item in imageSpecs" :key="item.key" class="image-spec-item">
          <div class="image-spec-name">{{ item.name }}</div>
          <div class="image-spec-meta">推荐比例：{{ item.ratio }}</div>
          <div class="image-spec-meta">最低分辨率：{{ item.minSize }}</div>
          <div class="image-spec-desc">{{ item.display }}</div>
          <div class="image-spec-note">{{ item.note }}</div>
        </div>
      </div>
    </el-card>

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <!-- ====== Banner 管理 ====== -->
      <el-tab-pane label="Banner 管理" name="banner">
        <el-card style="margin-top: 16px;">
          <template #header>
            <div class="card-header">
              <span>Banner 列表</span>
              <el-button type="primary" @click="handleAddBanner">
                <el-icon><Plus /></el-icon>
                新增 Banner
              </el-button>
            </div>
          </template>

          <div style="margin-bottom:16px;display:flex;gap:12px;align-items:center;">
            <span style="font-size:14px;color:#606266;">位置筛选：</span>
            <el-radio-group v-model="bannerFilter" size="small" @change="fetchBanners">
              <el-radio-button value="">全部</el-radio-button>
              <el-radio-button value="home">首页轮播</el-radio-button>
              <el-radio-button value="home_mid">首页中部</el-radio-button>
              <el-radio-button value="home_bottom">首页底部</el-radio-button>
              <el-radio-button value="category">分类页</el-radio-button>
              <el-radio-button value="activity">活动页</el-radio-button>
            </el-radio-group>
          </div>

          <el-alert
            v-if="bannerFilter === 'category'"
            title="分类页 Banner 当前后端已支持配置，但小程序分类页前端尚未正式接入展示，后续会统一调整分类页广告位逻辑。"
            type="warning"
            :closable="false"
            show-icon
            style="margin-bottom: 16px;"
          />

          <el-table :data="banners" v-loading="bannerLoading" stripe>
            <el-table-column label="ID" width="90">
              <template #default="{ row }">
                <CompactIdCell :value="row.display_id || row.id" :full-value="row.id" />
              </template>
            </el-table-column>
            <el-table-column label="图片" width="130">
              <template #default="{ row }">
                <el-image
                  :src="bannerDisplayImage(row)"
                  fit="cover"
                  style="width: 90px; height: 45px; border-radius: 4px;"
                  :preview-src-list="[bannerDisplayImage(row)]"
                />
              </template>
            </el-table-column>
            <el-table-column prop="title" label="标题" min-width="120" />
            <el-table-column label="跳转类型" width="120">
              <template #default="{ row }">
                <el-tag size="small" :type="linkTypeTagType(row.link_type)">
                  {{ linkTypeLabel(row.link_type) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="跳转目标" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">
                <span v-if="row.link_type === 'product' && row.product">{{ row.product.name }}</span>
                <span v-else-if="displayLinkTarget(row)">{{ displayLinkTarget(row) }}</span>
                <span v-else style="color:#ccc">-</span>
              </template>
            </el-table-column>
            <el-table-column label="位置" width="90">
              <template #default="{ row }">
                <el-tag size="small" type="info">{{ positionLabel(row.position) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="sort_order" label="排序" width="70" />
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
                  {{ row.status === 1 ? '显示' : '隐藏' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="handleEditBanner(row)">编辑</el-button>
                <el-button text type="danger" size="small" @click="handleDeleteBanner(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- ====== 公告/内容管理 ====== -->
      <el-tab-pane label="图文内容" name="article">
        <el-card style="margin-top: 16px;">
          <template #header>
            <div class="card-header">
              <span>图文内容</span>
              <el-button type="primary" @click="handleAddContent">
                <el-icon><Plus /></el-icon>
                新增内容
              </el-button>
            </div>
          </template>

          <el-table :data="contents" v-loading="contentLoading" stripe>
            <el-table-column label="ID" width="90">
              <template #default="{ row }">
                <CompactIdCell :value="row.display_id || row.id" :full-value="row.id" />
              </template>
            </el-table-column>
            <el-table-column prop="title" label="标题" min-width="200" />
            <el-table-column prop="type" label="类型" width="100">
              <template #default="{ row }">
                <el-tag size="small">{{ row.type || 'article' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="创建时间" width="160">
              <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="180" fixed="right">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="handleEditContent(row)">编辑</el-button>
                <el-button text type="danger" size="small" @click="handleDeleteContent(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- Banner 编辑对话框 -->
    <el-dialog
      v-model="bannerDialogVisible"
      :title="bannerIsEdit ? '编辑 Banner' : '新增 Banner'"
      width="680px"
    >
      <el-form ref="bannerFormRef" :model="bannerForm" :rules="bannerRules" label-width="100px">
        <el-form-item label="展示位置">
          <el-radio-group v-model="bannerForm.position">
            <el-radio-button value="home">首页轮播</el-radio-button>
            <el-radio-button value="home_mid">首页中部</el-radio-button>
            <el-radio-button value="home_bottom">首页底部</el-radio-button>
            <el-radio-button value="category">分类页</el-radio-button>
            <el-radio-button value="activity">活动页</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-alert
          v-if="bannerForm.position === 'category'"
          title="分类页 Banner 配置会先保存到后台，当前小程序前端尚未完整接入该广告位展示，后续会统一改动。"
          type="warning"
          :closable="false"
          show-icon
          style="margin-bottom: 16px;"
        />
        <el-form-item label="标题">
          <el-input v-model="bannerForm.title" placeholder="Banner 主标题（可选）" />
        </el-form-item>
        <el-form-item label="副标题">
          <el-input v-model="bannerForm.subtitle" placeholder="副标题/描述文字（可选）" />
        </el-form-item>
        <el-form-item label="角标文字">
          <el-input v-model="bannerForm.kicker" placeholder="如：NEW / 限时活动（可选）" style="width:200px" />
        </el-form-item>

        <el-divider content-position="left">内容配置（选商品自动填入图片和跳转，或上传自定义图，或复用已有Banner）</el-divider>
        <div class="banner-spec-panel">
          <div class="banner-spec-title">当前图位要求</div>
          <div class="banner-spec-line">
            {{ currentBannerImageSpec.name }} · {{ currentBannerImageSpec.ratio }} · {{ currentBannerImageSpec.minSize }}
          </div>
          <div class="banner-spec-note">
            {{ currentBannerImageSpec.display }}；{{ currentBannerImageSpec.note }}
          </div>
        </div>
        <ContentBlockEditor v-model="bannerBlockData" :fields="['title', 'subtitle']" :image-spec="currentBannerImageSpec" />
        <el-form-item label="展示时段">
          <el-date-picker
            v-model="bannerForm.start_time"
            type="datetime"
            placeholder="开始时间（留空=立即）"
            style="width:200px"
            value-format="YYYY-MM-DD HH:mm:ss"
          />
          <span style="margin:0 8px;color:#909399;">至</span>
          <el-date-picker
            v-model="bannerForm.end_time"
            type="datetime"
            placeholder="结束时间（留空=永久）"
            style="width:200px"
            value-format="YYYY-MM-DD HH:mm:ss"
          />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="bannerForm.sort_order" :min="0" :max="999" />
          <span style="margin-left: 8px; color: #909399; font-size: 12px;">数字越小越靠前</span>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="bannerForm.status" :active-value="1" :inactive-value="0" active-text="显示" inactive-text="隐藏" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="bannerDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleBannerSubmit" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>

    <!-- 内容编辑对话框 -->
    <el-dialog v-model="contentDialogVisible" :title="contentIsEdit ? '编辑内容' : '新增内容'" width="700px">
      <el-form :model="contentForm" label-width="80px">
        <el-form-item label="标题">
          <el-input v-model="contentForm.title" placeholder="内容标题" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="contentForm.type">
            <el-option label="文章" value="article" />
            <el-option label="公告" value="notice" />
            <el-option label="帮助" value="help" />
          </el-select>
        </el-form-item>
        <div class="banner-spec-panel article-spec-panel">
          <div class="banner-spec-title">图文正文配图要求</div>
          <div class="banner-spec-line">
            {{ articleImageSpec.name }} · {{ articleImageSpec.ratio }} · {{ articleImageSpec.minSize }}
          </div>
          <div class="banner-spec-note">
            {{ articleImageSpec.display }}；{{ articleImageSpec.note }}
          </div>
        </div>
        <el-form-item label="正文">
          <el-input v-model="contentForm.content" type="textarea" :rows="8" placeholder="支持 HTML 内容" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="contentDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleContentSubmit" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import CompactIdCell from '@/components/CompactIdCell.vue'
import ContentBlockEditor from '@/components/ContentBlockEditor.vue'
import { getBanners, createBanner, updateBanner, deleteBanner, uploadFile, getProducts, deleteContent, getContents, createContent, updateContent } from '@/api'
import { formatDate } from '@/utils/format'
import { buildPersistentAssetRef, warnTemporaryAssetUrls } from '@/utils/assetUrlAudit'
import { findMiniProgramTarget } from '@/config/miniProgramTargets'
import {
  imageSpecs,
  bannerPositionSpecMap,
  bannerLinkTypeMap,
  bannerPositionMap
} from './contentPageConfig'

const activeTab = ref('banner')
const submitting = ref(false)

const currentBannerImageSpec = computed(() => {
  return bannerPositionSpecMap[bannerForm.position] || imageSpecs[0]
})

const articleImageSpec = computed(() => imageSpecs.find(item => item.key === 'article'))

// ===== Banner =====
const bannerLoading = ref(false)
const bannerFilter = ref('')
const banners = ref([])
const bannerDialogVisible = ref(false)
const bannerIsEdit = ref(false)
const bannerFormRef = ref()
const bannerForm = reactive({
  id: null, title: '', subtitle: '', kicker: '',
  file_id: '', image_url: '', link_type: 'none', link_value: '',
  product_id: null, position: 'home',
  sort_order: 0, status: 1, start_time: null, end_time: null
})
const bannerRules = {
  title: [{ required: true, message: '请填写 Banner 标题', trigger: 'blur' }]
}

const resolveAssetUrl = (item = {}) => item.image_url || item.url || item.image || item.cover_image || item.file_id || ''

// 商品搜索
const productSearchLoading = ref(false)
const productOptions = ref([])
const selectedProduct = ref(null)

const autoPreviewUrl = computed(() => {
  if (bannerForm.link_type === 'product' && selectedProduct.value) {
    const imgs = selectedProduct.value.images
    return Array.isArray(imgs) ? imgs[0] : null
  }
  return null
})

const linkTypeLabel = (t) => bannerLinkTypeMap[t]?.label || t
const linkTypeTagType = (t) => bannerLinkTypeMap[t]?.tagType || 'info'
const positionLabel = (p) => bannerPositionMap[p] || p
const displayLinkTarget = (row = {}) => {
  const target = findMiniProgramTarget(row.link_type, row.link_value)
  if (target) return `${target.title}${target.note ? ` · ${target.note}` : ''}`
  return row.link_value || ''
}

const searchProducts = async (query) => {
  if (!query) return
  productSearchLoading.value = true
  try {
    const res = await getProducts({ keyword: query, limit: 20, status: 1 })
    productOptions.value = res?.list || (Array.isArray(res) ? res : [])
  } catch (e) {
    console.error('搜索商品失败:', e)
  } finally {
    productSearchLoading.value = false
  }
}

const handleProductSelect = (id) => {
  selectedProduct.value = productOptions.value.find(p => p.id === id) || null
  if (selectedProduct.value) {
    bannerForm.link_value = String(id)
  }
}

const handleLinkTypeChange = () => {
  bannerForm.link_value = ''
  bannerForm.product_id = null
  selectedProduct.value = null
}

const bannerBlockData = computed({
  get: () => ({
    file_id: bannerForm.file_id,
    image_url: bannerForm.image_url || '',
    title: bannerForm.title,
    subtitle: bannerForm.subtitle,
    link_type: bannerForm.link_type,
    link_value: bannerForm.link_value,
    product_id: bannerForm.product_id
  }),
  set: (v) => {
    // 只更新真正有值的字段，避免子组件 emit 空值覆盖父组件已有数据
    if (v.file_id !== undefined) bannerForm.file_id = v.file_id || ''
    if (v.image_url !== undefined) bannerForm.image_url = v.image_url
    if (v.title !== undefined) bannerForm.title = v.title
    if (v.subtitle !== undefined) bannerForm.subtitle = v.subtitle
    if (v.link_type !== undefined) bannerForm.link_type = v.link_type || 'none'
    if (v.link_value !== undefined) bannerForm.link_value = v.link_value || ''
    if (v.product_id !== undefined) bannerForm.product_id = v.product_id || null
  }
})
const bannerDisplayImage = (row) => resolveAssetUrl(row) || (row.product && row.product.images && row.product.images[0]) || ''

// ===== Content =====
const contentLoading = ref(false)
const contents = ref([])
const contentDialogVisible = ref(false)
const contentIsEdit = ref(false)
const contentForm = reactive({ id: null, title: '', type: 'article', content: '' })

const fetchBanners = async () => {
  bannerLoading.value = true
  try {
    const params = bannerFilter.value ? { position: bannerFilter.value } : {}
    const res = await getBanners(params)
    const rows = Array.isArray(res) ? res : (res?.list || [])
    banners.value = rows.map(item => ({
      ...item,
      asset_url: resolveAssetUrl(item)
    }))
  } catch (e) {
    console.error('获取Banner失败:', e)
  } finally {
    bannerLoading.value = false
  }
}

const fetchContents = async () => {
  contentLoading.value = true
  try {
    const res = await getContents()
    contents.value = res?.list || (Array.isArray(res) ? res : [])
  } catch (e) {
    console.error('获取内容列表失败:', e)
  } finally {
    contentLoading.value = false
  }
}

const handleTabChange = (name) => {
  if (name === 'article' && contents.value.length === 0) fetchContents()
}

const handleAddBanner = () => {
  bannerIsEdit.value = false
  selectedProduct.value = null
  productOptions.value = []
  Object.assign(bannerForm, {
    id: null, title: '', subtitle: '', kicker: '',
    file_id: '', image_url: '', link_type: 'none', link_value: '',
    product_id: null, position: 'home',
    sort_order: 0, status: 1, start_time: null, end_time: null
  })
  bannerDialogVisible.value = true
}

const handleEditBanner = (row) => {
  bannerIsEdit.value = true
  selectedProduct.value = null
  productOptions.value = []
  Object.assign(bannerForm, {
    id: row.id,
    title: row.title || '',
    subtitle: row.subtitle || '',
    kicker: row.kicker || '',
    file_id: row.file_id || '',
    image_url: resolveAssetUrl(row),
    link_type: row.link_type || 'none',
    link_value: row.link_value || '',
    product_id: row.product_id || null,
    position: row.position || 'home',
    sort_order: row.sort_order || 0,
    status: row.status ?? 1,
    start_time: row.start_time || null,
    end_time: row.end_time || null
  })
  // 恢复商品信息
  if (row.product_id && row.product) {
    selectedProduct.value = row.product
    productOptions.value = [row.product]
  }
  bannerDialogVisible.value = true
}

const handleBannerSubmit = async () => {
  const valid = await bannerFormRef.value?.validate().catch(() => false)
  if (!valid) return
  if (!bannerForm.product_id && !bannerForm.file_id && !bannerForm.image_url) {
    ElMessage.warning('请关联商品或上传 Banner 图片')
    return
  }
  submitting.value = true
  try {
    const payload = { ...bannerForm }
    payload.image_url = buildPersistentAssetRef({ url: payload.image_url, fileId: payload.file_id })
    // product类型时，link_value = product_id
    if (payload.link_type === 'product' && payload.product_id) {
      payload.link_value = String(payload.product_id)
    }
    if (!payload.image_url) {
      payload.image_url = resolveAssetUrl(payload)
    }
    const tempUrlMessage = warnTemporaryAssetUrls(payload.image_url ? [payload.image_url] : [], 'Banner 图片')
    if (tempUrlMessage) {
      ElMessage.warning(tempUrlMessage)
      return
    }
    if (bannerIsEdit.value) {
      await updateBanner(bannerForm.id, payload)
      ElMessage.success('更新成功')
    } else {
      await createBanner(payload)
      ElMessage.success('创建成功')
    }
    bannerDialogVisible.value = false
    fetchBanners()
  } catch (e) {
    console.error('提交失败:', e)
  } finally {
    submitting.value = false
  }
}

const handleDeleteBanner = async (row) => {
  try {
    await ElMessageBox.confirm(`确认删除 Banner "${row.title || row.id}"？`, '确认删除', { type: 'warning' })
    await deleteBanner(row.id)
    ElMessage.success('已删除')
    fetchBanners()
  } catch (e) {
    if (e !== 'cancel') console.error('删除失败:', e)
  }
}

const handleBannerUpload = async ({ file }) => {
  try {
    const data = await uploadFile(file)
    bannerForm.file_id = data.file_id || ''
    bannerForm.image_url = data.url || data.image_url || ''
    ElMessage.success('上传成功')
  } catch (e) {
    ElMessage.error('图片上传失败，请重试')
  }
}

const beforeUpload = (file) => {
  if (!file.type.startsWith('image/')) { ElMessage.error('只能上传图片'); return false }
  if (file.size > 2 * 1024 * 1024) { ElMessage.error('图片不能超过 2MB'); return false }
  return true
}

const handleAddContent = () => {
  contentIsEdit.value = false
  Object.assign(contentForm, { id: null, title: '', type: 'article', content: '' })
  contentDialogVisible.value = true
}

const handleEditContent = (row) => {
  contentIsEdit.value = true
  Object.assign(contentForm, row)
  contentDialogVisible.value = true
}

const handleContentSubmit = async () => {
  submitting.value = true
  try {
    if (contentIsEdit.value) {
      await updateContent(contentForm.id, contentForm)
      ElMessage.success('更新成功')
    } else {
      await createContent(contentForm)
      ElMessage.success('创建成功')
    }
    contentDialogVisible.value = false
    fetchContents()
  } catch (e) {
    ElMessage.error('保存失败，请重试')
  } finally {
    submitting.value = false
  }
}

const handleDeleteContent = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除「${row.title}」？此操作不可恢复。`, '删除确认', {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await deleteContent(row.id)
    ElMessage.success('删除成功')
    fetchContents()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
      console.error('删除内容失败:', error)
    }
  }
}

onMounted(fetchBanners)
</script>

<style scoped>
.content-page { padding: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.image-spec-card { margin-bottom: 16px; }
.image-spec-tip {
  margin-bottom: 14px;
  font-size: 13px;
  line-height: 1.7;
  color: #8b7460;
}
.image-spec-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.image-spec-item {
  padding: 14px 16px;
  border-radius: 12px;
  background: #faf7f2;
  border: 1px solid #f0e5d8;
}
.image-spec-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 6px;
}
.image-spec-meta {
  font-size: 12px;
  color: #606266;
  line-height: 1.6;
}
.image-spec-desc,
.image-spec-note {
  font-size: 12px;
  line-height: 1.6;
}
.image-spec-desc {
  margin-top: 6px;
  color: #8b7460;
}
.image-spec-note {
  color: #909399;
}
.banner-spec-panel {
  margin-bottom: 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #faf7f2;
  border: 1px solid #f0e5d8;
}
.banner-spec-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 6px;
}
.banner-spec-line,
.banner-spec-note {
  font-size: 12px;
  line-height: 1.7;
}
.banner-spec-line { color: #8b7460; }
.banner-spec-note { color: #909399; }
.article-spec-panel { margin-bottom: 18px; }
.upload-area { display: flex; flex-direction: column; gap: 8px; }
.banner-uploader { width: 320px; border: 1px dashed #d9d9d9; border-radius: 6px; overflow: hidden; cursor: pointer; }
.banner-uploader:hover { border-color: #409eff; }
.banner-preview { width: 320px; height: 110px; display: block; object-fit: cover; }
.banner-preview-wrap { position: relative; width: 320px; height: 110px; }
.preview-tip { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.45); color: #fff; font-size: 12px; text-align: center; padding: 4px; }
.upload-placeholder { width: 320px; height: 110px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #8c939d; gap: 4px; }
.upload-tip { font-size: 12px; color: #909399; }
</style>
