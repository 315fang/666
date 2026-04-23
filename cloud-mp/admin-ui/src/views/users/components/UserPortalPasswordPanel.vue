<template>
  <div class="detail-section-title" style="margin-top:20px">业务密码</div>

  <el-alert
    v-if="!portalPasswordSupported"
    type="info"
    :closable="false"
    show-icon
    title="当前账号暂不支持业务密码"
    description="仅角色等级 1 及以上用户可申领业务密码。"
    style="margin-bottom:12px"
  />

  <template v-else>
    <el-descriptions :column="2" border size="small">
      <el-descriptions-item label="已设置">
        <el-tag :type="detailUser.portal_password_enabled ? 'success' : 'info'">
          {{ detailUser.portal_password_enabled ? '已设置' : '未设置' }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="当前状态">
        <el-tag :type="portalPasswordStatus.type">
          {{ portalPasswordStatus.text }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="锁定至">
        {{ formatDateSafe(detailUser.portal_password_locked_until) }}
      </el-descriptions-item>
      <el-descriptions-item label="设置时间">
        {{ formatDateSafe(detailUser.portal_password_set_at) }}
      </el-descriptions-item>
      <el-descriptions-item label="最后修改">
        {{ formatDateSafe(detailUser.portal_password_changed_at) }}
      </el-descriptions-item>
      <el-descriptions-item label="密码版本">
        {{ Number(detailUser.portal_password_version || 0) }}
      </el-descriptions-item>
    </el-descriptions>

    <div class="sub-hint" style="margin-top:10px">
      重置会生成新的初始密码，并要求用户下次进入小程序后先修改。后台无法查看当前密码明文。
    </div>

    <el-space wrap style="margin-top:12px">
      <template v-if="canManageUserPortalPassword">
        <el-button type="warning" :loading="portalPasswordSaving" @click="onResetPortalPassword">重置为新初始密码</el-button>
        <el-button
          v-if="detailUser.portal_password_locked_until"
          :loading="portalPasswordSaving"
          @click="onUnlockPortalPassword"
        >
          解除锁定
        </el-button>
      </template>
      <span v-else class="sub-hint">当前账号无权重置或解锁用户业务密码。</span>
    </el-space>
  </template>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  detailUser: {
    type: Object,
    required: true
  },
  canManageUserPortalPassword: {
    type: Boolean,
    default: false
  },
  portalPasswordSaving: {
    type: Boolean,
    default: false
  },
  formatDate: {
    type: Function,
    required: true
  },
  onResetPortalPassword: {
    type: Function,
    required: true
  },
  onUnlockPortalPassword: {
    type: Function,
    required: true
  }
})

const portalPasswordSupported = computed(() => Number(props.detailUser?.role_level || 0) >= 1)

const portalPasswordStatus = computed(() => {
  if (!props.detailUser?.portal_password_enabled) return { text: '未设置', type: 'info' }
  if (props.detailUser?.portal_password_locked_until) return { text: '已锁定', type: 'danger' }
  if (props.detailUser?.portal_password_change_required) return { text: '待修改初始密码', type: 'warning' }
  return { text: '可正常使用', type: 'success' }
})

const formatDateSafe = (value) => {
  return value ? props.formatDate(value) : '-'
}
</script>

<style scoped>
.detail-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 10px;
  padding-left: 8px;
  border-left: 3px solid var(--el-color-primary);
}

.sub-hint {
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
}
</style>
