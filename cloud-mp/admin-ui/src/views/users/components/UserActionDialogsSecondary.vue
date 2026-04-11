<template>
  <el-dialog v-model="remarkVisibleProxy" title="备注 / 标签" width="420px">
    <el-form :model="remarkForm" label-width="80px">
      <el-form-item label="内部备注">
        <el-input v-model="remarkForm.remark" type="textarea" :rows="3" placeholder="仅管理员可见" />
      </el-form-item>
      <el-form-item label="内部标签">
        <el-tag
          v-for="tag in remarkForm.tags"
          :key="tag"
          closable
          @close="onRemoveTag(tag)"
          style="margin-right:6px; margin-bottom:4px"
        >{{ tag }}</el-tag>
        <el-input
          v-if="tagInputVisible"
          ref="tagInputRef"
          v-model="tagInputValue"
          size="small"
          style="width:100px"
          @keyup.enter="onAddTag"
          @blur="onAddTag"
        />
        <el-button v-else size="small" @click="onShowTagInput">+ 添加标签</el-button>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="remarkVisibleProxy = false">取消</el-button>
      <el-button type="primary" @click="onSubmitRemark" :loading="submitting">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="inviteVisibleProxy" title="修改历史邀请码" width="380px">
    <el-form :model="inviteForm" label-width="90px">
      <el-form-item label="当前历史邀请码">{{ currentUser?.invite_code || '-' }}</el-form-item>
      <el-form-item label="新历史邀请码">
        <el-input v-model="inviteForm.code" placeholder="留空则自动生成6位数字码" maxlength="6" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="inviteVisibleProxy = false">取消</el-button>
      <el-button type="primary" @click="onSubmitInvite" :loading="submitting">确认</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="memberNoVisibleProxy" title="修改会员码" width="420px">
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      style="margin-bottom:16px"
      title="会员码用于邀请绑定与代理门户登录。留空可自动生成 8 位随机码；手工填写时仅允许 8 位数字/大写字母（不含0/O/1/I）。"
    />
    <el-form :model="memberNoForm" label-width="90px">
      <el-form-item label="当前会员码">{{ currentUser?.member_no || '-' }}</el-form-item>
      <el-form-item label="新会员码">
        <el-input v-model="memberNoForm.member_no" placeholder="留空则自动生成随机会员码" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="memberNoVisibleProxy = false">取消</el-button>
      <el-button type="primary" @click="onSubmitMemberNo" :loading="submitting">确认</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="parentVisibleProxy" title="修改上级绑定" width="380px">
    <el-alert type="warning" :closable="false" style="margin-bottom:16px">
      修改上级后，原上级直推人数-1，新上级+1，请谨慎操作。
    </el-alert>
    <el-form :model="parentForm" label-width="90px">
      <el-form-item label="当前上级">{{ displayUserName(currentUser?.parent, '无') }}</el-form-item>
      <el-form-item label="新上级ID">
        <el-input v-model="parentForm.new_parent_id" placeholder="输入用户ID，留空为解绑" />
      </el-form-item>
      <el-form-item label="操作原因">
        <el-input v-model="parentForm.reason" placeholder="必填" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="parentVisibleProxy = false">取消</el-button>
      <el-button type="primary" @click="onSubmitParent" :loading="submitting">确认</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed } from 'vue'
import { getUserNickname } from '@/utils/userDisplay'

const props = defineProps({
  currentUser: { type: Object, default: null },
  submitting: { type: Boolean, default: false },
  remarkVisible: { type: Boolean, default: false },
  remarkForm: { type: Object, required: true },
  tagInputVisible: { type: Boolean, default: false },
  tagInputValue: { type: String, default: '' },
  inviteVisible: { type: Boolean, default: false },
  inviteForm: { type: Object, required: true },
  memberNoVisible: { type: Boolean, default: false },
  memberNoForm: { type: Object, required: true },
  parentVisible: { type: Boolean, default: false },
  parentForm: { type: Object, required: true },
  onShowTagInput: { type: Function, required: true },
  onAddTag: { type: Function, required: true },
  onRemoveTag: { type: Function, required: true },
  onSubmitRemark: { type: Function, required: true },
  onSubmitInvite: { type: Function, required: true },
  onSubmitMemberNo: { type: Function, required: true },
  onSubmitParent: { type: Function, required: true }
})

const emit = defineEmits([
  'update:remarkVisible',
  'update:inviteVisible',
  'update:memberNoVisible',
  'update:parentVisible',
  'update:tagInputValue'
])

const remarkVisibleProxy = computed({
  get: () => props.remarkVisible,
  set: (value) => emit('update:remarkVisible', value)
})

const inviteVisibleProxy = computed({
  get: () => props.inviteVisible,
  set: (value) => emit('update:inviteVisible', value)
})

const memberNoVisibleProxy = computed({
  get: () => props.memberNoVisible,
  set: (value) => emit('update:memberNoVisible', value)
})

const parentVisibleProxy = computed({
  get: () => props.parentVisible,
  set: (value) => emit('update:parentVisible', value)
})

const tagInputValue = computed({
  get: () => props.tagInputValue,
  set: (value) => emit('update:tagInputValue', value)
})

const displayUserName = (user, fallback = '-') => getUserNickname(user || {}, fallback)
</script>
