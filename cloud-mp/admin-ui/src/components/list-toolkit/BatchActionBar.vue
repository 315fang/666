<template>
  <transition name="batch-action-bar-fade">
    <div v-if="count > 0" class="batch-action-bar" role="region" aria-label="批量操作">
      <div class="batch-action-bar__info">
        已选 <b>{{ count }}</b> 项
        <el-button text size="small" @click="emit('clear')">清空</el-button>
      </div>
      <div class="batch-action-bar__actions">
        <el-button
          v-for="(action, i) in visibleActions"
          :key="i"
          size="small"
          :type="action.type || 'primary'"
          :disabled="action.disabled"
          :loading="action.loading"
          :plain="action.plain !== false"
          @click="action.onClick && action.onClick()"
        >{{ action.label }}</el-button>
      </div>
    </div>
  </transition>
</template>

<script setup>
/**
 * BatchActionBar —— 列表选中后顶部出现的批量操作条。
 *
 * 配合 useBatchSelection() + el-table type="selection"。
 *
 * 用法：
 *   const batch = useBatchSelection()
 *
 *   <el-table @selection-change="batch.onSelectionChange">
 *     <el-table-column type="selection" width="44" />
 *     ...
 *   </el-table>
 *
 *   <BatchActionBar
 *     :count="batch.count.value"
 *     :actions="[
 *       { label: '批量上架', type: 'success', onClick: () => doBatch('activate') },
 *       { label: '批量下架', type: 'warning', onClick: () => doBatch('archive')  },
 *       { label: '批量删除', type: 'danger',  onClick: confirmDelete, visible: canDelete }
 *     ]"
 *     @clear="batch.clear()"
 *   />
 */
import { computed } from 'vue'

const props = defineProps({
  count: { type: Number, required: true },
  actions: { type: Array, default: () => [] }
})
const emit = defineEmits(['clear'])

const visibleActions = computed(() => (props.actions || []).filter((a) => a && a.visible !== false))
</script>

<style scoped>
.batch-action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  margin-bottom: 12px;
  background: #ecf5ff;
  border: 1px solid #d9ecff;
  border-radius: 6px;
}
.batch-action-bar__info {
  font-size: 13px;
  color: #303133;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.batch-action-bar__info b {
  color: #409eff;
  font-size: 14px;
}
.batch-action-bar__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.batch-action-bar-fade-enter-active,
.batch-action-bar-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.batch-action-bar-fade-enter-from,
.batch-action-bar-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
