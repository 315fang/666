<template>
  <div class="materials-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>推广素材管理</span>
          <el-button type="primary" @click="handleAdd">
            <el-icon><Plus /></el-icon>
            新增素材
          </el-button>
        </div>
      </template>

      <!-- 搜索栏 -->
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="类型">
          <el-select v-model="searchForm.type" placeholder="全部" clearable style="width:120px">
            <el-option label="图片" value="image" />
            <el-option label="海报" value="poster" />
            <el-option label="视频" value="video" />
            <el-option label="文案" value="text" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="searchForm.keyword" placeholder="素材名称" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 卡片视图 -->
      <div v-if="viewMode === 'card'" class="material-grid">
        <div
          v-for="item in tableData"
          :key="item.id"
          class="material-card"
        >
          <div class="material-thumb">
            <el-image
              v-if="item.type === 'image' || item.type === 'poster'"
              :src="item.url"
              fit="cover"
              class="thumb-img"
              :preview-src-list="[item.url]"
            />
            <div v-else class="thumb-placeholder">
              <el-icon :size="32" color="#909399"><Document /></el-icon>
            </div>
          </div>
          <div class="material-info">
            <div class="material-title">{{ item.title || item.name || '-' }}</div>
            <el-tag size="small" style="margin-top: 4px;">{{ item.type }}</el-tag>
          </div>
          <div class="material-actions">
            <el-button text type="primary" size="small" @click="handleEdit(item)">编辑</el-button>
            <el-button text type="danger" size="small" @click="handleDelete(item)">删除</el-button>
          </div>
        </div>
      </div>

      <!-- 分页 -->
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.limit"
        :total="pagination.total"
        :page-sizes="[12, 24, 48]"
        layout="total, sizes, prev, pager, next"
        @size-change="fetchData"
        @current-change="fetchData"
        style="margin-top: 20px; justify-content: flex-end;"
      />
    </el-card>

    <!-- 编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑素材' : '新增素材'" width="560px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="名称" prop="title">
          <el-input v-model="form.title" placeholder="素材名称" />
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-select v-model="form.type" style="width:100%">
            <el-option label="图片" value="image" />
            <el-option label="海报" value="poster" />
            <el-option label="视频" value="video" />
            <el-option label="文案" value="text" />
          </el-select>
        </el-form-item>
        <el-form-item label="素材" v-if="form.type !== 'text'">
          <el-upload
            :show-file-list="false"
            :http-request="handleUpload"
            :before-upload="beforeUpload"
          >
            <img v-if="form.url && (form.type === 'image' || form.type === 'poster')" :src="form.url" style="max-width:200px;max-height:120px;border-radius:4px;" />
            <el-button v-else :type="form.url ? 'success' : 'default'">
              {{ form.url ? '✓ 已上传，点击替换' : '点击上传文件' }}
            </el-button>
          </el-upload>
        </el-form-item>
        <el-form-item label="文案内容" v-if="form.type === 'text'">
          <el-input v-model="form.content" type="textarea" :rows="4" placeholder="推广文案内容" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="素材说明（可选）" />
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
import { uploadFile } from '@/api'
import request from '@/utils/request'

const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const viewMode = ref('card')
const formRef = ref()

const searchForm = reactive({ type: '', keyword: '' })
const pagination = reactive({ page: 1, limit: 12, total: 0 })
const tableData = ref([])
const form = reactive({ id: null, title: '', type: 'image', url: '', content: '', description: '' })
const rules = {
  title: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }]
}

const fetchData = async () => {
  loading.value = true
  try {
    const res = await request({
      url: '/materials',
      method: 'get',
      params: { ...searchForm, page: pagination.page, limit: pagination.limit }
    })
    tableData.value = res.list || res.data?.list || []
    pagination.total = res.total || res.data?.total || 0
  } catch (e) {
    console.error('获取素材列表失败:', e)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => { pagination.page = 1; fetchData() }
const handleReset = () => { searchForm.type = ''; searchForm.keyword = ''; handleSearch() }

const handleAdd = () => {
  isEdit.value = false
  Object.assign(form, { id: null, title: '', type: 'image', url: '', content: '', description: '' })
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  Object.assign(form, row)
  dialogVisible.value = true
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(`确认删除素材 "${row.title || row.id}"？`, '确认删除', { type: 'warning' })
    await request({ url: `/materials/${row.id}`, method: 'delete' })
    ElMessage.success('已删除')
    fetchData()
  } catch (e) {
    if (e !== 'cancel') console.error('删除失败:', e)
  }
}

const handleSubmit = async () => {
  await formRef.value?.validate(async (valid) => {
    if (!valid) return
    submitting.value = true
    try {
      if (isEdit.value) {
        await request({ url: `/materials/${form.id}`, method: 'put', data: form })
        ElMessage.success('更新成功')
      } else {
        await request({ url: '/materials', method: 'post', data: form })
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

const handleUpload = async ({ file }) => {
  try {
    const data = await uploadFile(file)
    form.url = data.url
    ElMessage.success('上传成功')
  } catch (e) {
    console.error('上传失败:', e)
  }
}

const beforeUpload = (file) => {
  if (file.size > 10 * 1024 * 1024) { ElMessage.error('文件不能超过 10MB'); return false }
  return true
}

onMounted(fetchData)
</script>

<style scoped>
.materials-page { padding: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.search-form { margin-bottom: 20px; }
.material-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.material-card { border: 1px solid #e4e7ed; border-radius: 8px; overflow: hidden; transition: box-shadow 0.2s; }
.material-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.material-thumb { height: 130px; background: #f5f7fa; display: flex; align-items: center; justify-content: center; }
.thumb-img { width: 100%; height: 130px; }
.thumb-placeholder { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
.material-info { padding: 10px 12px 4px; }
.material-title { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.material-actions { padding: 6px 8px; border-top: 1px solid #f0f0f0; display: flex; gap: 4px; }
</style>
