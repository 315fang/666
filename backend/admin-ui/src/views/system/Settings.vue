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
        <!-- 存储配置 (新增) -->
        <el-tab-pane label="存储配置" name="storage">
            <el-form :model="storageConfig" label-width="150px" v-loading="storageLoading">
                <el-form-item label="存储提供商">
                    <el-select v-model="storageConfig.provider">
                        <el-option label="本地存储" value="local"></el-option>
                        <el-option label="阿里云 OSS" value="aliyun"></el-option>
                        <el-option label="腾讯云 COS" value="tencent"></el-option>
                        <el-option label="七牛云" value="qiniu"></el-option>
                        <el-option label="MinIO" value="minio"></el-option>
                    </el-select>
                </el-form-item>

                <!-- 阿里云配置 -->
                <div v-if="storageConfig.provider === 'aliyun'">
                    <el-divider content-position="left">阿里云 OSS 配置</el-divider>
                    <el-form-item label="AccessKey ID">
                        <el-input v-model="storageConfig.aliyun.accessKeyId" show-password></el-input>
                    </el-form-item>
                    <el-form-item label="AccessKey Secret">
                        <el-input v-model="storageConfig.aliyun.accessKeySecret" show-password></el-input>
                    </el-form-item>
                    <el-form-item label="Bucket">
                        <el-input v-model="storageConfig.aliyun.bucket"></el-input>
                    </el-form-item>
                    <el-form-item label="Region">
                        <el-input v-model="storageConfig.aliyun.region" placeholder="oss-cn-hangzhou"></el-input>
                    </el-form-item>
                     <el-form-item label="Endpoint">
                        <el-input v-model="storageConfig.aliyun.endpoint"></el-input>
                    </el-form-item>
                    <el-form-item label="自定义域名">
                        <el-input v-model="storageConfig.aliyun.customDomain"></el-input>
                    </el-form-item>
                </div>

                <!-- 腾讯云配置 -->
                <div v-if="storageConfig.provider === 'tencent'">
                    <el-divider content-position="left">腾讯云 COS 配置</el-divider>
                    <el-form-item label="SecretId">
                        <el-input v-model="storageConfig.tencent.secretId" show-password></el-input>
                    </el-form-item>
                    <el-form-item label="SecretKey">
                        <el-input v-model="storageConfig.tencent.secretKey" show-password></el-input>
                    </el-form-item>
                    <el-form-item label="Bucket">
                        <el-input v-model="storageConfig.tencent.bucket"></el-input>
                    </el-form-item>
                    <el-form-item label="Region">
                        <el-input v-model="storageConfig.tencent.region" placeholder="ap-guangzhou"></el-input>
                    </el-form-item>
                </div>

                <!-- 按钮 -->
                <el-form-item>
                    <el-button type="primary" @click="saveStorageConfig">保存存储配置</el-button>
                    <el-button @click="testStorageConfig">测试连接</el-button>
                </el-form-item>
            </el-form>
        </el-tab-pane>

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

const activeTab = ref('storage')
const settings = ref({
    ORDER: {},
    WITHDRAWAL: {},
    COMMISSION: {},
    REFUND: {},
    UPGRADE_RULES: {},
    STOCK: {}
})

// 存储配置
const storageLoading = ref(false)
const storageConfig = ref({
    provider: 'local',
    aliyun: {},
    tencent: {},
    qiniu: {},
    minio: {}
})

onMounted(() => {
    fetchSettings()
    fetchStorageConfig()
})

const fetchSettings = async () => {
    try {
        const res = await request.get('/settings')
        if (res.code === 0) {
            settings.value = res.data
        }
    } catch (error) {
        console.error(error)
    }
}

const fetchStorageConfig = async () => {
    storageLoading.value = true
    try {
        const res = await request.get('/storage/config')
        if (res.code === 0) {
            storageConfig.value = res.data
        }
    } catch (error) {
        console.error(error)
    } finally {
        storageLoading.value = false
    }
}

const saveSetting = async (category) => {
    try {
        const data = {
            category,
            settings: settings.value[category]
        }
        const res = await request.put('/settings', data)
        if (res.code === 0) {
            ElMessage.success('配置已保存')
        }
    } catch (error) {
        ElMessage.error('保存失败')
    }
}

const saveStorageConfig = async () => {
    try {
        const res = await request.put('/storage/config', storageConfig.value)
        if (res.code === 0) {
            ElMessage.success('存储配置已保存')
        }
    } catch (error) {
        ElMessage.error('保存失败')
    }
}

const testStorageConfig = async () => {
    try {
        const res = await request.post('/storage/test', storageConfig.value)
        if (res.code === 0) {
            ElMessage.success('连接测试成功')
        }
    } catch (error) {
        ElMessage.error(error.message || '连接测试失败')
    }
}
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.tip {
  font-size: 12px;
  color: #999;
  line-height: 1.5;
  margin-top: 5px;
}
</style>
