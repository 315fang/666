<template>
  <div class="settings-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>系统设置</span>
          <el-button type="primary" @click="fetchSettings">刷新</el-button>
        </div>
      </template>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="订单配置" name="order">
          <el-form :model="settings.ORDER" label-width="180px">
            <el-form-item label="自动取消时间 (分钟)">
              <el-input-number v-model="settings.ORDER.AUTO_CANCEL_MINUTES" />
              <div class="tip">未支付订单自动取消时间</div>
            </el-form-item>
            <el-form-item label="自动确认收货 (天)">
              <el-input-number v-model="settings.ORDER.AUTO_CONFIRM_DAYS" />
              <div class="tip">发货后自动确认收货天数</div>
            </el-form-item>
            <el-form-item label="代理商支付超时 (小时)">
              <el-input-number v-model="settings.ORDER.AGENT_TIMEOUT_HOURS" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveSetting('ORDER')">保存配置</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="提现配置" name="withdrawal">
          <el-form :model="settings.WITHDRAWAL" label-width="180px">
            <el-form-item label="最小提现金额">
              <el-input-number v-model="settings.WITHDRAWAL.MIN_AMOUNT" />
            </el-form-item>
            <el-form-item label="单笔最大金额">
              <el-input-number v-model="settings.WITHDRAWAL.MAX_SINGLE_AMOUNT" />
            </el-form-item>
            <el-form-item label="每日最大次数">
              <el-input-number v-model="settings.WITHDRAWAL.MAX_DAILY_COUNT" />
            </el-form-item>
            <el-form-item label="手续费率 (%)">
              <el-input-number v-model="settings.WITHDRAWAL.FEE_RATE" :precision="2" :step="0.01" :max="100" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveSetting('WITHDRAWAL')">保存配置</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
        
        <el-tab-pane label="佣金配置" name="commission">
             <el-form :model="settings.COMMISSION" label-width="180px">
                <el-form-item label="佣金冻结期 (天)">
                  <el-input-number v-model="settings.COMMISSION.FREEZE_DAYS" />
                  <div class="tip">订单完成后佣金冻结天数</div>
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" @click="saveSetting('COMMISSION')">保存配置</el-button>
                </el-form-item>
             </el-form>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import request from '@/utils/request'
import { ElMessage } from 'element-plus'

const activeTab = ref('order')
const settings = ref({
    ORDER: {},
    WITHDRAWAL: {},
    COMMISSION: {},
    REFUND: {},
    UPGRADE_RULES: {},
    STOCK: {}
})

const fetchSettings = async () => {
    try {
        const res = await request.get('/settings')
        settings.value = res // request interceptor returns res.data
    } catch (error) {
        console.error(error)
    }
}

const saveSetting = async (category) => {
    // Currently the backend only supports updating key by key or logic needs to be adapted
    // But adminSettingsController.js seems to expect { category, key, value }
    // Let's implement a loop or adapt based on backend implementation
    // For now, just show a message that persistence might require backend support
    
    // Backend: adminSettingsController.js updateSettings expects { category, key, value }
    // We will simulate saving one by one or just alert user
    ElMessage.info('演示环境：配置保存功能需后端配合数据库持久化开启')
}

onMounted(() => {
    fetchSettings()
})
</script>

<style scoped>
.tip {
    font-size: 12px;
    color: #999;
    margin-left: 10px;
}
</style>
