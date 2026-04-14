<template>
  <div class="home-sections-page">
    <el-tabs v-model="pageTab">
      <el-tab-pane label="弹窗广告" name="popup">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>首页弹窗配置</span>
              <el-button type="primary" :loading="popupSaving" @click="savePopupAd">保存配置</el-button>
            </div>
          </template>
          <el-alert
            title="首页当前真正生效的是这一块弹窗配置。"
            type="info"
            :closable="false"
            show-icon
            style="margin-bottom: 16px"
          />
          <el-form label-width="120px" style="max-width:680px;">
            <el-form-item label="启用弹窗">
              <el-switch v-model="popupForm.enabled" active-text="开启" inactive-text="关闭" />
            </el-form-item>
            <el-form-item label="弹出频率">
              <el-select v-model="popupForm.frequency" style="width:220px;">
                <el-option label="每次进入" value="every_time" />
                <el-option label="每天一次" value="once_daily" />
                <el-option label="每次会话一次" value="once_session" />
              </el-select>
            </el-form-item>
            <el-divider content-position="left">内容配置（选商品自动填入图片和跳转，或上传自定义图）</el-divider>
            <ContentBlockEditor v-model="popupBlockData" :fields="['title']" />
            <el-form-item label="按钮文字">
              <el-input v-model="popupForm.button_text" placeholder="如：立即查看、马上抢购" style="width:220px;" />
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="品牌配置" name="brand">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>首页品牌标识与热度气泡</span>
              <el-button type="primary" :loading="brandSaving" @click="saveBrandConfig">保存配置</el-button>
            </div>
          </template>
          <el-alert
            title="这一页负责首页主视觉辅助内容，包括品牌标识和热度气泡。"
            type="warning"
            :closable="false"
            show-icon
            style="margin-bottom: 16px"
          />
          <el-form label-width="140px" style="max-width:680px;">
            <el-form-item label="显示品牌Logo">
              <el-switch v-model="brandConfig.show_brand_logo" active-text="显示" inactive-text="隐藏" />
              <div style="font-size:12px;color:#909399;margin-top:4px;">关闭后首页左上角品牌Logo区域将完全隐藏</div>
            </el-form-item>
            <el-form-item label="品牌Logo图片" v-if="brandConfig.show_brand_logo">
              <el-input v-model="brandConfig.brand_logo" placeholder="Logo图片URL（留空使用默认气泡动画）" />
              <div v-if="brandConfig.brand_logo" style="margin-top:8px;">
                <el-image :src="brandConfig.brand_logo" fit="contain" style="width:52px;height:52px;border-radius:12px;border:1px solid #eee;" />
              </div>
              <div style="font-size:12px;color:#909399;margin-top:4px;">建议正方形透明底PNG，128x128px</div>
            </el-form-item>
            <el-form-item label="品牌名称">
              <el-input v-model="brandConfig.nav_brand_title" placeholder="如：问兰镜像" style="width:240px;" />
            </el-form-item>
            <el-form-item label="品牌副标题">
              <el-input v-model="brandConfig.nav_brand_sub" placeholder="如：品牌甄选" style="width:240px;" />
            </el-form-item>
            <el-divider content-position="left">热度气泡通告</el-divider>
            <el-form-item label="启用气泡通告">
              <el-switch v-model="brandConfig.bubble_enabled" active-text="开启" inactive-text="关闭" />
            </el-form-item>
            <el-form-item label="展示条数">
              <el-input-number v-model="brandConfig.bubble_limit" :min="3" :max="20" />
            </el-form-item>
            <el-divider content-position="left">气泡动作文案（用 {user} 代表用户昵称，{product} 代表商品名）</el-divider>
            <el-form-item label="普通下单">
              <el-input v-model="brandConfig.bubble_copy_order" placeholder="默认：{user} 购买了 {product}" style="width:320px;" />
            </el-form-item>
            <el-form-item label="拼团下单">
              <el-input v-model="brandConfig.bubble_copy_group_buy" placeholder="默认：{user} 拼团了 {product}" style="width:320px;" />
            </el-form-item>
            <el-form-item label="砍价下单">
              <el-input v-model="brandConfig.bubble_copy_slash" placeholder="默认：{user} 砍价了 {product}" style="width:320px;" />
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="精选商品榜" name="featured">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>首页精选商品榜</span>
              <div class="header-actions">
                <el-button type="primary" @click="openAddDialog">
                  <el-icon><Plus /></el-icon>
                  添加上榜商品
                </el-button>
                <el-button :loading="savingSort" @click="saveSort">保存排序</el-button>
              </div>
            </div>
          </template>

          <el-alert
            title="这里管理首页“精选商品”列表。拖拽后点击“保存排序”生效。"
            type="info"
            :closable="false"
            show-icon
            style="margin-bottom: 16px;"
          />

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

            <el-empty v-if="!featuredRows.length && !featuredLoading" description="暂无上榜商品，点击右上角添加" />
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="开屏动画" name="splash">
        <el-row :gutter="24">
          <el-col :span="16">
            <el-card v-loading="splashLoading">
              <template #header>
                <div class="splash-header">
                  <span>开屏动画配置</span>
                  <div class="splash-header-actions">
                    <span style="font-size:13px;color:#606266;">是否启用</span>
                    <el-switch v-model="splashForm.is_active" active-text="开启" inactive-text="关闭" />
                  </div>
                </div>
              </template>

              <el-form :model="splashForm" label-width="110px" label-position="left">
                <el-form-item label="展示模式">
                  <el-select v-model="splashForm.show_mode" style="width:220px">
                    <el-option label="每次启动均展示" value="always" />
                    <el-option label="每天仅展示一次" value="daily" />
                    <el-option label="仅展示一次（看过就不再显示）" value="once" />
                    <el-option label="关闭（不展示）" value="disabled" />
                  </el-select>
                </el-form-item>

                <el-form-item label="自动跳过(ms)">
                  <el-input-number v-model="splashForm.duration" :min="0" :max="30000" :step="500" style="width:180px" />
                  <span style="margin-left:8px;color:#909399;font-size:12px;">0 = 不自动跳过</span>
                </el-form-item>

                <el-form-item label="跳过按钮文字">
                  <el-input v-model="splashForm.skip_text" style="width:160px" placeholder="跳过" />
                </el-form-item>

                <el-divider content-position="left">背景图片（可选）</el-divider>
                <el-form-item label="背景图片">
                  <div>
                    <el-upload
                      :show-file-list="false"
                      :before-upload="handleBeforeUpload"
                      :http-request="handleUpload"
                      accept="image/*"
                    >
                      <el-button size="small" type="primary">上传图片</el-button>
                    </el-upload>
                    <el-input
                      v-model="splashForm.image_url"
                      placeholder="或直接填入图片URL"
                      style="width:320px;margin-top:8px"
                      clearable
                    />
                    <div v-if="splashForm.file_id" style="font-size:12px;color:#909399;margin-top:6px;">
                      file_id: {{ splashForm.file_id }}
                    </div>
                    <div v-if="splashForm.image_url" style="margin-top:8px">
                      <el-image :src="splashForm.image_url" style="width:80px;height:80px;border-radius:6px;" fit="cover" />
                    </div>
                    <div style="font-size:12px;color:#909399;margin-top:4px;">留空则使用渐变动画效果</div>
                  </div>
                </el-form-item>

                <el-form-item label="渐变起始色">
                  <div style="display:flex;align-items:center;gap:8px">
                    <el-color-picker v-model="splashForm.bg_color_start" />
                    <el-input v-model="splashForm.bg_color_start" style="width:120px" placeholder="#26064F" />
                  </div>
                </el-form-item>
                <el-form-item label="渐变结束色">
                  <div style="display:flex;align-items:center;gap:8px">
                    <el-color-picker v-model="splashForm.bg_color_end" />
                    <el-input v-model="splashForm.bg_color_end" style="width:120px" placeholder="#F7F4EF" />
                  </div>
                </el-form-item>

                <el-divider content-position="left">Reveal层（最终品牌画面）</el-divider>

                <el-form-item label="品牌大字">
                  <el-input v-model="splashForm.title" placeholder="盒美美" style="width:240px" />
                </el-form-item>
                <el-form-item label="英文大字">
                  <el-input v-model="splashForm.en_title" placeholder="HEMEIMEI" style="width:240px" />
                </el-form-item>
                <el-form-item label="副标题">
                  <el-input v-model="splashForm.subtitle" placeholder="做大学生的第一款护肤品" style="width:340px" />
                </el-form-item>
                <el-form-item label="Credit 文字">
                  <el-input v-model="splashForm.credit" placeholder="问兰药业 × 镜像案例库 · 联合出品" style="width:340px" />
                </el-form-item>

                <el-divider content-position="left">前置内容层（上滑逐层展示）</el-divider>

                <div v-for="(layer, idx) in splashForm.layers" :key="idx" class="layer-block">
                  <div class="layer-header">
                    <span>第 {{ idx + 1 }} 层</span>
                    <el-button type="danger" link size="small" @click="removeLayer(idx)">删除</el-button>
                  </div>

                  <el-form-item :label="'主标题'" :label-width="'80px'">
                    <el-input v-model="layer.title" placeholder="例：问兰药业" style="width:240px" />
                  </el-form-item>
                  <el-form-item :label="'标签胶囊'" :label-width="'80px'">
                    <el-input v-model="layer.tag" placeholder="例：苏州河海大学企业" style="width:260px" />
                  </el-form-item>
                  <el-form-item :label="'英文副标'" :label-width="'80px'">
                    <el-input v-model="layer.en" placeholder="例：WENLAN PHARMACEUTICAL" style="width:280px" />
                  </el-form-item>
                  <el-form-item :label="'描述行'" :label-width="'80px'">
                    <div style="width:100%">
                      <div
                        v-for="(line, li) in layer.lines"
                        :key="li"
                        style="display:flex;gap:6px;margin-bottom:6px"
                      >
                        <el-input v-model="layer.lines[li]" style="width:260px" />
                        <el-button link type="danger" @click="removeLine(idx, li)">-</el-button>
                      </div>
                      <el-button link type="primary" size="small" @click="addLine(idx)">+ 添加描述行</el-button>
                    </div>
                  </el-form-item>
                </div>

                <el-button type="primary" plain size="small" style="margin-bottom:20px" @click="addLayer">
                  + 添加内容层
                </el-button>

                <div class="splash-footer-actions">
                  <el-button type="primary" :loading="splashSaving" @click="handleSaveSplash">保存配置</el-button>
                  <el-button @click="handleResetSplash">重置</el-button>
                </div>
              </el-form>
            </el-card>
          </el-col>

          <el-col :span="8">
            <el-card style="position:sticky;top:20px">
              <template #header>效果预览</template>
              <div class="preview-phone">
                <div class="preview-screen" :style="previewBg">
                  <div class="preview-content">
                    <div class="preview-top-label">HEMEIMEI · 盒美美</div>
                    <div v-if="splashForm.layers.length" class="preview-layer">
                      <div class="preview-en">{{ splashForm.layers[0].en }}</div>
                      <div class="preview-tag">{{ splashForm.layers[0].tag }}</div>
                      <div class="preview-title-text" :style="{ color: titleColor }">
                        {{ splashForm.layers[0].title }}
                      </div>
                      <div class="preview-divider"></div>
                      <div
                        v-for="(line, i) in splashForm.layers[0].lines"
                        :key="i"
                        class="preview-line"
                        :style="{ color: subColor }"
                      >{{ line }}</div>
                    </div>
                    <div class="preview-arrow">↓ 下滑</div>
                    <div v-if="splashForm.skip_text" class="preview-skip">{{ splashForm.skip_text }}</div>
                  </div>
                </div>
              </div>
              <div style="margin-top:12px;font-size:12px;color:#909399;text-align:center">
                实机效果以小程序为准
              </div>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="addDialogVisible" title="添加上榜商品" width="560px">
      <el-form label-width="90px">
        <el-form-item label="搜索商品">
          <el-select
            v-model="selectedProducts"
            multiple
            filterable
            remote
            reserve-keyword
            :remote-method="searchProducts"
            :loading="searchLoading"
            style="width:100%;"
            placeholder="输入商品名称搜索后可多选"
          >
            <el-option
              v-for="item in productOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            >
              <div class="option-row">
                <el-image
                  :src="(Array.isArray(item.images) ? item.images[0] : '')"
                  style="width:24px;height:24px;border-radius:4px;"
                  fit="cover"
                />
                <span>{{ item.name }}</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="confirmAdd">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import ContentBlockEditor from '@/components/ContentBlockEditor.vue'
import {
  getPopupAdConfig,
  updatePopupAdConfig,
  getSettings,
  updateSettings,
  getFeaturedBoard,
  getBoardProducts,
  addBoardProducts,
  updateBoardProduct,
  deleteBoardProduct,
  sortBoardProducts,
  getProducts,
  getSplashConfig,
  updateSplashConfig,
  uploadSplashImage
} from '@/api/index'

const route = useRoute()
const pageTab = ref('popup')
const submitting = ref(false)

// ===== 弹窗广告 =====
const popupSaving = ref(false)
const popupForm = reactive({
  enabled: false,
  frequency: 'once_daily',
  image_url: '',
  file_id: '',
  link_type: 'none',
  link_value: '',
  button_text: '',
  product_id: null
})

const loadPopupAd = async () => {
  try {
    const data = await getPopupAdConfig()
    Object.assign(popupForm, data || {})
  } catch (_) {}
}

const popupBlockData = computed({
  get: () => ({
    image_url: popupForm.image_url,
    file_id: popupForm.file_id,
    title: popupForm.button_text,
    link_type: popupForm.link_type,
    link_value: popupForm.link_value,
    product_id: popupForm.product_id
  }),
  set: (v) => {
    popupForm.image_url = v.image_url || ''
    popupForm.file_id = v.file_id || ''
    popupForm.button_text = v.title || popupForm.button_text
    popupForm.link_type = v.link_type || 'none'
    popupForm.link_value = v.link_value || ''
    popupForm.product_id = v.product_id || null
  }
})

const savePopupAd = async () => {
  popupSaving.value = true
  try {
    await updatePopupAdConfig({ ...popupForm })
    ElMessage.success('弹窗广告配置已保存')
  } catch (_) {
    ElMessage.error('保存失败')
  } finally {
    popupSaving.value = false
  }
}

// ===== 品牌配置 =====
const brandSaving = ref(false)
const brandConfig = reactive({
  show_brand_logo: true,
  brand_logo: '',
  nav_brand_title: '问兰镜像',
  nav_brand_sub: '品牌甄选',
  bubble_enabled: true,
  bubble_limit: 10,
  bubble_copy_order: '',
  bubble_copy_group_buy: '',
  bubble_copy_slash: ''
})

const loadBrandConfig = async () => {
  try {
    const res = await getSettings()
    const root = res?.data || res || {}
    const d = root.homepage || root.HOMEPAGE || {}
    brandConfig.show_brand_logo = d.show_brand_logo !== 'false' && d.show_brand_logo !== false
    brandConfig.brand_logo = d.brand_logo || ''
    brandConfig.nav_brand_title = d.nav_brand_title || '问兰镜像'
    brandConfig.nav_brand_sub = d.nav_brand_sub || '品牌甄选'
    brandConfig.bubble_enabled = d.bubble_enabled !== false
    brandConfig.bubble_limit = Number(d.bubble_limit || 10)
    brandConfig.bubble_copy_order = d.bubble_copy_order || ''
    brandConfig.bubble_copy_group_buy = d.bubble_copy_group_buy || ''
    brandConfig.bubble_copy_slash = d.bubble_copy_slash || ''
  } catch (_) {}
}

const saveBrandConfig = async () => {
  brandSaving.value = true
  try {
    await updateSettings({
      category: 'homepage',
      settings: {
        show_brand_logo: String(brandConfig.show_brand_logo),
        brand_logo: brandConfig.brand_logo,
        nav_brand_title: brandConfig.nav_brand_title,
        nav_brand_sub: brandConfig.nav_brand_sub,
        bubble_enabled: String(brandConfig.bubble_enabled),
        bubble_limit: String(brandConfig.bubble_limit),
        bubble_copy_order: brandConfig.bubble_copy_order,
        bubble_copy_group_buy: brandConfig.bubble_copy_group_buy,
        bubble_copy_slash: brandConfig.bubble_copy_slash
      }
    })
    ElMessage.success('品牌配置已保存')
  } catch (_) {
    ElMessage.error('保存失败')
  } finally {
    brandSaving.value = false
  }
}

// ===== 精选商品榜 =====
const featuredLoading = ref(false)
const savingSort = ref(false)
const addDialogVisible = ref(false)
const searchLoading = ref(false)
const boardId = ref(null)
const featuredRows = ref([])
const productOptions = ref([])
const selectedProducts = ref([])
let dragFrom = -1

const loadFeaturedRows = async () => {
  if (!boardId.value) return
  const res = await getBoardProducts(boardId.value)
  featuredRows.value = Array.isArray(res) ? res : (res?.list || [])
}

const loadFeaturedBoard = async () => {
  featuredLoading.value = true
  try {
    const boardsRes = await getFeaturedBoard()
    const boards = Array.isArray(boardsRes) ? boardsRes : (boardsRes.data || boardsRes.list || [])
    const board = boards[0]
    if (!board?.id) {
      ElMessage.error('未找到首页精选商品榜，请先检查后端初始化')
      return
    }
    boardId.value = board.id
    await loadFeaturedRows()
  } catch (_) {
    ElMessage.error('读取精选商品榜失败')
  } finally {
    featuredLoading.value = false
  }
}

const openAddDialog = () => {
  selectedProducts.value = []
  productOptions.value = []
  addDialogVisible.value = true
}

const searchProducts = async (keyword) => {
  if (!keyword) return
  searchLoading.value = true
  try {
    const res = await getProducts({ keyword, limit: 20, status: 1 })
    productOptions.value = res?.list || (Array.isArray(res) ? res : [])
  } catch (_) {
    productOptions.value = []
  } finally {
    searchLoading.value = false
  }
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

// ===== 开屏动画 =====
const splashLoading = ref(false)
const splashSaving = ref(false)
const splashForm = reactive({
  is_active: false,
  show_mode: 'always',
  file_id: '',
  image_url: '',
  title: '盒美美',
  subtitle: '做大学生的第一款护肤品',
  credit: '问兰药业 × 镜像案例库 · 联合出品',
  en_title: 'HEMEIMEI',
  bg_color_start: '#26064F',
  bg_color_end: '#F7F4EF',
  duration: 5000,
  skip_text: '跳过',
  layers: [
    {
      type: 'single',
      title: '问兰药业',
      tag: '苏州河海大学企业',
      lines: ['50年药研传承', '美容院原料供应商'],
      en: 'WENLAN PHARMACEUTICAL'
    },
    {
      type: 'single',
      title: '镜像案例库',
      tag: '大学生成长平台',
      lines: ['社会第一课', '学校最后一堂课'],
      en: 'JINGXIANG CASE LIBRARY'
    }
  ]
})
let originalSplashForm = null

const resolveSplashAssetUrl = (payload = {}) => payload.file_id || payload.image_url || payload.image || payload.url || ''

const previewBg = computed(() => {
  const assetUrl = resolveSplashAssetUrl(splashForm)
  if (assetUrl) {
    return {
      backgroundImage: `url(${assetUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    }
  }
  return {
    background: `linear-gradient(to bottom, ${splashForm.bg_color_start || '#26064F'}, ${splashForm.bg_color_end || '#F7F4EF'})`
  }
})

const isDark = computed(() => {
  const c = splashForm.bg_color_start || '#26064F'
  const hex = c.replace('#', '')
  if (hex.length < 6) return true
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  return (r * 0.299 + g * 0.587 + b * 0.114) < 128
})

const titleColor = computed(() => isDark.value ? '#FFFFFF' : '#2D1A4A')
const subColor = computed(() => isDark.value ? 'rgba(255,255,255,0.65)' : 'rgba(60,20,100,0.65)')

async function fetchSplashConfig() {
  splashLoading.value = true
  try {
    const res = await getSplashConfig()
    const data = res?.data || res
    if (data) {
      const normalizedData = {
        ...data,
        file_id: data.file_id || '',
        image_url: resolveSplashAssetUrl(data)
      }
      Object.assign(splashForm, normalizedData)
      originalSplashForm = JSON.stringify(normalizedData)
    }
  } catch (_) {
    ElMessage.error('加载配置失败')
  } finally {
    splashLoading.value = false
  }
}

async function handleSaveSplash() {
  splashSaving.value = true
  try {
    const payload = {
      ...splashForm,
      image_url: resolveSplashAssetUrl(splashForm)
    }
    const res = await updateSplashConfig(payload)
    ElMessage.success(res?.message || '保存成功')
    originalSplashForm = JSON.stringify(payload)
  } catch (_) {
    ElMessage.error('保存异常')
  } finally {
    splashSaving.value = false
  }
}

function handleResetSplash() {
  if (originalSplashForm) {
    Object.assign(splashForm, JSON.parse(originalSplashForm))
    ElMessage.info('已还原上次保存的配置')
  }
}

function handleBeforeUpload(file) {
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.warning('图片大小不能超过 5MB')
    return false
  }
  return true
}

async function handleUpload({ file }) {
  try {
    const res = await uploadSplashImage(file)
    const data = res?.data || res
    const url = data?.url
    if (!url) {
      ElMessage.error('上传失败')
      return
    }
    splashForm.file_id = data?.file_id || ''
    splashForm.image_url = resolveSplashAssetUrl(data)
    ElMessage.success('上传成功')
  } catch (_) {
    ElMessage.error('上传异常')
  }
}

function addLayer() {
  splashForm.layers.push({
    type: 'single',
    title: '',
    tag: '',
    lines: [''],
    en: ''
  })
}

function removeLayer(idx) {
  splashForm.layers.splice(idx, 1)
}

function addLine(layerIdx) {
  splashForm.layers[layerIdx].lines.push('')
}

function removeLine(layerIdx, lineIdx) {
  splashForm.layers[layerIdx].lines.splice(lineIdx, 1)
}

watch(
  pageTab,
  async (tab) => {
    if (tab === 'featured' && !boardId.value) {
      await loadFeaturedBoard()
    }
    if (tab === 'splash' && !originalSplashForm) {
      await fetchSplashConfig()
    }
  },
  { immediate: true }
)

onMounted(() => {
  const tab = String(route.query.tab || '')
  if (['popup', 'brand', 'featured', 'splash'].includes(tab)) {
    pageTab.value = tab
  }
  loadPopupAd()
  loadBrandConfig()
})
</script>

<style scoped>
.home-sections-page { padding: 0; }
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-actions {
  display: flex;
  gap: 8px;
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

.splash-header {
  display:flex;
  align-items:center;
  justify-content:space-between;
}
.splash-header-actions {
  display:flex;
  align-items:center;
  gap:12px;
}
.splash-footer-actions {
  border-top:1px solid #f0f0f0;
  padding-top:20px;
  display:flex;
  gap:12px;
}

.layer-block {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  background: #fafafa;
}
.layer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}

.preview-phone {
  display: flex;
  justify-content: center;
}
.preview-screen {
  width: 180px;
  height: 320px;
  border-radius: 20px;
  overflow: hidden;
  position: relative;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.preview-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.preview-top-label {
  position: absolute;
  top: 14%;
  font-size: 6px;
  letter-spacing: 0.25em;
  color: rgba(255,255,255,0.25);
  text-align: center;
}
.preview-layer {
  text-align: center;
  width: 100%;
}
.preview-en {
  font-size: 5px;
  letter-spacing: 0.2em;
  color: rgba(255,255,255,0.25);
  text-transform: uppercase;
  margin-bottom: 8px;
}
.preview-tag {
  display: inline-block;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 100px;
  padding: 2px 8px;
  font-size: 5px;
  letter-spacing: 0.1em;
  color: rgba(255,255,255,0.45);
  margin-bottom: 8px;
}
.preview-title-text {
  font-size: 20px;
  font-weight: 800;
  line-height: 1.1;
  margin-bottom: 8px;
  letter-spacing: 0.04em;
}
.preview-divider {
  width: 14px;
  height: 1px;
  background: rgba(255,255,255,0.25);
  margin: 0 auto 8px;
}
.preview-line {
  font-size: 6px;
  line-height: 1.8;
  letter-spacing: 0.05em;
}
.preview-arrow {
  position: absolute;
  bottom: 28px;
  font-size: 7px;
  color: rgba(255,255,255,0.35);
  letter-spacing: 0.15em;
}
.preview-skip {
  position: absolute;
  top: 12px;
  right: 12px;
  font-size: 6px;
  color: rgba(255,255,255,0.4);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 100px;
  padding: 2px 6px;
}
</style>
