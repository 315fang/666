<template>
  <span class="row-actions-menu">
    <el-button
      v-for="(action, i) in primaryActions"
      :key="`primary-${i}`"
      text
      :type="action.type || 'primary'"
      size="small"
      :disabled="action.disabled"
      :loading="action.loading"
      @click.stop="action.onClick && action.onClick()"
    >{{ action.label }}</el-button>

    <el-dropdown v-if="moreActions.length" trigger="click" size="small" @click.stop>
      <el-button text size="small" class="row-actions-menu__more">
        更多<el-icon class="row-actions-menu__more-icon"><ArrowDown /></el-icon>
      </el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="(action, i) in moreActions"
            :key="`more-${i}`"
            :divided="action.divided"
            :disabled="action.disabled"
            @click="action.onClick && action.onClick()"
          >
            <span :class="{ 'row-actions-menu__danger': action.danger }">{{ action.label }}</span>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </span>
</template>

<script setup>
/**
 * RowActionsMenu —— 表格行操作列统一按钮（主操作外露 + "更多"下拉收尾）。
 *
 * 对应 2026-05-03 实用性体检 #6：
 *   refunds 操作列 240px 塞 6 个 text 按钮，窄屏会重叠；
 *   products 100px 塞 2 个；withdrawals 220px 塞 5 个 —— 各页样式不一致。
 *
 * 用法：
 *   <RowActionsMenu :actions="getRowActions(row)" :primary-count="2" />
 *
 *   function getRowActions(row) {
 *     return [
 *       { label: '通过',   type: 'success', onClick: () => approve(row),  visible: row.status === 'pending' },
 *       { label: '拒绝',   type: 'danger',  onClick: () => reject(row),   visible: row.status === 'pending', danger: true },
 *       { label: '同步',                     onClick: () => sync(row),    visible: row.status === 'processing' },
 *       { label: '详情',                     onClick: () => detail(row) },
 *       { label: '删除',   type: 'danger',  onClick: () => del(row),     danger: true, divided: true }
 *     ]
 *   }
 *
 * action 字段：
 *   - label    显示文字（必填）
 *   - onClick  点击回调
 *   - type     主按钮颜色（primary/success/warning/danger/info），仅外露按钮生效
 *   - disabled 禁用
 *   - loading  加载中（仅外露按钮生效）
 *   - visible  布尔，false 则隐藏（不占位）
 *   - danger   下拉项里红字提示
 *   - divided  下拉项前加分割线
 *
 * 显示规则：
 *   visible !== false 的 action 按数组顺序：
 *     - 前 primaryCount 个外露
 *     - 其余收进"更多"
 *   primaryCount=0 时全部进下拉。
 */
import { computed } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'

const props = defineProps({
  actions: { type: Array, required: true },
  primaryCount: { type: Number, default: 2 }
})

const visibleActions = computed(() => (props.actions || []).filter((a) => a && a.visible !== false))
const primaryActions = computed(() => visibleActions.value.slice(0, Math.max(0, props.primaryCount)))
const moreActions = computed(() => visibleActions.value.slice(Math.max(0, props.primaryCount)))
</script>

<style scoped>
.row-actions-menu {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.row-actions-menu__more {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.row-actions-menu__more-icon {
  font-size: 12px;
}
.row-actions-menu__danger {
  color: #f56c6c;
}
</style>
