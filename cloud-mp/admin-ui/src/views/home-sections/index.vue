<template>
  <div class="home-sections-page">
    <el-tabs v-model="pageTab">
      <el-tab-pane label="弹窗广告" name="popup">
        <PopupAdSection v-if="pageTab === 'popup'" />
      </el-tab-pane>

      <el-tab-pane v-if="canManageSettings" label="品牌背书" name="brand">
        <BrandZoneSection v-if="canManageSettings && pageTab === 'brand'" />
      </el-tab-pane>

      <el-tab-pane label="商品分组编排" name="featured">
        <FeaturedProductsSection v-if="pageTab === 'featured'" />
      </el-tab-pane>

      <el-tab-pane label="开屏动画" name="splash">
        <SplashScreenSection v-if="pageTab === 'splash'" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/store/user'
import PopupAdSection from './PopupAdSection.vue'
import BrandZoneSection from './BrandZoneSection.vue'
import FeaturedProductsSection from './FeaturedProductsSection.vue'
import SplashScreenSection from './SplashScreenSection.vue'

const route = useRoute()
const userStore = useUserStore()
const canManageSettings = computed(() => userStore.hasPermission('settings_manage'))
const availableTabs = computed(() => (
  canManageSettings.value
    ? ['popup', 'brand', 'featured', 'splash']
    : ['popup', 'featured', 'splash']
))
const pageTab = ref('popup')

// ============================================================================
// home-sections megapage 拆分（2026-05-03 §P1-2，4 步完成）
// ----------------------------------------------------------------------------
// 原 1637 行 monolith 已按 tab 拆为 4 个自治子组件，本文件仅作路由 shell 保留：
//   - PopupAdSection.vue       弹窗广告（原 ~50 行 script + ContentBlockEditor）
//   - BrandZoneSection.vue     品牌背书（原 ~340 行 script + MediaPicker + 5 依赖）
//   - FeaturedProductsSection.vue  商品分组（原 ~268 行 script + 2 dialogs + 11 API）
//   - SplashScreenSection.vue  开屏动画（原 ~153 行 script + 复杂 preview）
// 4 个 child 共享拆分模板：零 props/emits、onMounted 自治 fetch、v-if 控 lazy mount。
// 详见 cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md §P1-2
// ============================================================================


watch(canManageSettings, (allowed) => {
  if (!allowed && pageTab.value === 'brand') {
    pageTab.value = 'popup'
  }
})

onMounted(() => {
  const tab = String(route.query.tab || '')
  if (availableTabs.value.includes(tab)) {
    pageTab.value = tab
  }
})
</script>

<style scoped>
/* parent shell 仅含 el-tabs；section 子组件各自负责自己的样式（含 .card-header / .header-actions 等）。 */
.home-sections-page { padding: 0; }
</style>
