<template>
  <div class="home-sections-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>首页装修</span>
          <div class="header-actions">
            <el-button type="primary" @click="handleSaveSort" :loading="savingSortLoading" :disabled="!hasChanges">
              <el-icon><Check /></el-icon>
              保存排序
            </el-button>
            <el-tooltip content="拖拽左侧 ≡ 图标可调整显示顺序" placement="bottom">
              <el-icon style="cursor:help;color:#909399;font-size:18px;"><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>
        </div>
      </template>

      <!-- 说明 -->
      <el-alert
        title="拖动每行左侧的「≡」图标来调整首页各区块的显示顺序。点击「编辑」可修改区块标题和可见性。"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 20px;"
      />

      <!-- 可拖拽列表 -->
      <div class="sections-list" v-loading="loading">
        <div
          v-for="(section, index) in sections"
          :key="section.id"
          class="section-item"
          :class="{ 'is-hidden': !section.is_visible }"
          draggable="true"
          @dragstart="handleDragStart(index)"
          @dragover.prevent="handleDragOver(index)"
          @drop="handleDrop(index)"
          @dragend="handleDragEnd"
        >
          <!-- 拖拽手柄 -->
          <div class="drag-handle">
            <el-icon color="#aaa"><Grid /></el-icon>
          </div>

          <!-- 区块信息 -->
          <div class="section-info">
            <div class="section-name">{{ section.title || section.section_type }}</div>
            <div class="section-sub">{{ section.subtitle || sectionTypeText(section.section_type) }}</div>
          </div>

          <!-- 排序序号 -->
          <div class="section-order">
            <el-tag type="info" size="small">#{{ index + 1 }}</el-tag>
          </div>

          <!-- 可见性开关 -->
          <div class="section-visibility">
            <el-switch
              v-model="section.is_visible"
              :active-value="1"
              :inactive-value="0"
              active-text="显示"
              inactive-text="隐藏"
              @change="markChanged"
            />
          </div>

          <!-- 编辑按钮 -->
          <div class="section-actions">
            <el-button text type="primary" size="small" @click="handleEdit(section)">编辑</el-button>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 编辑对话框 -->
    <el-dialog v-model="editDialogVisible" title="编辑区块" width="520px">
      <el-form ref="editFormRef" :model="editForm" label-width="100px">
        <el-form-item label="区块类型">
          <el-tag>{{ sectionTypeText(editForm.section_type) }}</el-tag>
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="editForm.title" placeholder="区块标题（留空使用默认）" />
        </el-form-item>
        <el-form-item label="副标题">
          <el-input v-model="editForm.subtitle" placeholder="区块副标题（可选）" />
        </el-form-item>
        <el-form-item label="是否显示">
          <el-switch v-model="editForm.is_visible" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item label="排序权重">
          <el-input-number v-model="editForm.sort_order" :min="0" :max="9999" />
          <span style="margin-left: 8px; font-size: 12px; color: #909399;">数字越大越靠前</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleEditSubmit" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import request from '@/utils/request'

const loading = ref(false)
const savingSortLoading = ref(false)
const submitting = ref(false)
const editDialogVisible = ref(false)
const hasChanges = ref(false)
const sections = ref([])
const editForm = reactive({ id: null, title: '', subtitle: '', is_visible: 1, sort_order: 0, section_type: '' })

// 拖拽状态
let dragSourceIndex = -1
let dragTargetIndex = -1

const fetchData = async () => {
  loading.value = true
  try {
    const res = await request({ url: '/home-sections', method: 'get' })
    sections.value = (res.data || res.list || []).sort((a, b) => b.sort_order - a.sort_order)
  } catch (e) {
    console.error('获取首页区块失败:', e)
  } finally {
    loading.value = false
  }
}

const handleDragStart = (index) => {
  dragSourceIndex = index
}

const handleDragOver = (index) => {
  dragTargetIndex = index
  if (dragSourceIndex !== dragTargetIndex) {
    // 实时更新列表顺序
    const list = [...sections.value]
    const [moved] = list.splice(dragSourceIndex, 1)
    list.splice(dragTargetIndex, 0, moved)
    sections.value = list
    dragSourceIndex = dragTargetIndex
    markChanged()
  }
}

const handleDrop = (index) => {
  dragTargetIndex = index
}

const handleDragEnd = () => {
  dragSourceIndex = -1
  dragTargetIndex = -1
}

const markChanged = () => {
  hasChanges.value = true
}

const handleSaveSort = async () => {
  savingSortLoading.value = true
  try {
    const orders = sections.value.map((section, index) => ({
      id: section.id,
      sort_order: sections.value.length - index,  // 越靠前数字越大
      is_visible: section.is_visible
    }))
    await request({ url: '/home-sections/sort', method: 'post', data: { orders } })
    ElMessage.success('排序已保存')
    hasChanges.value = false
  } catch (e) {
    console.error('保存排序失败:', e)
  } finally {
    savingSortLoading.value = false
  }
}

const handleEdit = (section) => {
  Object.assign(editForm, section)
  editDialogVisible.value = true
}

const handleEditSubmit = async () => {
  submitting.value = true
  try {
    await request({
      url: `/home-sections/${editForm.id}`,
      method: 'put',
      data: {
        title: editForm.title,
        subtitle: editForm.subtitle,
        is_visible: editForm.is_visible,
        sort_order: editForm.sort_order
      }
    })
    ElMessage.success('更新成功')
    editDialogVisible.value = false
    fetchData()
    hasChanges.value = false
  } catch (e) {
    console.error('更新失败:', e)
  } finally {
    submitting.value = false
  }
}

const sectionTypeText = (type) => ({
  banner: 'Banner 轮播',
  quick_entry: '快速入口',
  featured_products: '精选商品',
  group_buy: '拼团活动',
  lottery: '抽奖活动',
  flash_sale: '限时特惠',
  notice: '公告通知',
  custom: '自定义区块'
}[type] || type || '-')

onMounted(fetchData)
</script>

<style scoped>
.home-sections-page { padding: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.header-actions { display: flex; align-items: center; gap: 12px; }
.sections-list { display: flex; flex-direction: column; gap: 8px; }
.section-item {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  gap: 16px;
  cursor: default;
  transition: all 0.2s;
  user-select: none;
}
.section-item:hover { border-color: #409eff; box-shadow: 0 2px 8px rgba(64,158,255,.15); }
.section-item.is-hidden { background: #fafafa; opacity: 0.7; }
.drag-handle { cursor: grab; font-size: 18px; }
.drag-handle:active { cursor: grabbing; }
.section-info { flex: 1; }
.section-name { font-size: 14px; font-weight: 500; color: #303133; }
.section-sub { font-size: 12px; color: #909399; margin-top: 2px; }
.section-order { width: 48px; display: flex; justify-content: center; }
.section-visibility { width: 120px; }
.section-actions { width: 60px; display: flex; justify-content: flex-end; }
</style>
