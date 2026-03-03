<template>
  <div class="theme-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>主题换肤</span>
          <el-button type="primary" @click="showCreateDialog">
            <el-icon><Plus /></el-icon>
            新建主题
          </el-button>
        </div>
      </template>

      <el-alert
        title="选择一个主题并点击「一键应用」，小程序首页将立即切换到该主题的色调、Banner 和快捷入口。"
        type="info" :closable="false" show-icon style="margin-bottom: 20px;"
      />

      <div class="theme-grid" v-loading="loading">
        <div
          v-for="theme in themes"
          :key="theme.id"
          :class="['theme-card', { 'is-active': theme.is_active }]"
        >
          <!-- 色块预览 -->
          <div class="theme-preview" :style="{ background: theme.primary_color || '#CA8A04' }">
            <div class="theme-preview-accent" :style="{ background: theme.secondary_color || '#F59E0B' }" />
            <el-icon v-if="theme.is_active" class="active-badge"><CircleCheckFilled /></el-icon>
          </div>

          <!-- 主题信息 -->
          <div class="theme-info">
            <div class="theme-name">{{ theme.theme_name }}</div>
            <div class="theme-desc">{{ theme.description || '暂无描述' }}</div>
            <div class="theme-dates" v-if="theme.auto_start_date">
              {{ theme.auto_start_date }} ~ {{ theme.auto_end_date }}
            </div>
          </div>

          <!-- 操作 -->
          <div class="theme-actions">
            <el-tag v-if="theme.is_active" type="success" size="small">当前主题</el-tag>
            <el-button
              v-else
              type="primary"
              size="small"
              :loading="switching === theme.id"
              @click="handleSwitch(theme)"
            >
              一键应用
            </el-button>
            <el-button text type="info" size="small" @click="handleEdit(theme)">
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-button
              v-if="!theme.is_active"
              text type="danger" size="small"
              @click="handleDelete(theme)"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 新建/编辑主题对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editForm.id ? '编辑主题' : '新建主题'"
      width="560px"
    >
      <el-form :model="editForm" label-width="120px">
        <el-form-item label="主题标识" required>
          <el-input v-model="editForm.theme_key" placeholder="如: spring_festival（唯一，不可重复）" :disabled="!!editForm.id" />
        </el-form-item>
        <el-form-item label="主题名称" required>
          <el-input v-model="editForm.theme_name" placeholder="如: 春节主题" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editForm.description" placeholder="简要描述（可选）" />
        </el-form-item>
        <el-form-item label="主色调">
          <div class="color-row">
            <el-color-picker v-model="editForm.primary_color" show-alpha />
            <el-input v-model="editForm.primary_color" placeholder="#CA8A04" style="width: 140px;" />
          </div>
        </el-form-item>
        <el-form-item label="辅助色">
          <div class="color-row">
            <el-color-picker v-model="editForm.secondary_color" show-alpha />
            <el-input v-model="editForm.secondary_color" placeholder="#F59E0B" style="width: 140px;" />
          </div>
        </el-form-item>
        <el-form-item label="自动启用日期">
          <el-input v-model="editForm.auto_start_date" placeholder="MM-DD（如 01-20）" style="width: 160px;" />
          <span style="margin: 0 8px;">~</span>
          <el-input v-model="editForm.auto_end_date" placeholder="MM-DD（如 02-05）" style="width: 160px;" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getThemes, switchTheme, createTheme, updateTheme, deleteTheme } from '@/api'

const loading = ref(false)
const saving = ref(false)
const switching = ref(null)
const dialogVisible = ref(false)
const themes = ref([])

const editForm = reactive({
  id: null,
  theme_key: '',
  theme_name: '',
  description: '',
  primary_color: '#CA8A04',
  secondary_color: '#F59E0B',
  auto_start_date: '',
  auto_end_date: ''
})

const fetchThemes = async () => {
  loading.value = true
  try {
    const res = await getThemes()
    themes.value = res.data || []
  } catch (e) {
    ElMessage.error('获取主题列表失败')
  } finally {
    loading.value = false
  }
}

const handleSwitch = async (theme) => {
  switching.value = theme.id
  try {
    await switchTheme({ theme_key: theme.theme_key })
    ElMessage.success(`已切换到「${theme.theme_name}」，小程序立即生效`)
    fetchThemes()
  } catch (e) {
    ElMessage.error('切换主题失败')
  } finally {
    switching.value = null
  }
}

const showCreateDialog = () => {
  Object.assign(editForm, {
    id: null, theme_key: '', theme_name: '', description: '',
    primary_color: '#CA8A04', secondary_color: '#F59E0B',
    auto_start_date: '', auto_end_date: ''
  })
  dialogVisible.value = true
}

const handleEdit = (theme) => {
  Object.assign(editForm, {
    id: theme.id,
    theme_key: theme.theme_key,
    theme_name: theme.theme_name,
    description: theme.description || '',
    primary_color: theme.primary_color || '#CA8A04',
    secondary_color: theme.secondary_color || '#F59E0B',
    auto_start_date: theme.auto_start_date || '',
    auto_end_date: theme.auto_end_date || ''
  })
  dialogVisible.value = true
}

const handleSave = async () => {
  if (!editForm.theme_key || !editForm.theme_name) {
    ElMessage.warning('主题标识和名称不能为空')
    return
  }
  if (!/^[a-zA-Z0-9_]+$/.test(editForm.theme_key)) {
    ElMessage.warning('主题标识只能包含字母、数字和下划线')
    return
  }
  saving.value = true
  try {
    if (editForm.id) {
      await updateTheme(editForm.id, editForm)
      ElMessage.success('主题已更新')
    } else {
      await createTheme(editForm)
      ElMessage.success('主题已创建')
    }
    dialogVisible.value = false
    fetchThemes()
  } catch (e) {
    ElMessage.error(editForm.id ? '更新失败' : '创建失败')
  } finally {
    saving.value = false
  }
}

const handleDelete = async (theme) => {
  try {
    await ElMessageBox.confirm(`确认删除主题「${theme.theme_name}」？`, '删除确认', { type: 'warning' })
    await deleteTheme(theme.id)
    ElMessage.success('主题已删除')
    fetchThemes()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

onMounted(fetchThemes)
</script>

<style scoped>
.theme-page { padding: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.theme-card {
  border: 2px solid #e4e7ed;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.2s;
  background: #fff;
}
.theme-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,.08); border-color: #409eff; }
.theme-card.is-active { border-color: #67c23a; box-shadow: 0 0 0 2px rgba(103,194,58,.2); }

.theme-preview {
  height: 80px;
  position: relative;
  display: flex;
  align-items: flex-end;
  padding: 8px;
}
.theme-preview-accent {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,.6);
}
.active-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  font-size: 22px;
  color: #fff;
  filter: drop-shadow(0 1px 3px rgba(0,0,0,.3));
}

.theme-info { padding: 12px 16px 8px; }
.theme-name { font-size: 14px; font-weight: 600; color: #303133; }
.theme-desc { font-size: 12px; color: #909399; margin-top: 4px; }
.theme-dates { font-size: 11px; color: #c0c4cc; margin-top: 4px; }

.theme-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px 14px;
}

.color-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
