<template>
  <div class="home-sections-page">
    <el-tabs v-model="pageTab">
      <el-tab-pane label="弹窗广告" name="popup">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>首页弹窗配置</span>
              <el-button type="primary" :loading="popupSaving" @click="savePopupAd">保存配置</el-button>
            </div>
          </template>
          <el-alert
            title="首页当前真正生效的是这一块弹窗配置；原来的区块编排没有实际效果，已从此页移除。"
            type="info"
            :closable="false"
            show-icon
            style="margin-bottom: 16px"
          />
          <el-form label-width="120px" style="max-width:680px;">
            <el-form-item label="启用弹窗">
              <el-switch v-model="popupForm.enabled" active-text="开启" inactive-text="关闭" />
            </el-form-item>
            <el-form-item label="弹出频率">
              <el-select v-model="popupForm.frequency" style="width:220px;">
                <el-option label="每次进入" value="every_time" />
                <el-option label="每天一次" value="once_daily" />
                <el-option label="每次会话一次" value="once_session" />
              </el-select>
            </el-form-item>
            <el-divider content-position="left">内容配置（选商品自动填入图片和跳转，或上传自定义图）</el-divider>
            <ContentBlockEditor v-model="popupBlockData" :fields="['title']" />
            <el-form-item label="按钮文字">
              <el-input v-model="popupForm.button_text" placeholder="如：立即查看、马上抢购" style="width:220px;" />
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="品牌配置" name="brand">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>首页品牌标识与热度气泡</span>
              <el-button type="primary" :loading="brandSaving" @click="saveBrandConfig">保存配置</el-button>
            </div>
          </template>
          <el-alert
            title="这一页现在负责首页主视觉辅助内容，包括首页弹窗、品牌标识和热度气泡，不再承担历史区块编排职责。"
            type="warning"
            :closable="false"
            show-icon
            style="margin-bottom: 16px"
          />
          <el-form label-width="140px" style="max-width:680px;">
            <el-form-item label="显示品牌Logo">
              <el-switch v-model="brandConfig.show_brand_logo" active-text="显示" inactive-text="隐藏" />
              <div style="font-size:12px;color:#909399;margin-top:4px;">关闭后首页左上角品牌Logo区域将完全隐藏</div>
            </el-form-item>
            <el-form-item label="品牌Logo图片" v-if="brandConfig.show_brand_logo">
              <el-input v-model="brandConfig.brand_logo" placeholder="Logo图片URL（留空使用默认气泡动画）" />
              <div v-if="brandConfig.brand_logo" style="margin-top:8px;">
                <el-image :src="brandConfig.brand_logo" fit="contain" style="width:52px;height:52px;border-radius:12px;border:1px solid #eee;" />
              </div>
              <div style="font-size:12px;color:#909399;margin-top:4px;">建议正方形透明底PNG，128x128px</div>
            </el-form-item>
            <el-form-item label="品牌名称">
              <el-input v-model="brandConfig.nav_brand_title" placeholder="如：问兰镜像" style="width:240px;" />
            </el-form-item>
            <el-form-item label="品牌副标题">
              <el-input v-model="brandConfig.nav_brand_sub" placeholder="如：品牌甄选" style="width:240px;" />
            </el-form-item>
            <el-divider content-position="left">热度气泡通告</el-divider>
            <el-form-item label="启用气泡通告">
              <el-switch v-model="brandConfig.bubble_enabled" active-text="开启" inactive-text="关闭" />
            </el-form-item>
            <el-form-item label="展示条数">
              <el-input-number v-model="brandConfig.bubble_limit" :min="3" :max="20" />
            </el-form-item>
            <el-divider content-position="left">气泡动作文案（用 {user} 代表用户昵称，{product} 代表商品名）</el-divider>
            <el-form-item label="普通下单">
              <el-input v-model="brandConfig.bubble_copy_order" placeholder="默认：{user} 购买了 {product}" style="width:320px;" />
            </el-form-item>
            <el-form-item label="拼团下单">
              <el-input v-model="brandConfig.bubble_copy_group_buy" placeholder="默认：{user} 拼团了 {product}" style="width:320px;" />
            </el-form-item>
            <el-form-item label="砍价下单">
              <el-input v-model="brandConfig.bubble_copy_slash" placeholder="默认：{user} 砍价了 {product}" style="width:320px;" />
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import ContentBlockEditor from '@/components/ContentBlockEditor.vue'
import {
  getPopupAdConfig,
  updatePopupAdConfig,
  getHomeSections,
  getSectionSchemas,
  createHomeSection,
  updateHomeSection,
  toggleSectionVisible,
  deleteHomeSection,
  updateSectionSort,
  getSettings,
  updateSettings
} from '@/api'

const pageTab = ref('popup')

// ===== 弹窗广告 =====
const popupSaving = ref(false)
const popupForm = reactive({
  enabled: false,
  frequency: 'once_daily',
  image_url: '',
  file_id: '',
  link_type: 'none',
  link_value: '',
  button_text: '',
  product_id: null
})

const loadPopupAd = async () => {
  try {
    const data = await getPopupAdConfig()
    Object.assign(popupForm, data || {})
  } catch (_) {}
}

const popupBlockData = computed({
  get: () => ({
    image_url: popupForm.image_url,
    file_id: popupForm.file_id,
    title: popupForm.button_text,
    link_type: popupForm.link_type,
    link_value: popupForm.link_value,
    product_id: popupForm.product_id
  }),
  set: (v) => {
    popupForm.image_url = v.image_url || ''
    popupForm.file_id = v.file_id || ''
    popupForm.button_text = v.title || popupForm.button_text
    popupForm.link_type = v.link_type || 'none'
    popupForm.link_value = v.link_value || ''
    popupForm.product_id = v.product_id || null
  }
})

const savePopupAd = async () => {
  popupSaving.value = true
  try {
    await updatePopupAdConfig({ ...popupForm })
    ElMessage.success('弹窗广告配置已保存')
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    popupSaving.value = false
  }
}

// ===== 品牌配置 =====
const brandSaving = ref(false)
const brandConfig = reactive({
  show_brand_logo: true,
  brand_logo: '',
  nav_brand_title: '问兰镜像',
  nav_brand_sub: '品牌甄选',
  bubble_enabled: true,
  bubble_limit: 10,
  bubble_copy_order: '',
  bubble_copy_group_buy: '',
  bubble_copy_slash: ''
})

const loadBrandConfig = async () => {
  try {
    const d = await getSettings()
    brandConfig.show_brand_logo = d.show_brand_logo !== 'false' && d.show_brand_logo !== false
    brandConfig.brand_logo = d.brand_logo || ''
    brandConfig.nav_brand_title = d.nav_brand_title || '问兰镜像'
    brandConfig.nav_brand_sub = d.nav_brand_sub || '品牌甄选'
    brandConfig.bubble_enabled = d.bubble_enabled !== false
    brandConfig.bubble_limit = Number(d.bubble_limit || 10)
    brandConfig.bubble_copy_order = d.bubble_copy_order || ''
    brandConfig.bubble_copy_group_buy = d.bubble_copy_group_buy || ''
    brandConfig.bubble_copy_slash = d.bubble_copy_slash || ''
  } catch (_) {}
}

const saveBrandConfig = async () => {
  brandSaving.value = true
  try {
    await updateSettings({
      category: 'homepage',
      settings: {
        show_brand_logo: String(brandConfig.show_brand_logo),
        brand_logo: brandConfig.brand_logo,
        nav_brand_title: brandConfig.nav_brand_title,
        nav_brand_sub: brandConfig.nav_brand_sub,
        bubble_enabled: String(brandConfig.bubble_enabled),
        bubble_limit: String(brandConfig.bubble_limit),
        bubble_copy_order: brandConfig.bubble_copy_order,
        bubble_copy_group_buy: brandConfig.bubble_copy_group_buy,
        bubble_copy_slash: brandConfig.bubble_copy_slash
      }
    })
    ElMessage.success('品牌配置已保存')
  } catch (_) {
    ElMessage.error('保存失败')
  } finally {
    brandSaving.value = false
  }
}

// ===== 区块编排 =====
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
    sections.value = res.list.slice().sort((a, b) => b.sort_order - a.sort_order)
    sectionSchemas.value = schemaRes || {}
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

onMounted(() => {
  fetchData()
  loadPopupAd()
  loadBrandConfig()
})
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
