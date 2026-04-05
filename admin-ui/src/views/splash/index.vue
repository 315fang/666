<template>
  <div class="splash-page">
    <el-row :gutter="24">
      <!-- 左：配置表单 -->
      <el-col :span="16">
        <el-card v-loading="loading">
          <template #header>
            <div style="display:flex;align-items:center;justify-content:space-between">
              <span>开屏动画配置</span>
              <div style="display:flex;align-items:center;gap:12px">
                <span style="font-size:13px;color:#606266;">是否启用</span>
                <el-switch
                  v-model="form.is_active"
                  active-text="开启"
                  inactive-text="关闭"
                />
              </div>
            </div>
          </template>

          <el-form :model="form" label-width="110px" label-position="left">

            <!-- 展示模式 -->
            <el-form-item label="展示模式">
              <el-select v-model="form.show_mode" style="width:220px">
                <el-option label="每次启动均展示" value="always" />
                <el-option label="每天仅展示一次" value="daily" />
                <el-option label="仅展示一次（看过就不再显示）" value="once" />
                <el-option label="关闭（不展示）" value="disabled" />
              </el-select>
            </el-form-item>

            <!-- 自动跳过 -->
            <el-form-item label="自动跳过(ms)">
              <el-input-number v-model="form.duration" :min="0" :max="30000" :step="500" style="width:180px" />
              <span style="margin-left:8px;color:#909399;font-size:12px;">0 = 不自动跳过</span>
            </el-form-item>

            <el-form-item label="跳过按钮文字">
              <el-input v-model="form.skip_text" style="width:160px" placeholder="跳过" />
            </el-form-item>

            <el-divider content-position="left">背景图片（可选）</el-divider>

            <!-- 背景图片 -->
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
                  v-model="form.image_url"
                  placeholder="或直接填入图片URL"
                  style="width:320px;margin-top:8px"
                  clearable
                />
                <div v-if="form.image_url" style="margin-top:8px">
                  <el-image :src="form.image_url" style="width:80px;height:80px;border-radius:6px;" fit="cover" />
                </div>
                <div style="font-size:12px;color:#909399;margin-top:4px;">留空则使用渐变动画效果</div>
              </div>
            </el-form-item>

            <!-- 背景渐变色 -->
            <el-form-item label="渐变起始色">
              <div style="display:flex;align-items:center;gap:8px">
                <el-color-picker v-model="form.bg_color_start" />
                <el-input v-model="form.bg_color_start" style="width:120px" placeholder="#26064F" />
              </div>
            </el-form-item>
            <el-form-item label="渐变结束色">
              <div style="display:flex;align-items:center;gap:8px">
                <el-color-picker v-model="form.bg_color_end" />
                <el-input v-model="form.bg_color_end" style="width:120px" placeholder="#F7F4EF" />
              </div>
            </el-form-item>

            <el-divider content-position="left">Reveal层（最终品牌画面）</el-divider>

            <el-form-item label="品牌大字">
              <el-input v-model="form.title" placeholder="盒美美" style="width:240px" />
            </el-form-item>
            <el-form-item label="英文大字">
              <el-input v-model="form.en_title" placeholder="HEMEIMEI" style="width:240px" />
            </el-form-item>
            <el-form-item label="副标题">
              <el-input v-model="form.subtitle" placeholder="做大学生的第一款护肤品" style="width:340px" />
            </el-form-item>
            <el-form-item label="Credit 文字">
              <el-input v-model="form.credit" placeholder="问兰药业 × 镜像案例库 · 联合出品" style="width:340px" />
            </el-form-item>

            <el-divider content-position="left">前置内容层（上滑逐层展示）</el-divider>

            <!-- Layers 编辑 -->
            <div v-for="(layer, idx) in form.layers" :key="idx" class="layer-block">
              <div class="layer-header">
                <span>第 {{ idx + 1 }} 层</span>
                <el-button
                  type="danger"
                  link
                  size="small"
                  @click="removeLayer(idx)"
                >删除</el-button>
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

            <el-button
              type="primary"
              plain
              size="small"
              style="margin-bottom:20px"
              @click="addLayer"
            >+ 添加内容层</el-button>

            <!-- 保存按钮 -->
            <div style="border-top:1px solid #f0f0f0;padding-top:20px;display:flex;gap:12px">
              <el-button type="primary" :loading="saving" @click="handleSave">保存配置</el-button>
              <el-button @click="handleReset">重置</el-button>
            </div>
          </el-form>
        </el-card>
      </el-col>

      <!-- 右：预览 -->
      <el-col :span="8">
        <el-card style="position:sticky;top:20px">
          <template #header>效果预览</template>
          <div class="preview-phone">
            <div
              class="preview-screen"
              :style="previewBg"
            >
              <!-- Flood 遮罩（静态展示最终态） -->
              <div class="preview-content">
                <!-- 顶部小标 -->
                <div class="preview-top-label">HEMEIMEI · 盒美美</div>

                <!-- 第一层内容 -->
                <div v-if="form.layers.length" class="preview-layer">
                  <div class="preview-en">{{ form.layers[0].en }}</div>
                  <div class="preview-tag">{{ form.layers[0].tag }}</div>
                  <div class="preview-title-text" :style="{ color: titleColor }">
                    {{ form.layers[0].title }}
                  </div>
                  <div class="preview-divider"></div>
                  <div
                    v-for="(line, i) in form.layers[0].lines"
                    :key="i"
                    class="preview-line"
                    :style="{ color: subColor }"
                  >{{ line }}</div>
                </div>

                <!-- 下滑提示 -->
                <div class="preview-arrow">↓ 下滑</div>

                <!-- 跳过按钮 -->
                <div v-if="form.skip_text" class="preview-skip">{{ form.skip_text }}</div>
              </div>
            </div>
          </div>
          <div style="margin-top:12px;font-size:12px;color:#909399;text-align:center">
            实机效果以小程序为准
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getSplashConfig, updateSplashConfig, uploadSplashImage } from '@/api/index'

const loading = ref(false)
const saving = ref(false)

const form = reactive({
  is_active: false,
  show_mode: 'always',
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

// 原始值，用于重置
let originalForm = null

// ── 预览计算 ──────────────────────────────────────
// 背景色：取起始深色作为预览背景（模拟第一层）
const previewBg = computed(() => {
  if (form.image_url) {
    return {
      backgroundImage: `url(${form.image_url})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    }
  }
  return {
    background: `linear-gradient(to bottom, ${form.bg_color_start || '#26064F'}, ${form.bg_color_end || '#F7F4EF'})`
  }
})

// 根据背景色深浅估算文字颜色
const isDark = computed(() => {
  const c = form.bg_color_start || '#26064F'
  const hex = c.replace('#', '')
  if (hex.length < 6) return true
  const r = parseInt(hex.substring(0,2), 16)
  const g = parseInt(hex.substring(2,4), 16)
  const b = parseInt(hex.substring(4,6), 16)
  return (r * 0.299 + g * 0.587 + b * 0.114) < 128
})
const titleColor = computed(() => isDark.value ? '#FFFFFF' : '#2D1A4A')
const subColor = computed(() => isDark.value ? 'rgba(255,255,255,0.65)' : 'rgba(60,20,100,0.65)')

// ── 加载配置 ──────────────────────────────────────
async function fetchConfig() {
  loading.value = true
  try {
    const res = await getSplashConfig()
    if (res.code === 0 && res.data) {
      Object.assign(form, res.data)
      originalForm = JSON.stringify(res.data)
    }
  } catch (e) {
    ElMessage.error('加载配置失败')
  } finally {
    loading.value = false
  }
}

// ── 保存配置 ──────────────────────────────────────
async function handleSave() {
  saving.value = true
  try {
    const res = await updateSplashConfig({ ...form })
    if (res.code === 0) {
      ElMessage.success(res.message || '保存成功')
      originalForm = JSON.stringify(form)
    } else {
      ElMessage.error(res.message || '保存失败')
    }
  } catch (e) {
    ElMessage.error('保存异常')
  } finally {
    saving.value = false
  }
}

// ── 重置 ──────────────────────────────────────────
function handleReset() {
  if (originalForm) {
    Object.assign(form, JSON.parse(originalForm))
    ElMessage.info('已还原上次保存的配置')
  }
}

// ── 图片上传 ──────────────────────────────────────
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
    if (res.code === 0 && res.data?.url) {
      form.image_url = res.data.url
      ElMessage.success('上传成功')
    } else {
      ElMessage.error('上传失败')
    }
  } catch (e) {
    ElMessage.error('上传异常')
  }
}

// ── Layer 管理 ────────────────────────────────────
function addLayer() {
  form.layers.push({
    type: 'single',
    title: '',
    tag: '',
    lines: [''],
    en: ''
  })
}

function removeLayer(idx) {
  form.layers.splice(idx, 1)
}

function addLine(layerIdx) {
  form.layers[layerIdx].lines.push('')
}

function removeLine(layerIdx, lineIdx) {
  form.layers[layerIdx].lines.splice(lineIdx, 1)
}

onMounted(() => { fetchConfig() })
</script>

<style scoped>
.splash-page {
  padding: 0;
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

/* 手机预览框 */
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
