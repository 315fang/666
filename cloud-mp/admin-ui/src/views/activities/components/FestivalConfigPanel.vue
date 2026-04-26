<template>
  <el-card style="margin-top: 16px">
    <template #header>
      <div class="card-header">
        <span>活动中心配置</span>
        <div class="header-actions">
          <el-button @click="props.saveGlobalUi" :loading="props.globalUiSaving">保存全局UI</el-button>
          <el-button type="primary" @click="props.saveFestival" :loading="props.festivalSaving">保存节日配置</el-button>
        </div>
      </div>
    </template>

    <el-form
      :model="props.festival"
      label-width="130px"
      :loading="props.festivalLoading || props.globalUiLoading"
      style="max-width: 700px"
    >
      <el-form-item label="是否启用">
        <el-switch v-model="props.festival.active" active-text="已启用" inactive-text="关闭" />
      </el-form-item>
      <el-form-item label="节日名称">
        <el-input v-model="props.festival.name" placeholder="如：中秋节 / 春节" />
      </el-form-item>
      <el-form-item label="节日主题">
        <el-input v-model="props.festival.theme" placeholder="如：moon / spring / valentines" />
        <div class="field-note">对应小程序CSS主题变量名（预设：moon/spring/valentines/anniversary）</div>
      </el-form-item>
      <el-form-item label="倒计时目标日">
        <el-date-picker
          v-model="props.festival.countdown_to"
          type="datetime"
          placeholder="留空则不显示倒计时"
          value-format="YYYY-MM-DD HH:mm:ss"
        />
      </el-form-item>
      <el-form-item label="活动Banner标题">
        <el-input v-model="props.festival.banner_title" placeholder="活动页顶部大标题" />
      </el-form-item>
      <el-form-item label="活动Banner副标题">
        <el-input v-model="props.festival.banner_subtitle" placeholder="活动页副标题" />
      </el-form-item>
      <el-form-item label="横幅背景图片">
        <div class="image-field">
          <el-input v-model="props.festival.banner" placeholder="横幅背景图片URL" @input="onBannerInput" />
          <div class="image-actions">
            <el-button size="small" @click="openMediaPicker('banner')">从素材库选择</el-button>
            <el-button v-if="resolveBannerImage()" size="small" text type="danger" @click="clearBannerImage">清空</el-button>
          </div>
        </div>
        <div v-if="resolveBannerImage()" class="banner-preview">
          <el-image :src="resolveBannerImage()" fit="contain" class="banner-image" />
        </div>
      </el-form-item>
      <el-form-item label="CTA按钮文案">
        <el-input v-model="props.festival.ctaText" placeholder="如：立即参与、马上查看" class="cta-input" />
      </el-form-item>
      <el-form-item label="Banner入口">
        <el-select
          :model-value="props.currentActivityOptionKey(props.festival.cta_link_type, props.festival.cta_link_value)"
          placeholder="选择 Banner 点击后进入的页面"
          class="option-select"
          :loading="props.activityOptionsLoading"
          @change="props.handleCtaOptionChange"
        >
          <el-option
            v-for="opt in props.activityOptions"
            :key="opt.key"
            :label="props.activityOptionLabel(opt)"
            :value="opt.key"
            :disabled="opt.disabled"
          />
        </el-select>
        <div class="field-note">
          {{
            props.activityOptionNote(
              props.findActivityOption(props.festival.cta_link_type, props.festival.cta_link_value)
            ) || '选择后系统将自动生成 Banner 跳转目标，不再手填页面路径。'
          }}
        </div>
        <div
          v-if="props.festival.cta_link_value && !props.findActivityOption(props.festival.cta_link_type, props.festival.cta_link_value)"
          class="field-warn"
        >
          当前保留旧配置：{{ props.festival.cta_link_type }} / {{ props.festival.cta_link_value }}
        </div>
      </el-form-item>
      <el-form-item label="主题色（主色）">
        <div class="color-row">
          <el-color-picker v-model="props.festival.theme_colors.primary" />
          <el-input v-model="props.festival.theme_colors.primary" class="color-input" placeholder="#C6A16E" />
        </div>
      </el-form-item>
      <el-form-item label="主题色（背景）">
        <div class="color-row">
          <el-color-picker v-model="props.festival.theme_colors.bg" />
          <el-input v-model="props.festival.theme_colors.bg" class="color-input" placeholder="#FFF8EE" />
        </div>
      </el-form-item>
      <el-form-item label="活动标签">
        <div class="tags-row">
          <el-tag
            v-for="(tag, idx) in props.festival.tags"
            :key="idx"
            closable
            @close="props.festival.tags.splice(idx, 1)"
          >
            {{ tag }}
          </el-tag>
          <el-input
            v-if="tagInputVisible"
            ref="tagInputRef"
            v-model="tagInputVal"
            size="small"
            class="tag-input"
            @keyup.enter="addTag"
            @blur="addTag"
          />
          <el-button v-else size="small" @click="showTagInput">+ 添加标签</el-button>
        </div>
      </el-form-item>
      <el-form-item label="全局背景墙纸">
        <div class="switch-row">
          <el-switch v-model="props.festival.global_wallpaper.enabled" active-text="开启" inactive-text="关闭" />
          <el-select v-model="props.festival.global_wallpaper.preset" class="preset-select">
            <el-option label="默认浅米" value="default" />
            <el-option label="暖金渐变" value="warm-gold" />
            <el-option label="静谧蓝灰" value="mist-blue" />
            <el-option label="深色极简" value="dark" />
          </el-select>
        </div>
      </el-form-item>
      <el-form-item label="底部精选好物">
        <div class="switch-row">
          <el-switch
            v-model="props.festival.show_featured_products"
            active-text="开启推荐商品"
            inactive-text="关闭"
          />
          <el-input-number v-model="props.festival.featured_products_limit" :min="1" :max="12" :step="1" />
          <span class="field-note-inline">展示数量</span>
        </div>
      </el-form-item>
      <el-form-item label="活动卡片配置">
        <div class="posters-wrap">
          <el-button size="small" type="primary" plain @click="props.addPoster">+ 新增活动卡片</el-button>
          <div class="poster-list">
            <el-card v-for="(poster, idx) in props.festival.card_posters" :key="poster.id || idx" shadow="never">
              <el-row :gutter="10">
                <el-col :span="6">
                  <el-input v-model="poster.title" placeholder="卡片标题" />
                </el-col>
                <el-col :span="8">
                  <el-input v-model="poster.subTitle" placeholder="卡片副标题" />
                </el-col>
                <el-col :span="10">
                  <el-select
                    :model-value="props.currentActivityOptionKey(poster.link_type, poster.link_value)"
                    placeholder="选择卡片进入的活动页面"
                    style="width: 100%"
                    :loading="props.activityOptionsLoading"
                    @change="(key) => props.handlePosterOptionChange(poster, key)"
                  >
                    <el-option
                      v-for="opt in props.activityOptions"
                      :key="opt.key"
                      :label="props.activityOptionLabel(opt)"
                      :value="opt.key"
                      :disabled="opt.disabled"
                    />
                  </el-select>
                </el-col>
              </el-row>
              <div class="field-note poster-note">
                {{
                  props.activityOptionNote(props.findActivityOption(poster.link_type, poster.link_value)) ||
                  '选择后卡片将进入对应活动页面，由用户在页面里继续选择具体商品或玩法。'
                }}
              </div>
              <div
                v-if="poster.link_value && !props.findActivityOption(poster.link_type, poster.link_value)"
                class="field-warn"
              >
                当前保留旧配置：{{ poster.link_type }} / {{ poster.link_value || poster.link }}
              </div>
              <el-row :gutter="10" class="poster-row">
                <el-col :span="20">
                  <div class="image-field">
                    <el-input v-model="poster.image" placeholder="卡片图片URL（可空）" @input="onPosterImageInput(poster)" />
                    <div class="image-actions">
                      <el-button size="small" @click="openMediaPicker('poster', idx)">从素材库选择</el-button>
                      <el-button v-if="resolvePosterImage(poster)" size="small" text type="danger" @click="clearPosterImage(poster)">清空</el-button>
                    </div>
                    <el-image v-if="resolvePosterImage(poster)" :src="resolvePosterImage(poster)" fit="cover" class="poster-preview-image" />
                  </div>
                </el-col>
                <el-col :span="4">
                  <el-button size="small" type="danger" text @click="props.removePoster(idx)">删除</el-button>
                </el-col>
              </el-row>
              <el-row :gutter="10" class="poster-row">
                <el-col :span="24">
                  <el-input v-model="poster.gradient" placeholder="背景渐变，如 linear-gradient(...)" />
                </el-col>
              </el-row>
            </el-card>
          </div>
        </div>
      </el-form-item>
    </el-form>
  </el-card>
  <MediaPicker
    v-model:visible="mediaPickerVisible"
    :multiple="false"
    :max="1"
    @confirm="handleMediaConfirm"
  />
</template>

<script setup>
import { nextTick, ref } from 'vue'
import MediaPicker from '@/components/MediaPicker.vue'
import { buildPersistentAssetRef } from '@/utils/assetUrlAudit'

const props = defineProps({
  festival: { type: Object, required: true },
  festivalLoading: { type: Boolean, required: true },
  festivalSaving: { type: Boolean, required: true },
  globalUiLoading: { type: Boolean, required: true },
  globalUiSaving: { type: Boolean, required: true },
  activityOptionsLoading: { type: Boolean, required: true },
  activityOptions: { type: Array, required: true },
  currentActivityOptionKey: { type: Function, required: true },
  findActivityOption: { type: Function, required: true },
  activityOptionLabel: { type: Function, required: true },
  activityOptionNote: { type: Function, required: true },
  handleCtaOptionChange: { type: Function, required: true },
  handlePosterOptionChange: { type: Function, required: true },
  addPoster: { type: Function, required: true },
  removePoster: { type: Function, required: true },
  saveFestival: { type: Function, required: true },
  saveGlobalUi: { type: Function, required: true }
})

const tagInputVisible = ref(false)
const tagInputVal = ref('')
const tagInputRef = ref()
const mediaPickerVisible = ref(false)
const mediaPickerContext = ref({ kind: 'banner', index: -1 })

const showTagInput = async () => {
  tagInputVisible.value = true
  await nextTick()
  tagInputRef.value?.focus()
}

const addTag = () => {
  if (tagInputVal.value.trim()) {
    props.festival.tags.push(tagInputVal.value.trim())
  }
  tagInputVal.value = ''
  tagInputVisible.value = false
}

const resolveBannerImage = () => props.festival.banner || ''
const resolvePosterImage = (poster = {}) => poster.image || ''

const onBannerInput = () => {
  props.festival.banner_file_id = ''
}

const onPosterImageInput = (poster) => {
  if (!poster) return
  poster.file_id = ''
}

const clearBannerImage = () => {
  props.festival.banner = ''
  props.festival.banner_file_id = ''
}

const clearPosterImage = (poster) => {
  if (!poster) return
  poster.image = ''
  poster.file_id = ''
}

const openMediaPicker = (kind, index = -1) => {
  mediaPickerContext.value = { kind, index }
  mediaPickerVisible.value = true
}

const handleMediaConfirm = (persistIds = [], displayUrls = []) => {
  const persist = Array.isArray(persistIds) ? (persistIds[0] || '') : ''
  const display = Array.isArray(displayUrls) ? (displayUrls[0] || '') : ''
  const stableUrl = buildPersistentAssetRef({ url: display || persist, fileId: persist })
  if (mediaPickerContext.value.kind === 'banner') {
    props.festival.banner_file_id = persist
    props.festival.banner = stableUrl || ''
    return
  }
  const poster = Array.isArray(props.festival.card_posters) ? props.festival.card_posters[mediaPickerContext.value.index] : null
  if (!poster) return
  poster.file_id = persist
  poster.image = stableUrl || ''
}
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions,
.color-row,
.switch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.field-note,
.field-note-inline,
.poster-note {
  font-size: 12px;
  color: #909399;
}

.field-note {
  margin-top: 4px;
}

.image-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.image-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.field-warn {
  font-size: 12px;
  color: #e6a23c;
  margin-top: 4px;
}

.banner-preview {
  margin-top: 8px;
}

.banner-image {
  max-width: 400px;
  max-height: 120px;
  border-radius: 8px;
}

.cta-input {
  width: min(240px, 100%);
}

.option-select {
  width: min(360px, 100%);
}

.color-input {
  width: 120px;
}

.tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-input {
  width: 100px;
}

.preset-select {
  width: min(180px, 100%);
}

.posters-wrap {
  width: 100%;
}

.poster-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.poster-row {
  margin-top: 10px;
}

.poster-preview-image {
  width: 120px;
  height: 80px;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

@media (max-width: 767px) {
  .card-header {
    flex-wrap: wrap;
    gap: 8px;
  }
}
</style>
