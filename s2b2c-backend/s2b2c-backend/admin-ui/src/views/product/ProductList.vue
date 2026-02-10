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
       <el-table-column label="操作" width="180" align="center">
           <template #default="{ row }">
               <el-button link type="primary" @click="handleEdit(row)">编辑</el-button>
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
          <el-input v-model="imageInput" placeholder="输入图片URL后回车添加，多张用逗号分隔" @keyup.enter="addImage" />
          <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px;">
            <div v-for="(img, idx) in form.images" :key="idx" style="position: relative;">
              <el-image :src="img" style="width: 80px; height: 80px; border-radius: 4px;" fit="cover" />
              <el-button type="danger" icon="Close" circle size="small"
                style="position: absolute; top: -8px; right: -8px;"
                @click="form.images.splice(idx, 1)" />
            </div>
          </div>
        </el-form-item>
        <el-form-item label="商品描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="请输入商品描述" />
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
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getProducts, getProductById, createProduct, updateProduct, getCategories, updateProductStatus } from '@/api/product'
import { ElMessage, ElMessageBox } from 'element-plus'

const list = ref([])
const categories = ref([])
const total = ref(0)
const loading = ref(false)

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

const defaultForm = {
    name: '',
    category_id: null,
    description: '',
    images: [],
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
    Object.assign(form, { ...defaultForm, images: [] })
    imageInput.value = ''
    editId.value = null
}

const addImage = () => {
    const urls = imageInput.value.split(',').map(s => s.trim()).filter(Boolean)
    form.images.push(...urls)
    imageInput.value = ''
}

// 发布商品
const handleCreate = () => {
    resetForm()
    isEdit.value = false
    dialogVisible.value = true
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
