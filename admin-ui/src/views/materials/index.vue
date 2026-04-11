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

          <!-- 非虚拟分组才显示操作；系统内置分组只读 -->
          <span v-if="!g._virtual && !g.is_system" class="group-actions">
            <el-icon size="13" @click.stop="showGroupDialog(g)"><Edit /></el-icon>
            <el-icon size="13" @click.stop="handleDeleteGroup(g)"><Delete /></el-icon>
          </span>
          <!-- 系统内置分组：锁定图标，不可操作 -->
          <span v-if="g.is_system" class="group-actions">
            <el-icon size="13" color="#c0c4cc" title="系统内置分组，不可删除"><Lock /></el-icon>
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
            <el-button size="small" type="danger" @click="handleBatchDelete">批量删除</el-button>
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
          <!-- 预览区（选中蒙层只盖住缩略图，避免挡住底部删除/编辑按钮） -->
          <div class="file-thumb">
            <div class="select-mask">
              <el-icon size="22" color="#fff"><Check /></el-icon>
            </div>
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

          <!-- 删除放最前：窄卡片下 flex-end 会把删除挤到右侧被 overflow 裁切 -->
          <div class="file-ops" @click.stop>
            <el-tooltip content="从素材库永久删除">
              <el-button text size="small" type="danger" :icon="Delete" @click="handleDelete(item)">删除</el-button>
            </el-tooltip>
            <el-tooltip content="编辑">
              <el-button text size="small" :icon="Edit" @click="handleEdit(item)">编辑</el-button>
            </el-tooltip>
            <el-tooltip content="复制链接">
              <el-button text size="small" :icon="CopyDocument" @click="copyUrl(item.url)" />
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
    <el-dialog v-model="groupDialogVisible" :title="editingGroup ? '编辑分组' : '新建分组'" width="min(420px, 94vw)">
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
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑素材' : '上传素材'" width="min(560px, 94vw)">
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
          <el-upload
            drag
            :show-file-list="false"
            :http-request="handleUpload"
            :before-upload="beforeUpload"
            class="material-uploader"
          >
            <!-- 已上传预览 -->
            <template v-if="form.url">
              <img v-if="['image','poster'].includes(form.type)" :src="form.url" class="upload-preview-img" />
              <audio v-else-if="form.type === 'audio'" :src="form.url" controls style="width:220px;margin:12px 0" />
              <div v-else class="upload-done-tip">
                <el-icon size="22" color="#67c23a"><Check /></el-icon>
                <span>已上传，拖入新文件可替换</span>
              </div>
            </template>
            <!-- 未上传引导 -->
            <template v-else>
              <el-icon class="upload-drag-icon"><UploadFilled /></el-icon>
              <div class="upload-drag-text">拖拽文件到此处，或 <em>点击选择</em></div>
              <div class="upload-drag-hint">支持 JPG / PNG / GIF / WebP，最大 50MB</div>
            </template>
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
import { Plus, Edit, Delete, Folder, FolderOpened, Check, Document, Microphone, CopyDocument, Lock, UploadFilled } from '@element-plus/icons-vue'
import {
  getMaterials, createMaterial, updateMaterial, deleteMaterial,
  getMaterialGroups, createMaterialGroup, updateMaterialGroup, deleteMaterialGroup,
  moveMaterials, uploadFile
} from '@/api'
import { usePagination } from '@/composables/usePagination'
import { warnTemporaryAssetUrls } from '@/utils/assetUrlAudit'

const resolveAssetUrl = (url) => {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/')) return `${window.location.origin}${url}`
  return url
}

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
  const res = await getMaterialGroups()
  groups.value = res?.list || []
}

const selectGroup = (id) => {
  activeGroupId.value = id
  resetPage()
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
      await updateMaterialGroup(editingGroup.value.id, groupForm)
      ElMessage.success('分组已更新')
    } else {
      await createMaterialGroup(groupForm)
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
  await deleteMaterialGroup(g.id)
  ElMessage.success('已删除')
  if (activeGroupId.value === g.id) activeGroupId.value = null
  await fetchGroups()
  await fetchMaterials()
}

// ===== 素材列表 =====
const loading = ref(false)
const tableData = ref([])
const { pagination, resetPage, applyResponse } = usePagination({ defaultLimit: 24 })
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
    const res = await getMaterials(params)
    tableData.value = (res?.list || []).map(item => ({
      ...item,
      url: resolveAssetUrl(item.url),
      thumbnail_url: resolveAssetUrl(item.thumbnail_url)
    }))
    applyResponse(res)
  } finally {
    loading.value = false
  }
}

const doSearch = () => { resetPage(); fetchMaterials() }

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
  await moveMaterials({ ids: selectedIds.value, group_id: moveTargetGroupId.value })
  ElMessage.success('移动成功')
  selectedIds.value = []
  moveTargetGroupId.value = null
  await fetchGroups()
  await fetchMaterials()
}

const handleBatchDelete = async () => {
  const ids = selectedIds.value.slice()
  if (!ids.length) return
  try {
    await ElMessageBox.confirm(`确定删除已选的 ${ids.length} 个素材？此操作不可恢复。`, '批量删除', { type: 'warning' })
  } catch {
    return
  }
  let ok = 0
  let fail = 0
  for (const id of ids) {
    try {
      await deleteMaterial(id)
      ok += 1
    } catch {
      fail += 1
    }
  }
  selectedIds.value = []
  await fetchGroups()
  await fetchMaterials()
  if (fail) ElMessage.warning(`已删除 ${ok} 个，${fail} 个失败（请查看网络或权限）`)
  else ElMessage.success(`已删除 ${ok} 个素材`)
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
  Object.assign(form, { ...row, url: resolveAssetUrl(row.url) })
  dialogVisible.value = true
}

const handleDelete = async (row) => {
  await ElMessageBox.confirm(`确认删除素材「${row.title}」？`, '确认删除', { type: 'warning' })
  await deleteMaterial(row.id)
  ElMessage.success('已删除')
  await fetchGroups()
  await fetchMaterials()
}

const handleSubmit = async () => {
  await formRef.value?.validate(async (valid) => {
    if (!valid) return
    const tempUrlMessage = warnTemporaryAssetUrls(form.url ? [form.url] : [], '素材地址')
    if (tempUrlMessage) return ElMessage.warning(tempUrlMessage)
    submitting.value = true
    try {
      if (isEdit.value) {
        await updateMaterial(form.id, form)
        ElMessage.success('更新成功')
      } else {
        await createMaterial(form)
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
  const data = await uploadFile(file, { params: { skip_library: 1, folder: 'materials' } })
  form.url = data.file?.url || data.url
  if (!form.title) form.title = file.name.replace(/\.[^.]+$/, '')
  ElMessage.success('文件已上传')
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
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
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
  overflow: hidden;
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
  position: relative;
  z-index: 3;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  padding: 4px 6px 6px;
  border-top: 1px solid #f0f0f0;
  justify-content: flex-start;
  gap: 4px;
  background: #fff;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  min-height: 36px;
  box-sizing: border-box;
}

/* 拖拽上传区 */
.material-uploader :deep(.el-upload-dragger) {
  width: 360px;
  min-height: 130px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px;
  border-radius: 8px;
}

.upload-drag-icon {
  font-size: 40px;
  color: #c0c4cc;
}

.upload-drag-text {
  font-size: 14px;
  color: #606266;
}

.upload-drag-text em {
  color: #409eff;
  font-style: normal;
}

.upload-drag-hint {
  font-size: 12px;
  color: #909399;
}

.upload-preview-img {
  max-width: 320px;
  max-height: 160px;
  border-radius: 6px;
  object-fit: contain;
}

.upload-done-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #67c23a;
}

@media (max-width: 767px) {
  .media-library {
    flex-direction: column;
    height: auto;
  }
  .group-sidebar {
    width: 100%;
    min-width: 0;
    border-right: none;
    border-bottom: 1px solid #e4e7ed;
  }
  .group-list {
    display: flex;
    overflow-x: auto;
    overflow-y: hidden;
    gap: 4px;
    padding: 8px;
  }
  .group-item {
    flex-shrink: 0;
    border-radius: 8px;
    background: #fff;
    border: 1px solid #edf0f5;
  }
  .material-main {
    padding: 12px;
  }
  .toolbar-left,
  .toolbar-right {
    width: 100%;
    flex-wrap: wrap;
  }
  .file-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }
  .material-uploader :deep(.el-upload-dragger) {
    width: 100%;
  }
}
</style>
