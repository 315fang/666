<template>
  <el-dialog :model-value="visible" :title="isEdit ? '编辑奖品' : '新增奖品'" width="min(500px, 94vw)" @update:model-value="emit('update:visible', $event)">
    <el-form ref="internalFormRef" :model="form" label-width="110px">
      <el-form-item label="奖品名称" :rules="[{ required: true, message: '必填' }]" prop="name">
        <el-input v-model="form.name" placeholder="如：谢谢参与 / 积分奖励 / 优惠券" />
      </el-form-item>
      <el-form-item label="奖品类型">
        <el-select v-model="form.type" style="width:min(180px, 100%);">
          <el-option label="未中奖（谢谢参与）" value="miss" />
          <el-option label="积分奖励" value="points" />
          <el-option label="优惠券" value="coupon" />
          <el-option label="货款奖励" value="goods_fund" />
          <el-option label="实物商品" value="physical" />
          <el-option label="神秘大奖" value="mystery" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="['points', 'goods_fund'].includes(form.type)" label="奖品价值">
        <el-input-number v-model="form.prize_value" :min="0" :precision="2" />
        <span style="margin-left:8px;font-size:12px;color:#909399;">{{ form.type === 'points' ? '积分数' : '货款金额(元)' }}</span>
      </el-form-item>
      <template v-if="form.type === 'coupon'">
        <el-form-item label="券金额">
          <el-input-number v-model="form.coupon_amount" :min="0" :precision="2" />
          <span style="margin-left:8px;font-size:12px;color:#909399;">固定金额券，直接发到券包</span>
        </el-form-item>
        <el-form-item label="使用门槛">
          <el-input-number v-model="form.coupon_min_purchase" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="有效天数">
          <el-input-number v-model="form.coupon_valid_days" :min="1" :precision="0" />
        </el-form-item>
        <el-form-item label="适用范围">
          <el-select v-model="form.coupon_scope" style="width:min(220px, 100%);">
            <el-option label="全场通用" value="all" />
            <el-option label="指定商品" value="product" />
            <el-option label="指定分类" value="category" />
          </el-select>
        </el-form-item>
        <el-form-item label="范围ID">
          <el-input v-model="form.coupon_scope_ids_text" type="textarea" :rows="2" placeholder="商品ID或分类ID，逗号/换行分隔；全场通用可留空" />
        </el-form-item>
      </template>
      <template v-if="form.type === 'goods_fund'">
        <el-form-item label="可领层级">
          <el-checkbox-group v-model="form.eligible_role_levels">
            <el-checkbox :label="3">B1</el-checkbox>
            <el-checkbox :label="4">B2</el-checkbox>
            <el-checkbox :label="5">B3</el-checkbox>
            <el-checkbox :label="6">店长</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="非代理处理">
          <el-tag type="warning">自动折算积分发放</el-tag>
        </el-form-item>
      </template>
      <template v-if="['physical', 'mystery'].includes(form.type)">
        <el-form-item label="需领奖">
          <el-switch v-model="form.claim_required" />
        </el-form-item>
        <el-form-item label="领奖说明">
          <el-input v-model="form.claim_instruction" type="textarea" :rows="2" placeholder="如：请填写收货地址，后台审核后发放" />
        </el-form-item>
        <el-form-item label="领奖时限">
          <el-input-number v-model="form.claim_deadline_days" :min="0" :precision="0" />
          <span style="margin-left:8px;font-size:12px;color:#909399;">0 表示不限制</span>
        </el-form-item>
        <el-form-item label="需要发货" v-if="form.type === 'physical'">
          <el-switch v-model="form.shipping_required" />
        </el-form-item>
        <el-form-item label="履约方式" v-else>
          <el-tag type="info">人工兑奖，不自动发货</el-tag>
        </el-form-item>
      </template>
      <el-form-item label="消耗积分">
        <el-input-number v-model="form.cost_points" :min="1" />
        <span style="margin-left:8px;font-size:12px;color:#909399;">每次抽奖消耗</span>
      </el-form-item>
      <el-form-item label="中奖概率%">
        <el-input-number v-model="form.probability" :min="0" :max="100" :precision="2" />
        <span style="margin-left:8px;font-size:12px;color:#909399;">当前总：{{ totalProbability.toFixed(1) }}%</span>
      </el-form-item>
      <el-form-item label="库存">
        <el-input-number v-model="form.stock" :min="-1" />
        <span style="margin-left:8px;font-size:12px;color:#909399;">-1=无限</span>
      </el-form-item>
      <el-form-item label="转盘位置">
        <el-input-number v-model="form.sort_order" :min="0" :max="7" />
        <span style="margin-left:8px;font-size:12px;color:#909399;">0-7格，顺时针</span>
      </el-form-item>
      <el-form-item label="奖品图片">
        <el-upload :show-file-list="false" :http-request="handlePrizeUpload" :before-upload="beforeUpload" accept="image/*">
          <el-image v-if="form.image_url" :src="form.image_url" style="width:64px;height:64px;border-radius:6px;" fit="cover" />
          <el-button v-else size="small">上传图片</el-button>
        </el-upload>
        <div v-if="form.file_id" style="font-size:12px;color:#909399;margin-top:6px;">
          file_id: {{ form.file_id }}
        </div>
      </el-form-item>
      <el-form-item label="展示 Emoji">
        <el-input v-model="form.display_emoji" maxlength="8" style="width:min(180px, 100%);" placeholder="如：🎁 / ⭐ / 🎫" />
        <span style="margin-left:8px;font-size:12px;color:#909399;">小程序奖池卡片和结果弹窗会优先使用这里的图标</span>
      </el-form-item>
      <el-form-item label="展示标签">
        <el-input v-model="form.badge_text" maxlength="12" style="width:220px;" placeholder="如：积分奖 / 优惠券 / 好运签" />
      </el-form-item>
      <el-form-item label="主色 / 辅色">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <el-color-picker v-model="form.theme_color" />
          <el-input v-model="form.theme_color" style="width:110px;" placeholder="#2563EB" />
          <el-color-picker v-model="form.accent_color" />
          <el-input v-model="form.accent_color" style="width:110px;" placeholder="#93C5FD" />
        </div>
      </el-form-item>
      <el-form-item label="样式预览">
        <div
          style="min-width:220px;padding:14px 16px;border-radius:14px;color:#fff;display:flex;align-items:center;gap:10px;"
          :style="{ background: `linear-gradient(135deg, ${form.theme_color || '#6B7280'}, ${form.accent_color || '#D1D5DB'})` }"
        >
          <span style="font-size:22px;">{{ form.display_emoji || '🎁' }}</span>
          <div style="display:flex;flex-direction:column;">
            <span style="font-size:12px;opacity:.9;">{{ form.badge_text || '奖品标签' }}</span>
            <span style="font-weight:600;">{{ form.name || '奖品名称预览' }}</span>
          </div>
        </div>
      </el-form-item>
      <el-form-item label="是否启用">
        <el-switch v-model="form.is_active" :active-value="1" :inactive-value="0" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="emit('submit')">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  visible: { type: Boolean, default: false },
  isEdit: { type: Boolean, default: false },
  form: { type: Object, required: true },
  totalProbability: { type: Number, default: 0 },
  submitting: { type: Boolean, default: false },
  handlePrizeUpload: { type: Function, required: true },
  beforeUpload: { type: Function, required: true }
})

const emit = defineEmits(['update:visible', 'submit'])
const internalFormRef = ref()

defineExpose({
  validate: (...args) => internalFormRef.value?.validate?.(...args)
})
</script>
