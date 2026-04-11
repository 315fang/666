<template>
  <el-form
    :model="alertForm"
    label-width="180px"
    style="max-width: 700px;"
    v-loading="loading"
  >
    <el-divider content-position="left">告警总开关</el-divider>
    <el-form-item label="启用告警推送">
      <el-switch v-model="alertForm.alert_enabled" />
      <span style="margin-left:12px;font-size:12px;color:#909399">
        关闭后所有渠道均停止推送
      </span>
    </el-form-item>

    <el-divider content-position="left">推送渠道</el-divider>
    <el-form-item label="推送渠道">
      <el-radio-group v-model="alertForm.alert_webhook_type">
        <el-radio value="dingtalk">仅钉钉</el-radio>
        <el-radio value="wecom">仅企业微信</el-radio>
        <el-radio value="both">两者都推</el-radio>
      </el-radio-group>
    </el-form-item>

    <el-form-item
      label="钉钉 Webhook 地址"
      v-if="alertForm.alert_webhook_type === 'dingtalk' || alertForm.alert_webhook_type === 'both'"
    >
      <el-input
        v-model="alertForm.alert_dingtalk_webhook"
        placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
        clearable
        style="width:min(420px, 100%)"
      />
      <el-button
        style="margin-left:8px"
        :loading="testingDing"
        @click="() => onTest('dingtalk')"
      >测试</el-button>
    </el-form-item>

    <el-form-item
      label="企业微信 Webhook 地址"
      v-if="alertForm.alert_webhook_type === 'wecom' || alertForm.alert_webhook_type === 'both'"
    >
      <el-input
        v-model="alertForm.alert_wecom_webhook"
        placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
        clearable
        style="width:min(420px, 100%)"
      />
      <el-button
        style="margin-left:8px"
        :loading="testingWecom"
        @click="() => onTest('wecom')"
      >测试</el-button>
    </el-form-item>

    <el-divider content-position="left">推送策略</el-divider>
    <el-form-item label="同类告警最小间隔 (分钟)">
      <el-input-number
        v-model="alertForm.alert_min_interval_minutes"
        :min="1"
        :max="1440"
        :step="5"
      />
      <span style="margin-left:10px;font-size:12px;color:#909399">
        相同类型告警在此时间内不重复推送
      </span>
    </el-form-item>

    <el-form-item>
      <el-button type="primary" @click="onSave" :loading="saving">
        保存告警配置
      </el-button>
    </el-form-item>
  </el-form>
</template>

<script setup>
defineProps({
  alertForm: { type: Object, required: true },
  loading: { type: Boolean, required: true },
  saving: { type: Boolean, required: true },
  testingDing: { type: Boolean, required: true },
  testingWecom: { type: Boolean, required: true },
  onSave: { type: Function, required: true },
  onTest: { type: Function, required: true }
})
</script>
