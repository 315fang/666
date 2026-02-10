<template>
  <div>
    <!-- Filters -->
    <div style="margin-bottom: 20px; display: flex; align-items: center;">
       <el-input v-model="query.name" placeholder="商品名称" style="width: 200px; margin-right: 10px;" clearable @keyup.enter="handleSearch" />
       <el-select v-model="query.category_id" placeholder="全部分类" style="width: 150px; margin-right: 10px;" clearable>
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
       </el-select>
       <el-button type="primary" @click="handleSearch">搜索</el-button>
       <el-button type="primary" icon="Plus" style="margin-left: auto;" @click="handleCreate">发布商品</el-button>
    </div>

    <el-table :data="list" border v-loading="loading">
       <el-table-column prop="id" label="ID" width="80" />
       <el-table-column label="商品信息" min-width="300">
           <template #default="{ row }">
               <div style="display: flex; align-items: center;">
                   <el-image v-if="row.images && row.images.length" :src="row.images[0]" style="width: 50px; height: 50px; margin-right: 10px; flex-shrink: 0;" fit="cover" />
                   <div style="min-width: 0;">
                       <div style="font-weight: 500;">{{ row.name }}</div>
                       <div style="color: #999; font-size: 12px;">零售价: ¥{{ row.retail_price }}</div>
                   </div>
               </div>
           </template>
       </el-table-column>
       <el-table-column label="等级价格" width="200">
           <template #default="{ row }">
               <div style="font-size: 12px; line-height: 1.8;">
                   <div>会员价: ¥{{ row.price_member || '-' }}</div>
                   <div>团长价: ¥{{ row.price_leader || '-' }}</div>
                   <div>代理价: ¥{{ row.price_agent || '-' }}</div>
               </div>
           </template>
       </el-table-column>
       <el-table-column prop="stock" label="库存" width="80" align="center" />
       <el-table-column prop="status" label="状态" width="80" align="center">
           <template #default="{ row }">
               <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '上架' : '下架' }}</el-tag>
           </template>
       </el-table-column>
       <el-table-column label="操作" width="220" align="center">
           <template #default="{ row }">
               <el-button link type="primary" @click="handleEdit(row)">编辑</el-button>
               <el-button link type="info" @click="handlePreview(row)">预览</el-button>
               <el-button link type="warning" @click="handleStatus(row)">{{ row.status === 1 ? '下架' : '上架' }}</el-button>
           </template>
       </el-table-column>
    </el-table>

    <div style="margin-top: 20px; text-align: right;">
        <el-pagination
            background
            layout="prev, pager, next"
            :total="total"
            :page-size="query.limit"
            @current-change="handlePageChange"
        />
    </div>

    <!-- 发布/编辑商品弹窗 -->
    <el-dialog
        v-model="dialogVisible"
        :title="isEdit ? '编辑商品' : '发布商品'"
        width="700px"
        :close-on-click-modal="false"
        destroy-on-close
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="商品名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入商品名称" maxlength="100" />
        </el-form-item>
        <el-form-item label="所属分类">
          <el-select v-model="form.category_id" placeholder="请选择分类" clearable style="width: 100%;">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="商品图片">
          <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
            <el-input v-model="imageInput" placeholder="输入图片URL后回车添加，多张用逗号分隔" @keyup.enter="addImage" style="flex: 1;" />
            <el-upload
              :action="uploadUrl"
              :headers="uploadHeaders"
              :on-success="(res) => onUploadSuccess(res, 'images')"
              :show-file-list="false"
              accept="image/*"
            >
              <el-button type="primary" size="small" icon="Upload">上传图片</el-button>
            </el-upload>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            <div v-for="(img, idx) in form.images" :key="idx" style="position: relative;">
              <el-image :src="img" style="width: 80px; height: 80px; border-radius: 4px;" fit="cover" :preview-src-list="form.images" :initial-index="idx" />
              <el-button type="danger" icon="Close" circle size="small"
                style="position: absolute; top: -8px; right: -8px;"
                @click="form.images.splice(idx, 1)" />
            </div>
          </div>
          <div style="font-size: 12px; color: #999; margin-top: 4px;">第一张为主图，建议比例1:1，至少上传1张</div>
        </el-form-item>

        <el-form-item label="详情图片">
          <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
            <el-input v-model="detailImageInput" placeholder="输入详情图URL后回车添加" @keyup.enter="addDetailImage" style="flex: 1;" />
            <el-upload
              :action="uploadUrl"
              :headers="uploadHeaders"
              :on-success="(res) => onUploadSuccess(res, 'detail_images')"
              :show-file-list="false"
              accept="image/*"
            >
              <el-button type="primary" size="small" icon="Upload">上传详情图</el-button>
            </el-upload>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            <div v-for="(img, idx) in form.detail_images" :key="idx" style="position: relative;">
              <el-image :src="img" style="width: 80px; height: 120px; border-radius: 4px;" fit="cover" :preview-src-list="form.detail_images" :initial-index="idx" />
              <el-button type="danger" icon="Close" circle size="small"
                style="position: absolute; top: -8px; right: -8px;"
                @click="form.detail_images.splice(idx, 1)" />
            </div>
          </div>
          <div style="font-size: 12px; color: #999; margin-top: 4px;">建议上传宽度为750px的详情长图，支持多张拼接，将在商品详情页底部展示</div>
        </el-form-item>

        <el-form-item label="商品描述">
          <el-input v-model="form.description" type="textarea" :rows="8" placeholder="请输入商品详细文案介绍，如：&#10;· 产品材质/成分&#10;· 使用方法/功效&#10;· 规格/尺寸&#10;· 注意事项&#10;（支持HTML标签格式化）" />
          <div style="font-size: 12px; color: #999; margin-top: 4px;">此文案将展示在商品详情页，详尽的描述能提升转化率</div>
        </el-form-item>

        <el-divider content-position="left">价格设置</el-divider>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="零售价" prop="retail_price">
              <el-input-number v-model="form.retail_price" :min="0" :precision="2" controls-position="right" style="width: 100%;" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="会员价">
              <el-input-number v-model="form.price_member" :min="0" :precision="2" controls-position="right" style="width: 100%;" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="团长价">
              <el-input-number v-model="form.price_leader" :min="0" :precision="2" controls-position="right" style="width: 100%;" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="代理价">
              <el-input-number v-model="form.price_agent" :min="0" :precision="2" controls-position="right" style="width: 100%;" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">库存设置</el-divider>
        <el-form-item label="库存数量" prop="stock">
          <el-input-number v-model="form.stock" :min="0" controls-position="right" style="width: 200px;" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">{{ isEdit ? '保存修改' : '立即发布' }}</el-button>
      </template>
    </el-dialog>

    <!-- 商品预览弹窗 -->
    <el-dialog v-model="previewVisible" title="商品预览" width="450px" destroy-on-close>
      <div v-if="previewProduct" style="max-height: 70vh; overflow-y: auto;">
        <!-- 主图轮播 -->
        <el-carousel v-if="previewProduct.images && previewProduct.images.length" height="300px" style="border-radius: 8px; overflow: hidden;">
          <el-carousel-item v-for="(img, idx) in previewProduct.images" :key="idx">
            <el-image :src="img" style="width: 100%; height: 300px;" fit="cover" />
          </el-carousel-item>
        </el-carousel>
        <!-- 商品信息 -->
        <div style="padding: 16px 0;">
          <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">{{ previewProduct.name }}</div>
          <div style="font-size: 24px; color: #F56C6C; font-weight: 700;">¥{{ previewProduct.retail_price }}</div>
          <div style="font-size: 12px; color: #999; margin-top: 4px;">
            会员价: ¥{{ previewProduct.price_member || '-' }} | 团长价: ¥{{ previewProduct.price_leader || '-' }} | 代理价: ¥{{ previewProduct.price_agent || '-' }}
          </div>
        </div>
        <!-- 文字描述 -->
        <div v-if="previewProduct.description" style="padding: 16px; background: #f5f5f5; border-radius: 8px; margin-bottom: 12px;">
          <div style="font-weight: 600; margin-bottom: 8px; font-size: 14px;">📝 商品详情</div>
          <div style="font-size: 13px; line-height: 1.8; color: #666; white-space: pre-wrap;" v-html="previewProduct.description"></div>
        </div>
        <!-- 详情图 -->
        <div v-if="previewProduct.detail_images && previewProduct.detail_images.length">
          <div style="font-weight: 600; margin-bottom: 8px; font-size: 14px;">🖼️ 详情图片</div>
          <el-image v-for="(img, idx) in previewProduct.detail_images" :key="idx" :src="img" style="width: 100%; margin-bottom: 4px;" fit="contain" />
        </div>
        <el-empty v-if="!previewProduct.description && (!previewProduct.detail_images || previewProduct.detail_images.length === 0)" description="暂无商品详情内容，请编辑添加" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { getProducts, getProductById, createProduct, updateProduct, getCategories, updateProductStatus } from '@/api/product'
import { ElMessage, ElMessageBox } from 'element-plus'

const list = ref([])
const categories = ref([])
const total = ref(0)
const loading = ref(false)

// 图片上传配置
const uploadUrl = computed(() => {
    const baseURL = import.meta.env.VITE_API_BASE_URL || '/admin/api'
    return `${baseURL}/upload`
})
const uploadHeaders = computed(() => ({
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`
}))
const onUploadSuccess = (res, target) => {
    if (res.code === 0 && res.data && res.data.url) {
        form[target].push(res.data.url)
        ElMessage.success('图片上传成功')
    } else {
        ElMessage.error(res.message || '上传失败')
    }
}

const query = reactive({
    page: 1,
    limit: 10,
    name: '',
    category_id: ''
})

// ========== 弹窗相关 ==========
const dialogVisible = ref(false)
const isEdit = ref(false)
const editId = ref(null)
const submitting = ref(false)
const formRef = ref(null)
const imageInput = ref('')
const detailImageInput = ref('')
const previewVisible = ref(false)
const previewProduct = ref(null)

const defaultForm = {
    name: '',
    category_id: null,
    description: '',
    images: [],
    detail_images: [],
    retail_price: null,
    price_member: null,
    price_leader: null,
    price_agent: null,
    stock: 0
}

const form = reactive({ ...defaultForm })

const rules = {
    name: [{ required: true, message: '请输入商品名称', trigger: 'blur' }],
    retail_price: [{ required: true, message: '请输入零售价', trigger: 'blur' }],
    stock: [{ required: true, message: '请输入库存', trigger: 'blur' }]
}

const resetForm = () => {
    Object.assign(form, { ...defaultForm, images: [], detail_images: [] })
    imageInput.value = ''
    detailImageInput.value = ''
    editId.value = null
}

const addImage = () => {
    const urls = imageInput.value.split(',').map(s => s.trim()).filter(Boolean)
    form.images.push(...urls)
    imageInput.value = ''
}

const addDetailImage = () => {
    const urls = detailImageInput.value.split(',').map(s => s.trim()).filter(Boolean)
    form.detail_images.push(...urls)
    detailImageInput.value = ''
}

// 发布商品
const handleCreate = () => {
    resetForm()
    isEdit.value = false
    dialogVisible.value = true
}

// 预览商品
const handlePreview = async (row) => {
    try {
        const product = await getProductById(row.id)
        previewProduct.value = product
        previewVisible.value = true
    } catch (error) {
        ElMessage.error('获取商品信息失败')
    }
}

// 编辑商品
const handleEdit = async (row) => {
    resetForm()
    isEdit.value = true
    editId.value = row.id
    try {
        const product = await getProductById(row.id)
        Object.assign(form, {
            name: product.name,
            category_id: product.category_id,
            description: product.description || '',
            images: Array.isArray(product.images) ? [...product.images] : [],
            detail_images: Array.isArray(product.detail_images) ? [...product.detail_images] : [],
            retail_price: parseFloat(product.retail_price) || null,
            price_member: parseFloat(product.price_member) || null,
            price_leader: parseFloat(product.price_leader) || null,
            price_agent: parseFloat(product.price_agent) || null,
            stock: product.stock || 0
        })
        dialogVisible.value = true
    } catch (error) {
        ElMessage.error('获取商品信息失败')
    }
}

// 提交
const handleSubmit = async () => {
    if (!formRef.value) return
    try {
        await formRef.value.validate()
    } catch {
        return
    }

    submitting.value = true
    try {
        const payload = {
            name: form.name,
            category_id: form.category_id || null,
            description: form.description,
            images: form.images,
            detail_images: form.detail_images,
            retail_price: form.retail_price,
            price_member: form.price_member,
            price_leader: form.price_leader,
            price_agent: form.price_agent,
            stock: form.stock,
            status: 1
        }

        if (isEdit.value) {
            await updateProduct(editId.value, payload)
            ElMessage.success('商品更新成功')
        } else {
            await createProduct(payload)
            ElMessage.success('商品发布成功')
        }
        dialogVisible.value = false
        loadData()
    } catch (error) {
        console.error('提交失败:', error)
    } finally {
        submitting.value = false
    }
}

// ========== 列表操作 ==========
const loadData = async () => {
    loading.value = true
    try {
        const res = await getProducts(query)
        list.value = res.list
        total.value = res.pagination.total
    } catch (error) {
        console.error(error)
    } finally {
        loading.value = false
    }
}

const loadCategories = async () => {
    try {
        const res = await getCategories()
        categories.value = res || []
    } catch (e) {
        console.error(e)
    }
}

const handleSearch = () => {
    query.page = 1
    loadData()
}

const handlePageChange = (val) => {
    query.page = val
    loadData()
}

const handleStatus = async (row) => {
    const action = row.status === 1 ? '下架' : '上架'
    try {
        await ElMessageBox.confirm(`确定${action}「${row.name}」吗？`, '提示', { type: 'warning' })
        const newStatus = row.status === 1 ? 0 : 1
        await updateProductStatus(row.id, newStatus)
        ElMessage.success(`${action}成功`)
        row.status = newStatus
    } catch (error) {
        if (error !== 'cancel') console.error(error)
    }
}

onMounted(() => {
    loadData()
    loadCategories()
})
</script>
