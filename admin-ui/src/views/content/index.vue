<template>
  <div class="content-page">
    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <!-- ====== Banner 管理 ====== -->
      <el-tab-pane label="Banner 管理" name="banner">
        <el-card style="margin-top: 16px;">
          <template #header>
            <div class="card-header">
              <span>Banner 列表</span>
              <el-button type="primary" @click="handleAddBanner">
                <el-icon><Plus /></el-icon>
                新增 Banner
              </el-button>
            </div>
          </template>

          <el-table :data="banners" v-loading="bannerLoading" stripe>
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column label="图片" width="120">
              <template #default="{ row }">
                <el-image
                  :src="row.image_url"
                  fit="cover"
                  style="width: 80px; height: 40px; border-radius: 4px;"
                  :preview-src-list="[row.image_url]"
                />
              </template>
            </el-table-column>
            <el-table-column prop="title" label="标题" min-width="150" />
            <el-table-column prop="link_url" label="跳转链接" min-width="200" show-overflow-tooltip />
            <el-table-column prop="sort_order" label="排序" width="80" />
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
                  {{ row.status === 1 ? '显示' : '隐藏' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="handleEditBanner(row)">编辑</el-button>
                <el-button text type="danger" size="small" @click="handleDeleteBanner(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- ====== 公告/内容管理 ====== -->
      <el-tab-pane label="图文内容" name="article">
        <el-card style="margin-top: 16px;">
          <template #header>
            <div class="card-header">
              <span>图文内容</span>
              <el-button type="primary" @click="handleAddContent">
                <el-icon><Plus /></el-icon>
                新增内容
              </el-button>
            </div>
          </template>

          <el-table :data="contents" v-loading="contentLoading" stripe>
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="title" label="标题" min-width="200" />
            <el-table-column prop="type" label="类型" width="100">
              <template #default="{ row }">
                <el-tag size="small">{{ row.type || 'article' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="创建时间" width="160">
              <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="handleEditContent(row)">编辑</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- Banner 编辑对话框 -->
    <el-dialog
      v-model="bannerDialogVisible"
      :title="bannerIsEdit ? '编辑 Banner' : '新增 Banner'"
      width="600px"
    >
      <el-form ref="bannerFormRef" :model="bannerForm" :rules="bannerRules" label-width="100px">
        <el-form-item label="标题" prop="title">
          <el-input v-model="bannerForm.title" placeholder="Banner 标题（可选）" />
        </el-form-item>
        <el-form-item label="图片" prop="image_url">
          <div class="upload-area">
            <el-upload
              class="banner-uploader"
              :show-file-list="false"
              :http-request="handleBannerUpload"
              :before-upload="beforeUpload"
              accept="image/*"
            >
              <img v-if="bannerForm.image_url" :src="bannerForm.image_url" class="banner-preview" />
              <div v-else class="upload-placeholder">
                <el-icon :size="28"><Plus /></el-icon>
                <div>上传图片</div>
              </div>
            </el-upload>
            <div class="upload-tip">推荐尺寸 750×280，支持 JPG/PNG，最大 2MB</div>
          </div>
        </el-form-item>
        <el-form-item label="跳转链接">
          <el-input v-model="bannerForm.link_url" placeholder="小程序页面路径或外部链接" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="bannerForm.sort_order" :min="0" :max="999" />
          <span style="margin-left: 8px; color: #909399; font-size: 12px;">数字越小越靠前</span>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="bannerForm.status" :active-value="1" :inactive-value="0" active-text="显示" inactive-text="隐藏" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="bannerDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleBannerSubmit" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>

    <!-- 内容编辑对话框 -->
    <el-dialog v-model="contentDialogVisible" :title="contentIsEdit ? '编辑内容' : '新增内容'" width="700px">
      <el-form :model="contentForm" label-width="80px">
        <el-form-item label="标题">
          <el-input v-model="contentForm.title" placeholder="内容标题" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="contentForm.type">
            <el-option label="文章" value="article" />
            <el-option label="公告" value="notice" />
            <el-option label="帮助" value="help" />
          </el-select>
        </el-form-item>
        <el-form-item label="正文">
          <el-input v-model="contentForm.content" type="textarea" :rows="8" placeholder="支持 HTML 内容" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="contentDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleContentSubmit" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getBanners, createBanner, updateBanner, deleteBanner, uploadFile } from '@/api'
import request from '@/utils/request'
import dayjs from 'dayjs'

const activeTab = ref('banner')
const submitting = ref(false)

// ===== Banner =====
const bannerLoading = ref(false)
const banners = ref([])
const bannerDialogVisible = ref(false)
const bannerIsEdit = ref(false)
const bannerFormRef = ref()
const bannerForm = reactive({ id: null, title: '', image_url: '', link_url: '', sort_order: 0, status: 1 })
const bannerRules = {
  image_url: [{ required: true, message: '请上传 Banner 图片', trigger: 'change' }]
}

// ===== Content =====
const contentLoading = ref(false)
const contents = ref([])
const contentDialogVisible = ref(false)
const contentIsEdit = ref(false)
const contentForm = reactive({ id: null, title: '', type: 'article', content: '' })

const fetchBanners = async () => {
  bannerLoading.value = true
  try {
    const res = await getBanners()
    banners.value = Array.isArray(res) ? res : (res.list || res.data || [])
  } catch (e) {
    console.error('获取Banner失败:', e)
  } finally {
    bannerLoading.value = false
  }
}

const fetchContents = async () => {
  contentLoading.value = true
  try {
    const res = await request({ url: '/contents', method: 'get' })
    contents.value = res.list || res.data || []
  } catch (e) {
    console.error('获取内容列表失败:', e)
  } finally {
    contentLoading.value = false
  }
}

const handleTabChange = (name) => {
  if (name === 'article' && contents.value.length === 0) fetchContents()
}

const handleAddBanner = () => {
  bannerIsEdit.value = false
  Object.assign(bannerForm, { id: null, title: '', image_url: '', link_url: '', sort_order: 0, status: 1 })
  bannerDialogVisible.value = true
}

const handleEditBanner = (row) => {
  bannerIsEdit.value = true
  Object.assign(bannerForm, row)
  bannerDialogVisible.value = true
}

const handleBannerSubmit = async () => {
  await bannerFormRef.value?.validate(async (valid) => {
    if (!valid) return
    submitting.value = true
    try {
      if (bannerIsEdit.value) {
        await updateBanner(bannerForm.id, bannerForm)
        ElMessage.success('更新成功')
      } else {
        await createBanner(bannerForm)
        ElMessage.success('创建成功')
      }
      bannerDialogVisible.value = false
      fetchBanners()
    } catch (e) {
      console.error('提交失败:', e)
    } finally {
      submitting.value = false
    }
  })
}

const handleDeleteBanner = async (row) => {
  try {
    await ElMessageBox.confirm(`确认删除 Banner "${row.title || row.id}"？`, '确认删除', { type: 'warning' })
    await deleteBanner(row.id)
    ElMessage.success('已删除')
    fetchBanners()
  } catch (e) {
    if (e !== 'cancel') console.error('删除失败:', e)
  }
}

const handleBannerUpload = async ({ file }) => {
  try {
    const data = await uploadFile(file)
    bannerForm.image_url = data.url
    ElMessage.success('上传成功')
  } catch (e) {
    console.error('上传失败:', e)
  }
}

const beforeUpload = (file) => {
  if (!file.type.startsWith('image/')) { ElMessage.error('只能上传图片'); return false }
  if (file.size > 2 * 1024 * 1024) { ElMessage.error('图片不能超过 2MB'); return false }
  return true
}

const handleAddContent = () => {
  contentIsEdit.value = false
  Object.assign(contentForm, { id: null, title: '', type: 'article', content: '' })
  contentDialogVisible.value = true
}

const handleEditContent = (row) => {
  contentIsEdit.value = true
  Object.assign(contentForm, row)
  contentDialogVisible.value = true
}

const handleContentSubmit = async () => {
  submitting.value = true
  try {
    if (contentIsEdit.value) {
      await request({ url: `/contents/${contentForm.id}`, method: 'put', data: contentForm })
      ElMessage.success('更新成功')
    } else {
      await request({ url: '/contents', method: 'post', data: contentForm })
      ElMessage.success('创建成功')
    }
    contentDialogVisible.value = false
    fetchContents()
  } catch (e) {
    console.error('提交失败:', e)
  } finally {
    submitting.value = false
  }
}

const formatDate = (d) => d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '-'
onMounted(fetchBanners)
</script>

<style scoped>
.content-page { padding: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.upload-area { display: flex; flex-direction: column; gap: 8px; }
.banner-uploader { width: 300px; border: 1px dashed #d9d9d9; border-radius: 6px; overflow: hidden; cursor: pointer; }
.banner-uploader:hover { border-color: #409eff; }
.banner-preview { width: 300px; height: 100px; display: block; object-fit: cover; }
.upload-placeholder { width: 300px; height: 100px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #8c939d; gap: 4px; }
.upload-tip { font-size: 12px; color: #909399; }
</style>
