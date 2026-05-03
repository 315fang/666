<template>
  <div class="home-sections-page">
    <el-tabs v-model="pageTab">
      <el-tab-pane label="弹窗广告" name="popup">
        <PopupAdSection v-if="pageTab === 'popup'" />
      </el-tab-pane>

      <el-tab-pane v-if="canManageSettings" label="品牌背书" name="brand">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>首页底部品牌专区</span>
              <el-button type="primary" :loading="brandSaving" @click="saveBrandConfig">保存配置</el-button>
            </div>
          </template>
          <el-alert
            title="这里是首页最底部品牌专区的唯一配置入口，包含封面、Welcome 文案、固定 3 个入口卡、企业认证和介绍文案。"
            type="warning"
            :closable="false"
            show-icon
            style="margin-bottom: 16px"
          />
          <el-form label-width="140px" style="max-width:760px;">
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
            <el-divider content-position="left">首页福利楼层</el-divider>
            <el-form-item label="楼层标题">
              <el-input v-model="brandConfig.coupon_zone_title" placeholder="默认：惊喜礼遇" style="width:240px;" />
            </el-form-item>
            <el-form-item label="楼层副标题">
              <el-input v-model="brandConfig.coupon_zone_subtitle" placeholder="如：登录后领券，下单时可直接使用" />
            </el-form-item>
            <el-divider content-position="left">底部品牌专区</el-divider>
            <el-form-item label="启用专区">
              <el-switch v-model="brandConfig.brand_zone_enabled" active-text="开启" inactive-text="关闭" />
              <div style="font-size:12px;color:#909399;margin-top:4px;">关闭后首页最底部不展示品牌专区楼层；未配置的入口卡槽位会自动隐藏。</div>
            </el-form-item>
            <el-form-item label="专区标题">
              <el-input v-model="brandConfig.brand_zone_title" placeholder="默认：品牌专区" style="width:240px;" />
            </el-form-item>
            <el-form-item label="专区封面">
              <div class="brand-zone-cover-editor">
                <div class="brand-zone-cover-preview" :class="{ empty: !brandZoneCoverDisplay }">
                  <el-image v-if="brandZoneCoverDisplay" :src="brandZoneCoverDisplay" fit="cover" style="width:100%;height:100%;border-radius:16px;" />
                  <div v-else class="brand-zone-cover-placeholder">未选择专区封面</div>
                </div>
                <div class="brand-zone-cover-actions">
                  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <el-button type="primary" @click="openBrandAssetPicker('cover')">{{ brandConfig.brand_zone_cover_file_id ? '更换素材' : '从素材库选择' }}</el-button>
                    <el-tag v-if="brandConfig.brand_zone_cover_file_id" type="success" effect="plain">当前素材已绑定，可重新选择替换</el-tag>
                    <el-button v-if="brandZoneCoverDisplay || brandConfig.brand_zone_cover_file_id" text type="danger" @click="clearBrandZoneCover">清空封面</el-button>
                  </div>
                  <div class="field-help">建议使用横图。优先选择云开发素材；未配置时小程序会展示品牌渐变兜底图。</div>
                </div>
              </div>
            </el-form-item>
            <el-form-item label="Welcome 标题">
              <el-input v-model="brandConfig.brand_zone_welcome_title" placeholder="默认：Welcome" style="width:240px;" />
            </el-form-item>
            <el-form-item label="Welcome 副标题">
              <el-input v-model="brandConfig.brand_zone_welcome_subtitle" placeholder="如：带您深入了解麦吉丽" />
            </el-form-item>
            <el-divider content-position="left">品牌专区入口卡</el-divider>
            <el-alert
              title="固定 3 个入口卡槽位：最新活动、行业前沿、商城公告。后台只配置海报和副文案，跳转目标已写死，未配置槽位首页会自动隐藏。"
              type="info"
              :closable="false"
              show-icon
              style="margin-bottom: 16px"
            />
            <div v-for="(item, index) in brandConfig.brand_endorsements" :key="item.id" class="brand-entry-card">
              <div class="brand-entry-header">
                <div>
                  <span>{{ getBrandCardPreset(index).title }}</span>
                  <div class="brand-entry-tip">{{ getBrandCardPreset(index).note }}</div>
                </div>
                <span class="brand-entry-tip">固定槽位，不支持新增或删除</span>
              </div>
              <ContentBlockEditor
                :model-value="buildBrandCardModel(index)"
                :fields="['subtitle']"
                :hide-link-controls="true"
                :allowed-sources="['custom', 'reuse']"
                @update:modelValue="updateBrandCard(index, $event)"
              />
            </div>
            <el-divider content-position="left">官方宣传海报</el-divider>
            <el-form-item label="官方宣传标题">
              <el-input v-model="brandConfig.official_promo_title" placeholder="如：专业皮肤修护 始于1974" style="width:420px;" />
            </el-form-item>
            <el-form-item label="官方宣传副标题">
              <el-input v-model="brandConfig.official_promo_subtitle" placeholder="选填；留空则官方宣传版仅显示主标题一行" style="width:420px;" />
            </el-form-item>
            <el-form-item label="官方宣传标签">
              <el-input v-model="brandConfig.official_promo_badge" placeholder="默认：官方宣传" style="width:220px;" />
            </el-form-item>
            <el-form-item label="官方宣传封面">
              <el-input v-model="brandConfig.official_promo_cover" placeholder="海报封面 URL" />
            </el-form-item>
            <el-divider content-position="left">企业介绍</el-divider>
            <el-form-item label="介绍标题">
              <el-input v-model="brandConfig.brand_story_title" placeholder="如：企业介绍" style="width:220px;" />
            </el-form-item>
            <el-form-item label="介绍正文">
              <el-input v-model="brandConfig.brand_story_body" type="textarea" :rows="4" placeholder="首页底部企业介绍正文" />
            </el-form-item>
            <el-divider content-position="left">企业认证</el-divider>
            <div v-if="!brandConfig.brand_certifications.length" class="brand-empty-hint">暂无认证条目，可按需新增。</div>
            <div v-for="(item, index) in brandConfig.brand_certifications" :key="item.id" class="brand-entry-card">
              <div class="brand-entry-header">
                <span>认证 {{ index + 1 }}</span>
                <div class="brand-entry-actions">
                  <el-button text type="primary" @click="openBrandAssetPicker('certification', index)">选择图片</el-button>
                  <el-button v-if="resolveBrandImage(item) || item.file_id" text @click="clearBrandCertificationImage(index)">清空图片</el-button>
                  <el-button type="danger" text @click="removeBrandCertification(index)">删除</el-button>
                </div>
              </div>
              <div class="brand-cert-body">
                <div class="brand-cert-preview" :class="{ empty: !resolveBrandImage(item) }">
                  <el-image v-if="resolveBrandImage(item)" :src="resolveBrandImage(item)" fit="cover" style="width:100%;height:100%;border-radius:14px;" />
                  <div v-else class="brand-zone-cover-placeholder">未选择认证图</div>
                </div>
                <div class="brand-cert-form">
                  <el-form-item label="标题">
                    <el-input v-model="item.title" placeholder="认证标题" />
                  </el-form-item>
                  <el-form-item label="说明">
                    <el-input v-model="item.subtitle" placeholder="认证说明（可选）" />
                  </el-form-item>
                </div>
              </div>
            </div>
            <el-button type="primary" plain @click="addBrandCertification">新增企业认证</el-button>
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

      <el-tab-pane label="商品分组编排" name="featured">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>首页商品分组</span>
              <div class="header-actions">
                <el-select v-model="boardId" placeholder="选择分组" style="width:220px">
                  <el-option v-for="board in productBoards" :key="board.id" :label="board.section_name || board.board_name" :value="board.id" />
                </el-select>
                <el-button @click="openBoardDialog">新增分组</el-button>
                <el-button type="primary" @click="openAddDialog">
                  <el-icon><Plus /></el-icon>
                  添加关联商品
                </el-button>
                <el-button :loading="savingSort" @click="saveSort">保存排序</el-button>
              </div>
            </div>
          </template>

          <el-alert
            title="这里管理首页按分组编排的商品内容。建议一个分组对应一个首页分类区块。"
            type="info"
            :closable="false"
            show-icon
            style="margin-bottom: 16px;"
          />

          <el-empty v-if="!productBoards.length && !featuredLoading" description="暂无商品分组，点击右上角新增分组" />

          <el-form v-if="currentBoard" inline class="board-meta-form">
            <el-form-item label="分组标题">
              <el-input v-model="boardDraft.section_name" style="width:220px" />
            </el-form-item>
            <el-form-item label="分组Key">
              <el-input v-model="boardDraft.section_key" style="width:240px" disabled />
            </el-form-item>
            <el-form-item label="显示">
              <el-switch v-model="boardDraft.is_visible" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" plain :loading="boardSaving" @click="saveBoardMeta">保存分组</el-button>
              <el-button :disabled="currentBoardIndex <= 0" @click="moveBoard(-1)">上移分组</el-button>
              <el-button :disabled="currentBoardIndex === -1 || currentBoardIndex >= productBoards.length - 1" @click="moveBoard(1)">下移分组</el-button>
              <el-button type="danger" plain @click="removeBoard">删除分组</el-button>
            </el-form-item>
          </el-form>

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

            <el-empty v-if="currentBoard && !featuredRows.length && !featuredLoading" description="当前分组暂无关联商品，点击右上角添加" />
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="开屏动画" name="splash">
        <SplashScreenSection v-if="pageTab === 'splash'" />
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="addDialogVisible" title="添加关联商品" width="560px">
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

    <el-dialog v-model="boardDialogVisible" title="新增商品分组" width="420px">
      <el-form label-width="90px">
        <el-form-item label="分组标题">
          <el-input v-model="boardForm.section_name" placeholder="如：新品专区 / 护肤精选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="boardDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="boardSaving" @click="saveBoard">创建</el-button>
      </template>
    </el-dialog>

    <MediaPicker
      v-model:visible="brandAssetPicker.visible"
      :multiple="false"
      :max="1"
      @confirm="handleBrandAssetConfirm"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/store/user'
import { ElMessage, ElMessageBox } from 'element-plus'
import ContentBlockEditor from '@/components/ContentBlockEditor.vue'
import MediaPicker from '@/components/MediaPicker.vue'
import PopupAdSection from './PopupAdSection.vue'
import SplashScreenSection from './SplashScreenSection.vue'
import { buildPersistentAssetRef, warnTemporaryAssetUrls } from '@/utils/assetUrlAudit'
import {
  getSettings,
  updateSettings,
  getHomeSections,
  createHomeSection,
  updateHomeSection,
  deleteHomeSection,
  updateSectionSort,
  getBoardProducts,
  addBoardProducts,
  updateBoardProduct,
  deleteBoardProduct,
  sortBoardProducts,
  getProducts
} from '@/api/index'

const route = useRoute()
const userStore = useUserStore()
const canManageSettings = computed(() => userStore.hasPermission('settings_manage'))
const availableTabs = computed(() => (
  canManageSettings.value
    ? ['popup', 'brand', 'featured', 'splash']
    : ['popup', 'featured', 'splash']
))
const pageTab = ref('popup')
const submitting = ref(false)
const FIXED_BRAND_CARD_COUNT = 3
const FIXED_BRAND_CARD_PRESETS = [
  {
    slot_index: 0,
    category_key: 'latest_activity',
    title: '最新活动',
    link_type: 'page',
    link_value: '/pages/index/brand-news-list?category_key=latest_activity',
    note: '固定跳转到「最新活动」列表页'
  },
  {
    slot_index: 1,
    category_key: 'industry_frontier',
    title: '行业前沿',
    link_type: 'page',
    link_value: '/pages/index/brand-news-list?category_key=industry_frontier',
    note: '固定跳转到「行业前沿」列表页'
  },
  {
    slot_index: 2,
    category_key: 'mall_notice',
    title: '商城公告',
    link_type: 'page',
    link_value: '/pages/index/brand-news-list?category_key=mall_notice',
    note: '固定跳转到「商城公告」列表页'
  }
]

const createBrandId = (prefix = 'brand') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

const getBrandCardPreset = (index = 0) => FIXED_BRAND_CARD_PRESETS[index] || FIXED_BRAND_CARD_PRESETS[0]

const createBrandEntry = (index = 0) => {
  const preset = getBrandCardPreset(index)
  return {
    id: createBrandId('brand-card'),
    slot_index: preset.slot_index,
    category_key: preset.category_key,
    title: preset.title,
    subtitle: '',
    image: '',
    file_id: '',
    link_type: preset.link_type,
    link_value: preset.link_value
  }
}

const createBrandCertificationEntry = () => ({
  id: createBrandId('brand-cert'),
  title: '',
  subtitle: '',
  image: '',
  file_id: ''
})

// ===== 弹窗广告 =====
// 2026-05-03 megapage 拆分 §P1-2：popup 弹窗广告 tab 已迁至 ./PopupAdSection.vue。

// ===== 品牌配置 =====
const brandSaving = ref(false)
const brandConfig = reactive({
  show_brand_logo: true,
  brand_logo: '',
  nav_brand_title: '问兰镜像',
  nav_brand_sub: '品牌甄选',
  coupon_zone_title: '惊喜礼遇',
  coupon_zone_subtitle: '领取后可在结算页直接选择使用',
  brand_zone_enabled: false,
  brand_zone_title: '品牌专区',
  brand_zone_cover: '',
  brand_zone_cover_file_id: '',
  brand_zone_welcome_title: 'Welcome',
  brand_zone_welcome_subtitle: '',
  bubble_enabled: true,
  bubble_limit: 10,
  bubble_copy_order: '',
  bubble_copy_group_buy: '',
  bubble_copy_slash: '',
  official_promo_title: '专业皮肤修护 始于1974',
  official_promo_subtitle: '',
  official_promo_badge: '官方宣传',
  official_promo_cover: '',
  brand_story_title: '企业介绍',
  brand_story_body: '',
  brand_endorsements: Array.from({ length: FIXED_BRAND_CARD_COUNT }, (_, index) => createBrandEntry(index)),
  brand_certifications: []
})

const brandAssetPicker = reactive({
  visible: false,
  kind: 'cover',
  index: -1
})

const brandZoneCoverDisplay = computed(() => brandConfig.brand_zone_cover || '')

const resolveBrandImage = (item = {}) => item.image || item.image_url || ''

const normalizeBrandCard = (item = {}, index = 0) => {
  const slotIndex = Number.isFinite(Number(item.slot_index)) ? Number(item.slot_index) : index
  const preset = getBrandCardPreset(slotIndex)
  return {
    ...createBrandEntry(slotIndex),
    ...item,
    id: item.id || createBrandId('brand-card'),
    slot_index: preset.slot_index,
    category_key: preset.category_key,
    title: preset.title,
    subtitle: item.subtitle || item.desc || item.description || '',
    image: item.image || item.image_url || item.url || '',
    file_id: item.file_id || '',
    link_type: preset.link_type,
    link_value: preset.link_value
  }
}

const normalizeBrandCertification = (item = {}) => ({
  ...createBrandCertificationEntry(),
  ...item,
  id: item.id || createBrandId('brand-cert'),
  title: item.title || item.name || item.label || '',
  subtitle: item.subtitle || item.desc || item.description || '',
  image: item.image || item.image_url || item.url || '',
  file_id: item.file_id || ''
})

const buildBrandCardSlots = (list = []) => Array.from({ length: FIXED_BRAND_CARD_COUNT }, (_, index) => {
  const preset = getBrandCardPreset(index)
  const source = (Array.isArray(list) ? list : []).find((item) => {
    if (!item || typeof item !== 'object') return false
    if (Number(item.slot_index) === index) return true
    return String(item.category_key || '').trim() === preset.category_key
  }) || (Array.isArray(list) ? list[index] : null) || {}
  return normalizeBrandCard(source, index)
})

const hasBrandZoneLegacyContent = (settings = {}) => {
  const endorsements = Array.isArray(settings.brand_endorsements) ? settings.brand_endorsements : []
  const certifications = Array.isArray(settings.brand_certifications) ? settings.brand_certifications : []
  return endorsements.length > 0 || certifications.length > 0 || !!String(settings.brand_story_body || '').trim()
}

const buildBrandCardModel = (index) => {
  const preset = getBrandCardPreset(index)
  const item = normalizeBrandCard(brandConfig.brand_endorsements[index] || {}, index)
  return {
    title: preset.title,
    subtitle: item.subtitle,
    image_url: item.image,
    file_id: item.file_id,
    link_type: preset.link_type,
    link_value: preset.link_value,
    product_id: null
  }
}

const updateBrandCard = (index, value = {}) => {
  const preset = getBrandCardPreset(index)
  const current = normalizeBrandCard(brandConfig.brand_endorsements[index] || {}, index)
  brandConfig.brand_endorsements[index] = normalizeBrandCard({
    ...current,
    subtitle: value.subtitle,
    image: value.image_url || '',
    file_id: value.file_id || '',
    slot_index: preset.slot_index,
    category_key: preset.category_key,
    link_type: preset.link_type,
    link_value: preset.link_value
  }, index)
}

const addBrandCertification = () => {
  brandConfig.brand_certifications.push(createBrandCertificationEntry())
}

const removeBrandCertification = (index) => {
  brandConfig.brand_certifications.splice(index, 1)
}

const clearBrandCertificationImage = (index) => {
  const current = brandConfig.brand_certifications[index]
  if (!current) return
  brandConfig.brand_certifications[index] = normalizeBrandCertification({
    ...current,
    image: '',
    file_id: ''
  })
}

const clearBrandZoneCover = () => {
  brandConfig.brand_zone_cover = ''
  brandConfig.brand_zone_cover_file_id = ''
}

const openBrandAssetPicker = (kind, index = -1) => {
  brandAssetPicker.kind = kind
  brandAssetPicker.index = index
  brandAssetPicker.visible = true
}

const handleBrandAssetConfirm = (persistIds = [], displayUrls = []) => {
  const fileId = Array.isArray(persistIds) ? (persistIds[0] || '') : ''
  const imageUrl = Array.isArray(displayUrls) ? (displayUrls[0] || '') : ''
  if (brandAssetPicker.kind === 'cover') {
    brandConfig.brand_zone_cover_file_id = fileId
    brandConfig.brand_zone_cover = imageUrl
    return
  }
  if (brandAssetPicker.kind === 'certification' && brandAssetPicker.index >= 0) {
    const current = brandConfig.brand_certifications[brandAssetPicker.index]
    if (!current) return
    brandConfig.brand_certifications[brandAssetPicker.index] = normalizeBrandCertification({
      ...current,
      image: imageUrl,
      file_id: fileId
    })
  }
}

const isBrandCardConfigured = (item = {}) => {
  const current = normalizeBrandCard(item, Number(item.slot_index || 0))
  return !!(current.subtitle || current.image || current.file_id)
}

const isBrandCertificationConfigured = (item = {}) => {
  const current = normalizeBrandCertification(item)
  return !!(current.title || current.subtitle || current.image || current.file_id)
}

const loadBrandConfig = async () => {
  if (!canManageSettings.value) return
  try {
    const res = await getSettings()
    const root = res?.data || res || {}
    const d = root.homepage || root.HOMEPAGE || {}
    const loadedBrandCards = Array.isArray(d.brand_endorsements) ? d.brand_endorsements : []
    const loadedBrandCertifications = Array.isArray(d.brand_certifications) ? d.brand_certifications : []
    brandConfig.show_brand_logo = d.show_brand_logo !== 'false' && d.show_brand_logo !== false
    brandConfig.brand_logo = d.brand_logo || ''
    brandConfig.nav_brand_title = d.nav_brand_title || '问兰镜像'
    brandConfig.nav_brand_sub = d.nav_brand_sub || '品牌甄选'
    brandConfig.coupon_zone_title = d.coupon_zone_title || '惊喜礼遇'
    brandConfig.coupon_zone_subtitle = d.coupon_zone_subtitle || '领取后可在结算页直接选择使用'
    brandConfig.brand_zone_enabled = d.brand_zone_enabled !== undefined
      ? d.brand_zone_enabled !== 'false' && d.brand_zone_enabled !== false
      : hasBrandZoneLegacyContent(d)
    brandConfig.brand_zone_title = d.brand_zone_title || '品牌专区'
    brandConfig.brand_zone_cover = d.brand_zone_cover || ''
    brandConfig.brand_zone_cover_file_id = d.brand_zone_cover_file_id || ''
    brandConfig.brand_zone_welcome_title = d.brand_zone_welcome_title || 'Welcome'
    brandConfig.brand_zone_welcome_subtitle = d.brand_zone_welcome_subtitle || ''
    brandConfig.bubble_enabled = d.bubble_enabled !== false
    brandConfig.bubble_limit = Number(d.bubble_limit || 10)
    brandConfig.bubble_copy_order = d.bubble_copy_order || ''
    brandConfig.bubble_copy_group_buy = d.bubble_copy_group_buy || ''
    brandConfig.bubble_copy_slash = d.bubble_copy_slash || ''
    brandConfig.official_promo_title = d.official_promo_title || ''
    brandConfig.official_promo_subtitle = d.official_promo_subtitle || ''
    brandConfig.official_promo_badge = d.official_promo_badge || '官方宣传'
    brandConfig.official_promo_cover = d.official_promo_cover || ''
    brandConfig.brand_story_title = d.brand_story_title || '企业介绍'
    brandConfig.brand_story_body = d.brand_story_body || ''
    brandConfig.brand_endorsements = buildBrandCardSlots(loadedBrandCards)
    brandConfig.brand_certifications = loadedBrandCertifications.map((item) => normalizeBrandCertification(item))
  } catch (_) {}
}

const saveBrandConfig = async () => {
  if (!canManageSettings.value) {
    ElMessage.warning('没有权限修改品牌背书配置')
    return
  }
  brandSaving.value = true
  try {
    const normalizedBrandZoneCover = buildPersistentAssetRef({
      url: brandConfig.brand_zone_cover,
      fileId: brandConfig.brand_zone_cover_file_id
    })
    const brandAssetWarning = warnTemporaryAssetUrls([
      brandConfig.brand_logo,
      brandConfig.official_promo_cover,
      normalizedBrandZoneCover
    ], '品牌配置图片')
    if (brandAssetWarning) {
      ElMessage.warning(brandAssetWarning)
      return
    }
    await updateSettings({
      category: 'homepage',
      settings: {
        show_brand_logo: String(brandConfig.show_brand_logo),
        brand_logo: brandConfig.brand_logo,
        nav_brand_title: brandConfig.nav_brand_title,
        nav_brand_sub: brandConfig.nav_brand_sub,
        coupon_zone_title: brandConfig.coupon_zone_title,
        coupon_zone_subtitle: brandConfig.coupon_zone_subtitle,
        brand_zone_enabled: String(brandConfig.brand_zone_enabled),
        brand_zone_title: brandConfig.brand_zone_title,
        brand_zone_cover: normalizedBrandZoneCover,
        brand_zone_cover_file_id: brandConfig.brand_zone_cover_file_id,
        brand_zone_welcome_title: brandConfig.brand_zone_welcome_title,
        brand_zone_welcome_subtitle: brandConfig.brand_zone_welcome_subtitle,
        bubble_enabled: String(brandConfig.bubble_enabled),
        bubble_limit: String(brandConfig.bubble_limit),
        bubble_copy_order: brandConfig.bubble_copy_order,
        bubble_copy_group_buy: brandConfig.bubble_copy_group_buy,
        bubble_copy_slash: brandConfig.bubble_copy_slash,
        official_promo_title: brandConfig.official_promo_title,
        official_promo_subtitle: brandConfig.official_promo_subtitle,
        official_promo_badge: brandConfig.official_promo_badge,
        official_promo_cover: brandConfig.official_promo_cover,
        brand_story_title: brandConfig.brand_story_title,
        brand_story_body: brandConfig.brand_story_body,
        brand_endorsements: brandConfig.brand_endorsements
          .slice(0, FIXED_BRAND_CARD_COUNT)
          .map(({ id, ...rest }, index) => {
            const preset = getBrandCardPreset(index)
            return {
              slot_index: preset.slot_index,
              category_key: preset.category_key,
              subtitle: rest.subtitle || '',
              image: rest.image || '',
              file_id: rest.file_id || '',
              link_type: preset.link_type,
              link_value: preset.link_value
            }
          })
          .filter(isBrandCardConfigured),
        brand_certifications: brandConfig.brand_certifications
          .map(({ id, ...rest }) => ({
            title: rest.title || '',
            subtitle: rest.subtitle || '',
            image: rest.image || '',
            file_id: rest.file_id || ''
          }))
          .filter(isBrandCertificationConfigured)
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
const productBoards = ref([])
const boardDialogVisible = ref(false)
const boardSaving = ref(false)
const boardForm = reactive({ section_name: '' })
const boardDraft = reactive({
  id: null,
  section_name: '',
  section_key: '',
  is_visible: true,
  sort_order: 0
})
const featuredRows = ref([])
const productOptions = ref([])
const selectedProducts = ref([])
let dragFrom = -1

const productBoardLookup = computed(() => {
  const lookup = new Map()
  productBoards.value.forEach((item, index) => {
    lookup.set(String(item.id), { item, index })
  })
  return lookup
})
const currentBoardEntry = computed(() => productBoardLookup.value.get(String(boardId.value)) || null)
const currentBoard = computed(() => currentBoardEntry.value?.item || null)
const currentBoardIndex = computed(() => currentBoardEntry.value?.index ?? -1)

const syncBoardDraft = () => {
  const board = currentBoard.value
  Object.assign(boardDraft, {
    id: board?.id || null,
    section_name: board?.section_name || board?.board_name || '',
    section_key: board?.section_key || board?.board_key || '',
    is_visible: board ? board.is_visible !== 0 : true,
    sort_order: Number(board?.sort_order || 0)
  })
}

const loadFeaturedRows = async () => {
  if (!boardId.value) return
  const res = await getBoardProducts(boardId.value)
  featuredRows.value = Array.isArray(res) ? res : (res?.list || [])
}

const loadProductBoards = async () => {
  featuredLoading.value = true
  try {
    const boardsRes = await getHomeSections()
    const source = Array.isArray(boardsRes)
      ? boardsRes
      : (boardsRes?.list || boardsRes?.data?.list || boardsRes?.data || [])
    productBoards.value = (Array.isArray(source) ? source : [])
      .filter((item) => (item.section_type || item.board_type || 'product_board') === 'product_board')
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    if (!productBoards.value.length) {
      boardId.value = null
      featuredRows.value = []
      return
    }
    if (!boardId.value || !productBoardLookup.value.has(String(boardId.value))) {
      boardId.value = productBoards.value[0].id
    }
    syncBoardDraft()
    await loadFeaturedRows()
  } catch (_) {
    ElMessage.error('读取首页商品分组失败')
  } finally {
    featuredLoading.value = false
  }
}

const openBoardDialog = () => {
  boardForm.section_name = ''
  boardDialogVisible.value = true
}

const createBoardKey = (name) => `home.category.${Date.now()}`

const saveBoard = async () => {
  if (!boardForm.section_name.trim()) {
    ElMessage.warning('请先填写分组标题')
    return
  }
  boardSaving.value = true
  try {
    const sectionKey = createBoardKey(boardForm.section_name)
    const res = await createHomeSection({
      section_name: boardForm.section_name.trim(),
      board_name: boardForm.section_name.trim(),
      section_key: sectionKey,
      board_key: sectionKey,
      section_type: 'product_board',
      board_type: 'product_board',
      is_visible: 1,
      sort_order: productBoards.value.length * 10 + 10
    })
    boardDialogVisible.value = false
    await loadProductBoards()
    boardId.value = res?.id || productBoards.value.at(-1)?.id || boardId.value
    syncBoardDraft()
    ElMessage.success('商品分组已创建')
  } catch (_) {
    ElMessage.error('创建分组失败')
  } finally {
    boardSaving.value = false
  }
}

const saveBoardMeta = async () => {
  if (!boardDraft.id) return
  boardSaving.value = true
  try {
    await updateHomeSection(boardDraft.id, {
      section_name: boardDraft.section_name.trim(),
      board_name: boardDraft.section_name.trim(),
      section_key: boardDraft.section_key,
      board_key: boardDraft.section_key,
      is_visible: boardDraft.is_visible ? 1 : 0,
      sort_order: boardDraft.sort_order,
      section_type: 'product_board',
      board_type: 'product_board'
    })
    await loadProductBoards()
    ElMessage.success('分组信息已保存')
  } catch (_) {
    ElMessage.error('分组保存失败')
  } finally {
    boardSaving.value = false
  }
}

const moveBoard = async (delta) => {
  if (currentBoardIndex.value < 0) return
  const nextIndex = currentBoardIndex.value + delta
  if (nextIndex < 0 || nextIndex >= productBoards.value.length) return
  const arr = [...productBoards.value]
  const [current] = arr.splice(currentBoardIndex.value, 1)
  arr.splice(nextIndex, 0, current)
  productBoards.value = arr
  try {
    await updateSectionSort({
      orders: arr.map((item, index) => ({
        id: item.id,
        sort_order: index * 10,
        is_visible: item.is_visible
      }))
    })
    await loadProductBoards()
  } catch (_) {
    ElMessage.error('分组排序失败')
  }
}

const removeBoard = async () => {
  if (!currentBoard.value) return
  try {
    await ElMessageBox.confirm(`确认删除分组「${currentBoard.value.section_name || currentBoard.value.board_name}」？`, '提示', { type: 'warning' })
    await deleteHomeSection(currentBoard.value.id)
    boardId.value = null
    await loadProductBoards()
    ElMessage.success('分组已删除')
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('删除分组失败')
  }
}

const openAddDialog = () => {
  if (!boardId.value) {
    ElMessage.warning('请先选择或创建商品分组')
    return
  }
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
// 2026-05-03 megapage 拆分（P1-2 PoC）：splash 开屏动画 tab 全部职责（原 ~153 行 script
// + ~119 行 style + ~164 行 template）已迁移至 ./SplashScreenSection.vue。
// 子组件自治、零跨 tab 状态共享，parent 用 v-if="pageTab==='splash'" 控制 lazy mount。
// 详见 cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md §P1-2

watch(
  pageTab,
  async (tab) => {
    if (tab === 'featured' && productBoards.value.length === 0) {
      await loadProductBoards()
    }

  },
  { immediate: true }
)

watch(canManageSettings, (allowed) => {
  if (!allowed && pageTab.value === 'brand') {
    pageTab.value = 'popup'
  }
})

watch(boardId, async (value, oldValue) => {
  if (!value || value === oldValue) return
  syncBoardDraft()
  await loadFeaturedRows()
})

onMounted(() => {
  const tab = String(route.query.tab || '')
  if (availableTabs.value.includes(tab)) {
    pageTab.value = tab
  }
  if (canManageSettings.value) loadBrandConfig()
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

.board-meta-form {
  margin-bottom: 16px;
  padding: 16px 16px 0;
  border-radius: 10px;
  background: #fafafa;
  border: 1px solid #ebeef5;
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

.brand-entry-card {
  border: 1px solid #ebeef5;
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 12px;
  background: #fafafa;
}

.brand-entry-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}

.brand-entry-tip {
  font-size: 12px;
  font-weight: 400;
  color: #909399;
}

.brand-entry-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.brand-zone-cover-editor,
.brand-cert-body {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  width: 100%;
}

.brand-zone-cover-preview {
  width: 280px;
  height: 200px;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid #ebeef5;
  background: linear-gradient(135deg, #f6f2eb 0%, #edf4f8 100%);
  flex-shrink: 0;
}

.brand-zone-cover-preview.empty,
.brand-cert-preview.empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-zone-cover-placeholder {
  font-size: 13px;
  color: #909399;
}

.brand-zone-cover-actions,
.brand-cert-form {
  flex: 1;
  min-width: 0;
}

.brand-cert-preview {
  width: 136px;
  height: 136px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid #ebeef5;
  background: linear-gradient(135deg, #f8fafc 0%, #eef4f7 100%);
  flex-shrink: 0;
}

.brand-empty-hint,
.field-help {
  font-size: 12px;
  color: #909399;
  line-height: 1.7;
}

</style>
