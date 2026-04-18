<template>
  <div>
    <el-dialog :model-value="purchaseLevelVisible" title="设置拿货等级" width="420px" @update:model-value="onPurchaseLevelVisibilityChange">
      <el-form :model="purchaseLevelForm" label-width="100px">
        <el-form-item label="用户">{{ displayUserName(currentUser, '-') }}</el-form-item>
        <el-form-item label="当前等级">
          <el-tag type="info">{{ purchaseLevelText(currentUser?.purchase_level_code) }}</el-tag>
        </el-form-item>
        <el-form-item label="新等级">
          <el-select v-model="purchaseLevelForm.purchase_level_code" clearable placeholder="不设置则清空" style="width:100%">
            <el-option v-for="item in purchaseLevelOptions" :key="item.code" :label="`${item.name} (${item.code})`" :value="item.code" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="onPurchaseLevelVisibilityChange(false)">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="onSubmitPurchaseLevel">确认</el-button>
      </template>
    </el-dialog>

    <el-dialog :model-value="roleVisible" title="修改用户角色" width="360px" @update:model-value="onRoleVisibilityChange">
      <el-form :model="roleForm" label-width="80px">
        <el-form-item label="用户">{{ displayUserName(currentUser, '-') }}</el-form-item>
        <el-form-item label="当前角色">
          <el-tag :type="roleTagType(currentUser?.role_level)">{{ roleText(currentUser?.role_level) }}</el-tag>
        </el-form-item>
        <el-form-item label="新角色">
          <el-select v-model="roleForm.role_level" style="width:100%">
            <el-option label="VIP用户" :value="0" />
            <el-option label="初级会员" :value="1" />
            <el-option label="高级会员" :value="2" />
            <el-option label="推广合伙人" :value="3" />
            <el-option label="运营合伙人" :value="4" />
            <el-option label="区域合伙人" :value="5" />
            <el-option label="线下实体门店" :value="6" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="onRoleVisibilityChange(false)">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="onSubmitRole">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { getUserNickname } from '@/utils/userDisplay'

defineProps({
  currentUser: {
    type: Object,
    default: null
  },
  submitting: {
    type: Boolean,
    default: false
  },
  purchaseLevelVisible: {
    type: Boolean,
    default: false
  },
  purchaseLevelForm: {
    type: Object,
    required: true
  },
  purchaseLevelOptions: {
    type: Array,
    required: true
  },
  roleVisible: {
    type: Boolean,
    default: false
  },
  roleForm: {
    type: Object,
    required: true
  },
  purchaseLevelText: {
    type: Function,
    required: true
  },
  roleText: {
    type: Function,
    required: true
  },
  roleTagType: {
    type: Function,
    required: true
  },
  onPurchaseLevelVisibilityChange: {
    type: Function,
    required: true
  },
  onRoleVisibilityChange: {
    type: Function,
    required: true
  },
  onSubmitPurchaseLevel: {
    type: Function,
    required: true
  },
  onSubmitRole: {
    type: Function,
    required: true
  }
})

const displayUserName = (user, fallback = '-') => getUserNickname(user || {}, fallback)
</script>
