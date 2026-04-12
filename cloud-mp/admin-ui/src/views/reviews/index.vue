<template>
  <div class="reviews-page">
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm">
        <el-form-item label="关键词">
          <!-- 后端按评论内容模糊匹配 -->
          <el-input v-model="searchForm.keyword" placeholder="评论内容" clearable style="width:220px" @keyup.enter="fetchReviews" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" clearable style="width:120px">
            <el-option label="显示" :value="1" />
            <el-option label="隐藏" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchReviews">搜索</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card style="margin-top:16px">
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column label="商品" min-width="220">
          <template #default="{ row }">
            <div class="product-block">
              <el-image :src="row.product?.images?.[0] || ''" class="thumb" fit="cover" />
              <div class="meta">
                <div class="title">{{ row.product?.name || '商品' }}</div>
                <div class="sub">订单：{{ row.order?.order_no || '-' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="用户" width="160">
          <template #default="{ row }">
            <div>{{ displayUserName(row.user, '用户') }}</div>
            <div class="muted">{{ row.user?.member_no || '' }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="rating" label="评分" width="80" />
        <el-table-column prop="content" label="评论内容" min-width="260" show-overflow-tooltip />
        <el-table-column label="精选" width="90">
          <template #default="{ row }">
            <el-tag :type="row.is_featured ? 'warning' : 'info'" size="small">{{ row.is_featured ? '精选' : '普通' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status ? 'success' : 'info'" size="small">{{ row.status ? '显示' : '隐藏' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button text type="warning" size="small" @click="toggleFeatured(row)">{{ row.is_featured ? '取消精选' : '设为精选' }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" title="编辑评论" width="620px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="评论内容">
          <el-input v-model="form.content" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item label="回复内容">
          <el-input v-model="form.reply_content" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="显示状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item label="精选评论">
          <el-switch v-model="form.is_featured" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitEdit" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getReviews, updateReview } from '@/api'
import { getUserNickname } from '@/utils/userDisplay'

const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const tableData = ref([])
const currentId = ref(null)
const searchForm = reactive({ keyword: '', status: '' })
const form = reactive({ content: '', reply_content: '', status: 1, is_featured: 0 })
const displayUserName = (user, fallback = '-') => getUserNickname(user || {}, fallback)

const fetchReviews = async () => {
  loading.value = true
  try {
    const res = await getReviews(searchForm)
    tableData.value = res?.list || []
  } finally {
    loading.value = false
  }
}

const openEdit = (row) => {
  currentId.value = row.id
  Object.assign(form, {
    content: row.content,
    reply_content: row.reply_content || '',
    status: row.status,
    is_featured: row.is_featured
  })
  dialogVisible.value = true
}

const submitEdit = async () => {
  submitting.value = true
  try {
    await updateReview(currentId.value, form)
    ElMessage.success('评论已更新')
    dialogVisible.value = false
    fetchReviews()
  } finally {
    submitting.value = false
  }
}

const toggleFeatured = async (row) => {
  await updateReview(row.id, { is_featured: row.is_featured ? 0 : 1 })
  ElMessage.success(row.is_featured ? '已取消精选' : '已设为精选')
  fetchReviews()
}

onMounted(fetchReviews)
</script>

<style scoped>
.reviews-page { padding: 0; }
.product-block { display: flex; gap: 12px; align-items: center; }
.thumb { width: 52px; height: 52px; border-radius: 6px; background: #f5f7fa; }
.meta { min-width: 0; }
.title { font-size: 13px; font-weight: 600; color: #1a1a2e; }
.sub { font-size: 12px; color: #909399; margin-top: 4px; }
.muted { font-size: 12px; color: #909399; }
</style>
