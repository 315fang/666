<template>
  <div class="theme-manager">
    <div class="header-actions">
      <h2>主题管理</h2>
      <el-button type="primary" icon="Plus" @click="handleCreate">新建主题</el-button>
    </div>

    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :xs="24" :sm="12" :md="8" :lg="6" v-for="theme in themes" :key="theme.id">
        <el-card 
          class="theme-card" 
          :class="{ 'active': theme.is_active }"
          shadow="hover"
        >
          <div class="theme-header">
            <div class="theme-icon" :style="{ color: theme.primary_color }">
              <el-icon v-if="theme.theme_key === 'default'"><Sunny /></el-icon>
              <el-icon v-else-if="theme.theme_key === 'spring_festival'"><Sugar /></el-icon>
              <el-icon v-else><Brush /></el-icon>
            </div>
            <div class="theme-info">
              <h3>{{ theme.theme_name }}</h3>
              <p class="theme-key">{{ theme.theme_key }}</p>
            </div>
            <div class="active-badge" v-if="theme.is_active">
              <el-tag type="success" effect="dark">当前使用</el-tag>
            </div>
          </div>
          
          <div class="theme-preview">
            <div class="color-dot" :style="{ background: theme.primary_color }" title="主色"></div>
            <div class="color-dot" v-if="theme.secondary_color" :style="{ background: theme.secondary_color }" title="辅色"></div>
          </div>
          
          <div class="theme-schedule" v-if="theme.auto_start_date">
            <el-icon><Timer /></el-icon>
            <span>自动启用: {{ theme.auto_start_date }} ~ {{ theme.auto_end_date }}</span>
          </div>

          <div class="theme-actions">
            <el-button 
              type="primary" 
              :disabled="theme.is_active" 
              @click="handleSwitch(theme)"
            >
              {{ theme.is_active ? '已应用' : '应用主题' }}
            </el-button>
            <el-button icon="Edit" circle @click="handleEdit(theme)"></el-button>
            <el-popconfirm title="确定删除该主题吗？" @confirm="handleDelete(theme.id)">
              <template #reference>
                <el-button icon="Delete" type="danger" circle :disabled="theme.is_active || theme.theme_key === 'default'"></el-button>
              </template>
            </el-popconfirm>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 编辑/创建对话框 -->
    <el-dialog :title="dialogTitle" v-model="dialogVisible" width="600px">
      <el-form :model="form" label-width="100px" :rules="rules" ref="formRef">
        <el-form-item label="主题名称" prop="theme_name">
          <el-input v-model="form.theme_name" placeholder="如：春节主题"></el-input>
        </el-form-item>
        <el-form-item label="主题Key" prop="theme_key">
          <el-input v-model="form.theme_key" placeholder="英文标识，如：spring_festival" :disabled="isEdit"></el-input>
        </el-form-item>
        <el-form-item label="主色调" prop="primary_color">
          <el-color-picker v-model="form.primary_color"></el-color-picker>
        </el-form-item>
        <el-form-item label="自动启用">
          <el-col :span="11">
            <el-input v-model="form.auto_start_date" placeholder="MM-DD (如 01-20)"></el-input>
          </el-col>
          <el-col :span="2" class="text-center">-</el-col>
          <el-col :span="11">
            <el-input v-model="form.auto_end_date" placeholder="MM-DD (如 02-10)"></el-input>
          </el-col>
        </el-form-item>
        <el-form-item label="轮播图配置">
           <el-input type="textarea" :rows="4" v-model="form.banner_json" placeholder="JSON格式的轮播图数组"></el-input>
        </el-form-item>
        <el-form-item label="快捷入口">
           <el-input type="textarea" :rows="4" v-model="form.quick_entry_json" placeholder="JSON格式的快捷入口数组"></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitForm">确定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { getThemes, switchTheme, createTheme, updateTheme, deleteTheme } from '@/api/theme'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Sunny, Sugar, Brush, Timer, Plus, Edit, Delete } from '@element-plus/icons-vue'

const themes = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)

const form = reactive({
  id: null,
  theme_name: '',
  theme_key: '',
  primary_color: '#409EFF',
  auto_start_date: '',
  auto_end_date: '',
  banner_json: '[]',
  quick_entry_json: '[]'
})

const rules = {
  theme_name: [{ required: true, message: '请输入主题名称', trigger: 'blur' }],
  theme_key: [{ required: true, message: '请输入主题Key', trigger: 'blur' }],
  primary_color: [{ required: true, message: '请选择主色调', trigger: 'change' }]
}

const dialogTitle = computed(() => isEdit.value ? '编辑主题' : '新建主题')

onMounted(() => {
  loadThemes()
})

async function loadThemes() {
  try {
    const res = await getThemes()
    if (res.code === 0) {
      themes.value = res.data
    }
  } catch (err) {
    console.error(err)
  }
}

async function handleSwitch(theme) {
  try {
    await ElMessageBox.confirm(`确定要切换到 "${theme.theme_name}" 吗？这会立即改变小程序前端的显示。`, '切换主题', {
      confirmButtonText: '确定切换',
      cancelButtonText: '取消',
      type: 'warning'
    })
    
    const res = await switchTheme(theme.theme_key)
    if (res.code === 0) {
      ElMessage.success('主题切换成功')
      loadThemes()
    }
  } catch (err) {
    if (err !== 'cancel') console.error(err)
  }
}

function handleCreate() {
  isEdit.value = false
  form.id = null
  form.theme_name = ''
  form.theme_key = ''
  form.primary_color = '#409EFF'
  form.auto_start_date = ''
  form.auto_end_date = ''
  form.banner_json = '[]'
  form.quick_entry_json = '[]'
  dialogVisible.value = true
}

function handleEdit(theme) {
  isEdit.value = true
  form.id = theme.id
  form.theme_name = theme.theme_name
  form.theme_key = theme.theme_key
  form.primary_color = theme.primary_color
  form.auto_start_date = theme.auto_start_date
  form.auto_end_date = theme.auto_end_date
  form.banner_json = JSON.stringify(theme.banner_images || [], null, 2)
  form.quick_entry_json = JSON.stringify(theme.quick_entries || [], null, 2)
  dialogVisible.value = true
}

async function handleDelete(id) {
  try {
    const res = await deleteTheme(id)
    if (res.code === 0) {
      ElMessage.success('删除成功')
      loadThemes()
    }
  } catch (err) {
    console.error(err)
  }
}

async function submitForm() {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (valid) {
      try {
        const data = {
          theme_name: form.theme_name,
          theme_key: form.theme_key,
          primary_color: form.primary_color,
          auto_start_date: form.auto_start_date,
          auto_end_date: form.auto_end_date,
          banner_images: JSON.parse(form.banner_json),
          quick_entries: JSON.parse(form.quick_entry_json)
        }

        if (isEdit.value) {
          const res = await updateTheme(form.id, data)
          if (res.code === 0) ElMessage.success('更新成功')
        } else {
          const res = await createTheme(data)
          if (res.code === 0) ElMessage.success('创建成功')
        }
        dialogVisible.value = false
        loadThemes()
      } catch (err) {
        console.error(err)
        ElMessage.error('操作失败，请检查JSON格式是否正确')
      }
    }
  })
}
</script>

<style scoped>
.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.theme-card {
  position: relative;
  transition: all 0.3s;
  border: 2px solid transparent;
  margin-bottom: 20px;
}

.theme-card.active {
  border-color: var(--el-color-success);
  background-color: var(--el-color-success-light-9);
}

.theme-header {
  display: flex;
  align-items: flex-start;
  margin-bottom: 15px;
}

.theme-icon {
  font-size: 40px;
  margin-right: 15px;
  display: flex;
  align-items: center;
}

.theme-info h3 {
  margin: 0 0 5px 0;
  font-size: 18px;
}

.theme-key {
  margin: 0;
  color: #909399;
  font-size: 12px;
}

.active-badge {
  position: absolute;
  top: 15px;
  right: 15px;
}

.theme-preview {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
}

.color-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.theme-schedule {
  font-size: 12px;
  color: #606266;
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 15px;
}

.theme-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid #ebeef5;
  padding-top: 15px;
}
</style>
