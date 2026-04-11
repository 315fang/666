<template>
  <div class="mass-message-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>群发消息管理</span>
          <el-button type="primary" @click="handleCreate">
            <el-icon><Plus /></el-icon>
            创建群发
          </el-button>
        </div>
      </template>

      <!-- 说明 -->
      <el-alert
        title="群发消息将推送给满足条件的用户，请谨慎操作。每次群发请确认目标用户范围。"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 20px;"
      />

      <!-- 表格 -->
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="title" label="标题" min-width="200" />
        <el-table-column label="目标用户" width="130">
          <template #default="{ row }">
            <span>{{ targetText(row.targetType || row.target_type) }}</span>
            <div v-if="(row.sentCount || row.sent_count)" style="font-size:12px;color:#909399">已发 {{ row.sentCount || row.sent_count }} 人</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="msgStatusType(row.status)" size="small">{{ msgStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发送时间" width="160">
          <template #default="{ row }">{{ formatDate(row.sentAt || row.send_at || row.createdAt || row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="handleView(row)">详情</el-button>
            <el-button
              v-if="row.status === 'draft'"
              text type="success" size="small"
              @click="handleSend(row)"
            >
              立即发送
            </el-button>
            <el-button
              v-if="row.status === 'draft'"
              text type="danger" size="small"
              @click="handleDelete(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.limit"
        :total="pagination.total"
        layout="total, prev, pager, next"
        @current-change="fetchData"
        style="margin-top: 20px; justify-content: flex-end;"
      />
    </el-card>

    <!-- 创建群发对话框 -->
    <el-dialog v-model="createDialogVisible" title="创建群发消息" width="600px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="消息标题" prop="title">
          <el-input v-model="form.title" placeholder="消息标题" />
        </el-form-item>
        <el-form-item label="消息内容" prop="content">
          <el-input v-model="form.content" type="textarea" :rows="4" placeholder="要推送的消息内容..." />
        </el-form-item>
        <el-form-item label="目标用户" prop="target_type">
          <el-select v-model="form.target_type" style="width:100%">
            <el-option label="全部用户" value="all" />
            <el-option label="按用户等级" value="by_level" />
            <el-option label="指定用户ID" value="by_ids" />
            <el-option label="分销商" value="distributor" />
            <el-option label="近30天活跃" value="active_30d" />
          </el-select>
        </el-form-item>
        <el-form-item label="用户等级" v-if="form.target_type === 'by_level'">
          <el-checkbox-group v-model="form.target_levels">
            <el-checkbox :label="0">普通用户(0)</el-checkbox>
            <el-checkbox :label="1">会员(1)</el-checkbox>
            <el-checkbox :label="2">团长(2)</el-checkbox>
            <el-checkbox :label="3">代理(3)</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="指定用户ID" v-if="form.target_type === 'by_ids'">
          <el-input v-model="form.target_ids_text" type="textarea" :rows="3"
            placeholder="多个用户ID用英文逗号分隔（例如：1, 23, 45）" />
        </el-form-item>
        <el-form-item label="发送时间">
          <el-radio-group v-model="form.send_mode" style="margin-bottom: 8px;">
            <el-radio label="now">立即发送</el-radio>
            <el-radio label="scheduled">定时发送</el-radio>
          </el-radio-group>
          <el-date-picker
            v-if="form.send_mode === 'scheduled'"
            v-model="form.send_at"
            type="datetime"
            placeholder="选择发送时间"
            style="width:100%"
            :disabled-date="(d) => d.getTime() < Date.now()"
          />
        </el-form-item>
        <el-form-item label="跳转页面">
          <el-input v-model="form.jump_path" placeholder="消息跳转的小程序页面路径（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button @click="handleSaveDraft" :loading="submitting">存为草稿</el-button>
        <el-button type="primary" @click="handleSubmitAndSend" :loading="submitting">{{ form.send_mode === 'now' ? '立即发送' : '保存并定时' }}</el-button>
      </template>
    </el-dialog>

    <!-- 详情对话框 -->
    <el-dialog v-model="detailDialogVisible" title="群发详情" width="500px">
      <el-descriptions :column="1" border v-if="currentMsg">
        <el-descriptions-item label="标题">{{ currentMsg.title }}</el-descriptions-item>
        <el-descriptions-item label="内容">{{ currentMsg.content }}</el-descriptions-item>
        <el-descriptions-item label="目标">{{ targetText(currentMsg.targetType || currentMsg.target_type) }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="msgStatusType(currentMsg.status)">{{ msgStatusText(currentMsg.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="发送人数">{{ currentMsg.sentCount || currentMsg.sent_count || 0 }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDate(currentMsg.createdAt || currentMsg.created_at) }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getMassMessages, createMassMessage, sendMassMessage, deleteMassMessage } from '@/api'
import { formatDate } from '@/utils/format'
import { usePagination } from '@/composables/usePagination'

const loading = ref(false)
const submitting = ref(false)
const createDialogVisible = ref(false)
const detailDialogVisible = ref(false)
const currentMsg = ref(null)
const formRef = ref()

const { pagination, resetPage, applyResponse } = usePagination({ defaultLimit: 10 })
const tableData = ref([])

const form = reactive({
  title: '', content: '', target_type: 'all', target_levels: [], target_ids_text: '',
  send_mode: 'now', send_at: null, jump_path: ''
})
const rules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  content: [{ required: true, message: '请输入内容', trigger: 'blur' }],
  target_type: [{ required: true, message: '请选择目标用户', trigger: 'change' }]
}

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getMassMessages({ page: pagination.page, limit: pagination.limit })
    tableData.value = res?.list || []
    applyResponse(res)
  } catch (e) {
    console.error('获取群发列表失败:', e)
  } finally {
    loading.value = false
  }
}

const handleCreate = () => {
  Object.assign(form, { title: '', content: '', target_type: 'all', target_levels: [], target_ids_text: '', send_mode: 'now', send_at: null, jump_path: '' })
  createDialogVisible.value = true
}

// 将前端表单转成后端期望的参数格式
const buildPayload = (extra = {}) => {
  const payload = {
    title: form.title,
    content: form.content,
    contentType: 'text',
    sendType: form.send_mode === 'now' ? 'immediate' : 'scheduled',
    scheduledAt: form.send_at || undefined,
    jump_path: form.jump_path || undefined,
    ...extra
  }
  if (form.target_type === 'by_level') {
    payload.targetType = 'role'
    payload.targetRoles = form.target_levels
  } else if (form.target_type === 'by_ids') {
    payload.targetType = 'specific'
    payload.targetUsers = form.target_ids_text.split(',').map(s => s.trim()).filter(Boolean).map(Number).filter(n => !isNaN(n) && n > 0)
  } else {
    payload.targetType = form.target_type
  }
  return payload
}

const handleSaveDraft = async () => {
  await formRef.value?.validate(async (valid) => {
    if (!valid) return
    submitting.value = true
    try {
      await createMassMessage(buildPayload({ sendType: 'draft' }))
      ElMessage.success('已保存为草稿')
      createDialogVisible.value = false
      fetchData()
    } catch (e) {
      console.error('保存失败:', e)
    } finally {
      submitting.value = false
    }
  })
}

const handleSubmitAndSend = async () => {
  await formRef.value?.validate(async (valid) => {
    if (!valid) return
    if (form.target_type === 'by_level' && form.target_levels.length === 0) {
      return ElMessage.warning('请选择至少一个用户等级')
    }
    if (form.target_type === 'by_ids' && !form.target_ids_text.trim()) {
      return ElMessage.warning('请输入目标用户ID')
    }
    submitting.value = true
    try {
      await createMassMessage(buildPayload())
      ElMessage.success(form.send_mode === 'now' ? '群发已开始！' : '定时群发已设置')
      createDialogVisible.value = false
      fetchData()
    } catch (e) {
      console.error('发送失败:', e)
    } finally {
      submitting.value = false
    }
  })
}

const handleSend = async (row) => {
  try {
    await ElMessageBox.confirm(`确认立即群发 "${row.title}" 给 ${targetText(row.targetType || row.target_type)}？`, '确认发送', {
      confirmButtonText: '立即发送',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await sendMassMessage(row.id)
    ElMessage.success('群发已启动')
    fetchData()
  } catch (e) {
    if (e !== 'cancel') console.error('发送失败:', e)
  }
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(`确认删除草稿 "${row.title}"？`, '确认删除', { type: 'warning' })
    await deleteMassMessage(row.id)
    ElMessage.success('已删除')
    fetchData()
  } catch (e) {
    if (e !== 'cancel') console.error('删除失败:', e)
  }
}

const handleView = (row) => { currentMsg.value = row; detailDialogVisible.value = true }

const targetText = (t) => ({ all: '全部用户', role: '按等级', specific: '指定用户', tag: '标签用户' }[t] || t)
const msgStatusText = (s) => ({ draft: '草稿', pending: '待发送', sending: '发送中', completed: '已完成', failed: '失败', cancelled: '已取消' }[s] || s)
const msgStatusType = (s) => ({ draft: 'info', pending: 'warning', sending: 'primary', completed: 'success', failed: 'danger', cancelled: 'info' }[s] || '')

onMounted(fetchData)
</script>

<style scoped>
.mass-message-page { padding: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
