<template>
  <div>
    <el-divider content-position="left">商品详情页服务承诺</el-divider>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      style="max-width: 880px; margin-bottom: 12px;"
      title="控制小程序商品详情页顶部的保障标签与下方「购物保障」说明。可按项开启/关闭并修改文案；请按法务与平台规则填写。"
    />
    <div
      v-for="key in pledgeKeys"
      :key="key"
      class="pledge-editor-block"
    >
      <div class="pledge-editor-head">
        <el-switch v-model="items[key].enabled" />
        <span class="pledge-editor-name">{{ pledgeLabels[key] }}</span>
      </div>
      <el-form-item label="标签文案" label-width="88px" class="pledge-form-item">
        <el-input
          v-model="items[key].title"
          placeholder="短标签，展示在商详页上行"
          style="max-width: 640px;"
        />
      </el-form-item>
      <el-form-item label="详细说明" label-width="88px" class="pledge-form-item">
        <el-input
          v-model="items[key].desc"
          type="textarea"
          :rows="2"
          placeholder="购物保障区完整说明，供用户展开阅读"
          style="max-width: 640px;"
        />
      </el-form-item>
    </div>
  </div>
</template>

<script setup>
defineProps({
  items: {
    type: Object,
    required: true
  },
  pledgeKeys: {
    type: Array,
    required: true
  },
  pledgeLabels: {
    type: Object,
    required: true
  }
})
</script>

<style scoped>
.pledge-editor-block {
  max-width: 880px;
  margin-bottom: 16px;
  padding: 12px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
}

.pledge-editor-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.pledge-editor-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.pledge-form-item {
  margin-bottom: 8px;
}

.pledge-form-item:last-child {
  margin-bottom: 0;
}
</style>
