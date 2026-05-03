<template>
  <div>
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

    <MediaPicker
      v-model:visible="brandAssetPicker.visible"
      :multiple="false"
      :max="1"
      @confirm="handleBrandAssetConfirm"
    />
  </div>
</template>

<script setup>
// 2026-05-03 megapage 拆分（P1-2，第三阶段）：
// 从 home-sections/index.vue 拆出。承担首页底部品牌专区（含 Logo / Welcome / 入口卡 /
// 企业认证 / 气泡通告等）的全部职责——也是 4 个 section 中最大、依赖最多的一个。
//
// 设计：与 SplashScreenSection / PopupAdSection 同模板。
//   - 零 props/emits，权限护栏由 parent v-if="canManageSettings && pageTab==='brand'" 兜底
//   - loadBrandConfig 内部仍保留 if(!canManageSettings)return 防御编程（即便误 mount）
//   - MediaPicker 跟着 brand 走，不再泄漏到 parent 顶层 dialog 区
//
// 详见 cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md §P1-2
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/store/user'
import ContentBlockEditor from '@/components/ContentBlockEditor.vue'
import MediaPicker from '@/components/MediaPicker.vue'
import { buildPersistentAssetRef, warnTemporaryAssetUrls } from '@/utils/assetUrlAudit'
import { getSettings, updateSettings } from '@/api/index'

const userStore = useUserStore()
const canManageSettings = computed(() => userStore.hasPermission('settings_manage'))

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

onMounted(() => {
  loadBrandConfig()
})
</script>

<style scoped>
/* 子组件需要重复 .card-header 因为 parent 的同名 scoped 选择器无法穿透到子组件 DOM。 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

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
