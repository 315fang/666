<template>
  <el-collapse v-model="active" class="page-help-tip">
    <el-collapse-item :title="collapseTitle" :name="name">
      <el-alert
        v-if="message"
        :type="type"
        :closable="false"
        show-icon
        :title="message"
      />
      <slot v-else />
    </el-collapse-item>
  </el-collapse>
</template>

<script setup>
/**
 * PageHelpTip —— 折叠的"操作提示"卡。
 *
 * orders/index.vue 里已经有这个模式：
 *   <el-collapse>
 *     <el-collapse-item title="操作提示（点击展开）">
 *       <el-alert ... />
 *     </el-collapse-item>
 *   </el-collapse>
 * 这里抽出来，让其它列表页用一行替换：
 *
 *   <PageHelpTip
 *     title="售后处理须知"
 *     message="退款金额由系统按商品实付自动计算；仅退现金，优惠券和积分不返还。"
 *   />
 *
 * 也可以只用 slot：
 *   <PageHelpTip title="商品发布须知">
 *     <ul><li>商品名 ≤ 30 字</li><li>...</li></ul>
 *   </PageHelpTip>
 */
import { ref, computed } from 'vue'

const props = defineProps({
  title: { type: String, default: '操作提示' },
  message: { type: String, default: '' },
  type: { type: String, default: 'info' },
  name: { type: String, default: 'tip' },
  defaultOpen: { type: Boolean, default: false }
})

const active = ref(props.defaultOpen ? [props.name] : [])
const collapseTitle = computed(() => `${props.title}（点击${active.value.length ? '收起' : '展开'}）`)
</script>

<style scoped>
.page-help-tip {
  margin-bottom: 12px;
  border-radius: 8px;
}
.page-help-tip :deep(.el-collapse-item__header) {
  font-size: 13px;
  color: #606266;
  padding-left: 12px;
}
</style>
