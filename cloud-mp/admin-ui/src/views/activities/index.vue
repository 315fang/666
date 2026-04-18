<template>
  <div class="activities-page">
    <el-alert
      title="这里用于维护活动资源本身：砍价、抽奖、节日配置；具体页面怎么展示，统一交给活动页与页面装修入口处理。"
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    />
    <el-tabs v-model="activeTab">
      <!-- ====== 砍价活动 ====== -->
      <el-tab-pane label="砍价活动" name="slash">
        <SlashActivityPanel
          :items="slashList"
          :loading="slashLoading"
          :total="slashTotal"
          :page="slashPage"
          :page-size="slashPageSize"
          :format-date="formatDate"
          @create="openSlashDialog()"
          @edit="openSlashDialog"
          @delete="deleteSlash"
          @page-change="slashPage = $event; fetchSlash()"
        />
      </el-tab-pane>

      <!-- ====== 抽奖奖品 ====== -->
      <el-tab-pane label="抽奖奖品" name="lottery">
        <LotteryPrizePanel
          :items="prizes"
          :loading="prizeLoading"
          :total-probability="totalProbability"
          :prize-tag-type="prizeTagType"
          :prize-type-label="prizeTypeLabel"
          @create="openPrizeDialog()"
          @edit="openPrizeDialog"
          @delete="deletePrize"
          @toggle="togglePrizeActive"
        />
      </el-tab-pane>

      <!-- ====== 节日活动配置 ====== -->
      <el-tab-pane label="节日活动" name="festival">
        <FestivalConfigPanel
          :festival="festival"
          :festival-loading="festivalLoading"
          :festival-saving="festivalSaving"
          :global-ui-loading="globalUiLoading"
          :global-ui-saving="globalUiSaving"
          :activity-options-loading="activityOptionsLoading"
          :activity-options="activityOptions"
          :current-activity-option-key="currentActivityOptionKey"
          :find-activity-option="findActivityOption"
          :activity-option-label="activityOptionLabel"
          :activity-option-note="activityOptionNote"
          :handle-cta-option-change="handleCtaOptionChange"
          :handle-poster-option-change="handlePosterOptionChange"
          :add-poster="addPoster"
          :remove-poster="removePoster"
          :save-festival="saveFestival"
          :save-global-ui="saveGlobalUi"
        />
      </el-tab-pane>

      <!-- ====== 活动链接配置 ====== -->
      <el-tab-pane label="活动链接" name="links">
        <ActivityLinksPanel
          :links-loading="linksLoading"
          :links-saving="linksSaving"
          :links-data="linksData"
          :links-meta="linksMeta"
          :activity-options-loading="activityOptionsLoading"
          :activity-options="activityOptions"
          :current-activity-option-key="currentActivityOptionKey"
          :apply-option-to-item="applyOptionToItem"
          :add-links-item="addLinksItem"
          :remove-links-item="removeLinksItem"
          :move-links-item="moveLinksItem"
          :save-activity-links="saveActivityLinks"
          :search-products="searchProducts"
          :product-search-loading="productSearchLoading"
          :product-options="productOptions"
          :add-spot-product="addSpotProduct"
          :remove-spot-product="removeSpotProduct"
          :add-news-item="addNewsItem"
          :remove-news-item="removeNewsItem"
          :move-news-item="moveNewsItem"
        />
      </el-tab-pane>

    </el-tabs>

    <SlashActivityDialog
      ref="slashFormRef"
      :visible="slashDialogVisible"
      :is-edit="slashIsEdit"
      :form="slashForm"
      :product-options="productOptions"
      :product-search-loading="productSearchLoading"
      :submitting="submitting"
      :search-products="searchProducts"
      @update:visible="slashDialogVisible = $event"
      @submit="submitSlash"
    />

    <LotteryPrizeDialog
      ref="prizeFormRef"
      :visible="prizeDialogVisible"
      :is-edit="prizeIsEdit"
      :form="prizeForm"
      :total-probability="totalProbability"
      :submitting="submitting"
      :handle-prize-upload="handlePrizeUpload"
      :before-upload="beforeUpload"
      @update:visible="prizeDialogVisible = $event"
      @submit="submitPrize"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import SlashActivityDialog from './components/SlashActivityDialog.vue'
import LotteryPrizeDialog from './components/LotteryPrizeDialog.vue'
import SlashActivityPanel from './components/SlashActivityPanel.vue'
import LotteryPrizePanel from './components/LotteryPrizePanel.vue'
import FestivalConfigPanel from './components/FestivalConfigPanel.vue'
import ActivityLinksPanel from './components/ActivityLinksPanel.vue'
import {
  getSlashActivities, createSlashActivity, updateSlashActivity, deleteSlashActivity,
  getLotteryPrizes, createLotteryPrize, updateLotteryPrize, deleteLotteryPrize,
  getActivityOptions, getFestivalConfig, updateFestivalConfig, getGlobalUiConfig, updateGlobalUiConfig,
  getActivityLinks, updateActivityLinks,
  getProducts, uploadFile
} from '@/api'
import { formatDateShort as formatDate } from '@/utils/format'

const activeTab = ref('slash')
const submitting = ref(false)

const PRIZE_STYLE_PRESETS = {
  miss: { display_emoji: '🍀', badge_text: '好运签', theme_color: '#6B7280', accent_color: '#D1D5DB' },
  points: { display_emoji: '⭐', badge_text: '积分奖', theme_color: '#2563EB', accent_color: '#93C5FD' },
  coupon: { display_emoji: '🎫', badge_text: '优惠券', theme_color: '#10B981', accent_color: '#6EE7B7' },
  physical: { display_emoji: '🎁', badge_text: '实物奖', theme_color: '#F59E0B', accent_color: '#FDE68A' }
}

const getPrizeStylePreset = (type) => ({ ...(PRIZE_STYLE_PRESETS[type] || PRIZE_STYLE_PRESETS.miss) })

// ===== 砍价活动 =====
const slashLoading = ref(false)
const slashList = ref([])
const slashTotal = ref(0)
const slashPage = ref(1)
const slashPageSize = 20
const slashDialogVisible = ref(false)
const slashIsEdit = ref(false)
const slashFormRef = ref()
const slashForm = reactive({
  id: null, product_id: null, sku_id: null,
  original_price: 0, floor_price: 0, initial_price: 0,
  min_slash_per_helper: 0.10, max_slash_per_helper: 5.00,
  max_helpers: 20, expire_hours: 48, stock_limit: 100,
  start_at: null, end_at: null, status: 1
})
const productSearchLoading = ref(false)
const productOptions = ref([])

const fetchSlash = async () => {
  slashLoading.value = true
  try {
    const res = await getSlashActivities({ page: slashPage.value, limit: slashPageSize })
    const d = res.data || res
    slashList.value = d.list || []
    slashTotal.value = d.total || 0
  } catch (e) {
    console.error('获取砍价活动失败:', e)
  } finally {
    slashLoading.value = false
  }
}

const openSlashDialog = (row = null) => {
  slashIsEdit.value = !!row
  productOptions.value = []
  if (row) {
    Object.assign(slashForm, {
      id: row.id, product_id: row.product_id, sku_id: row.sku_id,
      original_price: parseFloat(row.original_price),
      floor_price: parseFloat(row.floor_price),
      initial_price: parseFloat(row.initial_price),
      min_slash_per_helper: parseFloat(row.min_slash_per_helper),
      max_slash_per_helper: parseFloat(row.max_slash_per_helper),
      max_helpers: row.max_helpers, expire_hours: row.expire_hours,
      stock_limit: row.stock_limit, start_at: row.start_at, end_at: row.end_at, status: row.status
    })
    if (row.product) productOptions.value = [row.product]
  } else {
    Object.assign(slashForm, {
      id: null, product_id: null, sku_id: null,
      original_price: 0, floor_price: 0, initial_price: 0,
      min_slash_per_helper: 0.10, max_slash_per_helper: 5.00,
      max_helpers: 20, expire_hours: 48, stock_limit: 100,
      start_at: null, end_at: null, status: 1
    })
  }
  slashDialogVisible.value = true
}

const searchProducts = async (query) => {
  if (!query) return
  productSearchLoading.value = true
  try {
    const res = await getProducts({ keyword: query, limit: 20, status: 1 })
    productOptions.value = res?.list || (Array.isArray(res) ? res : [])
  } catch (e) { console.error(e) }
  finally { productSearchLoading.value = false }
}

const submitSlash = async () => {
  await slashFormRef.value?.validate(async (valid) => {
    if (!valid) return
    submitting.value = true
    try {
      if (slashIsEdit.value) {
        await updateSlashActivity(slashForm.id, slashForm)
        ElMessage.success('更新成功')
      } else {
        await createSlashActivity(slashForm)
        ElMessage.success('创建成功')
      }
      slashDialogVisible.value = false
      fetchSlash()
    } catch (e) {
      console.error(e)
    } finally {
      submitting.value = false
    }
  })
}

const deleteSlash = async (row) => {
  try {
    await ElMessageBox.confirm(`确认删除砍价活动"${row.product?.name || row.id}"？`, '确认', { type: 'warning' })
    await deleteSlashActivity(row.id)
    ElMessage.success('已删除')
    fetchSlash()
  } catch (e) {
    if (e !== 'cancel') console.error(e)
  }
}

// ===== 抽奖奖品 =====
const prizeLoading = ref(false)
const prizes = ref([])
const prizeDialogVisible = ref(false)
const prizeIsEdit = ref(false)
const prizeFormRef = ref()
const prizeForm = reactive({
  id: null, name: '', image_url: '', file_id: '', cost_points: 100,
  probability: 10, stock: -1, type: 'miss', prize_value: 0,
  sort_order: 0, is_active: 1,
  display_emoji: '🍀', badge_text: '好运签',
  theme_color: '#6B7280', accent_color: '#D1D5DB'
})

// 只统计已启用奖品的概率总和，禁用的奖品不参与抽奖，不计入概率
const totalProbability = computed(() =>
  prizes.value
    .filter(p => p.is_active !== 0)
    .reduce((s, p) => s + parseFloat(p.probability || 0), 0)
)

watch(() => prizeForm.type, (type, oldType) => {
  if (!prizeDialogVisible.value) return
  const preset = getPrizeStylePreset(type)
  const oldPreset = getPrizeStylePreset(oldType)

  if (!prizeForm.display_emoji || prizeForm.display_emoji === oldPreset.display_emoji) {
    prizeForm.display_emoji = preset.display_emoji
  }
  if (!prizeForm.badge_text || prizeForm.badge_text === oldPreset.badge_text) {
    prizeForm.badge_text = preset.badge_text
  }
  if (!prizeForm.theme_color || prizeForm.theme_color === oldPreset.theme_color) {
    prizeForm.theme_color = preset.theme_color
  }
  if (!prizeForm.accent_color || prizeForm.accent_color === oldPreset.accent_color) {
    prizeForm.accent_color = preset.accent_color
  }
})

const fetchPrizes = async () => {
  prizeLoading.value = true
  try {
    const res = await getLotteryPrizes()
    const data = res?.data || res
    prizes.value = Array.isArray(data) ? data : (data?.list || [])
  } catch (e) {
    console.error('获取奖品失败:', e)
  } finally {
    prizeLoading.value = false
  }
}

const openPrizeDialog = (row = null) => {
  prizeIsEdit.value = !!row
  if (row) {
    Object.assign(prizeForm, {
      id: row.id, name: row.name, image_url: row.image_url || row.image || '',
      file_id: row.file_id || '',
      cost_points: row.cost_points, probability: parseFloat(row.probability),
      stock: row.stock, type: row.type, prize_value: parseFloat(row.prize_value || 0),
      sort_order: row.sort_order, is_active: row.is_active,
      display_emoji: row.display_emoji || getPrizeStylePreset(row.type).display_emoji,
      badge_text: row.badge_text || getPrizeStylePreset(row.type).badge_text,
      theme_color: row.theme_color || getPrizeStylePreset(row.type).theme_color,
      accent_color: row.accent_color || getPrizeStylePreset(row.type).accent_color
    })
  } else {
    const preset = getPrizeStylePreset('miss')
    Object.assign(prizeForm, {
      id: null, name: '', image_url: '', file_id: '', cost_points: 100,
      probability: 0, stock: -1, type: 'miss', prize_value: 0,
      sort_order: 0, is_active: 1,
      display_emoji: preset.display_emoji,
      badge_text: preset.badge_text,
      theme_color: preset.theme_color,
      accent_color: preset.accent_color
    })
  }
  prizeDialogVisible.value = true
}

const submitPrize = async () => {
  await prizeFormRef.value?.validate(async (valid) => {
    if (!valid) return
    submitting.value = true
    try {
      if (prizeIsEdit.value) {
        await updateLotteryPrize(prizeForm.id, prizeForm)
        ElMessage.success('更新成功')
      } else {
        await createLotteryPrize(prizeForm)
        ElMessage.success('创建成功')
      }
      prizeDialogVisible.value = false
      fetchPrizes()
    } catch (e) {
      ElMessage.error('保存失败，请重试')
    } finally {
      submitting.value = false
    }
  })
}

const togglePrizeActive = async (row, val) => {
  const prev = row.is_active
  row.is_active = val
  try {
    await updateLotteryPrize(row.id, { ...row, is_active: val })
    ElMessage.success(val === 1 ? '已启用' : '已禁用')
  } catch (e) {
    row.is_active = prev
    ElMessage.error('状态更新失败')
  }
}

const deletePrize = async (row) => {
  try {
    await ElMessageBox.confirm(`确认删除奖品"${row.name}"？`, '确认', { type: 'warning' })
    await deleteLotteryPrize(row.id)
    ElMessage.success('已删除')
    fetchPrizes()
  } catch (e) {
    if (e !== 'cancel') console.error(e)
  }
}

const handlePrizeUpload = async ({ file }) => {
  try {
    const data = await uploadFile(file)
    prizeForm.file_id = data.file_id || ''
    prizeForm.image_url = data.url || data.image_url || ''
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

// ===== 节日活动 =====
const festivalLoading = ref(false)
const festivalSaving = ref(false)
const globalUiLoading = ref(false)
const globalUiSaving = ref(false)
const festival = reactive({
  active: false,
  name: '',
  theme: '',
  countdown_to: null,
  banner_title: '',
  banner_subtitle: '',
  banner: '',
  ctaText: '',
  ctaPath: '',
  cta_link_type: 'none',
  cta_link_value: '',
  theme_colors: { primary: '#C6A16E', bg: '#FFF8EE' },
  tags: [],
  card_posters: [],
  show_featured_products: false,
  featured_products_limit: 4,
  global_wallpaper: { enabled: false, preset: 'default' }
})
const globalUi = reactive({
  wallpaper: { enabled: false, preset: 'default' },
  card_style: { radius: 24, shadow: 'medium', gap: 18 },
  section_toggle: { show_featured_in_activity: true, show_featured_in_category: true },
  featured_products: { limit: 4, title: '精选好物', kicker: "EDITOR'S PICK", button_text: '去选购' }
})
const activityOptionsLoading = ref(false)
const activityOptions = ref([])

const currentActivityOptionKey = (linkType, linkValue) => {
  if ((linkType || 'none') === 'flash_sale' && ((linkValue || '') === '' || (linkValue || '') === '__flash_sale__')) {
    return 'flash_sale:current'
  }
  const matched = activityOptions.value.find(opt => opt.link_type === (linkType || 'none') && (opt.link_value || '') === (linkValue || ''))
  return matched?.key || ''
}
const findActivityOption = (linkType, linkValue) => activityOptions.value.find(opt => opt.link_type === (linkType || 'none') && (opt.link_value || '') === (linkValue || ''))
const activityOptionLabel = (opt) => opt?.badge ? `${opt.title} · ${opt.badge}` : (opt?.title || '未命名入口')
const activityOptionNote = (opt) => opt?.note || ''

const applyActivityOption = (target, option) => {
  if (!target || !option) return
  target.source_type = option.source_type || ''
  target.link_type = option.link_type || 'none'
  target.link_value = option.link_value || ''
  target.link = option.link_type === 'page' ? option.link_value : ''
}

const handleCtaOptionChange = (key) => {
  const option = activityOptions.value.find(opt => opt.key === key)
  if (!option) return
  festival.cta_link_type = option.link_type || 'none'
  festival.cta_link_value = option.link_value || ''
  festival.ctaPath = option.link_type === 'page' ? option.link_value : ''
}

const handlePosterOptionChange = (poster, key) => {
  const option = activityOptions.value.find(opt => opt.key === key)
  if (!option) return
  applyActivityOption(poster, option)
}

const addPoster = () => {
  festival.card_posters.push({
    id: Date.now(),
    title: '',
    subTitle: '',
    image: '',
    gradient: 'linear-gradient(135deg, #2C231C 0%, #473326 100%)',
    source_type: '',
    link_type: 'none',
    link_value: '',
    link: ''
  })
}

const removePoster = (idx) => {
  festival.card_posters.splice(idx, 1)
}

const fetchFestival = async () => {
  festivalLoading.value = true
  try {
    const res = await getFestivalConfig()
    const d = res.data || res || {}
    Object.assign(festival, {
      active: d.active ?? false,
      name: d.name || '',
      theme: d.theme || '',
      countdown_to: d.countdown_to || null,
      banner_title: d.banner_title || '',
      banner_subtitle: d.banner_subtitle || '',
      banner: d.banner || '',
      ctaText: d.ctaText || '',
      ctaPath: d.ctaPath || '',
      cta_link_type: d.cta_link_type || (d.ctaPath ? 'page' : 'none'),
      cta_link_value: d.cta_link_value || d.ctaPath || '',
      theme_colors: d.theme_colors || { primary: '#C6A16E', bg: '#FFF8EE' },
      tags: d.tags || [],
      card_posters: Array.isArray(d.card_posters) ? d.card_posters.map(item => ({
        id: item.id || Date.now(),
        title: item.title || '',
        subTitle: item.subTitle || item.subtitle || '',
        image: item.image || '',
        gradient: item.gradient || 'linear-gradient(135deg, #2C231C 0%, #473326 100%)',
        source_type: item.source_type || '',
        link_type: item.link_type || (item.link ? 'page' : 'none'),
        link_value: item.link_value || item.link || '',
        link: item.link || ''
      })) : [],
      show_featured_products: !!d.show_featured_products,
      featured_products_limit: Number(d.featured_products_limit || 4),
      global_wallpaper: d.global_wallpaper || { enabled: false, preset: 'default' }
    })
  } catch (e) {
    console.error('获取节日配置失败:', e)
  } finally {
    festivalLoading.value = false
  }
}

const saveFestival = async () => {
  festivalSaving.value = true
  try {
    await updateFestivalConfig({
      ...festival,
      ctaPath: festival.cta_link_type === 'page' ? festival.cta_link_value : '',
      card_posters: festival.card_posters.map(item => ({
        ...item,
        link: item.link_type === 'page' ? item.link_value : ''
      }))
    })
    ElMessage.success('保存成功')
  } catch (e) {
    console.error('保存失败:', e)
    ElMessage.error('保存失败')
  } finally {
    festivalSaving.value = false
  }
}

const fetchActivityOptions = async () => {
  activityOptionsLoading.value = true
  try {
    const res = await getActivityOptions()
    activityOptions.value = Array.isArray(res) ? res : []
  } catch (e) {
    console.error('获取活动入口选项失败:', e)
    activityOptions.value = []
  } finally {
    activityOptionsLoading.value = false
  }
}

const fetchGlobalUi = async () => {
  globalUiLoading.value = true
  try {
    const res = await getGlobalUiConfig()
    const d = res.data || res || {}
    Object.assign(globalUi, {
      wallpaper: { enabled: !!d.wallpaper?.enabled, preset: d.wallpaper?.preset || 'default' },
      card_style: {
        radius: Number(d.card_style?.radius || 24),
        shadow: d.card_style?.shadow || 'medium',
        gap: Number(d.card_style?.gap || 18)
      },
      section_toggle: {
        show_featured_in_activity: d.section_toggle?.show_featured_in_activity !== false,
        show_featured_in_category: d.section_toggle?.show_featured_in_category !== false
      },
      featured_products: {
        limit: Number(d.featured_products?.limit || 4),
        title: d.featured_products?.title || '精选好物',
        kicker: d.featured_products?.kicker || "EDITOR'S PICK",
        button_text: d.featured_products?.button_text || '去选购'
      }
    })
  } catch (e) {
    console.error('获取全局UI配置失败:', e)
  } finally {
    globalUiLoading.value = false
  }
}

const saveGlobalUi = async () => {
  globalUiSaving.value = true
  try {
    await updateGlobalUiConfig({ ...globalUi })
    ElMessage.success('全局UI配置已保存')
  } catch (e) {
    console.error('保存全局UI配置失败:', e)
    ElMessage.error('保存失败')
  } finally {
    globalUiSaving.value = false
  }
}

// ===== 活动链接配置 =====
const linksLoading = ref(false)
const linksSaving = ref(false)
const linksData = reactive({ banners: [], permanent: [], limited: [], brand_news: [] })
const linksMeta = reactive({
  permanent_section_enabled: true,
  activity_sections_order: 'permanent_first',
  permanent_section_title: '',
  permanent_section_subtitle: '',
  brand_news_section_title: '品牌动态'
})

const inferActivityCardStyleKey = (item = {}) => {
  const linkType = String(item.link_type || item.linkType || '').trim()
  const linkValue = String(item.link_value || item.linkValue || '').trim()
  const title = String(item.title || '').trim()

  if (linkType === 'flash_sale') return 'flash_sale'
  if (linkType === 'coupon_center') return 'coupon_center'
  if (linkType === 'lottery') return 'lottery'
  if (linkType === 'group_buy') return 'group'
  if (linkType === 'slash') return 'slash'

  if (linkValue === '__flash_sale__' || linkValue.includes('/pages/activity/limited-spot')) return 'flash_sale'
  if (linkValue === '__coupon_center__' || linkValue.includes('/pages/coupon/list')) return 'coupon_center'
  if (linkValue.includes('/pages/lottery/')) return 'lottery'
  if (linkValue.includes('/pages/group/')) return 'group'
  if (linkValue.includes('/pages/slash/')) return 'slash'

  if (title.includes('秒杀') || title.includes('特惠')) return 'flash_sale'
  if (title.includes('优惠券')) return 'coupon_center'
  if (title.includes('抽奖')) return 'lottery'
  if (title.includes('拼团')) return 'group'
  if (title.includes('砍价')) return 'slash'

  return ''
}

let _linksKeyCounter = 0
const mkItem = (overrides = {}) => ({
  _key:       ++_linksKeyCounter,
  id:         String(Date.now()),
  title:      '',
  subtitle:   '',
  tag:        '',
  image:      '',
  icon:       '',
  gradient:   'linear-gradient(135deg, #3D2F22 0%, #5A4535 100%)',
  pill_text:  '',
  style_key:  '',
  link_type:  'none',
  link_value: '',
  end_time:   null,
  sort_order: 0,
  spot_products: [],
  direct_product_id: null,
  enabled: true,
  ...overrides
})

const mkNewsItem = (overrides = {}) => ({
  _key: ++_linksKeyCounter,
  id: String(Date.now()),
  title: '',
  summary: '',
  cover_image: '',
  content_html: '',
  sort_order: 0,
  enabled: true,
  ...overrides
})

const fetchLinks = async () => {
  linksLoading.value = true
  try {
    const res = await getActivityLinks()
    const d = res.data || res || {}
    const hydrate = (arr) => (arr || []).map((it) => {
      let direct_product_id = it.direct_product_id != null && it.direct_product_id !== '' ? Number(it.direct_product_id) : null
      if (!direct_product_id && it.link_type === 'product' && it.link_value && (!it.spot_products || !it.spot_products.length)) {
        const n = parseInt(String(it.link_value), 10)
        if (Number.isFinite(n) && n > 0) direct_product_id = n
      }
      return mkItem({
        ...it,
        style_key: it.style_key || inferActivityCardStyleKey(it),
        enabled: it.enabled !== false,
        spot_products: Array.isArray(it.spot_products) ? it.spot_products : [],
        direct_product_id: direct_product_id || null
      })
    })
    linksMeta.permanent_section_enabled = d.permanent_section_enabled !== false
    linksMeta.activity_sections_order = d.activity_sections_order === 'limited_first' ? 'limited_first' : 'permanent_first'
    linksMeta.permanent_section_title = (d.permanent_section_title || '').toString().trim()
    linksMeta.permanent_section_subtitle = (d.permanent_section_subtitle || '').toString().trim()
    linksMeta.brand_news_section_title = (d.brand_news_section_title || '品牌动态').toString().slice(0, 20) || '品牌动态'
    linksData.banners   = hydrate(d.banners)
    linksData.permanent = hydrate(d.permanent)
    linksData.limited   = hydrate(d.limited).map((item) => {
      if ((!item.link_type || item.link_type === 'none') && Array.isArray(item.spot_products) && item.spot_products.length) {
        item.link_type = 'flash_sale'
        item.link_value = ''
      }
      return item
    })
    linksData.brand_news = (d.brand_news || []).map((it) => mkNewsItem({ ...it }))
  } catch (e) {
    ElMessage.error('读取活动链接配置失败')
  } finally {
    linksLoading.value = false
  }
}

const saveActivityLinks = async () => {
  linksSaving.value = true
  try {
    validateActivityLinks()
    const strip = (arr) => arr.map(({ _key, ...rest }) => rest)
    await updateActivityLinks({
      permanent_section_enabled: linksMeta.permanent_section_enabled,
      activity_sections_order: linksMeta.activity_sections_order,
      permanent_section_title: linksMeta.permanent_section_title || '',
      permanent_section_subtitle: linksMeta.permanent_section_subtitle || '',
      brand_news_section_title: linksMeta.brand_news_section_title || '品牌动态',
      banners:   strip(linksData.banners),
      permanent: strip(linksData.permanent),
      limited:   strip(linksData.limited),
      brand_news: strip(linksData.brand_news)
    })
    ElMessage.success('活动链接配置已保存')
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    linksSaving.value = false
  }
}

const validateActivityLinks = () => {
  const validateItem = (item, idx, section, requireEndTime = false) => {
    if (!item.title?.trim()) throw new Error(`${section} 第 ${idx + 1} 项缺少标题`)
    const requiresLinkValue = String(item.link_type || 'none') !== 'flash_sale'
    if (!item.link_type || item.link_type === 'none' || (requiresLinkValue && !item.link_value?.trim())) {
      throw new Error(`${section} 第 ${idx + 1} 项缺少跳转目标`)
    }
    if (!item.image?.trim() && !item.gradient?.trim()) {
      throw new Error(`${section} 第 ${idx + 1} 项至少填写图片或渐变背景`)
    }
    if (requireEndTime && !item.end_time) {
      throw new Error(`${section} 第 ${idx + 1} 项必须填写截止时间`)
    }
  }

  linksData.banners.forEach((item, idx) => validateItem(item, idx, 'Banner'))
  linksData.permanent.forEach((item, idx) => {
    if (item.enabled === false) return
    validateItem(item, idx, '常驻活动')
  })
  linksData.limited.forEach((item, idx) => {
    validateItem(item, idx, '限时活动', true)
  })

  linksData.brand_news.forEach((item, idx) => {
    if (item.enabled === false) return
    if (!item.title?.trim()) throw new Error(`品牌新闻第 ${idx + 1} 条缺少标题`)
    if (!item.summary?.trim() && !item.content_html?.trim()) {
      throw new Error(`品牌新闻第 ${idx + 1} 条请填写摘要或正文`)
    }
  })
}

const addLinksItem = (section) => {
  if (section === 'limited') {
    linksData[section].push(mkItem({
      link_type: 'flash_sale',
      link_value: '',
      style_key: 'flash_sale'
    }))
    return
  }
  linksData[section].push(mkItem())
}

const removeLinksItem = (section, idx) => {
  linksData[section].splice(idx, 1)
}

const moveLinksItem = (section, idx, delta) => {
  const arr = linksData[section]
  const j = idx + delta
  if (j < 0 || j >= arr.length) return
  const tmp = arr[idx]
  arr[idx] = arr[j]
  arr[j] = tmp
  arr.forEach((it, i) => { it.sort_order = i * 10 })
}

const addSpotProduct = (item) => {
  if (!item.spot_products) item.spot_products = []
  item.spot_products.push({
    id: `o${Date.now()}`,
    product_id: null,
    sku_id: null,
    enable_points: true,
    enable_money: true,
    points_price: 100,
    money_price: 9.9,
    stock_limit: 50
  })
}

const removeSpotProduct = (item, si) => {
  item.spot_products.splice(si, 1)
}

const addNewsItem = () => {
  linksData.brand_news.push(mkNewsItem())
}

const removeNewsItem = (idx) => {
  linksData.brand_news.splice(idx, 1)
}

const moveNewsItem = (idx, delta) => {
  const arr = linksData.brand_news
  const j = idx + delta
  if (j < 0 || j >= arr.length) return
  const tmp = arr[idx]
  arr[idx] = arr[j]
  arr[j] = tmp
  arr.forEach((it, i) => { it.sort_order = i * 10 })
}

const applyOptionToItem = (item, key) => {
  if (!key) { item.link_type = 'none'; item.link_value = ''; return }
  const option = activityOptions.value.find(opt => opt.key === key)
  if (option) {
    item.link_type  = option.link_type  || 'none'
    item.link_value = option.link_value || ''
    if (!item.style_key) item.style_key = inferActivityCardStyleKey(option)
    if (!item.title) item.title = option.title || ''
    if (!item.subtitle) item.subtitle = option.subtitle || ''
  }
}

const prizeTypeLabel = (t) => ({ miss: '未中奖', points: '积分', coupon: '优惠券', physical: '实物' }[t] || t)
const prizeTagType = (t) => ({ miss: 'info', points: 'warning', coupon: 'success', physical: 'primary' }[t] || '')

watch(activeTab, (tab) => {
  if (tab === 'slash' && slashList.value.length === 0) {
    fetchSlash()
  }
  if (tab === 'lottery' && prizes.value.length === 0) {
    fetchPrizes()
  }
  if (tab === 'festival') {
    fetchActivityOptions()
    if (!festival.name && !festival.banner_title && !festival.tags.length) {
      fetchFestival()
    }
    fetchGlobalUi()
  }
  if (tab === 'links') {
    fetchActivityOptions()
    fetchLinks()
  }
}, { immediate: true })
</script>

<style scoped>
.activities-page { padding: 0; }
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }

@media (max-width: 767px) {
  .pagination-wrap {
    justify-content: center;
  }
}
</style>
