<template>
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
</template>

<script setup>
// 2026-05-03 megapage 拆分（P1-2，第二阶段）：
// 从 home-sections/index.vue 拆出。承担首页弹窗广告 tab 的全部职责。
// 设计：与 SplashScreenSection 同模板——零 props/emits、onMounted 自治 fetch。
// parent 用 v-if="pageTab==='popup'" 控制 lazy mount（注：原 parent 是 onMounted 立即
// loadPopupAd，不论用户当前 tab；本次拆分改为 lazy load——popup 是首页默认 tab，效果等价）。
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import ContentBlockEditor from '@/components/ContentBlockEditor.vue'
import { getPopupAdConfig, updatePopupAdConfig } from '@/api/index'

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

onMounted(() => {
  loadPopupAd()
})
</script>

<style scoped>
/* 子组件需要重复 .card-header：parent 的 scoped .card-header 无法穿透到子组件 DOM。 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
