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
            <span>{{ targetText(row.target_type) }}</span>
            <div v-if="row.sent_count" style="font-size:12px;color:#909399">已发 {{ row.sent_count }} 人</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="msgStatusType(row.status)" size="small">{{ msgStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发送时间" width="160">
          <template #default="{ row }">{{ formatDate(row.send_at || row.created_at) }}</template>
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
            <el-option label="分销商" value="distributor" />
            <el-option label="合伙人" value="partner" />
            <el-option label="经销商" value="dealer" />
            <el-option label="近30天活跃" value="active_30d" />
          </el-select>
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
        <el-descriptions-item label="目标">{{ targetText(currentMsg.target_type) }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="msgStatusType(currentMsg.status)">{{ msgStatusText(currentMsg.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="发送人数">{{ currentMsg.sent_count || 0 }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDate(currentMsg.created_at) }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/utils/request'
import dayjs from 'dayjs'

const loading = ref(false)
const submitting = ref(false)
const createDialogVisible = ref(false)
const detailDialogVisible = ref(false)
const currentMsg = ref(null)
const formRef = ref()

const pagination = reactive({ page: 1, limit: 10, total: 0 })
const tableData = ref([])

const form = reactive({
  title: '', content: '', target_type: 'all', send_mode: 'now', send_at: null, jump_path: ''
})
const rules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  content: [{ required: true, message: '请输入内容', trigger: 'blur' }],
  target_type: [{ required: true, message: '请选择目标用户', trigger: 'change' }]
}

const fetchData = async () => {
  loading.value = true
  try {
    const res = await request({ url: '/mass-messages', method: 'get', params: { page: pagination.page, limit: pagination.limit } })
    tableData.value = res.list || res.data?.list || []
    pagination.total = res.total || res.data?.total || 0
  } catch (e) {
    console.error('获取群发列表失败:', e)
  } finally {
    loading.value = false
  }
}

const handleCreate = () => {
  Object.assign(form, { title: '', content: '', target_type: 'all', send_mode: 'now', send_at: null, jump_path: '' })
  createDialogVisible.value = true
}

const handleSaveDraft = async () => {
  await formRef.value?.validate(async (valid) => {
    if (!valid) return
    submitting.value = true
    try {
      await request({ url: '/mass-messages', method: 'post', data: { ...form, status: 'draft' } })
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
    submitting.value = true
    try {
      const status = form.send_mode === 'now' ? 'sending' : 'scheduled'
      await request({ url: '/mass-messages', method: 'post', data: { ...form, status } })
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
    await ElMessageBox.confirm(`确认立即群发 "${row.title}" 给 ${targetText(row.target_type)}？`, '确认发送', {
      confirmButtonText: '立即发送',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await request({ url: `/mass-messages/${row.id}/send`, method: 'post' })
    ElMessage.success('群发已启动')
    fetchData()
  } catch (e) {
    if (e !== 'cancel') console.error('发送失败:', e)
  }
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(`确认删除草稿 "${row.title}"？`, '确认删除', { type: 'warning' })
    await request({ url: `/mass-messages/${row.id}`, method: 'delete' })
    ElMessage.success('已删除')
    fetchData()
  } catch (e) {
    if (e !== 'cancel') console.error('删除失败:', e)
  }
}

const handleView = (row) => { currentMsg.value = row; detailDialogVisible.value = true }

const targetText = (t) => ({ all: '全部用户', distributor: '分销商', partner: '合伙人', dealer: '经销商', active_30d: '近30天活跃' }[t] || t)
const msgStatusText = (s) => ({ draft: '草稿', scheduled: '待发送', sending: '发送中', sent: '已发送', failed: '失败' }[s] || s)
const msgStatusType = (s) => ({ draft: 'info', scheduled: 'warning', sending: 'primary', sent: 'success', failed: 'danger' }[s] || '')
const formatDate = (d) => d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '-'

onMounted(fetchData)
</script>

<style scoped>
.mass-message-page { padding: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
