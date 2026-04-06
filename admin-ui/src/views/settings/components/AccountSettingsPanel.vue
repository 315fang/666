<template>
  <el-form :model="accountForm" label-width="120px" style="max-width: 600px;">
    <el-form-item label="当前用户名">
      <el-input v-model="accountForm.username" disabled />
    </el-form-item>
    <el-form-item label="角色">
      <el-input v-model="accountForm.role" disabled />
    </el-form-item>
    <el-form-item>
      <el-button type="primary" @click="onChangePassword">
        修改密码
      </el-button>
    </el-form-item>
  </el-form>
</template>

<script setup>
defineProps({
  accountForm: {
    type: Object,
    required: true
  },
  onChangePassword: {
    type: Function,
    required: true
  }
})
</script>
