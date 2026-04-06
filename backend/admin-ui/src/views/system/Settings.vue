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
        <!-- AI配置 (新增) -->
        <el-tab-pane label="AI配置" name="ai">
          <el-form :model="aiConfig" label-width="150px" v-loading="aiLoading">
            <!-- 启用开关 -->
            <el-form-item label="启用AI功能">
              <el-switch v-model="aiConfig.AI_ENABLED" active-value="true" inactive-value="false" />
              <span class="status-text" :class="{ enabled: aiConfig.AI_ENABLED === 'true' && aiConfig._hasApiKey }">
                {{ getAiStatusText() }}
              </span>
            </el-form-item>

            <!-- 服务商选择 -->
            <el-form-item label="AI服务商">
              <el-select v-model="aiConfig.AI_PROVIDER" :disabled="aiConfig.AI_ENABLED !== 'true'" @change="onProviderChange">
                <el-option label="智谱AI (推荐)" value="zhipu">
                  <span>智谱AI</span>
                  <span class="provider-tip">免费额度1000万token/月</span>
                </el-option>
                <el-option label="通义千问" value="qwen">
                  <span>通义千问</span>
                  <span class="provider-tip">阿里云，免费额度</span>
                </el-option>
                <el-option label="DeepSeek" value="deepseek">
                  <span>DeepSeek</span>
                  <span class="provider-tip">最便宜，¥0.001/千token</span>
                </el-option>
                <el-option label="OpenRouter" value="openrouter">
                  <span>OpenRouter</span>
                  <span class="provider-tip">多模型聚合平台</span>
                </el-option>
                <el-option label="ModelScope" value="modelscope">
                  <span>ModelScope</span>
                  <span class="provider-tip">阿里云模型平台</span>
                </el-option>
                <el-option label="OpenAI" value="openai">
                  <span>OpenAI</span>
                  <span class="provider-tip">标准GPT模型</span>
                </el-option>
                <el-option label="自定义" value="custom">
                  <span>自定义</span>
                  <span class="provider-tip">自定义API端点</span>
                </el-option>
              </el-select>
            </el-form-item>

            <!-- API密钥 -->
            <el-form-item label="API密钥">
              <el-input
                v-model="aiConfig.AI_API_KEY"
                type="password"
                show-password
                placeholder="请输入API密钥"
                :disabled="aiConfig.AI_ENABLED !== 'true'"
              />
              <div class="tip">
                <template v-if="aiConfig.AI_PROVIDER === 'zhipu'">
                  获取地址: <a href="https://open.bigmodel.cn" target="_blank">open.bigmodel.cn</a>
                </template>
                <template v-else-if="aiConfig.AI_PROVIDER === 'qwen'">
                  获取地址: <a href="https://dashscope.console.aliyun.com" target="_blank">dashscope.console.aliyun.com</a>
                </template>
                <template v-else-if="aiConfig.AI_PROVIDER === 'deepseek'">
                  获取地址: <a href="https://platform.deepseek.com" target="_blank">platform.deepseek.com</a>
                </template>
                <template v-else-if="aiConfig.AI_PROVIDER === 'openrouter'">
                  获取地址: <a href="https://openrouter.ai/keys" target="_blank">openrouter.ai/keys</a>
                </template>
                <template v-else-if="aiConfig.AI_PROVIDER === 'modelscope'">
                  获取地址: <a href="https://modelscope.cn/my/myaccesstoken" target="_blank">modelscope.cn</a>
                </template>
                <template v-else-if="aiConfig.AI_PROVIDER === 'openai'">
                  获取地址: <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a>
                </template>
              </div>
            </el-form-item>

            <!-- 自定义端点 -->
            <el-form-item label="API地址" v-if="aiConfig.AI_PROVIDER === 'custom'">
              <el-input
                v-model="aiConfig.AI_API_ENDPOINT"
                placeholder="https://api.example.com/v1/chat/completions"
                :disabled="aiConfig.AI_ENABLED !== 'true'"
              />
            </el-form-item>

            <!-- 模型选择 -->
            <el-form-item label="AI模型">
              <el-select v-model="aiConfig.AI_MODEL" :disabled="aiConfig.AI_ENABLED !== 'true'" filterable allow-create>
                <el-option
                  v-for="model in currentProviderModels"
                  :key="model"
                  :label="model"
                  :value="model"
                />
              </el-select>
            </el-form-item>

            <!-- 功能开关 -->
            <el-divider content-position="left">功能开关</el-divider>

            <el-form-item label="AI客服对话">
              <el-switch
                v-model="aiConfig.AI_CHAT_ENABLED"
                active-value="true"
                inactive-value="false"
                :disabled="aiConfig.AI_ENABLED !== 'true'"
              />
              <div class="tip">小程序端AI客服功能</div>
            </el-form-item>

            <el-form-item label="AI运维监控">
              <el-switch
                v-model="aiConfig.AI_OPS_ENABLED"
                active-value="true"
                inactive-value="false"
                :disabled="aiConfig.AI_ENABLED !== 'true'"
              />
              <div class="tip">自动错误检测、系统监控、异常告警</div>
            </el-form-item>

            <el-form-item label="管理员AI助手">
              <el-switch
                v-model="aiConfig.AI_ADMIN_ASSISTANT_ENABLED"
                active-value="true"
                inactive-value="false"
                :disabled="aiConfig.AI_ENABLED !== 'true'"
              />
              <div class="tip">管理后台AI助手，可查日志、看统计等</div>
            </el-form-item>

            <!-- 高级配置 -->
            <el-divider content-position="left">高级配置</el-divider>

            <el-form-item label="最大Token数">
              <el-input-number
                v-model="aiConfig.AI_MAX_TOKENS"
                :min="100"
                :max="8000"
                :step="100"
                :disabled="aiConfig.AI_ENABLED !== 'true'"
              />
              <div class="tip">单次对话最大输出长度</div>
            </el-form-item>

            <el-form-item label="温度参数">
              <el-slider
                v-model="aiConfig.AI_TEMPERATURE"
                :min="0"
                :max="1"
                :step="0.1"
                :disabled="aiConfig.AI_ENABLED !== 'true'"
                show-input
              />
              <div class="tip">0=精确，1=创意，建议0.7</div>
            </el-form-item>

            <el-form-item label="超时时间(ms)">
              <el-input-number
                v-model="aiConfig.AI_TIMEOUT"
                :min="5000"
                :max="60000"
                :step="1000"
                :disabled="aiConfig.AI_ENABLED !== 'true'"
              />
            </el-form-item>

            <!-- 按钮 -->
            <el-form-item>
              <el-button type="primary" @click="saveAiConfig">保存AI配置</el-button>
              <el-button @click="testAiConfig" :loading="aiTesting">测试连接</el-button>
              <el-button @click="resetAiConfig" type="danger" plain>重置默认</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 存储配置 -->
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

        <el-tab-pane label="规则公告" name="rules">
          <el-form label-width="180px">
            <el-form-item label="标题">
              <el-input v-model="rulesConfig.RULES_TITLE" placeholder="请输入规则标题" />
            </el-form-item>
            <el-form-item label="摘要">
              <el-input v-model="rulesConfig.RULES_SUMMARY" type="textarea" :rows="3" placeholder="一句话说明规则要点" />
            </el-form-item>
            <el-form-item label="详细规则">
              <el-input v-model="rulesEditor" type="textarea" :rows="6" placeholder="每行一条规则" />
              <div class="tip">每行一条，保存后会转为列表展示</div>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveRules">保存规则说明</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import request from '@/utils/request'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getRules, updateRules } from '@/api/rules'

const activeTab = ref('ai')
const settings = ref({
  ORDER: {},
  WITHDRAWAL: {},
  COMMISSION: {},
  REFUND: {},
  UPGRADE_RULES: {},
  STOCK: {}
})

const rulesConfig = ref({
  RULES_TITLE: '发货与佣金规则说明',
  RULES_SUMMARY: '',
  RULES_DETAILS: []
})

const rulesEditor = ref('')

// 存储配置
const storageLoading = ref(false)
const storageConfig = ref({
  provider: 'local',
  aliyun: {},
  tencent: {},
  qiniu: {},
  minio: {}
})

// AI配置
const aiLoading = ref(false)
const aiTesting = ref(false)
const aiConfig = ref({
  AI_ENABLED: 'false',
  AI_PROVIDER: 'zhipu',
  AI_API_KEY: '',
  AI_API_ENDPOINT: '',
  AI_MODEL: 'glm-4-flash',
  AI_CHAT_ENABLED: 'true',
  AI_OPS_ENABLED: 'true',
  AI_ADMIN_ASSISTANT_ENABLED: 'true',
  AI_MAX_TOKENS: '2000',
  AI_TEMPERATURE: '0.7',
  AI_TIMEOUT: '30000',
  _hasApiKey: false
})

// 服务商预设模型
const providerModels = {
  zhipu: ['glm-4-flash', 'glm-4', 'glm-4-plus', 'glm-4-air', 'glm-4-airx'],
  qwen: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-max-longcontext'],
  deepseek: ['deepseek-chat', 'deepseek-coder'],
  openrouter: [
    'openai/gpt-4o-mini',
    'openai/gpt-4o',
    'anthropic/claude-3-haiku',
    'anthropic/claude-3-sonnet',
    'google/gemini-flash-1.5',
    'meta-llama/llama-3-8b-instruct',
    'qwen/qwen-2-7b-instruct'
  ],
  modelscope: ['qwen-turbo', 'qwen-plus', 'chatglm3-6b', 'baichuan2-13b-chat'],
  openai: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini'],
  custom: []
}

// 当前服务商可用模型
const currentProviderModels = computed(() => {
  return providerModels[aiConfig.value.AI_PROVIDER] || []
})

// AI状态文本
const getAiStatusText = () => {
  if (aiConfig.value.AI_ENABLED !== 'true') return '未启用'
  if (!aiConfig.value._hasApiKey) return '未配置API密钥'
  return '已启用'
}

// 服务商切换时更新默认模型
const onProviderChange = (provider) => {
  const defaultModels = {
    zhipu: 'glm-4-flash',
    qwen: 'qwen-turbo',
    deepseek: 'deepseek-chat',
    openrouter: 'openai/gpt-4o-mini',
    modelscope: 'qwen-turbo',
    openai: 'gpt-4o-mini',
    custom: ''
  }
  aiConfig.value.AI_MODEL = defaultModels[provider] || ''
}

onMounted(() => {
  fetchSettings()
  fetchStorageConfig()
  fetchRules()
  fetchAiConfig()
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

const fetchAiConfig = async () => {
  aiLoading.value = true
  try {
    const res = await request.get('/ai/config')
    if (res.code === 0) {
      aiConfig.value = { ...aiConfig.value, ...res.data.config }
    }
  } catch (error) {
    console.error(error)
  } finally {
    aiLoading.value = false
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

const saveAiConfig = async () => {
  try {
    const res = await request.put('/ai/config', aiConfig.value)
    if (res.code === 0) {
      ElMessage.success('AI配置已保存并立即生效')
      fetchAiConfig()
    }
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

const testAiConfig = async () => {
  aiTesting.value = true
  try {
    const res = await request.post('/ai/test', {
      apiKey: aiConfig.value.AI_API_KEY,
      provider: aiConfig.value.AI_PROVIDER,
      apiEndpoint: aiConfig.value.AI_API_ENDPOINT,
      model: aiConfig.value.AI_MODEL
    })
    if (res.code === 0) {
      ElMessage.success(`连接测试成功！模型: ${res.data.model}`)
    } else {
      ElMessage.error(res.message || '连接测试失败')
    }
  } catch (error) {
    ElMessage.error(error.message || '连接测试失败')
  } finally {
    aiTesting.value = false
  }
}

const resetAiConfig = async () => {
  try {
    await ElMessageBox.confirm('确定要重置AI配置为默认值吗？', '确认重置', {
      type: 'warning'
    })
    const res = await request.post('/ai/reset')
    if (res.code === 0) {
      ElMessage.success('AI配置已重置')
      fetchAiConfig()
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('重置失败')
    }
  }
}

const fetchRules = async () => {
  try {
    const res = await getRules()
    if (res.code === 0) {
      const data = res.data || {}
      rulesConfig.value = {
        RULES_TITLE: data.RULES_TITLE || '发货与佣金规则说明',
        RULES_SUMMARY: data.RULES_SUMMARY || '',
        RULES_DETAILS: Array.isArray(data.RULES_DETAILS) ? data.RULES_DETAILS : []
      }
      rulesEditor.value = rulesConfig.value.RULES_DETAILS.join('\n')
    }
  } catch (error) {
    console.error(error)
  }
}

const saveRules = async () => {
  try {
    const details = rulesEditor.value
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)

    const payload = {
      RULES_TITLE: rulesConfig.value.RULES_TITLE,
      RULES_SUMMARY: rulesConfig.value.RULES_SUMMARY,
      RULES_DETAILS: details
    }

    const res = await updateRules(payload)
    if (res.code === 0) {
      ElMessage.success('规则说明已保存')
    }
  } catch (error) {
    ElMessage.error('保存失败')
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
.tip a {
  color: #409eff;
}
.provider-tip {
  font-size: 12px;
  color: #999;
  margin-left: 10px;
}
.status-text {
  margin-left: 10px;
  font-size: 12px;
  color: #999;
}
.status-text.enabled {
  color: #67c23a;
}
</style>
