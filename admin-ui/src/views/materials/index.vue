<template>
  <div class="media-library">
    <!-- 左侧：分组侧边栏 -->
    <aside class="group-sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">素材库</span>
        <el-button type="primary" size="small" :icon="Plus" circle @click="showGroupDialog(null)" title="新建分组" />
      </div>

      <ul class="group-list">
        <li
          v-for="g in groups"
          :key="g.id ?? 'all'"
          class="group-item"
          :class="{ active: activeGroupId === g.id }"
          @click="selectGroup(g.id)"
        >
          <el-icon class="group-icon"><FolderOpened v-if="activeGroupId === g.id" /><Folder v-else /></el-icon>
          <span class="group-name">{{ g.name }}</span>
          <el-badge :value="g.count" :max="999" class="group-count" type="info" />

          <!-- 非虚拟分组才显示操作 -->
          <span v-if="!g._virtual" class="group-actions">
            <el-icon size="13" @click.stop="showGroupDialog(g)"><Edit /></el-icon>
            <el-icon size="13" @click.stop="handleDeleteGroup(g)"><Delete /></el-icon>
          </span>
        </li>
      </ul>
    </aside>

    <!-- 右侧：素材内容区 -->
    <main class="material-main">
      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <h3 class="area-title">{{ currentGroupName }}</h3>
          <el-tag v-if="selectedIds.length > 0" type="warning" size="small" style="margin-left:8px">
            已选 {{ selectedIds.length }} 项
          </el-tag>
        </div>
        <div class="toolbar-right">
          <!-- 批量操作 -->
          <template v-if="selectedIds.length > 0">
            <el-select v-model="moveTargetGroupId" placeholder="移动到分组" size="small" clearable style="width:130px">
              <el-option
                v-for="g in movableGroups"
                :key="g.id ?? 'none'"
                :label="g.name"
                :value="g.id"
              />
            </el-select>
            <el-button size="small" type="warning" @click="handleBatchMove" :disabled="!moveTargetGroupId">移动</el-button>
            <el-button size="small" type="danger" plain @click="selectedIds = []">取消选择</el-button>
            <el-divider direction="vertical" />
          </template>

          <!-- 过滤 -->
          <el-select v-model="searchForm.type" placeholder="全部类型" clearable size="small" style="width:110px">
            <el-option label="图片" value="image" />
            <el-option label="海报" value="poster" />
            <el-option label="视频" value="video" />
            <el-option label="音频" value="audio" />
            <el-option label="文案" value="text" />
          </el-select>
          <el-input v-model="searchForm.keyword" placeholder="搜索名称" clearable size="small" style="width:140px" @keyup.enter="doSearch" />
          <el-button size="small" @click="doSearch">搜索</el-button>
          <el-button type="primary" size="small" :icon="Plus" @click="handleAdd">上传素材</el-button>
        </div>
      </div>

      <!-- 素材网格 -->
      <div v-loading="loading" class="file-grid">
        <div v-if="tableData.length === 0 && !loading" class="empty-tip">
          <el-empty description="该分组暂无素材，点击上方「上传素材」添加" />
        </div>

        <div
          v-for="item in tableData"
          :key="item.id"
          class="file-card"
          :class="{ selected: selectedIds.includes(item.id) }"
          @click="toggleSelect(item.id)"
        >
          <!-- 选中蒙层 -->
          <div class="select-mask">
            <el-icon size="22" color="#fff"><Check /></el-icon>
          </div>

          <!-- 预览区 -->
          <div class="file-thumb">
            <el-image
              v-if="['image','poster'].includes(item.type)"
              :src="item.url"
              fit="cover"
              class="thumb-img"
              :preview-src-list="[item.url]"
              @click.stop
            />
            <video
              v-else-if="item.type === 'video'"
              :src="item.url"
              class="thumb-img thumb-video"
              preload="none"
            />
            <div v-else class="thumb-placeholder">
              <el-icon :size="32" color="#909399">
                <Microphone v-if="item.type === 'audio'" />
                <Document v-else />
              </el-icon>
            </div>

            <!-- 类型标签 -->
            <el-tag class="type-badge" size="small" effect="dark" :type="typeColor(item.type)">
              {{ item.type }}
            </el-tag>
          </div>

          <!-- 文件信息 -->
          <div class="file-meta">
            <div class="file-name" :title="item.title">{{ item.title }}</div>
          </div>

          <!-- 操作按钮 -->
          <div class="file-ops" @click.stop>
            <el-tooltip content="复制链接">
              <el-button text size="small" :icon="CopyDocument" @click="copyUrl(item.url)" />
            </el-tooltip>
            <el-tooltip content="编辑">
              <el-button text size="small" :icon="Edit" @click="handleEdit(item)" />
            </el-tooltip>
            <el-tooltip content="删除">
              <el-button text size="small" :icon="Delete" type="danger" @click="handleDelete(item)" />
            </el-tooltip>
          </div>
        </div>
      </div>

      <!-- 分页 -->
      <el-pagination
        v-if="pagination.total > 0"
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.limit"
        :total="pagination.total"
        :page-sizes="[24, 48, 96]"
        layout="total, sizes, prev, pager, next"
        @size-change="fetchMaterials"
        @current-change="fetchMaterials"
        style="margin-top:16px; justify-content:flex-end"
      />
    </main>

    <!-- ====== 分组编辑 Dialog ====== -->
    <el-dialog v-model="groupDialogVisible" :title="editingGroup ? '编辑分组' : '新建分组'" width="420px">
      <el-form :model="groupForm" label-width="70px">
        <el-form-item label="分组名">
          <el-input v-model="groupForm.name" placeholder="如：产品图组、海报组" maxlength="50" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="groupForm.description" placeholder="可选" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="groupDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitGroup" :loading="groupSaving">确定</el-button>
      </template>
    </el-dialog>

    <!-- ====== 素材上传/编辑 Dialog ====== -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑素材' : '上传素材'" width="560px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="名称" prop="title">
          <el-input v-model="form.title" placeholder="素材名称" />
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-select v-model="form.type" style="width:100%">
            <el-option label="图片" value="image" />
            <el-option label="海报" value="poster" />
            <el-option label="视频" value="video" />
            <el-option label="音频" value="audio" />
            <el-option label="文案" value="text" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属分组">
          <el-select v-model="form.group_id" placeholder="未分组" clearable style="width:100%">
            <el-option v-for="g in realGroups" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="素材文件" v-if="form.type !== 'text'">
          <el-upload :show-file-list="false" :http-request="handleUpload" :before-upload="beforeUpload">
            <img v-if="form.url && ['image','poster'].includes(form.type)" :src="form.url" style="max-width:200px;max-height:120px;border-radius:4px;" />
            <audio v-else-if="form.url && form.type === 'audio'" :src="form.url" controls style="width:200px" />
            <el-button v-else :type="form.url ? 'success' : 'default'">
              {{ form.url ? '✓ 已上传，点击替换' : '点击上传文件' }}
            </el-button>
          </el-upload>
        </el-form-item>
        <el-form-item label="文案内容" v-if="form.type === 'text'">
          <el-input v-model="form.description" type="textarea" :rows="4" placeholder="推广文案内容" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="form.description" type="textarea" :rows="2" v-if="form.type !== 'text'" />
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
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Folder, FolderOpened, Check, Document, Microphone, CopyDocument } from '@element-plus/icons-vue'
import { uploadFile } from '@/api'
import request from '@/utils/request'

// ===== 分组 =====
const groups = ref([])     // 含虚拟"全部素材"分组
const activeGroupId = ref(null)   // null = 全部

const realGroups = computed(() => groups.value.filter(g => !g._virtual))
const movableGroups = computed(() => realGroups.value)
const currentGroupName = computed(() => {
  const g = groups.value.find(g => g.id === activeGroupId.value)
  return g?.name || '全部素材'
})

const fetchGroups = async () => {
  const res = await request({ url: '/material-groups', method: 'get' })
  groups.value = res.data || res || []
}

const selectGroup = (id) => {
  activeGroupId.value = id
  pagination.page = 1
  fetchMaterials()
}

// 分组对话框
const groupDialogVisible = ref(false)
const groupSaving = ref(false)
const editingGroup = ref(null)
const groupForm = reactive({ name: '', description: '' })

const showGroupDialog = (g) => {
  editingGroup.value = g
  groupForm.name = g?.name || ''
  groupForm.description = g?.description || ''
  groupDialogVisible.value = true
}

const submitGroup = async () => {
  if (!groupForm.name.trim()) return ElMessage.warning('请输入分组名称')
  groupSaving.value = true
  try {
    if (editingGroup.value) {
      await request({ url: `/material-groups/${editingGroup.value.id}`, method: 'put', data: groupForm })
      ElMessage.success('分组已更新')
    } else {
      await request({ url: '/material-groups', method: 'post', data: groupForm })
      ElMessage.success('分组已创建')
    }
    groupDialogVisible.value = false
    await fetchGroups()
  } finally {
    groupSaving.value = false
  }
}

const handleDeleteGroup = async (g) => {
  await ElMessageBox.confirm(`删除分组「${g.name}」后，组内素材将移至未分组，确认操作？`, '确认删除', { type: 'warning' })
  await request({ url: `/material-groups/${g.id}`, method: 'delete' })
  ElMessage.success('已删除')
  if (activeGroupId.value === g.id) activeGroupId.value = null
  await fetchGroups()
  await fetchMaterials()
}

// ===== 素材列表 =====
const loading = ref(false)
const tableData = ref([])
const pagination = reactive({ page: 1, limit: 24, total: 0 })
const searchForm = reactive({ type: '', keyword: '' })

const fetchMaterials = async () => {
  loading.value = true
  try {
    const params = {
      ...searchForm,
      page: pagination.page,
      limit: pagination.limit
    }
    // 全部 = 不传 group_id；虚拟分组用 null；真实分组传 id
    if (activeGroupId.value !== null) {
      params.group_id = activeGroupId.value ?? 'none'
    }
    const res = await request({ url: '/materials', method: 'get', params })
    tableData.value = res.data?.list || res.list || []
    pagination.total = res.data?.pagination?.total || res.total || 0
  } finally {
    loading.value = false
  }
}

const doSearch = () => { pagination.page = 1; fetchMaterials() }

// ===== 多选 =====
const selectedIds = ref([])
const moveTargetGroupId = ref(null)

const toggleSelect = (id) => {
  const idx = selectedIds.value.indexOf(id)
  if (idx === -1) selectedIds.value.push(id)
  else selectedIds.value.splice(idx, 1)
}

const handleBatchMove = async () => {
  if (!selectedIds.value.length) return
  await request({ url: '/material-groups/move', method: 'post', data: { ids: selectedIds.value, group_id: moveTargetGroupId.value } })
  ElMessage.success('移动成功')
  selectedIds.value = []
  moveTargetGroupId.value = null
  await fetchGroups()
  await fetchMaterials()
}

// ===== 素材 CRUD =====
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const formRef = ref()
const form = reactive({ id: null, title: '', type: 'image', url: '', description: '', group_id: null })
const rules = {
  title: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }]
}

const handleAdd = () => {
  isEdit.value = false
  Object.assign(form, { id: null, title: '', type: 'image', url: '', description: '', group_id: activeGroupId.value })
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  Object.assign(form, { ...row })
  dialogVisible.value = true
}

const handleDelete = async (row) => {
  await ElMessageBox.confirm(`确认删除素材「${row.title}」？`, '确认删除', { type: 'warning' })
  await request({ url: `/materials/${row.id}`, method: 'delete' })
  ElMessage.success('已删除')
  await fetchGroups()
  await fetchMaterials()
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
        ElMessage.success('上传成功')
      }
      dialogVisible.value = false
      await fetchGroups()
      await fetchMaterials()
    } finally {
      submitting.value = false
    }
  })
}

const handleUpload = async ({ file }) => {
  const data = await uploadFile(file)
  form.url = data.url
  if (!form.title) form.title = file.name.replace(/\.[^.]+$/, '')
  ElMessage.success('上传成功')
}

const beforeUpload = (file) => {
  if (file.size > 50 * 1024 * 1024) { ElMessage.error('文件不能超过 50MB'); return false }
  return true
}

// ===== 工具 =====
const copyUrl = (url) => {
  if (!url) return ElMessage.warning('该素材无链接')
  navigator.clipboard.writeText(url).then(() => ElMessage.success('链接已复制'))
}

const typeColor = (type) => {
  const map = { image: 'success', poster: 'primary', video: 'warning', audio: '', text: 'info' }
  return map[type] || 'info'
}

onMounted(async () => {
  await fetchGroups()
  await fetchMaterials()
})
</script>

<style scoped>
.media-library {
  display: flex;
  height: calc(100vh - 120px);
  gap: 0;
  background: #f5f7fa;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e4e7ed;
}

/* 左侧分组栏 */
.group-sidebar {
  width: 200px;
  min-width: 200px;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 12px 12px;
  border-bottom: 1px solid #f0f0f0;
}

.sidebar-title {
  font-weight: 600;
  font-size: 14px;
  color: #1a1a2e;
}

.group-list {
  list-style: none;
  padding: 8px 0;
  margin: 0;
  overflow-y: auto;
  flex: 1;
}

.group-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
  color: #606266;
  border-radius: 0;
  position: relative;
  transition: background 0.15s;
}

.group-item:hover { background: #f5f7fa; }
.group-item.active { background: #ecf5ff; color: #409eff; font-weight: 500; }
.group-icon { flex-shrink: 0; font-size: 14px; }
.group-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.group-count { flex-shrink: 0; }
.group-actions { display: none; gap: 4px; color: #909399; }
.group-item:hover .group-actions { display: flex; }
.group-actions .el-icon { cursor: pointer; padding: 2px; border-radius: 2px; }
.group-actions .el-icon:hover { background: #e8e8e8; color: #409eff; }

/* 右侧素材区 */
.material-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.toolbar-left { display: flex; align-items: center; }
.toolbar-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.area-title { margin: 0; font-size: 15px; font-weight: 600; color: #1a1a2e; }

/* 文件网格 */
.file-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  align-content: start;
}

.empty-tip {
  grid-column: 1 / -1;
  display: flex;
  justify-content: center;
  padding: 60px 0;
}

.file-card {
  background: #fff;
  border-radius: 8px;
  border: 2px solid #e4e7ed;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
  position: relative;
}

.file-card:hover { border-color: #409eff; box-shadow: 0 2px 12px rgba(64,158,255,.15); }
.file-card.selected { border-color: #409eff; background: #ecf5ff; }

.select-mask {
  display: none;
  position: absolute;
  inset: 0;
  background: rgba(64,158,255,.35);
  z-index: 2;
  align-items: center;
  justify-content: center;
}

.file-card.selected .select-mask { display: flex; }

.file-thumb {
  height: 120px;
  background: #f5f7fa;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumb-img { width: 100%; height: 120px; object-fit: cover; display: block; }
.thumb-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }

.type-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 1;
  pointer-events: none;
}

.file-meta { padding: 6px 8px 2px; }
.file-name {
  font-size: 12px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-ops {
  display: flex;
  padding: 2px 4px 4px;
  border-top: 1px solid #f0f0f0;
  justify-content: flex-end;
  gap: 0;
}
</style>
