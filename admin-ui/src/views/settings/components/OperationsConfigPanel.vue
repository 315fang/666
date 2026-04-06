<template>
  <div>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      style="max-width: 700px; margin-bottom: 16px;"
      title="这里维护日常运营参数（提现门槛、订单时效、全局分销等）。提现手续费比例与封顶请在「小程序配置」中维护（可覆盖库表默认值）。单商品独立佣金请在对应业务页面配置。"
    />
    <el-form
      :model="settingsForm"
      label-width="160px"
      style="max-width: 700px;"
      v-loading="loading"
    >
      <el-divider content-position="left">分销设置</el-divider>
      <el-form-item label="分销佣金比例 (%)">
        <el-input-number v-model="settingsForm.commission_rate" :min="0" :max="100" :step="0.5" :precision="1" />
        <div class="field-hint">全局分销相关参数之一，具体是否参与计算以服务端佣金服务为准；填写 0～100 表示百分比。</div>
      </el-form-item>
      <el-form-item label="提现最低金额 (元)">
        <el-input-number v-model="settingsForm.min_withdrawal" :min="1" :step="10" />
        <div class="field-hint">用户/代理申请提现时金额不得低于该值。</div>
      </el-form-item>

      <el-divider content-position="left">订单设置</el-divider>
      <el-form-item label="自动取消时间 (分钟)">
        <el-input-number v-model="settingsForm.auto_cancel_minutes" :min="5" :max="1440" :step="5" />
        <div class="field-hint">未支付订单超过该时间未付款将自动关闭（需后端定时任务配合生效）。</div>
      </el-form-item>
      <el-form-item label="自动确认时间 (天)">
        <el-input-number v-model="settingsForm.auto_confirm_days" :min="1" :max="30" />
        <div class="field-hint">发货后超过该天数未申请售后则自动确认收货（以实际任务逻辑为准）。</div>
      </el-form-item>

      <el-divider content-position="left">用户与账号</el-divider>
      <el-form-item label="默认头像 URL">
        <el-input
          v-model="settingsForm.user_default_avatar_url"
          placeholder="/assets/images/default-avatar.svg 或 HTTPS 图片地址"
          style="max-width: 520px;"
        />
        <div class="field-hint">新用户注册、头像为空时展示；小程序本地路径需与包内资源一致。</div>
      </el-form-item>
      <el-form-item label="纯游客闲置清理 (天)">
        <el-input-number v-model="settingsForm.user_idle_guest_purge_days" :min="0" :max="365" />
        <div class="field-hint">
          最后登录超过该天数、且无任何订单/券/团队/佣金等痕迹的「纯游客」将定期删除（释放 openid）。填 0 关闭。默认 7 天。
        </div>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="saving" @click="onSave">
          保存配置
        </el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup>
defineProps({
  settingsForm: {
    type: Object,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  },
  saving: {
    type: Boolean,
    default: false
  },
  onSave: {
    type: Function,
    required: true
  }
})
</script>

<style scoped>
.field-hint {
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
  margin-top: 6px;
  max-width: 520px;
}
</style>
