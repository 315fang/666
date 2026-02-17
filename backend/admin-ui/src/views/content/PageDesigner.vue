<template>
  <div class="page-designer">
    <div class="header">
      <h2>首页装修</h2>
      <el-button type="primary" @click="saveOrder">保存排序</el-button>
    </div>

    <div class="designer-container">
      <!-- 左侧：组件列表 (可拖拽排序) -->
      <div class="section-list">
        <el-card shadow="never" class="list-card">
          <template #header>
            <span>组件列表</span>
          </template>
          
          <div v-loading="loading">
             <div 
                v-for="(section, index) in sections" 
                :key="section.id" 
                class="section-item"
                :class="{ 'active': currentSection?.id === section.id }"
                @click="selectSection(section)"
             >
                <div class="section-handle">
                    <el-icon><Rank /></el-icon>
                </div>
                <div class="section-info">
                    <span class="section-name">{{ section.section_name }}</span>
                    <el-tag size="small" type="info">{{ section.section_key }}</el-tag>
                </div>
                <div class="section-actions">
                    <el-switch 
                        v-model="section.is_visible" 
                        size="small"
                        @change="handleVisibilityChange(section)"
                    />
                    <div class="sort-btns">
                        <el-button size="small" circle icon="ArrowUp" :disabled="index === 0" @click.stop="moveUp(index)"></el-button>
                        <el-button size="small" circle icon="ArrowDown" :disabled="index === sections.length - 1" @click.stop="moveDown(index)"></el-button>
                    </div>
                </div>
             </div>
          </div>
        </el-card>
      </div>

      <!-- 中间：手机预览 -->
      <div class="preview-area">
        <div class="mobile-frame">
          <div class="mobile-header">
            <span class="time">12:00</span>
            <div class="camera"></div>
            <div class="status-icons">
               <el-icon><Connection /></el-icon>
               <el-icon><Battery /></el-icon>
            </div>
          </div>
          <div class="mobile-nav">
             <el-icon><ArrowLeft /></el-icon>
             <span>首页</span>
             <el-icon><More /></el-icon>
          </div>
          
          <div class="mobile-content">
             <!-- 模拟渲染各个组件 -->
             <div v-for="section in sortedSections" :key="section.id">
                <div v-if="section.is_visible" class="preview-section" :class="section.section_key">
                    <!-- Banner -->
                    <div v-if="section.section_key === 'banner'" class="mock-banner">
                        <div class="mock-img">轮播图区域</div>
                    </div>
                    
                    <!-- Quick Entries -->
                    <div v-if="section.section_key === 'quick_entries'" class="mock-quick">
                        <div class="mock-icon" v-for="i in 5" :key="i"></div>
                    </div>

                    <!-- Product Grid -->
                    <div v-if="section.section_key === 'products_grid'" class="mock-grid">
                        <div class="mock-card" v-for="i in 4" :key="i">商品</div>
                    </div>

                    <!-- Fallback -->
                    <div v-else-if="!['banner', 'quick_entries', 'products_grid'].includes(section.section_key)" class="mock-default">
                        {{ section.section_name }}
                    </div>
                </div>
             </div>
          </div>
          
          <div class="mobile-tabbar">
             <div class="tab-item active">首页</div>
             <div class="tab-item">分类</div>
             <div class="tab-item">购物车</div>
             <div class="tab-item">我的</div>
          </div>
        </div>
      </div>

      <!-- 右侧：属性编辑 -->
      <div class="prop-editor">
        <el-card shadow="never" class="prop-card" v-if="currentSection">
          <template #header>
            <span>属性编辑 - {{ currentSection.section_name }}</span>
          </template>
          
          <el-form label-position="top">
             <el-form-item label="显示标题">
                <el-input v-model="currentSection.title" placeholder="前端显示的标题" />
             </el-form-item>
             <el-form-item label="副标题">
                <el-input v-model="currentSection.subtitle" placeholder="前端显示的副标题" />
             </el-form-item>
             
             <el-divider>配置参数 (JSON)</el-divider>
             <el-input 
                type="textarea" 
                :rows="10" 
                v-model="currentSectionConfigStr" 
                placeholder="JSON 配置"
                @blur="updateConfig"
             />
             
             <div class="editor-footer">
                <el-button type="primary" @click="saveCurrentSection">保存属性</el-button>
             </div>
          </el-form>
        </el-card>
        <el-empty v-else description="请点击左侧组件进行编辑" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { getHomeSections, updateHomeSection, updateSortOrder } from '@/api/homeSection'
import { ElMessage } from 'element-plus'
import { Rank, ArrowUp, ArrowDown, Connection, Loading as Battery, ArrowLeft, More } from '@element-plus/icons-vue'

const loading = ref(false)
const sections = ref([])
const currentSection = ref(null)
const currentSectionConfigStr = ref('{}')

// 按 sort_order 排序用于预览
const sortedSections = computed(() => {
    return [...sections.value].sort((a, b) => b.sort_order - a.sort_order)
})

onMounted(() => {
    loadSections()
})

async function loadSections() {
    loading.value = true
    try {
        const res = await getHomeSections()
        if (res.code === 0) {
            sections.value = res.data
        }
    } catch (err) {
        console.error(err)
    } finally {
        loading.value = false
    }
}

function selectSection(section) {
    currentSection.value = section
    currentSectionConfigStr.value = JSON.stringify(section.config || {}, null, 2)
}

function updateConfig() {
    try {
        currentSection.value.config = JSON.parse(currentSectionConfigStr.value)
    } catch (e) {
        // ignore JSON parse error while typing
    }
}

async function saveCurrentSection() {
    if (!currentSection.value) return
    try {
        const data = {
            ...currentSection.value,
            config: JSON.parse(currentSectionConfigStr.value)
        }
        const res = await updateHomeSection(currentSection.value.id, data)
        if (res.code === 0) {
            ElMessage.success('保存成功')
        }
    } catch (e) {
        ElMessage.error('保存失败：JSON格式错误')
    }
}

async function handleVisibilityChange(section) {
    await updateHomeSection(section.id, { is_visible: section.is_visible })
}

function moveUp(index) {
    if (index === 0) return
    const temp = sections.value[index]
    sections.value[index] = sections.value[index - 1]
    sections.value[index - 1] = temp
    recalcSortOrder()
}

function moveDown(index) {
    if (index === sections.value.length - 1) return
    const temp = sections.value[index]
    sections.value[index] = sections.value[index + 1]
    sections.value[index + 1] = temp
    recalcSortOrder()
}

function recalcSortOrder() {
    // 重新计算 sort_order，index 越小 sort_order 越大
    const len = sections.value.length
    sections.value.forEach((item, index) => {
        item.sort_order = (len - index) * 10
    })
}

async function saveOrder() {
    try {
        const orders = sections.value.map(item => ({
            id: item.id,
            sort_order: item.sort_order
        }))
        const res = await updateSortOrder(orders)
        if (res.code === 0) {
            ElMessage.success('排序保存成功')
        }
    } catch (e) {
        ElMessage.error('排序保存失败')
    }
}
</script>

<style scoped>
.page-designer {
  height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.designer-container {
  display: flex;
  flex: 1;
  gap: 20px;
  overflow: hidden;
}

/* Left List */
.section-list {
  width: 300px;
  overflow-y: auto;
}

.section-item {
  display: flex;
  align-items: center;
  padding: 10px;
  border: 1px solid #EBEEF5;
  margin-bottom: 10px;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.section-item.active {
  border-color: #409EFF;
  background-color: #ECF5FF;
}

.section-handle {
  cursor: move;
  margin-right: 10px;
  color: #909399;
}

.section-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section-name {
  font-weight: 500;
}

.section-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sort-btns {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Middle Preview */
.preview-area {
  flex: 1;
  display: flex;
  justify-content: center;
  background: #F2F6FC;
  padding: 20px;
  border-radius: 8px;
  overflow-y: auto;
}

.mobile-frame {
  width: 375px;
  height: 667px;
  background: #fff;
  border-radius: 30px;
  box-shadow: 0 0 20px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 8px solid #333;
}

.mobile-header {
  height: 44px;
  background: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 15px;
  font-size: 12px;
  font-weight: bold;
}

.mobile-nav {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  border-bottom: 1px solid #eee;
}

.mobile-content {
  flex: 1;
  overflow-y: auto;
  background: #f7f7f7;
}

.mobile-tabbar {
  height: 50px;
  border-top: 1px solid #eee;
  display: flex;
  align-items: center;
}

.tab-item {
  flex: 1;
  text-align: center;
  font-size: 10px;
  color: #999;
}
.tab-item.active {
  color: #409EFF;
}

/* Mock Components */
.preview-section {
  margin-bottom: 10px;
  background: #fff;
}

.mock-banner {
  height: 150px;
  background: #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
}

.mock-quick {
  display: flex;
  padding: 10px;
  gap: 10px;
  justify-content: space-around;
}

.mock-icon {
  width: 40px;
  height: 40px;
  background: #f0f0f0;
  border-radius: 50%;
}

.mock-grid {
  display: flex;
  flex-wrap: wrap;
  padding: 10px;
  gap: 10px;
}

.mock-card {
  width: calc(50% - 5px);
  height: 100px;
  background: #f9f9f9;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.mock-default {
  padding: 20px;
  text-align: center;
  border: 1px dashed #ccc;
  margin: 10px;
}

/* Right Editor */
.prop-editor {
  width: 350px;
  overflow-y: auto;
}

.editor-footer {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
