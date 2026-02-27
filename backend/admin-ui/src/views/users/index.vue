<template>
  <div class="users-page">
    <el-card>
      <template #header>
        用户管理
      </template>
      
      <!-- 搜索栏 -->
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="用户昵称">
          <el-input v-model="searchForm.nickname" placeholder="请输入用户昵称" clearable />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="searchForm.role" placeholder="请选择角色" clearable>
            <el-option label="普通用户" value="user" />
            <el-option label="分销商" value="distributor" />
            <el-option label="合伙人" value="partner" />
            <el-option label="经销商" value="dealer" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
      
      <!-- 表格 -->
      <el-table :data="tableData" v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column label="头像" width="80">
          <template #default="{ row }">
            <el-avatar :src="row.avatar_url" />
          </template>
        </el-table-column>
        <el-table-column prop="nickname" label="昵称" width="150" />
        <el-table-column prop="phone" label="手机号" width="120" />
        <el-table-column prop="role" label="角色" width="120">
          <template #default="{ row }">
            <el-tag :type="getRoleType(row.role)">
              {{ getRoleText(row.role) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="balance" label="余额" width="120">
          <template #default="{ row }">
            ¥{{ row.balance || 0 }}
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="注册时间" width="180" />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" @click="handleEdit(row)">
              编辑角色
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.limit"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSearch"
        @current-change="handleSearch"
        style="margin-top: 20px; justify-content: flex-end;"
      />
    </el-card>
    
    <!-- 编辑角色对话框 -->
    <el-dialog v-model="dialogVisible" title="编辑用户角色" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="用户昵称">
          <el-input v-model="form.nickname" disabled />
        </el-form-item>
        <el-form-item label="用户角色">
          <el-select v-model="form.role" placeholder="请选择角色">
            <el-option label="普通用户" value="user" />
            <el-option label="分销商" value="distributor" />
            <el-option label="合伙人" value="partner" />
            <el-option label="经销商" value="dealer" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getUsers, updateUserRole } from '@/api'

const loading = ref(false)
const dialogVisible = ref(false)

const searchForm = reactive({
  nickname: '',
  role: ''
})

const pagination = reactive({
  page: 1,
  limit: 10,
  total: 0
})

const tableData = ref([])

const form = reactive({
  id: null,
  nickname: '',
  role: ''
})

const fetchUsers = async () => {
  loading.value = true
  try {
    const params = {
      ...searchForm,
      page: pagination.page,
      limit: pagination.limit
    }
    const data = await getUsers(params)
    tableData.value = data.list || []
    pagination.total = data.total || 0
  } catch (error) {
    console.error('获取用户列表失败:', error)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  pagination.page = 1
  fetchUsers()
}

const handleReset = () => {
  searchForm.nickname = ''
  searchForm.role = ''
  handleSearch()
}

const handleEdit = (row) => {
  form.id = row.id
  form.nickname = row.nickname
  form.role = row.role
  dialogVisible.value = true
}

const handleSubmit = async () => {
  try {
    await updateUserRole(form.id, { role: form.role })
    ElMessage.success('角色更新成功')
    dialogVisible.value = false
    fetchUsers()
  } catch (error) {
    console.error('角色更新失败:', error)
  }
}

const getRoleType = (role) => {
  const map = {
    user: '',
    distributor: 'success',
    partner: 'warning',
    dealer: 'danger'
  }
  return map[role] || ''
}

const getRoleText = (role) => {
  const map = {
    user: '普通用户',
    distributor: '分销商',
    partner: '合伙人',
    dealer: '经销商'
  }
  return map[role] || role
}

onMounted(() => {
  fetchUsers()
})
</script>

<style scoped>
.users-page {
  padding: 0;
}

.search-form {
  margin-bottom: 20px;
}
</style>
