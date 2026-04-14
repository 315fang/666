<!--
  UserBalanceAdjustDialog.vue
  统一账户调整弹窗：货款余额 / 佣金 / 积分 / 成长值
-->
<template>
  <el-dialog
    :model-value="visible"
    title="账户调整（货款 / 佣金 / 积分 / 成长值）"
    width="480px"
    @update:model-value="emit('update:visible', $event)"
    @close="resetForm"
  >
    <el-form :model="form" ref="formRef" label-width="90px">
      <!-- 用户信息 -->
      <el-form-item label="用户">
        <div class="user-info-row">
          <el-tag size="small" :type="roleTagType(user?.role_level)" style="margin-right:8px">
            {{ roleText(user?.role_level) }}
          </el-tag>
          <span class="user-name">{{ displayName(user) }}</span>
        </div>
      </el-form-item>

      <!-- 账户类型 -->
      <el-form-item label="调整账户" prop="account">
        <el-select v-model="form.account" style="width:100%" @change="onAccountChange">
          <el-option value="goods_fund" label="💰 货款余额">
            <span>💰 货款余额</span>
            <span class="opt-hint">代理商下单时可使用</span>
          </el-option>
          <el-option value="commission" label="🏆 佣金">
            <span>🏆 佣金</span>
            <span class="opt-hint">插入佣金记录，申请提现后需审核</span>
          </el-option>
          <el-option value="points" label="⭐ 积分">
            <span>⭐ 积分</span>
            <span class="opt-hint">下单抵扣，1积分=0.1元</span>
          </el-option>
          <el-option value="growth" label="📈 成长值">
            <span>📈 成长值</span>
            <span class="opt-hint">影响会员等级和权益</span>
          </el-option>
        </el-select>
      </el-form-item>

      <!-- 当前值 -->
      <el-form-item label="当前值">
        <span class="current-value">{{ currentValueDisplay }}</span>
      </el-form-item>

      <!-- 操作类型 -->
      <el-form-item label="操作" prop="type">
        <el-radio-group v-model="form.type">
          <el-radio value="add">增加（+）</el-radio>
          <el-radio value="subtract">扣减（-）</el-radio>
        </el-radio-group>
      </el-form-item>

      <!-- 金额/数量 -->
      <el-form-item :label="amountLabel" prop="amount" :rules="amountRules">
        <el-input-number
          v-model="form.amount"
          :min="isIntegerAccount ? 1 : 0.01"
          :precision="isIntegerAccount ? 0 : 2"
          :step="isIntegerAccount ? 1 : 1"
          style="width:100%"
        />
        <div class="form-hint">{{ amountHint }}</div>
      </el-form-item>

      <!-- 原因 -->
      <el-form-item label="原因" prop="reason" :rules="[{ required: true, message: '请填写原因' }]">
        <el-input
          v-model="form.reason"
          placeholder="请填写操作原因，将记入操作日志"
          maxlength="100"
          show-word-limit
        />
      </el-form-item>

      <!-- 预览 -->
      <el-form-item label="">
        <el-alert :type="form.type === 'add' ? 'success' : 'warning'" :closable="false" show-icon>
          <template #title>
            <span v-if="form.type === 'add'">
              操作后：{{ currentRawValue }} + {{ form.amount || 0 }} = <strong>{{ previewValue }}</strong> {{ unit }}
            </span>
            <span v-else>
              操作后：{{ currentRawValue }} - {{ form.amount || 0 }} = <strong>{{ previewValue }}</strong> {{ unit }}（最低 0）
            </span>
          </template>
        </el-alert>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">确认操作</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getUserNickname } from '@/utils/userDisplay'
import {
  adjustUserGoodsFund,
  adjustUserPoints,
  adjustUserGrowth,
  adjustUserCommission
} from '@/api'

const VALID_ACCOUNTS = ['goods_fund', 'commission', 'points', 'growth']

const props = defineProps({
  visible:      { type: Boolean, default: false },
  user:         { type: Object, default: null },
  initAccount:  { type: String, default: 'goods_fund' },
  roleText:     { type: Function, required: true },
  roleTagType:  { type: Function, required: true }
})
const emit = defineEmits(['update:visible', 'success'])

const formRef = ref(null)
const submitting = ref(false)
const form = ref({ account: 'goods_fund', type: 'add', amount: null, reason: '' })

// 当弹窗打开时，根据 initAccount 预选账户类型
watch(() => props.visible, (val) => {
  if (val) {
    form.value.account = VALID_ACCOUNTS.includes(props.initAccount) ? props.initAccount : 'goods_fund'
  }
})

const displayName = (u) => getUserNickname(u || {}, '-')

// 是否整数类型账户（积分/成长值必须整数）
const isIntegerAccount = computed(() => ['points', 'growth'].includes(form.value.account))

// 当前值（从 user 对象读）
const currentRawValue = computed(() => {
  const u = props.user
  if (!u) return 0
  const map = {
    goods_fund: u.goods_fund_balance ?? u.agent_wallet_balance ?? u.wallet_balance ?? 0,
    commission: u.commission_balance ?? u.balance ?? 0,
    points:     u.points ?? 0,
    growth:     u.growth_value ?? 0
  }
  return Number(map[form.value.account] || 0)
})

const currentValueDisplay = computed(() => {
  const v = currentRawValue.value
  if (isIntegerAccount.value) return `${v} ${unit.value}`
  return `¥${v.toFixed(2)}`
})

const unit = computed(() => {
  return { goods_fund: '元', commission: '元', points: '积分', growth: '成长值' }[form.value.account] || ''
})

const amountLabel = computed(() => {
  return { goods_fund: '金额（元）', commission: '金额（元）', points: '积分数', growth: '成长值' }[form.value.account] || '数量'
})

const amountHint = computed(() => {
  const map = {
    goods_fund: '货款余额直接变动，代理商下单时可使用',
    commission: '将插入一条 pending_approval 状态的佣金记录，用户申请提现后需审核',
    points:     '必须为正整数，1积分=0.1元，下单可抵扣最多70%',
    growth:     '必须为正整数，影响会员等级'
  }
  return map[form.value.account] || ''
})

const amountRules = computed(() => {
  if (isIntegerAccount.value) {
    return [{ required: true, type: 'integer', min: 1, message: '请输入正整数', trigger: 'blur' }]
  }
  return [{ required: true, type: 'number', min: 0.01, message: '请输入有效金额', trigger: 'blur' }]
})

const previewValue = computed(() => {
  const cur = currentRawValue.value
  const amt = Number(form.value.amount) || 0
  const next = form.value.type === 'add' ? cur + amt : Math.max(0, cur - amt)
  return isIntegerAccount.value ? Math.round(next) : next.toFixed(2)
})

// 切换账户类型时重置金额
const onAccountChange = () => {
  form.value.amount = null
}

// 关闭时重置
const resetForm = () => {
  form.value = { account: 'goods_fund', type: 'add', amount: null, reason: '' }
  formRef.value?.clearValidate()
}

// 用户切换时同步重置
watch(() => props.user, () => {
  if (props.visible) resetForm()
})

const API_MAP = {
  goods_fund: adjustUserGoodsFund,
  points:     adjustUserPoints,
  growth:     adjustUserGrowth,
  commission: adjustUserCommission
}

const handleSubmit = async () => {
  try {
    await formRef.value?.validate()
  } catch {
    ElMessage.warning('请检查填写项')
    return
  }
  if (!props.user?.id) return ElMessage.error('未找到用户信息')
  submitting.value = true
  try {
    const fn = API_MAP[form.value.account]
    await fn(props.user.id, {
      type:   form.value.type,
      amount: form.value.amount,
      reason: form.value.reason.trim()
    })
    const labelMap = { goods_fund: '货款余额', commission: '佣金', points: '积分', growth: '成长值' }
    ElMessage.success(`${labelMap[form.value.account]}调整成功`)
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    ElMessage.error(e?.message || '操作失败，请重试')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.user-info-row { display: flex; align-items: center; }
.user-name { font-size: 14px; color: #303133; }
.current-value { font-size: 16px; font-weight: 600; color: #303133; }
.opt-hint { font-size: 11px; color: #909399; margin-left: 8px; }
.form-hint { font-size: 12px; color: #909399; margin-top: 4px; line-height: 1.5; }
</style>
