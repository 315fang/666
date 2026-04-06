<template>
  <div>
    <el-divider content-position="left">轻度说明弹窗（小程序）</el-divider>
    <el-text type="info" size="small" style="display:block;margin-bottom:12px;">
      关闭开关后对应场景不再弹出说明；文案随小程序配置下发，保存后约 15 分钟内客户端缓存会刷新。
    </el-text>

    <el-form-item label="优惠券说明弹窗">
      <el-switch v-model="modals.coupon_usage.enabled" />
    </el-form-item>
    <el-form-item label="优惠券说明标题">
      <el-input v-model="modals.coupon_usage.title" style="max-width:420px;" />
    </el-form-item>
    <el-form-item label="优惠券说明正文">
      <el-input v-model="modals.coupon_usage.body" type="textarea" :rows="4" placeholder="结算页每日首次进入可弹出，且可点「说明」随时查看" />
    </el-form-item>

    <el-form-item label="积分签到说明弹窗">
      <el-switch v-model="modals.points_checkin.enabled" />
    </el-form-item>
    <el-form-item label="积分签到标题">
      <el-input v-model="modals.points_checkin.title" style="max-width:420px;" />
    </el-form-item>
    <el-form-item label="积分签到正文">
      <el-input v-model="modals.points_checkin.body" type="textarea" :rows="4" placeholder="积分页每日首次进入可弹出" />
    </el-form-item>

    <el-form-item label="新人注册券提示">
      <el-switch v-model="modals.register_coupon.enabled" />
    </el-form-item>
    <el-form-item label="未发到券也提示">
      <el-switch v-model="modals.register_coupon.show_without_coupon" />
    </el-form-item>
    <el-form-item label="注册券标题">
      <el-input v-model="modals.register_coupon.title" style="max-width:420px;" />
    </el-form-item>
    <el-form-item label="注册券正文（未发券或作兜底）">
      <el-input v-model="modals.register_coupon.body" type="textarea" :rows="3" />
    </el-form-item>
    <el-form-item label="已发券时正文（可选）">
      <el-input
        v-model="modals.register_coupon.body_when_issued"
        type="textarea"
        :rows="3"
        placeholder="支持占位符 {count} 表示发放张数"
      />
    </el-form-item>
  </div>
</template>

<script setup>
defineProps({
  modals: {
    type: Object,
    required: true
  }
})
</script>
