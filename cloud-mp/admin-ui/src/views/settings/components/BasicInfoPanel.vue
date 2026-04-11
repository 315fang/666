<template>
  <el-descriptions :column="2" border>
    <el-descriptions-item label="系统名称">
      S2B2C 数字加盟系统
    </el-descriptions-item>
    <el-descriptions-item label="系统版本">
      v1.0.0
    </el-descriptions-item>
    <el-descriptions-item label="运行环境">
      Node.js + MySQL
    </el-descriptions-item>
    <el-descriptions-item label="服务状态">
      <el-tag v-if="systemStatus.status === 'ok' || systemStatus.status === 'online'" type="success">
        运行中
      </el-tag>
      <el-tag v-else-if="systemStatus.status === 'degraded'" type="warning">
        部分异常
      </el-tag>
      <el-tag v-else type="danger">
        异常
      </el-tag>
    </el-descriptions-item>
  </el-descriptions>
</template>

<script setup>
defineProps({
  systemStatus: {
    type: Object,
    required: true
  }
})
</script>
