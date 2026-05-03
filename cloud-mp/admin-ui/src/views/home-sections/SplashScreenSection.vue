<template>
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
</template>

<script setup>
// 2026-05-03 megapage 拆分（P1-2，第一阶段 PoC）：
// 从 home-sections/index.vue 拆出。原文件 1637 行 / 4 个互斥 tab section，
// 此处只承担 "splash 开屏动画" tab 的全部职责（template + script + style）。
// 拆分原则：
//   - 子组件零 props / 零 emits：splash 配置完全自治，不与其他 tab 共享状态。
//   - 子组件 onMounted 自己 fetch，替代原 parent watch(pageTab) 的 lazy load。
//     parent 用 v-if="pageTab === 'splash'" 包裹本组件，自然实现切到 tab 才加载。
// 详见 cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md §P1-2
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getSplashConfig, updateSplashConfig, uploadSplashImage } from '@/api/index'

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

onMounted(() => {
  fetchSplashConfig()
})
</script>

<style scoped>
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
