<template>
  <div class="bundle-page">
    <BundleListSection ref="listRef" @edit="handleEdit" @new="handleNew" />
    <BundleEditDrawer ref="drawerRef" @saved="handleSaved" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import BundleListSection from './BundleListSection.vue'
import BundleEditDrawer from './BundleEditDrawer.vue'

// ============================================================================
// product-bundles megapage 拆分（2026-05-03 §P1-2，3 步完成）
// ----------------------------------------------------------------------------
// 原 1670 行 monolith 已拆为 shell + 3 个职责单一的子组件，本文件仅作路由 shell：
//   - BundleListSection.vue   列表 + 搜索 + 分页 + 行操作（编辑/上下架/删除）
//   - BundleEditDrawer.vue    编辑抽屉（基础表单 + 摘要 + 封面 + validate/buildPayload/submit）
//   - BundleStepsEditor.vue   编辑抽屉内的"2. 选择步骤"区块（独立子组件，drawer 内嵌）
// 协调方式：list emit edit/new -> shell 调 drawerRef.open(row)；
//          drawer emit saved -> shell 调 listRef.refresh()。
// 详见 cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md §P1-2
// ============================================================================

const listRef = ref(null)
const drawerRef = ref(null)

const handleEdit = (row) => drawerRef.value?.open(row)
const handleNew = () => drawerRef.value?.open()
const handleSaved = () => listRef.value?.refresh()
</script>

<style scoped>
.bundle-page {
  display: flex;
  flex-direction: column;
  gap: 0;
}
</style>
