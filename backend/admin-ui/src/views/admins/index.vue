<template>
  <div class="admins-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>管理员账号管理</span>
          <el-button type="primary" @click="handleAdd">
            <el-icon><Plus /></el-icon>
            新增管理员
          </el-button>
        </div>
      </template>

      <!-- 表格 -->
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="username" label="用户名" width="150" />
        <el-table-column label="角色" width="140">
          <template #default="{ row }">
            <el-tag :type="roleTagType(row.role)" size="small">{{ roleText(row.role) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
              {{ row.status === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="last_login_at" label="最后登录" width="160">
          <template #default="{ row }">{{ formatDate(row.last_login_at) }}</template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160">
          <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="handleEdit(row)">编辑</el-button>
            <el-button text type="warning" size="small" @click="handleResetPwd(row)">重置密码</el-button>
            <el-button
              text
              :type="row.status === 1 ? 'danger' : 'success'"
              size="small"
              @click="handleToggleStatus(row)"
              :disabled="row.role === 'super_admin'"
            >
              {{ row.status === 1 ? '禁用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑管理员' : '新增管理员'"
      width="500px"
      @close="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" :disabled="isEdit" placeholder="登录用户名" />
        </el-form-item>
        <el-form-item label="密码" prop="password" v-if="!isEdit">
          <el-input v-model="form.password" type="password" show-password placeholder="至少6位" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="form.role" style="width:100%">
            <el-option label="管理员 (商品+订单+用户+内容)" value="admin" />
            <el-option label="运营 (商品+订单+内容)" value="operator" />
            <el-option label="财务 (订单+提现+结算)" value="finance" />
            <el-option label="客服 (订单+售后+用户)" value="customer_service" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" v-if="isEdit">
          <el-radio-group v-model="form.status">
            <el-radio :label="1">启用</el-radio>
            <el-radio :label="0">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">确定</el-button>
      </template>
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
const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref()
const tableData = ref([])

const form = reactive({ id: null, username: '', password: '', role: 'operator', status: 1 })

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }, { min: 3, message: '至少3个字符' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }, { min: 6, message: '至少6位' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }]
}

const fetchData = async () => {
  loading.value = true
  try {
    const res = await request({ url: '/admins', method: 'get' })
    tableData.value = res.list || res.data || []
  } catch (e) {
    console.error('获取管理员列表失败:', e)
  } finally {
    loading.value = false
  }
}

const handleAdd = () => {
  isEdit.value = false
  Object.assign(form, { id: null, username: '', password: '', role: 'operator', status: 1 })
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  Object.assign(form, { id: row.id, username: row.username, role: row.role, status: row.status })
  dialogVisible.value = true
}

const handleSubmit = async () => {
  await formRef.value?.validate(async (valid) => {
    if (!valid) return
    submitting.value = true
    try {
      if (isEdit.value) {
        await request({ url: `/admins/${form.id}`, method: 'put', data: { role: form.role, status: form.status } })
        ElMessage.success('更新成功')
      } else {
        await request({ url: '/admins', method: 'post', data: { username: form.username, password: form.password, role: form.role } })
        ElMessage.success('创建成功')
      }
      dialogVisible.value = false
      fetchData()
    } catch (e) {
      console.error('提交失败:', e)
    } finally {
      submitting.value = false
    }
  })
}

const handleResetPwd = async (row) => {
  try {
    const { value: newPwd } = await ElMessageBox.prompt(`重置 "${row.username}" 的密码`, '重置密码', {
      confirmButtonText: '确认重置',
      cancelButtonText: '取消',
      inputPlaceholder: '输入新密码（至少6位）',
      inputValidator: (v) => v && v.length >= 6 ? true : '密码至少6位',
      type: 'warning'
    })
    await request({ url: `/admins/${row.id}/password`, method: 'put', data: { password: newPwd } })
    ElMessage.success('密码已重置')
  } catch (e) {
    if (e !== 'cancel') console.error('重置失败:', e)
  }
}

const handleToggleStatus = async (row) => {
  const action = row.status === 1 ? '禁用' : '启用'
  try {
    await ElMessageBox.confirm(`确认${action} "${row.username}"？`, '确认操作', { type: 'warning' })
    await request({ url: `/admins/${row.id}`, method: 'put', data: { status: row.status === 1 ? 0 : 1 } })
    ElMessage.success(`${action}成功`)
    fetchData()
  } catch (e) {
    if (e !== 'cancel') console.error('操作失败:', e)
  }
}

const resetForm = () => formRef.value?.resetFields()

const roleText = (r) => ({
  super_admin: '超级管理员', admin: '管理员', operator: '运营', finance: '财务', customer_service: '客服'
}[r] || r)
const roleTagType = (r) => ({
  super_admin: 'danger', admin: 'primary', operator: 'success', finance: 'warning', customer_service: 'info'
}[r] || '')
const formatDate = (d) => d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '-'

onMounted(fetchData)
</script>

<style scoped>
.admins-page { padding: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
