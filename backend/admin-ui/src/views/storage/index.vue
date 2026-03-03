<template>
  <div class="storage-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>存储配置</span>
          <div class="header-actions">
            <el-button @click="handleTest" :loading="testing">
              <el-icon><Connection /></el-icon>
              连通性测试
            </el-button>
            <el-button type="primary" @click="handleSave" :loading="saving">
              <el-icon><Check /></el-icon>
              保存配置
            </el-button>
          </div>
        </div>
      </template>

      <el-alert
        title="配置保存后立即生效，重启服务器后自动恢复（数据库持久化）。推荐使用腾讯云 COS，与服务器同区域传输更快、费用更低。"
        type="info" :closable="false" show-icon style="margin-bottom: 24px;"
      />

      <div v-loading="loading">
        <!-- ===== 服务商选择 ===== -->
        <div class="section-title">选择存储服务商</div>
        <div class="provider-grid">
          <div
            v-for="p in providers"
            :key="p.value"
            :class="['provider-card', { 'is-active': form.provider === p.value }]"
            @click="form.provider = p.value"
          >
            <div class="provider-icon">{{ p.icon }}</div>
            <div class="provider-name">{{ p.label }}</div>
            <div class="provider-desc">{{ p.desc }}</div>
            <el-tag v-if="p.value === 'tencent'" type="success" size="small" class="provider-badge">推荐</el-tag>
            <el-tag v-if="p.value === form.provider" type="primary" size="small" class="provider-active-badge">当前</el-tag>
          </div>
        </div>

        <!-- ===== 腾讯云 COS ===== -->
        <template v-if="form.provider === 'tencent'">
          <div class="section-title">腾讯云 COS 配置</div>
          <el-alert type="warning" :closable="false" style="margin-bottom:16px;">
            <template #default>
              前往
              <el-link href="https://console.cloud.tencent.com/cam/capi" target="_blank" type="primary">腾讯云 API 密钥管理</el-link>
              获取 SecretId 和 SecretKey，并在
              <el-link href="https://console.cloud.tencent.com/cos" target="_blank" type="primary">对象存储控制台</el-link>
              创建 Bucket（建议与服务器同地域以节省流量费用）。
            </template>
          </el-alert>
          <el-form :model="form.tencent" label-width="140px" style="max-width: 680px;">
            <el-form-item label="SecretId" required>
              <el-input v-model="form.tencent.secretId" placeholder="AKIDxxxxxxxxxxxx" show-password />
            </el-form-item>
            <el-form-item label="SecretKey" required>
              <el-input v-model="form.tencent.secretKey" placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" show-password />
            </el-form-item>
            <el-form-item label="Bucket 名称" required>
              <el-input v-model="form.tencent.bucket" placeholder="your-bucket-1234567890" />
              <div class="field-hint">格式：bucket名称-APPID，例如 mybucket-1250000000</div>
            </el-form-item>
            <el-form-item label="地域 Region" required>
              <el-select v-model="form.tencent.region" style="width:100%">
                <el-option v-for="r in tencentRegions" :key="r.value" :label="r.label" :value="r.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="自定义域名">
              <el-input v-model="form.tencent.customDomain" placeholder="https://cdn.yourdomain.com（可选，CDN 加速域名）" />
            </el-form-item>
          </el-form>
        </template>

        <!-- ===== 阿里云 OSS ===== -->
        <template v-else-if="form.provider === 'aliyun'">
          <div class="section-title">阿里云 OSS 配置</div>
          <el-form :model="form.aliyun" label-width="140px" style="max-width: 680px;">
            <el-form-item label="AccessKey ID" required>
              <el-input v-model="form.aliyun.accessKeyId" placeholder="LTAIxxxxxxxxxxxx" show-password />
            </el-form-item>
            <el-form-item label="AccessKey Secret" required>
              <el-input v-model="form.aliyun.accessKeySecret" placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" show-password />
            </el-form-item>
            <el-form-item label="Bucket 名称" required>
              <el-input v-model="form.aliyun.bucket" placeholder="your-bucket-name" />
            </el-form-item>
            <el-form-item label="地域 Region" required>
              <el-select v-model="form.aliyun.region" style="width:100%">
                <el-option v-for="r in aliyunRegions" :key="r.value" :label="r.label" :value="r.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="自定义域名">
              <el-input v-model="form.aliyun.customDomain" placeholder="https://cdn.yourdomain.com（可选）" />
            </el-form-item>
          </el-form>
        </template>

        <!-- ===== 七牛云 ===== -->
        <template v-else-if="form.provider === 'qiniu'">
          <div class="section-title">七牛云 Kodo 配置</div>
          <el-form :model="form.qiniu" label-width="140px" style="max-width: 680px;">
            <el-form-item label="AccessKey" required>
              <el-input v-model="form.qiniu.accessKey" show-password />
            </el-form-item>
            <el-form-item label="SecretKey" required>
              <el-input v-model="form.qiniu.secretKey" show-password />
            </el-form-item>
            <el-form-item label="Bucket 名称" required>
              <el-input v-model="form.qiniu.bucket" />
            </el-form-item>
            <el-form-item label="访问域名" required>
              <el-input v-model="form.qiniu.domain" placeholder="https://cdn.yourdomain.com" />
            </el-form-item>
          </el-form>
        </template>

        <!-- ===== MinIO ===== -->
        <template v-else-if="form.provider === 'minio'">
          <div class="section-title">MinIO 自建对象存储</div>
          <el-form :model="form.minio" label-width="140px" style="max-width: 680px;">
            <el-form-item label="服务器地址" required>
              <el-input v-model="form.minio.endPoint" placeholder="minio.yourdomain.com" />
            </el-form-item>
            <el-form-item label="端口">
              <el-input-number v-model="form.minio.port" :min="1" :max="65535" />
            </el-form-item>
            <el-form-item label="启用 HTTPS">
              <el-switch v-model="form.minio.useSSL" />
            </el-form-item>
            <el-form-item label="AccessKey" required>
              <el-input v-model="form.minio.accessKey" show-password />
            </el-form-item>
            <el-form-item label="SecretKey" required>
              <el-input v-model="form.minio.secretKey" show-password />
            </el-form-item>
            <el-form-item label="Bucket 名称" required>
              <el-input v-model="form.minio.bucket" />
            </el-form-item>
          </el-form>
        </template>

        <!-- ===== 本地存储 ===== -->
        <template v-else-if="form.provider === 'local'">
          <div class="section-title">本地存储（仅用于开发/测试）</div>
          <el-alert
            title="本地存储不适合生产环境：文件保存在服务器本地磁盘，重建容器后会丢失。生产环境请使用腾讯云 COS。"
            type="warning" :closable="false" style="margin-bottom:16px;"
          />
          <el-form :model="form.local" label-width="140px" style="max-width: 680px;">
            <el-form-item label="上传目录">
              <el-input v-model="form.local.uploadDir" placeholder="uploads" />
            </el-form-item>
            <el-form-item label="访问基础URL">
              <el-input v-model="form.local.baseUrl" placeholder="/uploads" />
            </el-form-item>
          </el-form>
        </template>

        <!-- ===== 连通性测试结果 ===== -->
        <div v-if="testResult" class="test-result" :class="testResult.success ? 'test-ok' : 'test-fail'">
          <el-icon :size="18">
            <component :is="testResult.success ? 'CircleCheckFilled' : 'CircleCloseFilled'" />
          </el-icon>
          <span>{{ testResult.message }}</span>
          <a v-if="testResult.url" :href="testResult.url" target="_blank" class="test-url">
            查看测试文件 →
          </a>
        </div>

        <!-- ===== 上传演示 ===== -->
        <div class="section-title" style="margin-top: 32px;">上传演示</div>
        <div class="upload-demo">
          <el-upload
            :action="uploadAction"
            :headers="uploadHeaders"
            :on-success="onUploadSuccess"
            :on-error="onUploadError"
            :before-upload="beforeUpload"
            :show-file-list="true"
            accept="image/*"
            drag
          >
            <el-icon :size="40" color="#c0c4cc"><UploadFilled /></el-icon>
            <div class="upload-tip">拖拽或点击上传图片（自动发送到当前配置的存储服务）</div>
            <div class="upload-tip-sub">支持 jpg / png / webp / gif，最大 10MB</div>
          </el-upload>
          <div v-if="uploadedUrl" class="uploaded-result">
            <el-input :value="uploadedUrl" readonly>
              <template #prepend>上传结果</template>
              <template #append>
                <el-button @click="copyUrl">复制</el-button>
              </template>
            </el-input>
            <el-image :src="uploadedUrl" fit="contain" style="margin-top:12px; max-height:200px; border-radius:8px;" />
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import request from '@/utils/request'
import { useUserStore } from '@/store/user'

const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const testResult = ref(null)
const uploadedUrl = ref('')
const userStore = useUserStore()

const form = reactive({
  provider: 'tencent',
  tencent: { secretId: '', secretKey: '', bucket: '', region: 'ap-guangzhou', customDomain: '' },
  aliyun: { accessKeyId: '', accessKeySecret: '', bucket: '', region: 'oss-cn-hangzhou', endpoint: '', customDomain: '' },
  qiniu: { accessKey: '', secretKey: '', bucket: '', domain: '' },
  minio: { endPoint: '', port: 9000, useSSL: false, accessKey: '', secretKey: '', bucket: 'uploads' },
  local: { uploadDir: 'uploads', baseUrl: '/uploads' }
})

const providers = [
  { value: 'tencent', label: '腾讯云 COS', icon: '🌐', desc: '与服务器同厂商，内网传输更快' },
  { value: 'aliyun', label: '阿里云 OSS', icon: '☁️', desc: '国内领先的对象存储服务' },
  { value: 'qiniu', label: '七牛云 Kodo', icon: '🦅', desc: '图片处理能力强，CDN覆盖广' },
  { value: 'minio', label: 'MinIO 自建', icon: '🏠', desc: '数据完全自主，适合私有化部署' },
  { value: 'local', label: '本地存储', icon: '💾', desc: '仅用于开发测试，不推荐生产' }
]

const tencentRegions = [
  { value: 'ap-guangzhou', label: '广州（ap-guangzhou）' },
  { value: 'ap-shanghai', label: '上海（ap-shanghai）' },
  { value: 'ap-beijing', label: '北京（ap-beijing）' },
  { value: 'ap-chengdu', label: '成都（ap-chengdu）' },
  { value: 'ap-chongqing', label: '重庆（ap-chongqing）' },
  { value: 'ap-nanjing', label: '南京（ap-nanjing）' },
  { value: 'ap-hongkong', label: '香港（ap-hongkong）' },
  { value: 'ap-singapore', label: '新加坡（ap-singapore）' }
]

const aliyunRegions = [
  { value: 'oss-cn-hangzhou', label: '杭州（oss-cn-hangzhou）' },
  { value: 'oss-cn-shanghai', label: '上海（oss-cn-shanghai）' },
  { value: 'oss-cn-beijing', label: '北京（oss-cn-beijing）' },
  { value: 'oss-cn-shenzhen', label: '深圳（oss-cn-shenzhen）' },
  { value: 'oss-cn-guangzhou', label: '广州（oss-cn-guangzhou）' }
]

// 上传接口地址和认证头
const uploadAction = computed(() => {
  const base = import.meta.env.VITE_API_BASE_URL || '/admin/api'
  return `${base}/upload`
})
const uploadHeaders = computed(() => ({ Authorization: `Bearer ${userStore.token}` }))

// 服务端脱敏占位符（与 adminUploadController.js 中 MASKED_PLACEHOLDER 保持一致）
const MASKED_PLACEHOLDER = '••••••••'

const fetchConfig = async () => {
  loading.value = true
  try {
    const res = await request({ url: '/storage/config', method: 'get' })
    const data = res.data || {}
    form.provider = data.provider || 'tencent'
    // 合并各服务商配置（跳过脱敏占位符字段，保留本地空白以等待用户重新输入）
    ;['tencent', 'aliyun', 'qiniu', 'minio', 'local'].forEach(p => {
      if (data[p]) {
        Object.keys(data[p]).forEach(k => {
          if (data[p][k] !== MASKED_PLACEHOLDER) {
            form[p][k] = data[p][k]
          }
        })
      }
    })
  } catch (e) {
    ElMessage.error('获取存储配置失败')
  } finally {
    loading.value = false
  }
}

const handleSave = async () => {
  saving.value = true
  testResult.value = null
  try {
    await request({ url: '/storage/config', method: 'put', data: form })
    ElMessage.success('存储配置已保存，立即生效')
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

const handleTest = async () => {
  testing.value = true
  testResult.value = null
  try {
    const res = await request({
      url: '/storage/test',
      method: 'post',
      data: { provider: form.provider }
    })
    testResult.value = { success: true, message: res.message, url: res.data?.url }
    ElMessage.success(res.message)
  } catch (e) {
    testResult.value = { success: false, message: e.message || '连接测试失败，请检查配置' }
    ElMessage.error(testResult.value.message)
  } finally {
    testing.value = false
  }
}

const beforeUpload = (file) => {
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error('文件不能超过 10MB')
    return false
  }
  return true
}

const onUploadSuccess = (response) => {
  if (response.code === 0) {
    uploadedUrl.value = response.data?.url || ''
    const provider = response.data?.provider || form.provider
    const providerName = providers.find(p => p.value === provider)?.label || provider
    ElMessage.success(`上传成功（${providerName}）`)
  } else {
    ElMessage.error(response.message || '上传失败')
  }
}

const onUploadError = () => {
  ElMessage.error('上传失败，请检查存储配置后重试')
}

const copyUrl = () => {
  navigator.clipboard.writeText(uploadedUrl.value)
    .then(() => ElMessage.success('链接已复制'))
    .catch(() => ElMessage.error('复制失败'))
}

onMounted(fetchConfig)
</script>

<style scoped>
.storage-page { padding: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.header-actions { display: flex; gap: 8px; }

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  padding: 8px 0 14px;
  border-bottom: 1px solid #f0f0f0;
  margin-bottom: 20px;
}

/* 服务商选择 */
.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 12px;
  margin-bottom: 28px;
}
.provider-card {
  position: relative;
  border: 2px solid #e4e7ed;
  border-radius: 12px;
  padding: 16px 14px 12px;
  cursor: pointer;
  transition: all 0.18s;
  text-align: center;
  background: #fff;
}
.provider-card:hover { border-color: #409eff; }
.provider-card.is-active { border-color: #409eff; background: #ecf5ff; }
.provider-icon { font-size: 28px; line-height: 1; margin-bottom: 6px; }
.provider-name { font-size: 13px; font-weight: 600; color: #303133; }
.provider-desc { font-size: 11px; color: #909399; margin-top: 3px; line-height: 1.4; }
.provider-badge {
  position: absolute;
  top: -8px; right: 8px;
}
.provider-active-badge {
  position: absolute;
  top: -8px; left: 8px;
}

.field-hint { font-size: 11px; color: #909399; margin-top: 4px; }

/* 测试结果 */
.test-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 8px;
  margin-top: 16px;
  font-size: 13px;
}
.test-ok { background: #f0f9eb; color: #529b2e; border: 1px solid #c2e7b0; }
.test-fail { background: #fef0f0; color: #c45656; border: 1px solid #fbc4c4; }
.test-url { margin-left: auto; font-size: 12px; text-decoration: none; color: #409eff; }
.test-url:hover { text-decoration: underline; }

/* 上传演示 */
.upload-demo { max-width: 560px; }
:deep(.el-upload-dragger) {
  height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.upload-tip { font-size: 13px; color: #606266; margin-top: 6px; }
.upload-tip-sub { font-size: 11px; color: #c0c4cc; margin-top: 3px; }
.uploaded-result { margin-top: 14px; }
</style>
