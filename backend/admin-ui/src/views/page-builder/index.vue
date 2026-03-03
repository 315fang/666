<template>
  <div class="page-builder">
    <el-row :gutter="16" style="height: 100%;">
      <!-- ===== 左侧：页面列表 ===== -->
      <el-col :span="5">
        <el-card class="side-card">
          <template #header>
            <div class="card-header">
              <span>页面列表</span>
              <el-button type="primary" size="small" @click="showNewPageDialog">
                <el-icon><Plus /></el-icon>
              </el-button>
            </div>
          </template>
          <div v-loading="listLoading" class="page-list">
            <div
              v-for="page in pages"
              :key="page.key"
              :class="['page-item', { 'is-active': currentKey === page.key }]"
              @click="loadPage(page.key)"
            >
              <div class="page-item-name">{{ page.title || page.key }}</div>
              <div class="page-item-meta">{{ page.blockCount }} 个组件</div>
            </div>
            <el-empty v-if="!listLoading && !pages.length" description="暂无页面" :image-size="60" />
          </div>
        </el-card>
      </el-col>

      <!-- ===== 中间：编辑画布 ===== -->
      <el-col :span="12">
        <el-card class="canvas-card">
          <template #header>
            <div class="card-header">
              <span>{{ currentTitle || '请选择或新建页面' }}</span>
              <div class="header-actions" v-if="currentKey">
                <el-input v-model="currentTitle" placeholder="页面标题" size="small" style="width: 160px;" />
                <el-button type="primary" @click="handleSave" :loading="saving">
                  <el-icon><Check /></el-icon>
                  保存
                </el-button>
              </div>
            </div>
          </template>

          <!-- 未选页面 -->
          <div v-if="!currentKey" class="empty-canvas">
            <el-icon :size="48" color="#ddd"><Grid /></el-icon>
            <div>请从左侧选择页面，或新建页面</div>
          </div>

          <!-- 编辑画布 -->
          <div v-else v-loading="canvasLoading" class="canvas-body">
            <!-- 组件区块列表 -->
            <div
              v-for="(block, index) in blocks"
              :key="block._uid"
              :class="['canvas-block', { 'is-selected': selectedIndex === index }]"
              @click="selectBlock(index)"
            >
              <div class="block-header">
                <span class="block-type-label">{{ blockTypeLabel(block.type) }}</span>
                <div class="block-ops">
                  <el-button text size="small" :disabled="index === 0" @click.stop="moveBlock(index, -1)">
                    <el-icon><ArrowUp /></el-icon>
                  </el-button>
                  <el-button text size="small" :disabled="index === blocks.length - 1" @click.stop="moveBlock(index, 1)">
                    <el-icon><ArrowDown /></el-icon>
                  </el-button>
                  <el-button text type="danger" size="small" @click.stop="removeBlock(index)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>

              <!-- Block 预览 -->
              <div class="block-preview">
                <template v-if="block.type === 'banner'">
                  <el-image :src="block.config.images?.[0]?.url" fit="cover" class="preview-img" />
                </template>
                <template v-else-if="block.type === 'image'">
                  <el-image :src="block.config.url" fit="cover" class="preview-img" />
                </template>
                <template v-else-if="block.type === 'rich_text'">
                  <div class="preview-text" v-html="block.config.content || '（空内容）'" />
                </template>
                <template v-else-if="block.type === 'notice'">
                  <div class="preview-notice">📢 {{ block.config.content || '（空公告）' }}</div>
                </template>
                <template v-else-if="block.type === 'button'">
                  <el-button type="primary" size="small">{{ block.config.text || '按钮' }}</el-button>
                </template>
                <template v-else-if="block.type === 'product_list'">
                  <div class="preview-products">📦 商品列表（{{ block.config.title || '未命名' }}）</div>
                </template>
                <template v-else>
                  <div class="preview-default">{{ blockTypeLabel(block.type) }}</div>
                </template>
              </div>
            </div>

            <!-- 添加组件区 -->
            <div class="add-block-area">
              <span class="add-label">添加组件：</span>
              <el-button
                v-for="bt in blockTypes"
                :key="bt.type"
                size="small"
                @click="addBlock(bt.type)"
              >
                {{ bt.icon }} {{ bt.label }}
              </el-button>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- ===== 右侧：属性编辑 + 手机预览 ===== -->
      <el-col :span="7">
        <!-- 属性面板 -->
        <el-card class="props-card" v-if="selectedBlock">
          <template #header>编辑属性：{{ blockTypeLabel(selectedBlock.type) }}</template>

          <!-- Banner 属性 -->
          <template v-if="selectedBlock.type === 'banner'">
            <el-form label-width="80px" size="small">
              <el-form-item label="图片列表">
                <div v-for="(img, i) in selectedBlock.config.images" :key="i" class="img-row">
                  <el-input v-model="img.url" placeholder="图片URL" />
                  <el-input v-model="img.link" placeholder="跳转链接（可选）" style="margin-top:4px;" />
                  <el-button text type="danger" size="small" @click="selectedBlock.config.images.splice(i, 1)">删除</el-button>
                </div>
                <el-button size="small" @click="selectedBlock.config.images.push({ url: '', link: '' })">+ 添加图片</el-button>
              </el-form-item>
              <el-form-item label="自动播放">
                <el-switch v-model="selectedBlock.config.autoplay" />
              </el-form-item>
            </el-form>
          </template>

          <!-- 图片属性 -->
          <template v-else-if="selectedBlock.type === 'image'">
            <el-form label-width="80px" size="small">
              <el-form-item label="图片URL">
                <el-input v-model="selectedBlock.config.url" placeholder="https://..." />
              </el-form-item>
              <el-form-item label="跳转链接">
                <el-input v-model="selectedBlock.config.link" placeholder="/pages/product/detail?id=1" />
              </el-form-item>
            </el-form>
          </template>

          <!-- 富文本属性 -->
          <template v-else-if="selectedBlock.type === 'rich_text'">
            <el-form label-width="80px" size="small">
              <el-form-item label="内容（HTML）">
                <el-input v-model="selectedBlock.config.content" type="textarea" :rows="6" placeholder="支持 HTML 富文本" />
              </el-form-item>
            </el-form>
          </template>

          <!-- 公告属性 -->
          <template v-else-if="selectedBlock.type === 'notice'">
            <el-form label-width="80px" size="small">
              <el-form-item label="公告文字">
                <el-input v-model="selectedBlock.config.content" placeholder="公告内容" />
              </el-form-item>
            </el-form>
          </template>

          <!-- 按钮属性 -->
          <template v-else-if="selectedBlock.type === 'button'">
            <el-form label-width="80px" size="small">
              <el-form-item label="按钮文字">
                <el-input v-model="selectedBlock.config.text" placeholder="立即购买" />
              </el-form-item>
              <el-form-item label="跳转链接">
                <el-input v-model="selectedBlock.config.link" placeholder="/pages/product/detail?id=1" />
              </el-form-item>
              <el-form-item label="样式">
                <el-select v-model="selectedBlock.config.style">
                  <el-option label="主色 (primary)" value="primary" />
                  <el-option label="朴素 (plain)" value="plain" />
                </el-select>
              </el-form-item>
            </el-form>
          </template>

          <!-- 商品列表属性 -->
          <template v-else-if="selectedBlock.type === 'product_list'">
            <el-form label-width="80px" size="small">
              <el-form-item label="标题">
                <el-input v-model="selectedBlock.config.title" placeholder="区块标题（可选）" />
              </el-form-item>
              <el-form-item label="商品ID">
                <el-input v-model="productIdsText" placeholder="商品ID，逗号分隔" @change="parseProductIds" />
                <div style="font-size:11px;color:#909399;margin-top:4px;">输入商品ID后自动填充商品数据</div>
              </el-form-item>
            </el-form>
          </template>

          <!-- 分割线属性（无需配置） -->
          <template v-else-if="selectedBlock.type === 'divider'">
            <el-empty description="分割线无需配置" :image-size="40" />
          </template>
        </el-card>

        <!-- 手机预览框 -->
        <div class="phone-preview" v-if="currentKey">
          <div class="phone-frame">
            <div class="phone-notch" />
            <div class="phone-screen">
              <div class="preview-nav">{{ currentTitle || '自定义页面' }}</div>
              <div class="preview-body">
                <template v-for="(block, i) in blocks" :key="i">
                  <div v-if="block.type === 'banner'" class="pv-banner">
                    <img v-if="block.config.images?.[0]?.url" :src="block.config.images[0].url" style="width:100%;display:block;" />
                    <div v-else class="pv-placeholder">Banner</div>
                  </div>
                  <div v-else-if="block.type === 'image'" class="pv-image">
                    <img v-if="block.config.url" :src="block.config.url" style="width:100%;display:block;" />
                    <div v-else class="pv-placeholder">图片</div>
                  </div>
                  <div v-else-if="block.type === 'rich_text'" class="pv-richtext" v-html="block.config.content || '（文本内容）'" />
                  <div v-else-if="block.type === 'notice'" class="pv-notice">📢 {{ block.config.content || '公告' }}</div>
                  <div v-else-if="block.type === 'button'" class="pv-btn">{{ block.config.text || '按钮' }}</div>
                  <div v-else-if="block.type === 'product_list'" class="pv-products">📦 {{ block.config.title || '商品列表' }}</div>
                  <div v-else-if="block.type === 'divider'" class="pv-divider" />
                </template>
                <div v-if="!blocks.length" class="pv-empty">空页面</div>
              </div>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 新建页面对话框 -->
    <el-dialog v-model="newPageDialog" title="新建页面" width="420px">
      <el-form label-width="90px">
        <el-form-item label="页面标识" required>
          <el-input v-model="newPageKey" placeholder="如: about / promo_2025（字母数字_-）" />
        </el-form-item>
        <el-form-item label="页面标题">
          <el-input v-model="newPageTitle" placeholder="显示在导航栏的标题" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="newPageDialog = false">取消</el-button>
        <el-button type="primary" @click="createPage">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import request from '@/utils/request'

const listLoading = ref(false)
const canvasLoading = ref(false)
const saving = ref(false)
const pages = ref([])
const currentKey = ref('')
const currentTitle = ref('')
const blocks = ref([])
const selectedIndex = ref(-1)
const newPageDialog = ref(false)
const newPageKey = ref('')
const newPageTitle = ref('')
const productIdsText = ref('')

let _uid = 0
const uid = () => ++_uid

const selectedBlock = computed(() =>
  selectedIndex.value >= 0 ? blocks.value[selectedIndex.value] : null
)

const blockTypes = [
  { type: 'banner', label: '轮播图', icon: '🖼' },
  { type: 'image', label: '单图', icon: '📷' },
  { type: 'rich_text', label: '富文本', icon: '📝' },
  { type: 'notice', label: '公告', icon: '📢' },
  { type: 'product_list', label: '商品列表', icon: '📦' },
  { type: 'button', label: '按钮', icon: '🔘' },
  { type: 'divider', label: '分割线', icon: '➖' }
]

const blockTypeLabel = (type) =>
  blockTypes.find(b => b.type === type)?.label || type

const defaultConfig = (type) => {
  const defaults = {
    banner: { images: [{ url: '', link: '' }], autoplay: true, interval: 3000, indicatorDots: true },
    image: { url: '', link: '', mode: 'widthFix' },
    rich_text: { content: '<p>请输入内容</p>' },
    notice: { content: '公告内容' },
    product_list: { title: '', products: [] },
    button: { text: '立即查看', link: '', style: 'primary' },
    divider: {}
  }
  return defaults[type] || {}
}

const fetchPages = async () => {
  listLoading.value = true
  try {
    const res = await request({ url: '/custom-pages', method: 'get' })
    pages.value = res.data || []
  } catch (e) {
    ElMessage.error('获取页面列表失败')
  } finally {
    listLoading.value = false
  }
}

const loadPage = async (key) => {
  if (currentKey.value === key) return
  currentKey.value = key
  selectedIndex.value = -1
  canvasLoading.value = true
  try {
    const res = await request({ url: `/custom-pages/${key}`, method: 'get' })
    const page = res.data || {}
    currentTitle.value = page.title || ''
    blocks.value = (page.blocks || []).map(b => ({ ...b, _uid: uid() }))
  } catch (e) {
    ElMessage.error('加载页面失败')
  } finally {
    canvasLoading.value = false
  }
}

const selectBlock = (index) => {
  selectedIndex.value = index
  if (blocks.value[index]?.type === 'product_list') {
    productIdsText.value = (blocks.value[index].config.products || []).map(p => p.id).join(',')
  }
}

const addBlock = (type) => {
  blocks.value.push({ type, config: reactive(defaultConfig(type)), _uid: uid() })
  selectedIndex.value = blocks.value.length - 1
}

const removeBlock = (index) => {
  blocks.value.splice(index, 1)
  if (selectedIndex.value >= blocks.value.length) {
    selectedIndex.value = blocks.value.length - 1
  }
}

const moveBlock = (index, direction) => {
  const newIndex = index + direction
  if (newIndex < 0 || newIndex >= blocks.value.length) return
  const arr = [...blocks.value]
  const tmp = arr[index]
  arr[index] = arr[newIndex]
  arr[newIndex] = tmp
  blocks.value = arr
  selectedIndex.value = newIndex
}

const parseProductIds = () => {
  if (!selectedBlock.value || selectedBlock.value.type !== 'product_list') return
  const ids = productIdsText.value.split(',').map(s => s.trim()).filter(Boolean)
  selectedBlock.value.config.products = ids.map(id => ({ id: Number(id) }))
}

const handleSave = async () => {
  if (!currentKey.value) return
  saving.value = true
  try {
    // 清理临时 _uid 字段
    const cleanBlocks = blocks.value.map(({ _uid, ...rest }) => rest)
    await request({
      url: `/custom-pages/${currentKey.value}`,
      method: 'put',
      data: { title: currentTitle.value, blocks: cleanBlocks }
    })
    ElMessage.success('页面已保存')
    fetchPages()
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

const showNewPageDialog = () => {
  newPageKey.value = ''
  newPageTitle.value = ''
  newPageDialog.value = true
}

const createPage = async () => {
  if (!newPageKey.value) { ElMessage.warning('页面标识不能为空'); return }
  if (!/^[a-zA-Z0-9_-]+$/.test(newPageKey.value)) {
    ElMessage.warning('页面标识只能包含字母、数字、_ 和 -')
    return
  }
  try {
    await request({
      url: `/custom-pages/${newPageKey.value}`,
      method: 'put',
      data: { title: newPageTitle.value, blocks: [] }
    })
    ElMessage.success('页面已创建')
    newPageDialog.value = false
    await fetchPages()
    loadPage(newPageKey.value)
  } catch (e) {
    ElMessage.error('创建失败')
  }
}

onMounted(fetchPages)
</script>

<style scoped>
.page-builder { padding: 0; height: calc(100vh - 140px); }

.side-card, .canvas-card, .props-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
:deep(.el-card__body) { flex: 1; overflow-y: auto; padding: 16px; }

.card-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.header-actions { display: flex; align-items: center; gap: 8px; }

/* 页面列表 */
.page-list { display: flex; flex-direction: column; gap: 6px; }
.page-item {
  padding: 10px 12px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.page-item:hover { border-color: #409eff; background: #f0f7ff; }
.page-item.is-active { border-color: #409eff; background: #ecf5ff; }
.page-item-name { font-size: 13px; font-weight: 500; }
.page-item-meta { font-size: 11px; color: #909399; margin-top: 2px; }

/* 画布 */
.empty-canvas {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  gap: 12px;
  color: #c0c4cc;
  font-size: 14px;
}
.canvas-body { display: flex; flex-direction: column; gap: 8px; }

.canvas-block {
  border: 2px solid #e4e7ed;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s;
}
.canvas-block:hover { border-color: #409eff; }
.canvas-block.is-selected { border-color: #409eff; box-shadow: 0 0 0 2px rgba(64,158,255,.2); }

.block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  background: #f5f7fa;
  border-bottom: 1px solid #e4e7ed;
}
.block-type-label { font-size: 12px; font-weight: 600; color: #606266; }
.block-ops { display: flex; gap: 2px; }

.block-preview { padding: 8px 10px; min-height: 40px; }
.preview-img { width: 100%; height: 80px; object-fit: cover; border-radius: 4px; }
.preview-text { font-size: 12px; color: #606266; max-height: 60px; overflow: hidden; }
.preview-notice { font-size: 12px; color: #606266; }
.preview-products { font-size: 12px; color: #606266; }
.preview-default { font-size: 12px; color: #c0c4cc; text-align: center; padding: 8px; }

.add-block-area {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px;
  border: 1px dashed #e4e7ed;
  border-radius: 8px;
  align-items: center;
}
.add-label { font-size: 12px; color: #909399; }

.img-row { margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #f0f0f0; }

/* 属性面板 */
.props-card { margin-bottom: 16px; }

/* 手机预览 */
.phone-preview {
  display: flex;
  justify-content: center;
  padding-top: 8px;
}
.phone-frame {
  width: 180px;
  background: #1c1c1e;
  border-radius: 28px;
  padding: 12px 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,.3);
}
.phone-notch {
  width: 60px;
  height: 8px;
  background: #1c1c1e;
  border-radius: 4px;
  margin: 0 auto 6px;
  position: relative;
  z-index: 1;
}
.phone-screen {
  background: #f5f5f5;
  border-radius: 18px;
  overflow: hidden;
  min-height: 300px;
  max-height: 360px;
  overflow-y: auto;
}
.preview-nav {
  background: #1c1917;
  color: #fff;
  text-align: center;
  font-size: 10px;
  padding: 6px 4px;
}
.preview-body { font-size: 10px; }
.pv-banner { background: #ddd; height: 60px; display: flex; align-items: center; justify-content: center; color: #999; font-size: 10px; overflow: hidden; }
.pv-image { background: #ddd; height: 50px; overflow: hidden; }
.pv-richtext { padding: 6px 8px; color: #333; line-height: 1.5; }
.pv-notice { background: #fffbeb; padding: 4px 8px; color: #92400e; border-left: 2px solid #f59e0b; }
.pv-btn { margin: 6px 8px; background: #ca8a04; color: #fff; text-align: center; padding: 4px 0; border-radius: 4px; }
.pv-products { padding: 6px 8px; background: #fff; margin: 4px 6px; border-radius: 4px; color: #666; }
.pv-divider { height: 1px; background: #e5e5e5; margin: 4px 0; }
.pv-empty { text-align: center; padding: 20px; color: #ccc; font-size: 10px; }
</style>
