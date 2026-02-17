<template>
  <div class="category-page">
    <!-- Page Header -->
    <div class="page-header">
      <h2 class="page-title">
        <el-icon><FolderOpened /></el-icon>
        商品类目管理
      </h2>
      <el-button type="primary" @click="showDialog()">
        <el-icon><Plus /></el-icon>
        新增类目
      </el-button>
    </div>

    <!-- Table -->
    <el-card class="table-card" shadow="never">
      <el-table
        :data="categoryTree"
        row-key="id"
        border
        default-expand-all
        v-loading="loading"
      >
        <el-table-column label="类目名称" min-width="200">
          <template #default="{ row }">
            <div class="category-name">
              <el-avatar 
                v-if="row.icon_url" 
                :size="36" 
                :src="row.icon_url" 
                shape="square"
                class="category-icon"
              />
              <div v-else class="category-icon-placeholder">
                <el-icon><Folder /></el-icon>
              </div>
              <span class="name">{{ row.name }}</span>
              <el-tag v-if="row.children && row.children.length" size="small" type="info" effect="plain">
                {{ row.children.length }}个子类
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="排序" width="100" align="center">
          <template #default="{ row }">
            <el-tag type="info" effect="plain" size="small">
              {{ row.sort }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-switch
              v-model="row.status"
              :active-value="1"
              :inactive-value="0"
              active-text="启用"
              inactive-text="禁用"
              inline-prompt
              @change="handleStatusChange(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="280" align="center">
          <template #default="{ row }">
            <el-button-group>
              <el-button type="primary" size="small" plain @click="showDialog(null, row.id)">
                <el-icon><Plus /></el-icon>添加子类
              </el-button>
              <el-button type="warning" size="small" plain @click="showDialog(row)">
                <el-icon><Edit /></el-icon>编辑
              </el-button>
              <el-button type="danger" size="small" plain @click="handleDelete(row)">
                <el-icon><Delete /></el-icon>删除
              </el-button>
            </el-button-group>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Dialog -->
    <el-dialog 
      v-model="dialogVisible" 
      :title="form.id ? '编辑类目' : '新增类目'" 
      width="520px"
      destroy-on-close
    >
      <el-form :model="form" label-width="100px" class="category-form">
        <el-form-item label="父级类目">
          <el-tree-select
            v-model="form.parent_id"
            :data="categoryTree"
            :props="{ label: 'name', value: 'id', children: 'children' }"
            check-strictly
            clearable
            placeholder="请选择父级类目（留空为顶级）"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="类目名称" required>
          <el-input v-model="form.name" placeholder="请输入类目名称" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="图标">
          <div class="icon-upload">
            <el-input v-model="form.icon_url" placeholder="请输入图标URL或上传图片" clearable>
              <template #append>
                <el-upload
                  :action="uploadUrl"
                  :headers="uploadHeaders"
                  :on-success="handleUploadSuccess"
                  :show-file-list="false"
                  accept="image/*"
                >
                  <el-button>
                    <el-icon><Upload /></el-icon>
                  </el-button>
                </el-upload>
              </template>
            </el-input>
            <div v-if="form.icon_url" class="icon-preview">
              <el-image :src="form.icon_url" style="width: 60px; height: 60px; border-radius: 8px;" fit="cover" />
            </div>
          </div>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="999" style="width: 150px;" />
          <span class="form-tip">数字越小排序越靠前</span>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch
            v-model="form.status"
            :active-value="1"
            :inactive-value="0"
            active-text="启用"
            inactive-text="禁用"
            inline-prompt
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">
          <el-icon><Check /></el-icon> 保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { getCategories, createCategory, updateCategory, updateCategoryStatus, deleteCategory } from '@/api/product'
import { ElMessage, ElMessageBox } from 'element-plus'
import { FolderOpened, Plus, Folder, Edit, Delete, Upload, Check } from '@element-plus/icons-vue'

const categories = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const submitting = ref(false)

const form = reactive({
  id: null,
  parent_id: null,
  name: '',
  icon_url: '',
  sort: 0,
  status: 1
})

// Upload config
const uploadUrl = import.meta.env.VITE_API_BASE_URL + '/upload'
const uploadHeaders = {
  Authorization: `Bearer ${localStorage.getItem('token') || ''}`
}

const handleUploadSuccess = (res) => {
  if (res.code === 0 && res.data?.url) {
    form.icon_url = res.data.url
    ElMessage.success('上传成功')
  } else {
    ElMessage.error(res.message || '上传失败')
  }
}

const categoryTree = computed(() => {
  return buildTree(categories.value)
})

const buildTree = (items, parentId = null) => {
  const tree = []
  items.forEach(item => {
    if (item.parent_id === parentId) {
      const children = buildTree(items, item.id)
      if (children.length) {
        item.children = children
      }
      tree.push(item)
    }
  })
  return tree
}

const loadData = async () => {
  loading.value = true
  try {
    const res = await getCategories()
    categories.value = res || []
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

const showDialog = (row = null, parentId = null) => {
  if (row) {
    Object.assign(form, row)
  } else {
    form.id = null
    form.name = ''
    form.icon_url = ''
    form.sort = 0
    form.status = 1
    form.parent_id = parentId
  }
  dialogVisible.value = true
}

const submitForm = async () => {
  if (!form.name.trim()) {
    ElMessage.warning('请输入类目名称')
    return
  }

  submitting.value = true
  try {
    if (form.id) {
      await updateCategory(form.id, form)
      ElMessage.success('更新成功')
    } else {
      await createCategory(form)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    loadData()
  } catch (error) {
    console.error(error)
  } finally {
    submitting.value = false
  }
}

const handleStatusChange = async (row) => {
  try {
    await updateCategoryStatus(row.id, row.status)
    ElMessage.success(row.status === 1 ? '已启用' : '已禁用')
  } catch (error) {
    row.status = row.status === 1 ? 0 : 1
    console.error(error)
  }
}

const handleDelete = (row) => {
  ElMessageBox.confirm(
    `确定删除类目 "${row.name}" 吗？${row.children?.length ? '该类目下有子类目，删除后将一并删除！' : ''}`,
    '删除确认',
    {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消'
    }
  ).then(async () => {
    try {
      await deleteCategory(row.id)
      ElMessage.success('删除成功')
      loadData()
    } catch (error) {
      console.error(error)
    }
  })
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.category-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.table-card {
  margin-bottom: 20px;
}

.category-name {
  display: flex;
  align-items: center;
  gap: 10px;
}

.category-icon {
  border: 1px solid #e4e7ed;
  border-radius: 6px;
}

.category-icon-placeholder {
  width: 36px;
  height: 36px;
  background: #f5f7fa;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
}

.category-name .name {
  font-weight: 600;
  color: #303133;
}

.category-form .form-tip {
  margin-left: 10px;
  color: #909399;
  font-size: 12px;
}

.icon-upload {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.icon-preview {
  padding: 10px;
  background: #f5f7fa;
  border-radius: 8px;
  display: inline-block;
}

:deep(.el-table__row--level-0) {
  background-color: #fafafa;
}

:deep(.el-table__row--level-1) {
  background-color: #ffffff;
}
</style>