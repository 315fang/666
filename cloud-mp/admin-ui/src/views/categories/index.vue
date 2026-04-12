<template>
  <div class="categories-page">
    <el-card shadow="never">
      <template #header>
        <div class="head">
          <span>商品分类管理</span>
          <el-button type="primary" @click="openCreate">新增分类</el-button>
        </div>
      </template>

      <el-table :data="categories" v-loading="loading" border>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="分类名称" min-width="220" />
        <el-table-column prop="sort_order" label="排序" width="100" />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="Number(row.status) === 1 ? 'success' : 'info'">
              {{ Number(row.status) === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-popconfirm title="确认删除该分类？" @confirm="onDelete(row)">
              <template #reference>
                <el-button size="small" type="danger" plain>删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑分类' : '新增分类'" width="460px">
      <el-form label-width="90px">
        <el-form-item label="分类名称" required>
          <el-input v-model="form.name" placeholder="请输入分类名称" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort_order" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getCategories, createCategory, updateCategory, deleteCategory } from '@/api'

const loading = ref(false)
const saving = ref(false)
const categories = ref([])
const dialogVisible = ref(false)
const form = reactive({
  id: null,
  name: '',
  sort_order: 0,
  status: 1
})

const resetForm = () => {
  form.id = null
  form.name = ''
  form.sort_order = 0
  form.status = 1
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await getCategories()
    const rows = Array.isArray(res) ? res : (res?.list || [])
    categories.value = rows.map(item => ({
      ...item,
      id: item.id ?? item._legacy_id ?? item._id ?? null
    }))
  } catch (e) {
    ElMessage.error('分类列表加载失败，请刷新重试')
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  resetForm()
  dialogVisible.value = true
}

const openEdit = (row) => {
  form.id = row.id
  form.name = row.name || ''
  form.sort_order = Number(row.sort_order || 0)
  form.status = Number(row.status || 0) === 1 ? 1 : 0
  dialogVisible.value = true
}

const onSave = async () => {
  if (!form.name.trim()) {
    ElMessage.warning('请先填写分类名称')
    return
  }
  saving.value = true
  try {
    const payload = {
      name: form.name.trim(),
      sort_order: Number(form.sort_order || 0),
      status: Number(form.status || 0) === 1 ? 1 : 0
    }
    if (form.id) await updateCategory(form.id, payload)
    else await createCategory(payload)
    ElMessage.success('保存成功')
    dialogVisible.value = false
    fetchList()
  } finally {
    saving.value = false
  }
}

const onDelete = async (row) => {
  await deleteCategory(row.id)
  ElMessage.success('删除成功')
  fetchList()
}

onMounted(fetchList)
</script>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
