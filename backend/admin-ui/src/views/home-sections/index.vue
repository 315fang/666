<template>
  <div class="home-sections-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>首页装修 (Low-Code Editor)</span>
          <div class="header-actions">
            <el-button type="success" @click="handleAddSection">
              <el-icon><Plus /></el-icon>
              新增区块
            </el-button>
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
            <el-button text type="primary" size="small" @click="handleEdit(section)">配置</el-button>
            <el-button text type="danger" size="small" @click="handleDelete(section.id)">删除</el-button>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 新建/编辑区块配置对话框 -->
    <el-dialog v-model="editDialogVisible" :title="editForm.id ? '编辑区块配置' : '新增业务区块'" width="800px" top="5vh">
      <el-form ref="editFormRef" :model="editForm" label-width="130px" class="dynamic-form">
        <el-form-item label="区块标识(Key)" required v-if="!editForm.id">
          <el-input v-model="editForm.section_key" placeholder="如: my_banner_1 (需唯一)" />
        </el-form-item>
        <el-form-item label="区块类型" required>
          <el-select v-model="editForm.section_type" placeholder="选择组件类型" :disabled="!!editForm.id" @change="handleTypeChange" filterable style="width: 100%">
            <el-option v-for="(schema, type) in sectionSchemas" :key="type" :label="`${schema.icon} ${schema.label} (${type})`" :value="type" />
          </el-select>
        </el-form-item>
        <el-form-item label="内部名称(管理用)" required>
          <el-input v-model="editForm.section_name" placeholder="如: 首页顶部大连版" />
        </el-form-item>
        
        <el-divider>显示设置</el-divider>
        <el-row>
          <el-col :span="12">
            <el-form-item label="大标题">
              <el-input v-model="editForm.title" placeholder="前端展示的区块标题" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="副标题">
              <el-input v-model="editForm.subtitle" placeholder="前端展示的副标题" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider v-if="currentSchemaKeys.length > 0">组件专属参数装配 (Schema Engine)</el-divider>
        
        <!-- 动态配置表单引擎 -->
        <template v-for="key in currentSchemaKeys" :key="key">
          <el-form-item :label="currentSchema[key].label || key">
            
            <!-- String / Number -->
            <el-input v-if="currentSchema[key].type === 'string'" v-model="editForm.config[key]" />
            <el-input-number v-else-if="currentSchema[key].type === 'number'" v-model="editForm.config[key]" />
            
            <!-- Textarea -->
            <el-input v-else-if="currentSchema[key].type === 'textarea'" type="textarea" :rows="3" v-model="editForm.config[key]" />
            
            <!-- Boolean -->
            <el-switch v-else-if="currentSchema[key].type === 'boolean'" v-model="editForm.config[key]" />
            
            <!-- Color -->
            <el-color-picker v-else-if="currentSchema[key].type === 'color'" v-model="editForm.config[key]" show-alpha />
            
            <!-- Select -->
            <el-select v-else-if="currentSchema[key].type === 'select'" v-model="editForm.config[key]" style="width:100%">
              <el-option v-for="opt in currentSchema[key].options" :key="opt" :label="opt" :value="opt" />
            </el-select>
            
            <!-- Array (String List or Object List) -->
            <div v-else-if="currentSchema[key].type === 'array'" class="array-container">
              <div v-for="(item, idx) in editForm.config[key]" :key="idx" class="array-item-card">
                <div class="array-item-header">
                  <span>项目 #{{ idx + 1 }}</span>
                  <el-button type="danger" text icon="Delete" @click="removeArrayItem(key, idx)">删除</el-button>
                </div>
                <!-- 纯字符串数组 -->
                <el-input v-if="!currentSchema[key].itemSchema" v-model="editForm.config[key][idx]" placeholder="请输入URL等值" />
                
                <!-- 对象数组 (递归渲染属性) -->
                <div v-else class="array-object-props">
                  <div class="prop-row" v-for="(propDef, propName) in currentSchema[key].itemSchema" :key="propName">
                    <span class="prop-label">{{ propDef.label || propName }}</span>
                    <el-input v-if="propDef.type === 'string'" v-model="item[propName]" size="small" />
                    <el-color-picker v-else-if="propDef.type === 'color'" v-model="item[propName]" show-alpha size="small" />
                    <el-select v-else-if="propDef.type === 'select'" v-model="item[propName]" size="small">
                      <el-option v-for="o in propDef.options" :key="o" :label="o" :value="o" />
                    </el-select>
                  </div>
                </div>
              </div>
              <el-button type="primary" plain size="small" @click="addArrayItem(key, currentSchema[key].itemSchema)">+ 添加项</el-button>
            </div>
            
          </el-form-item>
        </template>
        
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleEditSubmit" :loading="submitting">保存装配结果</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/utils/request'
import {
  getHomeSections,
  getSectionSchemas,
  createHomeSection,
  updateHomeSection,
  toggleSectionVisible,
  deleteHomeSection,
  updateSectionSort
} from '@/api/index'

const loading = ref(false)
const savingSortLoading = ref(false)
const submitting = ref(false)
const editDialogVisible = ref(false)
const hasChanges = ref(false)
const sections = ref([])
const sectionSchemas = ref({})

const editForm = reactive({ 
  id: null, 
  section_key: '',
  section_name: '',
  title: '', 
  subtitle: '', 
  is_visible: 1, 
  sort_order: 0, 
  section_type: '',
  config: {}
})

// 计算属性：当前选中 Schema 的属性列表
const currentSchema = computed(() => {
  if (!editForm.section_type || !sectionSchemas.value[editForm.section_type]) return {}
  return sectionSchemas.value[editForm.section_type].configSchema || {}
})

const currentSchemaKeys = computed(() => Object.keys(currentSchema.value))

// 拖拽状态
let dragSourceIndex = -1
let dragTargetIndex = -1

const fetchData = async () => {
  loading.value = true
  try {
    const [res, schemaRes] = await Promise.all([
      getHomeSections(),
      getSectionSchemas()
    ])
    sections.value = (res.data || res.list || []).sort((a, b) => b.sort_order - a.sort_order)
    sectionSchemas.value = schemaRes.data || {}
  } catch (e) {
    console.error('获取首页配置失败:', e)
  } finally {
    loading.value = false
  }
}

const handleAddSection = () => {
  Object.assign(editForm, {
    id: null,
    section_key: `section_${Date.now()}`,
    section_name: '新业务区块',
    title: '',
    subtitle: '',
    is_visible: 1,
    sort_order: sections.value.length ? Math.max(...sections.value.map(s => s.sort_order)) + 10 : 0,
    section_type: 'banner',
    config: {}
  })
  handleTypeChange('banner') // 初始化默认 config
  editDialogVisible.value = true
}

const handleTypeChange = (type) => {
  // 根据目标 Schema 重置 config 避免脏数据
  const schemaObj = sectionSchemas.value[type]?.configSchema || {}
  const newConfig = {}
  Object.keys(schemaObj).forEach(k => {
    // 深度拷贝默认值，特别是数组
    newConfig[k] = JSON.parse(JSON.stringify(schemaObj[k].default ?? ''))
  })
  editForm.config = newConfig
}

const addArrayItem = (key, itemSchema) => {
  if (!editForm.config[key]) editForm.config[key] = []
  
  if (!itemSchema) {
    editForm.config[key].push('')
  } else {
    // 根据 itemSchema 构建空对象
    const newItem = {}
    Object.keys(itemSchema).forEach(k => {
      newItem[k] = itemSchema[k].default ?? ''
    })
    editForm.config[key].push(newItem)
  }
}

const removeArrayItem = (key, index) => {
  editForm.config[key].splice(index, 1)
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
    await updateSectionSort({ orders })
    ElMessage.success('排序已保存')
    hasChanges.value = false
  } catch (e) {
    console.error('保存排序失败:', e)
  } finally {
    savingSortLoading.value = false
  }
}

const handleEdit = (section) => {
  Object.assign(editForm, {
    id: section.id,
    section_key: section.section_key,
    section_name: section.section_name,
    title: section.title,
    subtitle: section.subtitle,
    is_visible: section.is_visible,
    sort_order: section.sort_order,
    section_type: section.section_type,
    // 必须深拷贝，防止直接修改了原表格对象
    config: JSON.parse(JSON.stringify(section.config || {}))
  })
  
  // 补充可能被后来添加但旧数据缺少的字段
  const schemaObj = sectionSchemas.value[section.section_type]?.configSchema || {}
  Object.keys(schemaObj).forEach(k => {
    if (editForm.config[k] === undefined) {
      editForm.config[k] = JSON.parse(JSON.stringify(schemaObj[k].default ?? ''))
    }
  })
  
  editDialogVisible.value = true
}

const handleEditSubmit = async () => {
  submitting.value = true
  try {
    const payload = { ...editForm }
    if (editForm.id) {
      await updateHomeSection(editForm.id, payload)
    } else {
      await createHomeSection(payload)
    }
    ElMessage.success('配置装配成功')
    editDialogVisible.value = false
    fetchData()
    hasChanges.value = false
  } catch (e) {
    console.error('更新失败:', e)
  } finally {
    submitting.value = false
  }
}

const handleDelete = async (id) => {
  try {
    await ElMessageBox.confirm('确定要永久删除该区块吗？这会影响前台显示。', '高危操作', { type: 'warning' })
    await deleteHomeSection(id)
    ElMessage.success('删除成功')
    fetchData()
  } catch (e) {
    if(e !== 'cancel') console.error('删除失败', e)
  }
}

const sectionTypeText = (type) => {
  if (sectionSchemas.value[type]) {
    return `${sectionSchemas.value[type].icon} ${sectionSchemas.value[type].label}`
  }
  return type
}

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
.array-container {
  width: 100%;
  background: #f8f9fa;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #ebeef5;
}
.array-item-card {
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
}
.array-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-weight: bold;
  font-size: 13px;
  color: #606266;
}
.array-object-props {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}
.prop-row {
  display: flex;
  align-items: center;
}
.prop-label {
  width: 130px;
  font-size: 13px;
  color: #606266;
  text-align: right;
  margin-right: 12px;
}
</style>
