<template>
  <div class="products-page">
    <!-- 搜索栏 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm">
        <el-form-item label="关键词">
          <el-input v-model="searchForm.keyword" placeholder="商品名称" clearable style="width:200px" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="searchForm.category_id" placeholder="全部分类" clearable style="width:140px">
            <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部" clearable style="width:100px">
            <el-option label="上架中" :value="1" />
            <el-option label="已下架" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
          <el-button type="success" @click="openForm()">发布商品</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 表格 -->
    <el-card style="margin-top:16px">
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column label="商品" min-width="260">
          <template #default="{ row }">
            <div class="product-cell">
              <el-image 
                :src="row.images && row.images.length > 0 ? row.images[0] : ''" 
                class="product-img" 
                fit="cover"
              />
              <div class="product-info">
                <div class="product-name">{{ row.name }}</div>
                <div class="product-cat">{{ row.category?.name || '未分类' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="价格体系" width="180">
          <template #default="{ row }">
            <div class="price-list">
              <div>零售价: <span class="danger">¥{{ row.retail_price }}</span></div>
              <div class="sub-price" v-if="row.price_member">会员价: ¥{{ row.price_member }}</div>
              <div class="sub-price" v-if="row.price_agent">代理价: ¥{{ row.price_agent }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="stock" label="总库存" width="100" />
        <el-table-column label="SKU数" width="80">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ row.skus?.length || 0 }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="营销属性" width="160">
          <template #default="{ row }">
            <el-tag v-if="row.enable_coupon" size="small" effect="plain" type="danger" style="margin-right:4px">用券</el-tag>
            <el-tag v-if="row.enable_group_buy" size="small" effect="plain" type="warning" style="margin-right:4px">拼团</el-tag>
            <el-tag v-if="row.custom_commissions" size="small" effect="plain" type="success">自定佣金</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-switch
              v-model="row.status"
              :active-value="1"
              :inactive-value="0"
              @change="(val) => handleStatusChange(row, val)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="openForm(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page" v-model:page-size="pagination.limit"
        :total="pagination.total" :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="fetchProducts" @current-change="fetchProducts"
        style="margin-top:20px; justify-content:flex-end"
      />
    </el-card>

    <!-- ===== 商品发布/编辑抽屉 (Three-Tab) ===== -->
    <el-drawer v-model="formVisible" :title="form.id ? '编辑商品' : '发布商品'" size="800px" destroy-on-close>
      <el-form :model="form" :rules="rules" ref="formRef" label-width="110px" class="product-form">
        <el-tabs v-model="activeTab" class="form-tabs">
          <!-- Tab 1: 基础信息 -->
          <el-tab-pane label="基础信息" name="basic">
            <el-form-item label="商品名称" prop="name">
              <el-input v-model="form.name" placeholder="请输入商品名称" maxlength="50" show-word-limit />
            </el-form-item>
            <el-form-item label="商品分类" prop="category_id">
              <el-select v-model="form.category_id" placeholder="请选择分类" style="width:100%">
                <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="商品简介" prop="description">
              <el-input v-model="form.description" type="textarea" :rows="3" placeholder="列表页显示的简短描述" />
            </el-form-item>
            <el-form-item label="轮播首图" prop="images">
              <div class="image-uploader">
                <div class="img-preview" v-for="(img, idx) in form.images" :key="idx">
                  <el-image :src="img" fit="cover" />
                  <div class="img-actions">
                    <el-icon @click="removeImage(idx, 'images')"><Delete /></el-icon>
                  </div>
                </div>
                <div class="upload-btn" @click="openMaterialPicker('images')" v-if="form.images.length < 5">
                  <el-icon><Plus /></el-icon>
                  <span>素材库</span>
                </div>
              </div>
              <div class="form-tip">建议尺寸 800x800，最多 5 张</div>
            </el-form-item>
            <el-form-item label="图文详情" prop="detail_images">
              <div class="image-uploader column-layout">
                <div class="img-preview full-width" v-for="(img, idx) in form.detail_images" :key="idx">
                  <el-image :src="img" fit="cover" />
                  <div class="img-actions">
                    <el-icon @click="removeImage(idx, 'detail_images')"><Delete /></el-icon>
                  </div>
                </div>
                <div class="upload-btn full-width" @click="openMaterialPicker('detail_images')">
                  <el-icon><Plus /></el-icon>
                  <span>添加详情图 (素材库)</span>
                </div>
              </div>
            </el-form-item>
          </el-tab-pane>

          <!-- Tab 2: 价格与库存 (SKU) -->
          <el-tab-pane label="价格与库存" name="pricing">
            <el-alert title="请务必填写基础零售价。如果您启用了SKU，价格和库存将以SKU明细为准。" type="info" :closable="false" style="margin-bottom:16px" />
            
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="零售价 (必填)" prop="retail_price">
                  <el-input-number v-model="form.retail_price" :min="0.01" :precision="2" style="width:100%" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="成本价" prop="cost_price">
                  <el-input-number v-model="form.cost_price" :min="0" :precision="2" style="width:100%" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="会员价" prop="price_member">
                  <el-input-number v-model="form.price_member" :min="0" :precision="2" style="width:100%" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="团长价" prop="price_leader">
                  <el-input-number v-model="form.price_leader" :min="0" :precision="2" style="width:100%" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="代理商价" prop="price_agent">
                  <el-input-number v-model="form.price_agent" :min="0" :precision="2" style="width:100%" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="默认总库存" prop="stock">
                  <el-input-number v-model="form.stock" :min="0" :precision="0" style="width:100%" />
                </el-form-item>
              </el-col>
            </el-row>

            <el-divider>SKU 规格明细</el-divider>
            <div class="sku-section">
              <div class="sku-header">
                <span>SKU 列表：</span>
                <el-button size="small" type="primary" plain @click="addSku">+ 添加规格</el-button>
              </div>
              <el-table :data="form.skus" border size="small" style="width: 100%; margin-top:10px">
                <el-table-column label="规格名" width="100">
                  <template #default="{ row }">
                    <el-input v-model="row.spec_name" placeholder="如: 颜色" size="small" />
                  </template>
                </el-table-column>
                <el-table-column label="规格值" width="100">
                  <template #default="{ row }">
                    <el-input v-model="row.spec_value" placeholder="如: 红色" size="small" />
                  </template>
                </el-table-column>
                <el-table-column label="SKU 编码" width="120">
                  <template #default="{ row }">
                    <el-input v-model="row.sku_code" placeholder="选填" size="small" />
                  </template>
                </el-table-column>
                <el-table-column label="零售价" width="110">
                  <template #default="{ row }">
                    <el-input-number v-model="row.retail_price" :min="0" :precision="2" size="small" :controls="false" style="width:100%" />
                  </template>
                </el-table-column>
                <el-table-column label="库存" width="90">
                  <template #default="{ row }">
                    <el-input-number v-model="row.stock" :min="0" :precision="0" size="small" :controls="false" style="width:100%" />
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="60" fixed="right" align="center">
                  <template #default="{ $index }">
                    <el-button text type="danger" size="small" @click="removeSku($index)">删</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </el-tab-pane>

          <!-- Tab 3: 营销与设置 -->
          <el-tab-pane label="营销与设置" name="marketing">
            <el-form-item label="开放优惠券" prop="enable_coupon">
              <el-switch v-model="form.enable_coupon" :active-value="1" :inactive-value="0" />
              <span class="form-tip-inline">允许用户使用满减等优惠券</span>
            </el-form-item>
            <el-form-item label="参与拼团" prop="enable_group_buy">
              <el-switch v-model="form.enable_group_buy" :active-value="1" :inactive-value="0" />
              <span class="form-tip-inline">作为拼团活动可用商品</span>
            </el-form-item>
            <el-form-item label="默认销量/热度" prop="manual_weight">
              <el-input-number v-model="form.manual_weight" :min="0" :precision="0" style="width:160px" />
              <span class="form-tip-inline">用于前端展示和基础排序</span>
            </el-form-item>

            <el-divider>分销佣金设置</el-divider>
            <el-alert title="开启独立设置后，该商品将不使用全局统一的佣金比例，而是按照下方填写的金额/比例进行结算。" type="warning" :closable="false" style="margin-bottom:16px" />
            <el-form-item label="独立佣金设置" prop="custom_commissions">
              <el-switch v-model="form.custom_commissions" :active-value="1" :inactive-value="0" />
            </el-form-item>
            
            <template v-if="form.custom_commissions === 1">
              <el-row :gutter="20">
                <el-col :span="12">
                  <el-form-item label="直推比例(%)">
                    <el-input-number v-model="form.commission_rate_1" :min="0" :max="100" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="间推比例(%)">
                    <el-input-number v-model="form.commission_rate_2" :min="0" :max="100" />
                  </el-form-item>
                </el-col>
              </el-row>
              <el-row :gutter="20">
                <el-col :span="12">
                  <el-form-item label="直推固定(元)">
                    <el-input-number v-model="form.commission_amount_1" :min="0" :precision="2" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="间推固定(元)">
                    <el-input-number v-model="form.commission_amount_2" :min="0" :precision="2" />
                  </el-form-item>
                </el-col>
              </el-row>
              <div class="form-tip" style="margin-left:110px">如果同时设置了比例和固定金额，将优先使用固定金额。</div>
            </template>
          </el-tab-pane>
        </el-tabs>
      </el-form>

      <template #footer>
        <div style="display:flex; justify-content: space-between;">
          <el-button @click="formVisible = false">取消</el-button>
          <div>
            <el-button type="primary" @click="submitForm" :loading="submitting">保存商品</el-button>
          </div>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'
import { getProducts, createProduct, updateProduct, updateProductStatus, getCategories } from '@/api'

// ===== 列表 =====
const loading = ref(false)
const tableData = ref([])
const categories = ref([])
const pagination = reactive({ page: 1, limit: 20, total: 0 })
const searchForm = reactive({ keyword: '', category_id: '', status: '' })

const loadCategories = async () => {
  try {
    const res = await getCategories()
    categories.value = res.data || []
  } catch (e) {
    console.error('获取分类失败')
  }
}

const fetchProducts = async () => {
  loading.value = true
  try {
    const params = {
      keyword: searchForm.keyword || undefined,
      category_id: searchForm.category_id || undefined,
      status: searchForm.status !== '' ? searchForm.status : undefined,
      page: pagination.page,
      limit: pagination.limit
    }
    const res = await getProducts(params)
    tableData.value = res.data?.list || []
    pagination.total = res.data?.pagination?.total || 0
  } finally {
    loading.value = false
  }
}

const handleSearch = () => { pagination.page = 1; fetchProducts() }
const handleReset = () => {
  Object.assign(searchForm, { keyword: '', category_id: '', status: '' })
  handleSearch()
}

const handleStatusChange = async (row, val) => {
  try {
    await updateProductStatus(row.id, { status: val })
    ElMessage.success(val === 1 ? '已上架' : '已下架')
  } catch (e) {
    row.status = val === 1 ? 0 : 1 // revert
  }
}

// ===== 表单 =====
const formVisible = ref(false)
const formRef = ref(null)
const submitting = ref(false)
const activeTab = ref('basic')

const defaultForm = () => ({
  id: null,
  name: '',
  category_id: null,
  description: '',
  images: [],
  detail_images: [],
  retail_price: null,
  cost_price: null,
  price_member: null,
  price_leader: null,
  price_agent: null,
  stock: 0,
  skus: [],
  enable_coupon: 1,
  enable_group_buy: 0,
  manual_weight: 0,
  custom_commissions: 0,
  commission_rate_1: 0,
  commission_rate_2: 0,
  commission_amount_1: 0,
  commission_amount_2: 0
})

const form = reactive(defaultForm())

const rules = {
  name: [{ required: true, message: '请输入商品名称', trigger: 'blur' }],
  retail_price: [{ required: true, message: '请输入零售价格', trigger: 'blur' }]
}

const openForm = (row) => {
  activeTab.value = 'basic'
  if (row) {
    Object.assign(form, {
      id: row.id,
      name: row.name || '',
      category_id: row.category_id || null,
      description: row.description || '',
      images: row.images ? [...row.images] : [],
      detail_images: row.detail_images ? [...row.detail_images] : [],
      retail_price: row.retail_price,
      cost_price: row.cost_price,
      price_member: row.price_member || row.member_price,
      price_leader: row.price_leader,
      price_agent: row.price_agent,
      stock: row.stock || 0,
      skus: row.skus ? row.skus.map(s => ({...s})) : [],
      enable_coupon: row.enable_coupon,
      enable_group_buy: row.enable_group_buy,
      manual_weight: row.manual_weight || 0,
      custom_commissions: row.custom_commissions,
      commission_rate_1: row.commission_rate_1 || 0,
      commission_rate_2: row.commission_rate_2 || 0,
      commission_amount_1: row.commission_amount_1 || 0,
      commission_amount_2: row.commission_amount_2 || 0
    })
  } else {
    Object.assign(form, defaultForm())
  }
  formVisible.value = true
}

const addSku = () => {
  form.skus.push({
    spec_name: '', spec_value: '', sku_code: '', retail_price: form.retail_price || 0, stock: 0
  })
}
const removeSku = (idx) => {
  form.skus.splice(idx, 1)
}

const removeImage = (idx, type) => {
  form[type].splice(idx, 1)
}

// 模拟素材库挑选图片（后续可通过 ElMessageBox 唤起组件，此处要求用户输入URL）
const openMaterialPicker = (type) => {
  import('element-plus').then(({ ElMessageBox }) => {
    ElMessageBox.prompt('请输入图片URL', '添加图片', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPattern: /^https?:\/\/.+/,
      inputErrorMessage: 'URL格式不正确'
    }).then(({ value }) => {
      form[type].push(value)
    }).catch(() => {})
  })
}

const submitForm = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) {
      ElMessage.warning('请检查基础信息和必填项')
      return
    }
    
    // 基本校验
    if (!form.images || form.images.length === 0) return ElMessage.warning('请至少上传一张首图')
    
    submitting.value = true
    try {
      const data = { ...form }
      if (data.id) {
        await updateProduct(data.id, data)
        ElMessage.success('更新成功')
      } else {
        await createProduct(data)
        ElMessage.success('发布商品成功')
      }
      formVisible.value = false
      fetchProducts()
    } catch (e) {
      console.error(e)
    } finally {
      submitting.value = false
    }
  })
}

onMounted(() => {
  loadCategories()
  fetchProducts()
})
</script>

<style scoped>
.products-page { display: flex; flex-direction: column; gap: 0; }
.search-card { border-radius: 8px; }

.product-cell { display: flex; align-items: stretch; gap: 12px; }
.product-img { width: 60px; height: 60px; border-radius: 6px; flex-shrink: 0; background: #f5f7fa; }
.product-info { display: flex; flex-direction: column; justify-content: center; }
.product-name { font-size: 14px; font-weight: 500; color: #1a1a2e; line-height: 1.4; margin-bottom: 4px; }
.product-cat { font-size: 12px; color: #909399; }

.price-list { font-size: 12px; line-height: 1.6; }
.danger { color: #f56c6c; font-weight: 600; font-size: 13px; }
.sub-price { color: #888; }

.form-tabs { margin-bottom: 20px; }
.form-tip { font-size: 12px; color: #909399; line-height: 1.5; margin-top: 4px; }
.form-tip-inline { font-size: 12px; color: #909399; margin-left: 10px; }

/* 图片上传器 */
.image-uploader { display: flex; flex-wrap: wrap; gap: 10px; }
.image-uploader.column-layout { flex-direction: column; width: 300px; }

.img-preview, .upload-btn {
  width: 80px; height: 80px; border-radius: 6px; border: 1px dashed #dcdfe6; position: relative;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  overflow: hidden; cursor: pointer; color: #8c939d; transition: all 0.3s;
}
.img-preview.full-width, .upload-btn.full-width { width: 100%; height: auto; min-height: 80px; }
.img-preview.full-width .el-image { width: 100%; height: auto; display: block; }
.img-preview .el-image { width: 100%; height: 100%; }

.upload-btn:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.upload-btn span { font-size: 12px; margin-top: 4px; }

.img-actions {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s;
}
.img-actions .el-icon { font-size: 20px; color: #fff; cursor: pointer; }
.img-preview:hover .img-actions { opacity: 1; }

.sku-section { background: #f8f9fa; padding: 12px; border-radius: 6px; }
.sku-header { display: flex; align-items: center; justify-content: space-between; font-weight: 500; }
</style>
