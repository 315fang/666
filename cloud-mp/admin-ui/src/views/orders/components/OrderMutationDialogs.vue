<template>
  <el-dialog :model-value="shipVisible" title="订单发货" width="400px" @update:model-value="emit('update:shipVisible', $event)">
    <el-form :model="shipForm" label-width="80px">
      <el-form-item label="履约方式">
        <el-tag :type="shipForm.fulfillment_type === 'agent' ? 'warning' : 'primary'">
          {{ shipFulfillmentLabel }}
        </el-tag>
      </el-form-item>
      <el-alert
        :title="logisticsMode === 'manual' ? '当前为手工发货模式，不会调用第三方物流轨迹查询。' : '当前为第三方物流模式，请尽量填写标准物流信息。'"
        type="info"
        :closable="false"
        style="margin-bottom:12px"
      />
      <el-form-item label="快递公司">
        <el-select
          v-model="shipForm.logistics_company"
          filterable
          allow-create
          clearable
          default-first-option
          :reserve-keyword="false"
          style="width:100%"
          :placeholder="logisticsMode === 'manual' ? '选择或输入承运方，如顺丰速运 / 同城配送' : '选择或输入快递公司，如顺丰速运'"
        >
          <el-option
            v-for="company in shippingCompanyOptions"
            :key="company"
            :label="company"
            :value="company"
          />
        </el-select>
        <div class="text-secondary" style="font-size:12px; line-height:1.6; margin-top:6px;">
          支持直接输入新公司；发货成功后会自动记住{{ canManageSettings ? '并同步到共享配置' : '' }}。
        </div>
      </el-form-item>
      <el-form-item label="快递单号">
        <el-input v-model="shipForm.tracking_no" :placeholder="logisticsMode === 'manual' ? '输入运单号或手工单号' : '输入快递单号'" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:shipVisible', false)">取消</el-button>
      <el-button type="primary" :loading="submittingShip" @click="emit('submitShip')">确认发货</el-button>
    </template>
  </el-dialog>

  <el-dialog :model-value="amountVisible" title="修改订单金额" width="400px" @update:model-value="emit('update:amountVisible', $event)">
    <el-form :model="amountForm" label-width="90px">
      <el-form-item label="当前金额">
        <span style="color:#f56c6c; font-weight:bold; font-size:16px">¥{{ money(currentOrder?.pay_amount) }}</span>
      </el-form-item>
      <el-form-item label="新金额">
        <el-input-number v-model="amountForm.pay_amount" :min="0" :precision="2" style="width:100%" />
      </el-form-item>
      <el-form-item label="调整原因">
        <el-input v-model="amountForm.reason" placeholder="如：客服协商改价" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:amountVisible', false)">取消</el-button>
      <el-button type="primary" :loading="submittingAmount" @click="emit('submitAmount')">确认修改</el-button>
    </template>
  </el-dialog>

  <el-dialog :model-value="remarkVisible" title="添加内部备注" width="400px" @update:model-value="emit('update:remarkVisible', $event)">
    <el-form>
      <el-input
        :model-value="remarkText"
        type="textarea"
        :rows="4"
        placeholder="备注内容仅管理员可见，会追加到已有内部备注末尾"
        @update:model-value="emit('update:remarkText', $event)"
      />
    </el-form>
    <template #footer>
      <el-button @click="emit('update:remarkVisible', false)">取消</el-button>
      <el-button type="primary" :loading="submittingRemark" @click="emit('submitRemark')">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog
    :model-value="visibilityVisible"
    :title="visibilityForm.visibility === 'hidden' ? '移入订单清理箱' : '移出订单清理箱'"
    width="440px"
    @update:model-value="emit('update:visibilityVisible', $event)"
  >
    <el-form :model="visibilityForm" label-width="90px">
      <el-form-item label="清理分类" required>
        <el-select v-model="visibilityForm.cleanup_category" :disabled="visibilityForm.visibility === 'visible'" style="width:100%">
          <el-option v-for="item in cleanupCategoryOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="操作原因" required>
        <el-input v-model="visibilityForm.reason" type="textarea" :rows="3" maxlength="200" show-word-limit />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visibilityVisible', false)">取消</el-button>
      <el-button
        :type="visibilityForm.visibility === 'hidden' ? 'warning' : 'primary'"
        :loading="submittingVisibility"
        @click="emit('submitVisibility')"
      >
        {{ visibilityForm.visibility === 'hidden' ? '移入清理箱' : '恢复显示' }}
      </el-button>
    </template>
  </el-dialog>

  <el-dialog
    :model-value="forceVisible"
    :title="forceType === 'complete' ? '强制完成订单' : '强制取消订单'"
    width="400px"
    @update:model-value="emit('update:forceVisible', $event)"
  >
    <el-alert v-if="forceType === 'cancel'" title="取消订单将自动发起退款，不可逆操作！" type="error" :closable="false" style="margin-bottom:15px" />
    <el-form :model="forceForm" label-width="90px">
      <el-form-item label="操作原因" required>
        <el-input v-model="forceForm.reason" placeholder="必填项" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:forceVisible', false)">取消</el-button>
      <el-button :type="forceType === 'cancel' ? 'danger' : 'warning'" :loading="submittingForce" @click="emit('submitForce')">确认</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
defineProps({
  shipVisible: { type: Boolean, default: false },
  amountVisible: { type: Boolean, default: false },
  remarkVisible: { type: Boolean, default: false },
  visibilityVisible: { type: Boolean, default: false },
  forceVisible: { type: Boolean, default: false },
  shipForm: { type: Object, required: true },
  amountForm: { type: Object, required: true },
  visibilityForm: { type: Object, required: true },
  forceForm: { type: Object, required: true },
  currentOrder: { type: Object, default: null },
  remarkText: { type: String, default: '' },
  forceType: { type: String, default: '' },
  shipFulfillmentLabel: { type: String, default: '' },
  logisticsMode: { type: String, default: 'third_party' },
  shippingCompanyOptions: { type: Array, default: () => [] },
  cleanupCategoryOptions: { type: Array, default: () => [] },
  canManageSettings: { type: Boolean, default: false },
  submittingShip: { type: Boolean, default: false },
  submittingAmount: { type: Boolean, default: false },
  submittingRemark: { type: Boolean, default: false },
  submittingVisibility: { type: Boolean, default: false },
  submittingForce: { type: Boolean, default: false },
  money: { type: Function, required: true }
})

const emit = defineEmits([
  'update:shipVisible',
  'update:amountVisible',
  'update:remarkVisible',
  'update:remarkText',
  'update:visibilityVisible',
  'update:forceVisible',
  'submitShip',
  'submitAmount',
  'submitRemark',
  'submitVisibility',
  'submitForce'
])
</script>
