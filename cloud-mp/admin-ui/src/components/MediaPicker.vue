<!--
  MediaPicker.vue — 通用图片选择器
  · 默认打开「素材库」，可搜索/筛选后单选/多选
  · 切换「本地上传」标签，上传后自动入库并可继续选中
  · Props:
      v-model:visible  — 对话框开关
      multiple         — 是否多选（默认 true）
      max              — 最多选几张（默认 9）
  · Events:
      confirm(urls: string[])  — 点击确认后触发
-->
<template>
  <el-dialog
    v-model="innerVisible"
    title="选择图片"
    width="860px"
    :close-on-click-modal="false"
    destroy-on-close
    class="media-picker-dialog"
  >
    <div class="picker-layout">
      <!-- 左侧：分组列表 -->
      <aside class="picker-groups">
        <div
          class="pg-item"
          :class="{ active: activeGroup === null }"
          @click="selectGroup(null)"
        >
          全部素材
        </div>
        <div
          v-for="g in groups"
          :key="g.id"
          class="pg-item"
          :class="{ active: activeGroup === g.id }"
          @click="selectGroup(g.id)"
        >
          {{ g.name }}
          <span class="pg-count">{{ g.count }}</span>
        </div>
      </aside>

      <!-- 右侧 -->
      <div class="picker-right">
        <!-- 工具栏 -->
        <div class="picker-toolbar">
          <el-input
            v-model="keyword"
            placeholder="搜索素材名称"
            clearable
            size="small"
            style="width:180px"
            @input="handleSearch"
          />
          <el-button
            size="small"
            type="primary"
            :icon="Upload"
            @click="triggerUpload"
            :loading="uploading"
          >
            上传图片
          </el-button>
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            multiple
            style="display:none"
            @change="handleUpload"
          />
        </div>

        <!-- 图片网格 -->
        <div class="picker-grid" v-loading="loading">
          <div
            v-for="item in list"
            :key="item.id"
            class="pg-cell"
            :class="{ selected: selectedSet.has(item.url) }"
            @click="toggleSelect(item)"
          >
            <el-image :src="item.url" fit="cover" lazy class="pg-img" />
            <div class="pg-check">
              <el-icon v-if="selectedSet.has(item.url)" color="#fff"><Select /></el-icon>
            </div>
            <div class="pg-name">{{ item.title || item.name }}</div>
          </div>

          <div v-if="!loading && list.length === 0" class="pg-empty">
            暂无素材，请先上传
          </div>
        </div>

        <!-- 分页 -->
        <el-pagination
          v-model:current-page="page"
          :total="total"
          :page-size="pageSize"
          layout="prev, pager, next, total"
          small
          @current-change="fetchMaterials"
          style="margin-top:10px; justify-content: flex-end"
        />
      </div>
    </div>

    <template #footer>
      <div class="picker-footer">
        <div class="selected-preview">
          <template v-if="selected.length > 0">
            已选 <strong>{{ selected.length }}</strong> 张
            <el-button text type="danger" size="small" @click="selected = []">清空</el-button>
          </template>
          <span v-else style="color:#999">尚未选择图片</span>
        </div>
        <div>
          <el-button @click="innerVisible = false">取消</el-button>
          <el-button type="primary" :disabled="selected.length === 0" @click="confirm">
            确认选择
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Select, Upload } from '@element-plus/icons-vue'
import { getMaterials, getMaterialGroups, createMaterial, uploadFile } from '@/api'
import { buildPersistentAssetRef } from '@/utils/assetUrlAudit'

const props = defineProps({
  visible: { type: Boolean, default: false },
  multiple: { type: Boolean, default: true },
  max: { type: Number, default: 9 }
})
const emit = defineEmits(['update:visible', 'confirm'])

const innerVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v)
})

// ===== 素材列表 =====
const loading = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 24
const keyword = ref('')
const activeGroup = ref(null)
const groups = ref([])

const fetchMaterials = async () => {
  loading.value = true
  try {
    const res = await getMaterials({
      page: page.value,
      limit: pageSize,
      keyword: keyword.value || undefined,
      group_id: activeGroup.value || undefined,
      type: 'image',
      sort: 'created_desc'
    })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.pagination?.total || res?.total || 0

  } catch (e) {
    ElMessage.error('素材列表加载失败，请刷新重试')
  } finally {
    loading.value = false
  }
}

// 也单独拉分组列表
const fetchGroups = async () => {
  try {
    const res = await getMaterialGroups()
    const rows = Array.isArray(res) ? res : (res?.list || [])
    groups.value = rows.filter(g => !g._virtual)
  } catch (e) {
    console.warn('加载素材分组失败:', e)
  }
}

const handleSearch = () => { page.value = 1; fetchMaterials() }
const selectGroup = (id) => { activeGroup.value = id; page.value = 1; fetchMaterials() }

// ===== 选择逻辑 =====
const selected = ref([])  // [{ id, url, name }]
const selectedSet = computed(() => new Set(selected.value.map(s => s.url)))

const toggleSelect = (item) => {
  const idx = selected.value.findIndex(s => s.url === item.url)
  if (idx >= 0) {
    selected.value.splice(idx, 1)
  } else {
    if (!props.multiple) {
      selected.value = [item]
    } else if (selected.value.length < props.max) {
      selected.value.push(item)
    } else {
      ElMessage.warning(`最多选 ${props.max} 张`)
    }
  }
}

const isCloudFileId = (v) => /^cloud:\/\//i.test(String(v || ''))

const confirm = () => {
  const validSelections = selected.value.filter((s) => isCloudFileId(s.file_id))
  if (!validSelections.length) {
    ElMessage.warning('仅支持选择已托管到云开发存储的素材，请重新上传后再选择')
    return
  }
  if (validSelections.length !== selected.value.length) {
    ElMessage.warning('已自动忽略未托管到云开发存储的历史素材')
  }
  // 第一个参数：持久 cloud:// file_id
  // 第二个参数：用于立即预览的 https url
  const persistIds = validSelections.map((s) => s.file_id)
  const displayUrls = validSelections.map((s) => s.url || '')
  emit('confirm', persistIds, displayUrls)
  innerVisible.value = false
  selected.value = []
}

// ===== 上传 =====
const uploading = ref(false)
const fileInput = ref(null)

const triggerUpload = () => fileInput.value?.click()

const handleUpload = async (e) => {
  const files = Array.from(e.target.files || [])
  if (!files.length) return
  uploading.value = true
  try {
    // 与素材库页一致：skip_library=1 避免「上传接口已自动入库 + 再 createMaterial」重复两条记录
    const appended = []
    let failedCount = 0
    for (const file of files) {
      const res = await uploadFile(file, { params: { skip_library: '1', folder: 'materials' } })
      const url = res?.url || res?.data?.url
      const fileId = res?.file_id || res?.data?.file_id || ''
      if (!url) continue
      if (!isCloudFileId(fileId)) {
        ElMessage.warning('上传成功但未获得 cloud:// file_id，请检查存储配置')
        continue
      }

      try {
        const mat = await createMaterial({
          type: 'image',
          title: file.name.replace(/\.[^.]+$/, ''),
          url: buildPersistentAssetRef({ url, fileId }),
          file_id: fileId,
          group_id: activeGroup.value || null
        })
        const row = mat && typeof mat === 'object' ? mat : null
        appended.push({
          id: row?.id,
          file_id: row?.file_id || fileId || '',
          url,
          title: row?.title || file.name.replace(/\.[^.]+$/, ''),
          name: row?.title || file.name.replace(/\.[^.]+$/, '')
        })
      } catch (err) {
        console.warn('素材自动入库失败:', err)
        failedCount += 1
      }
    }

    if (appended.length) {
      for (const it of appended) {
        if (selected.value.some((s) => s.url === it.url)) continue
        if (props.multiple && selected.value.length >= props.max) {
          ElMessage.warning(`最多选 ${props.max} 张，部分新图未自动勾选`)
          break
        }
        if (!props.multiple) {
          selected.value = [it]
          break
        }
        selected.value.push(it)
      }
      ElMessage.success(
        appended.length > 1
          ? `已上传 ${appended.length} 张，已按上传顺序加入已选`
          : `已上传 1 张`
      )
    }
    if (failedCount > 0) {
      throw new Error(`已有 ${failedCount} 张图片上传到存储，但写入素材库失败`)
    }

    page.value = 1
    await fetchMaterials()
  } catch (err) {
    ElMessage.error('上传失败：' + (err?.message || '请检查存储配置'))
  } finally {
    uploading.value = false
    e.target.value = ''
  }
}

// ===== 生命周期 =====
watch(innerVisible, (v) => {
  if (v) {
    selected.value = []
    page.value = 1
    keyword.value = ''
    activeGroup.value = null
    fetchMaterials()
    fetchGroups()
  }
})
</script>

<style scoped>
.media-picker-dialog :deep(.el-dialog__body) { padding: 12px 20px; }

.picker-layout {
  display: flex;
  gap: 12px;
  height: 480px;
}

/* 左侧分组 */
.picker-groups {
  width: 120px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid #e8e8e8;
  padding-right: 8px;
}
.pg-item {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: #555;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background 0.15s;
}
.pg-item:hover { background: #f5f7fa; }
.pg-item.active { background: #ecf5ff; color: #409eff; font-weight: 600; }
.pg-count { font-size: 11px; color: #aaa; }

/* 右侧 */
.picker-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.picker-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

/* 图片网格 */
.picker-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
  align-content: start;
}

.pg-cell {
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
  transition: border-color 0.15s;
  background: #f5f7fa;
}
.pg-cell:hover { border-color: #a0cfff; }
.pg-cell.selected { border-color: #409eff; }

.pg-img { width: 100%; aspect-ratio: 1; display: block; }

.pg-check {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #409eff;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
}
.pg-cell.selected .pg-check { opacity: 1; }

.pg-name {
  font-size: 10px;
  color: #888;
  padding: 2px 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pg-empty {
  grid-column: 1 / -1;
  text-align: center;
  padding: 60px 0;
  color: #aaa;
  font-size: 14px;
}

/* 底部 */
.picker-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.selected-preview { font-size: 13px; color: #555; }
</style>
