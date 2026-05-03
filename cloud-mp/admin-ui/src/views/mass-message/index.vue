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
        <el-table-column label="ID" width="90">
          <template #default="{ row }">
            <CompactIdCell :value="row.display_id || row.id" :full-value="row.id" />
          </template>
        </el-table-column>
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
            <el-checkbox :label="0">VIP用户(0)</el-checkbox>
            <el-checkbox :label="1">初级会员(1)</el-checkbox>
            <el-checkbox :label="2">高级会员(2)</el-checkbox>
            <el-checkbox :label="3">推广合伙人(3)</el-checkbox>
            <el-checkbox :label="4">运营合伙人(4)</el-checkbox>
            <el-checkbox :label="5">区域合伙人(5)</el-checkbox>
            <el-checkbox :label="6">线下实体门店(6)</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="指定用户" v-if="form.target_type === 'by_ids'">
          <div style="width:100%;">
            <div style="display:flex; align-items:center; gap:10px;">
              <el-button @click="userPickerVisible = true">点击挑选用户</el-button>
              <span style="color:#606266; font-size:13px;">已挑选 <b>{{ form.target_user_items.length }}</b> 人</span>
              <el-button v-if="form.target_user_items.length" text type="danger" size="small" @click="clearPickedUsers">清空</el-button>
            </div>
            <div v-if="form.target_user_items.length" style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px; max-height:120px; overflow-y:auto;">
              <el-tag
                v-for="item in form.target_user_items"
                :key="item.id"
                closable
                @close="removeTargetUser(item.id)"
              >{{ item.nickname || `#${item.id}` }}</el-tag>
            </div>
            <el-collapse style="margin-top:8px;">
              <el-collapse-item title="高级：粘贴 ID / 会员编号 / 邀请码 / openid">
                <el-input v-model="form.target_ids_text" type="textarea" :rows="3"
                  placeholder="多个用户用逗号、分号或换行分隔（例：12, 8H8W69RV, oXXXXXXXXX）" />
                <div style="font-size:12px;color:#909399;margin-top:4px;">
                  粘贴内容会与上方挑选的用户<strong>合并去重</strong>，适合按 openid/邀请码批量定向。
                </div>
              </el-collapse-item>
            </el-collapse>
          </div>
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
        <el-button type="primary" @click="handleSubmitAndSend" :loading="submitting">
          下一步：预览目标用户
        </el-button>
      </template>
    </el-dialog>

    <!-- 群发目标用户确认弹窗 -->
    <UserConfirmDialog
      v-model="massConfirmVisible"
      :title="massConfirmTitle"
      :action-desc="`「${form.title || '(未填标题)'}」${form.send_mode === 'now' ? '立即' : '定时'}群发`"
      :users="massPreviewUsers"
      :count="massPreviewCount"
      :truncated="massPreviewTruncated"
      :loading="massPreviewLoading"
      :confirming="massConfirming"
      :require-confirm-threshold="20"
      confirm-keyword="确认群发"
      @confirm="doMassSend"
    />

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

    <EntityPicker
      v-model:visible="userPickerVisible"
      v-model="form.target_user_ids"
      entity="user"
      :multiple="true"
      :preselected-items="form.target_user_items"
      dialog-width="1000px"
      @confirm="onUsersPicked"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import CompactIdCell from '@/components/CompactIdCell.vue'
import EntityPicker from '@/components/entity-picker'
import { getMassMessages, previewMassMessage, createMassMessage, sendMassMessage, deleteMassMessage } from '@/api'
import { formatDate } from '@/utils/format'
import { usePagination } from '@/composables/usePagination'
import UserConfirmDialog from '@/components/UserConfirmDialog.vue'

const loading = ref(false)
const submitting = ref(false)
const createDialogVisible = ref(false)
const detailDialogVisible = ref(false)
const currentMsg = ref(null)
const formRef = ref()

const { pagination, resetPage, applyResponse } = usePagination({ defaultLimit: 10 })
const tableData = ref([])

const userPickerVisible = ref(false)

const form = reactive({
  title: '', content: '', target_type: 'all', target_levels: [],
  target_user_ids: [],     // EntityPicker 选出的用户 id 数组
  target_user_items: [],   // EntityPicker 选出的完整用户对象（仅前端用于显示 / 回填）
  target_ids_text: '',     // 高级模式：粘贴的 ID/openid/邀请码列表
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
    if (!e?.__handledByRequest) ElMessage.error(e?.message || '获取群发列表失败')
  } finally {
    loading.value = false
  }
}

const handleCreate = () => {
  Object.assign(form, {
    title: '', content: '', target_type: 'all', target_levels: [],
    target_user_ids: [], target_user_items: [],
    target_ids_text: '', send_mode: 'now', send_at: null, jump_path: ''
  })
  createDialogVisible.value = true
}

const onUsersPicked = (ids, items) => {
  form.target_user_ids = ids
  form.target_user_items = items || []
}

const removeTargetUser = (id) => {
  form.target_user_ids = form.target_user_ids.filter((x) => x !== id)
  form.target_user_items = form.target_user_items.filter((x) => x.id !== id)
}

const clearPickedUsers = () => {
  form.target_user_ids = []
  form.target_user_items = []
}

/** 解析「指定用户」输入：支持数字 id、文档 _id、openid、会员编号、邀请码等；分隔符支持英文/中文逗号、分号、换行 */
function parseTargetUsersInput(text) {
  const raw = String(text || '').trim()
  if (!raw) return []
  const parts = raw.split(/[,，;；\r\n]+/).map((s) => s.trim()).filter(Boolean)
  const seen = new Set()
  const out = []
  for (const p of parts) {
    const key = p.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (/^\d+$/.test(p)) {
      const n = Number(p)
      if (Number.isFinite(n)) out.push(n)
      else out.push(p)
    } else {
      out.push(p)
    }
  }
  return out
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
    // EntityPicker 选出的 id + textarea 粘贴的 ID/openid/邀请码 合并去重
    const merged = [...form.target_user_ids, ...parseTargetUsersInput(form.target_ids_text)]
    const seen = new Set()
    payload.targetUsers = merged.filter((v) => {
      const key = String(v).toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
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
      if (!e?.__handledByRequest) ElMessage.error(e?.message || '保存失败')
    } finally {
      submitting.value = false
    }
  })
}

// 群发确认弹窗状态
const massConfirmVisible = ref(false)
const massPreviewUsers = ref([])
const massPreviewCount = ref(0)
const massPreviewTruncated = ref(false)
const massPreviewLoading = ref(false)
const massConfirming = ref(false)
let pendingMassPayload = null

const massConfirmTitle = computed(() => {
  const modeLabel = form.send_mode === 'now' ? '立即群发' : '定时群发'
  const targetLabel = { all: '全部用户', by_level: '按等级筛选用户', by_ids: '指定用户', distributor: '分销商', active_30d: '近30天活跃用户' }[form.target_type] || '目标用户'
  return `群发确认 — ${modeLabel} · ${targetLabel}`
})

const handleSubmitAndSend = async () => {
  await formRef.value?.validate(async (valid) => {
    if (!valid) return
    if (form.target_type === 'by_level' && form.target_levels.length === 0) {
      return ElMessage.warning('请选择至少一个用户等级')
    }
    if (form.target_type === 'by_ids' && form.target_user_ids.length === 0 && !form.target_ids_text.trim()) {
      return ElMessage.warning('请挑选用户或在高级区粘贴 ID')
    }

    // 先获取目标用户预览，弹出确认弹窗
    const payload = buildPayload()
    pendingMassPayload = payload
    massPreviewLoading.value = true
    massConfirmVisible.value = true
    massPreviewUsers.value = []
    massPreviewCount.value = 0

    try {
      const previewPayload = {
        targetType: payload.targetType,
        targetRoles: payload.targetRoles,
        targetUsers: payload.targetUsers
      }
      const res = await previewMassMessage(previewPayload)
      massPreviewUsers.value = res?.preview || []
      massPreviewCount.value = res?.count ?? 0
      massPreviewTruncated.value = !!res?.truncated
    } catch (e) {
      massConfirmVisible.value = false
      ElMessage.error('查询目标用户失败，请重试')
    } finally {
      massPreviewLoading.value = false
    }
  })
}

// 确认名单后实际执行群发
const doMassSend = async () => {
  if (!pendingMassPayload) return
  massConfirming.value = true
  try {
    await createMassMessage(pendingMassPayload)
    ElMessage.success(form.send_mode === 'now' ? '群发已开始！' : '定时群发已设置')
    massConfirmVisible.value = false
    createDialogVisible.value = false
    fetchData()
  } catch (e) {
    console.error('发送失败:', e)
    if (!e?.__handledByRequest) ElMessage.error(e?.message || '发送失败')
  } finally {
    massConfirming.value = false
  }
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
