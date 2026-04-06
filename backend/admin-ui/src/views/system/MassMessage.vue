<template>
  <div class="mass-message-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2><el-icon><Message /></el-icon> 群发信息管理</h2>
      <el-button type="primary" @click="showCreateDialog">
        <el-icon><Plus /></el-icon> 新建群发
      </el-button>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-value">{{ stats.total || 0 }}</div>
          <div class="stat-label">总发送次数</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card success">
          <div class="stat-value">{{ stats.completed || 0 }}</div>
          <div class="stat-label">发送成功</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card warning">
          <div class="stat-value">{{ stats.sending || 0 }}</div>
          <div class="stat-label">发送中</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card info">
          <div class="stat-value">{{ totalReach || 0 }}</div>
          <div class="stat-label">累计触达用户</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 筛选栏 -->
    <el-card class="filter-card">
      <el-form :inline="true" :model="filterForm">
        <el-form-item label="状态">
          <el-select v-model="filterForm.status" placeholder="全部状态" clearable>
            <el-option label="草稿" value="draft" />
            <el-option label="待发送" value="pending" />
            <el-option label="发送中" value="sending" />
            <el-option label="已完成" value="completed" />
            <el-option label="失败" value="failed" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标类型">
          <el-select v-model="filterForm.targetType" placeholder="全部类型" clearable>
            <el-option label="全部用户" value="all" />
            <el-option label="按角色" value="role" />
            <el-option label="按标签" value="tag" />
            <el-option label="特定用户" value="specific" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadData">查询</el-button>
          <el-button @click="resetFilter">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 消息列表 -->
    <el-card class="list-card">
      <el-table :data="messageList" v-loading="loading" stripe>
        <el-table-column prop="title" label="消息标题" min-width="200">
          <template #default="{ row }">
            <div class="message-title">
              <el-tag v-if="row.contentType === 'text'" size="small" type="info">文本</el-tag>
              <el-tag v-else-if="row.contentType === 'image'" size="small" type="warning">图文</el-tag>
              <el-tag v-else size="small" type="success">{{ row.contentType }}</el-tag>
              <span class="title-text">{{ row.title }}</span>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column prop="targetType" label="发送目标" width="120">
          <template #default="{ row }">
            <el-tag size="small">{{ getTargetTypeText(row.targetType) }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="发送进度" width="200">
          <template #default="{ row }">
            <div v-if="row.status === 'sending' || row.status === 'completed' || row.status === 'failed'">
              <el-progress 
                :percentage="calculateProgress(row)" 
                :status="row.status === 'failed' ? 'exception' : ''"
                :stroke-width="8"
              />
              <div class="progress-text">
                {{ row.sentCount }}/{{ row.totalCount }} 
                <span v-if="row.readCount > 0" class="read-count">已读{{ row.readCount }}</span>
              </div>
            </div>
            <span v-else-if="row.status === 'draft'">-</span>
            <span v-else>等待发送</span>
          </template>
        </el-table-column>

        <el-table-column prop="sendType" label="发送方式" width="100">
          <template #default="{ row }">
            {{ row.sendType === 'immediate' ? '立即发送' : '定时发送' }}
            <div v-if="row.scheduledAt" class="scheduled-time">
              {{ formatTime(row.scheduledAt) }}
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="viewDetail(row)">详情</el-button>
            <el-button 
              v-if="row.status === 'draft' || row.status === 'pending'" 
              link 
              type="warning" 
              @click="cancelSend(row)"
            >
              取消
            </el-button>
            <el-button 
              v-if="row.status !== 'sending'" 
              link 
              type="danger" 
              @click="deleteMessage(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.limit"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @size-change="loadData"
          @current-change="loadData"
        />
      </div>
    </el-card>

    <!-- 新建/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑消息' : '新建群发消息'"
      width="700px"
      :close-on-click-modal="false"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="消息标题" prop="title">
          <el-input v-model="form.title" placeholder="请输入消息标题" maxlength="200" show-word-limit />
        </el-form-item>

        <el-form-item label="内容类型" prop="contentType">
          <el-radio-group v-model="form.contentType">
            <el-radio label="text">纯文本</el-radio>
            <el-radio label="image">图文</el-radio>
            <el-radio label="link">链接</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="消息内容" prop="content">
          <el-input 
            v-model="form.content" 
            type="textarea" 
            :rows="6" 
            placeholder="请输入消息内容..."
            maxlength="1000"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="发送目标" prop="targetType">
          <el-radio-group v-model="form.targetType">
            <el-radio label="all">全部用户</el-radio>
            <el-radio label="role">按角色</el-radio>
            <el-radio label="tag">按标签</el-radio>
            <el-radio label="specific">特定用户</el-radio>
          </el-radio-group>
        </el-form-item>

        <!-- 按角色选择 -->
        <el-form-item v-if="form.targetType === 'role'" label="选择角色">
          <el-checkbox-group v-model="form.targetRoles">
            <el-checkbox label="0">普通用户</el-checkbox>
            <el-checkbox label="1">会员</el-checkbox>
            <el-checkbox label="2">团长</el-checkbox>
            <el-checkbox label="3">代理商</el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <!-- 按标签选择 -->
        <el-form-item v-if="form.targetType === 'tag'" label="选择标签">
          <el-select v-model="form.targetTags" multiple placeholder="请选择标签">
            <el-option
              v-for="tag in userTags"
              :key="tag.id"
              :label="tag.name"
              :value="tag.id"
            />
          </el-select>
        </el-form-item>

        <!-- 特定用户 -->
        <el-form-item v-if="form.targetType === 'specific'" label="选择用户">
          <el-select-v2
            v-model="form.targetUsers"
            :options="userOptions"
            placeholder="搜索并选择用户"
            multiple
            filterable
            remote
            :remote-method="searchUsers"
            :loading="userLoading"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="发送方式">
          <el-radio-group v-model="form.sendType">
            <el-radio label="immediate">立即发送</el-radio>
            <el-radio label="scheduled">定时发送</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="form.sendType === 'scheduled'" label="发送时间">
          <el-date-picker
            v-model="form.scheduledAt"
            type="datetime"
            placeholder="选择发送时间"
            :disabled-date="disabledDate"
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="previewCount">预览目标用户数</el-button>
          <span v-if="previewCountResult !== null" class="preview-result">
            预计发送给 <strong>{{ previewCountResult }}</strong> 位用户
          </span>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">
          {{ form.sendType === 'immediate' ? '立即发送' : '保存草稿' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 详情对话框 -->
    <el-dialog v-model="detailVisible" title="发送详情" width="600px">
      <div v-if="currentDetail" class="detail-content">
        <h4>{{ currentDetail.title }}</h4>
        <p class="content-text">{{ currentDetail.content }}</p>
        
        <el-divider />
        
        <div class="detail-stats">
          <div class="stat-row">
            <span class="label">目标用户：</span>
            <span class="value">{{ currentDetail.totalCount }} 人</span>
          </div>
          <div class="stat-row">
            <span class="label">发送成功：</span>
            <span class="value success">{{ currentDetail.sentCount }} 人</span>
          </div>
          <div class="stat-row">
            <span class="label">发送失败：</span>
            <span class="value danger">{{ currentDetail.failCount }} 人</span>
          </div>
          <div class="stat-row">
            <span class="label">已读人数：</span>
            <span class="value">{{ currentDetail.readCount }} 人</span>
          </div>
          <div class="stat-row" v-if="currentDetail.completedAt">
            <span class="label">完成时间：</span>
            <span class="value">{{ formatTime(currentDetail.completedAt) }}</span>
          </div>
        </div>

        <el-divider />

        <div class="read-stats" v-if="currentDetail.readStats">
          <h5>阅读统计</h5>
          <div v-for="stat in currentDetail.readStats" :key="stat.status" class="read-stat-row">
            <span>{{ stat.status === 'read' ? '已读' : '未读' }}：</span>
            <el-tag :type="stat.status === 'read' ? 'success' : 'info'">{{ stat.count }}</el-tag>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { Message, Plus } from '@element-plus/icons-vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const API_BASE = '/api/admin'

// 状态
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const detailVisible = ref(false)
const isEdit = ref(false)
const messageList = ref([])
const userTags = ref([])
const userOptions = ref([])
const userLoading = ref(false)
const currentDetail = ref(null)
const previewCountResult = ref(null)

const stats = reactive({
  total: 0,
  completed: 0,
  sending: 0,
  failed: 0
})

const totalReach = ref(0)

const filterForm = reactive({
  status: '',
  targetType: ''
})

const pagination = reactive({
  page: 1,
  limit: 20,
  total: 0
})

const formRef = ref(null)
const form = reactive({
  title: '',
  content: '',
  contentType: 'text',
  targetType: 'all',
  targetRoles: [],
  targetTags: [],
  targetUsers: [],
  sendType: 'immediate',
  scheduledAt: null
})

const rules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  content: [{ required: true, message: '请输入内容', trigger: 'blur' }],
  targetType: [{ required: true, message: '请选择发送目标', trigger: 'change' }]
}

// 方法
const loadData = async () => {
  loading.value = true
  try {
    const res = await axios.get(`${API_BASE}/mass-messages`, {
      params: {
        ...filterForm,
        page: pagination.page,
        limit: pagination.limit
      }
    })

    if (res.data.code === 0) {
      messageList.value = res.data.data.list
      pagination.total = res.data.data.total
    }
  } catch (error) {
    ElMessage.error('加载数据失败')
  } finally {
    loading.value = false
  }
}

const loadStats = async () => {
  try {
    const res = await axios.get(`${API_BASE}/mass-messages/statistics`)
    if (res.data.code === 0) {
      const data = res.data.data
      stats.total = data.reduce((sum, item) => sum + parseInt(item.count), 0)
      stats.completed = data.find(item => item.status === 'completed')?.count || 0
      stats.sending = data.find(item => item.status === 'sending')?.count || 0
      stats.failed = data.find(item => item.status === 'failed')?.count || 0
      
      totalReach.value = data.reduce((sum, item) => sum + (parseInt(item.totalSent) || 0), 0)
    }
  } catch (error) {
    console.error('加载统计失败:', error)
  }
}

const loadUserTags = async () => {
  try {
    const res = await axios.get(`${API_BASE}/mass-messages/tags`)
    if (res.data.code === 0) {
      userTags.value = res.data.data
    }
  } catch (error) {
    console.error('加载标签失败:', error)
  }
}

const searchUsers = async (query) => {
  if (query.length < 2) return
  
  userLoading.value = true
  try {
    const res = await axios.get(`${API_BASE}/mass-messages/users/search`, {
      params: { keyword: query }
    })
    
    if (res.data.code === 0) {
      userOptions.value = res.data.data.map(user => ({
        value: user.id,
        label: `${user.nickname || '未知'} (ID: ${user.id})`
      }))
    }
  } catch (error) {
    console.error('搜索用户失败:', error)
  } finally {
    userLoading.value = false
  }
}

const previewCount = async () => {
  try {
    const res = await axios.post(`${API_BASE}/mass-messages/preview-count`, {
      targetType: form.targetType,
      targetRoles: form.targetRoles,
      targetTags: form.targetTags,
      targetUsers: form.targetUsers
    })
    
    if (res.data.code === 0) {
      previewCountResult.value = res.data.data.count
    }
  } catch (error) {
    ElMessage.error('预览失败')
  }
}

const showCreateDialog = () => {
  isEdit.value = false
  resetForm()
  dialogVisible.value = true
  previewCountResult.value = null
}

const submitForm = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    const res = await axios.post(`${API_BASE}/mass-messages`, form)
    
    if (res.data.code === 0) {
      ElMessage.success(res.data.message)
      dialogVisible.value = false
      loadData()
      loadStats()
    }
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '创建失败')
  } finally {
    submitting.value = false
  }
}

const cancelSend = async (row) => {
  try {
    await ElMessageBox.confirm('确定要取消发送这条消息吗？', '提示', {
      type: 'warning'
    })
    
    const res = await axios.put(`${API_BASE}/mass-messages/${row.id}/cancel`)
    if (res.data.code === 0) {
      ElMessage.success('已取消')
      loadData()
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.message || '取消失败')
    }
  }
}

const deleteMessage = async (row) => {
  try {
    await ElMessageBox.confirm('删除后无法恢复，确定要删除吗？', '提示', {
      type: 'warning'
    })
    
    const res = await axios.delete(`${API_BASE}/mass-messages/${row.id}`)
    if (res.data.code === 0) {
      ElMessage.success('删除成功')
      loadData()
      loadStats()
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.message || '删除失败')
    }
  }
}

const viewDetail = async (row) => {
  try {
    const res = await axios.get(`${API_BASE}/mass-messages/${row.id}`)
    if (res.data.code === 0) {
      currentDetail.value = res.data.data
      detailVisible.value = true
    }
  } catch (error) {
    ElMessage.error('加载详情失败')
  }
}

const resetForm = () => {
  form.title = ''
  form.content = ''
  form.contentType = 'text'
  form.targetType = 'all'
  form.targetRoles = []
  form.targetTags = []
  form.targetUsers = []
  form.sendType = 'immediate'
  form.scheduledAt = null
  if (formRef.value) {
    formRef.value.resetFields()
  }
}

const resetFilter = () => {
  filterForm.status = ''
  filterForm.targetType = ''
  pagination.page = 1
  loadData()
}

const disabledDate = (time) => {
  return time.getTime() < Date.now() - 8.64e7
}

// 辅助函数
const getTargetTypeText = (type) => {
  const map = {
    all: '全部用户',
    role: '按角色',
    tag: '按标签',
    specific: '特定用户'
  }
  return map[type] || type
}

const getStatusType = (status) => {
  const map = {
    draft: 'info',
    pending: 'warning',
    sending: 'primary',
    completed: 'success',
    failed: 'danger',
    cancelled: 'info'
  }
  return map[status] || 'info'
}

const getStatusText = (status) => {
  const map = {
    draft: '草稿',
    pending: '待发送',
    sending: '发送中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  }
  return map[status] || status
}

const calculateProgress = (row) => {
  if (!row.totalCount) return 0
  return Math.round((row.sentCount / row.totalCount) * 100)
}

const formatTime = (time) => {
  if (!time) return '-'
  return new Date(time).toLocaleString()
}

onMounted(() => {
  loadData()
  loadStats()
  loadUserTags()
})
</script>

<style scoped>
.mass-message-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  text-align: center;
  padding: 15px;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #409EFF;
  margin-bottom: 5px;
}

.stat-card.success .stat-value {
  color: #67C23A;
}

.stat-card.warning .stat-value {
  color: #E6A23C;
}

.stat-card.info .stat-value {
  color: #909399;
}

.stat-label {
  font-size: 14px;
  color: #606266;
}

.filter-card {
  margin-bottom: 20px;
}

.list-card {
  margin-bottom: 20px;
}

.message-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-text {
  font-weight: 500;
}

.progress-text {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
}

.read-count {
  color: #67C23A;
  margin-left: 10px;
}

.scheduled-time {
  font-size: 12px;
  color: #909399;
}

.pagination {
  margin-top: 20px;
  text-align: right;
}

.preview-result {
  margin-left: 15px;
  color: #409EFF;
}

.detail-content h4 {
  margin-top: 0;
  color: #303133;
}

.content-text {
  color: #606266;
  line-height: 1.6;
  background: #f5f7fa;
  padding: 15px;
  border-radius: 4px;
}

.detail-stats {
  padding: 10px 0;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.stat-row .label {
  color: #909399;
}

.stat-row .value {
  font-weight: 500;
}

.stat-row .value.success {
  color: #67C23A;
}

.stat-row .value.danger {
  color: #F56C6C;
}

.read-stats {
  margin-top: 20px;
}

.read-stats h5 {
  margin-bottom: 15px;
  color: #606266;
}

.read-stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
}
</style>
