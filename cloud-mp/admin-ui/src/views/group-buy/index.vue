<template>
  <div class="group_buy-page">
    <el-card>
      <template #header>拼团活动管理</template>
      
      <!-- 搜索查询 -->
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="活动名称">
          <!-- 后端按活动名称模糊匹配 -->
          <el-input v-model="searchForm.keyword" placeholder="活动名称" clearable @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable style="width:120px">
            <el-option label="进行中" :value="1" />
            <el-option label="已结束/下架" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
        <el-form-item style="float: right;">
          <el-button type="success" @click="openForm()">创建活动</el-button>
        </el-form-item>
      </el-form>

      <!-- 列表内容 -->
      <el-table :data="tableData" v-loading="loading">
        <el-table-column label="ID" width="90">
          <template #default="{ row }">
            <CompactIdCell :value="row.display_id || row.id" :full-value="row.id" />
          </template>
        </el-table-column>
        <el-table-column prop="name" label="活动名称" min-width="150" />
        <el-table-column label="关联商品" min-width="180">
          <template #default="{ row }">
            <div style="display:flex; align-items:center; gap:8px">
              <el-avatar shape="square" :size="30" :src="row.product?.images?.[0]" />
              <div style="font-size:12px; color:#606266">{{ row.product?.name || '商品已删除' }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="开团价格" width="100">
          <template #default="{ row }">
            <span style="color:#f56c6c; font-weight:bold">¥{{ row.group_price }}</span>
          </template>
        </el-table-column>
        <el-table-column label="成团规则" width="130">
          <template #default="{ row }">
            <div>{{ row.required_members }}人成团</div>
            <div style="font-size:12px;color:#909399">{{ row.expire_hours }}小时内</div>
          </template>
        </el-table-column>
        <el-table-column prop="sold_count" label="已成团件数" width="100" />
        <el-table-column label="库存" width="100">
          <template #default="{ row }">{{ row.stock_limit }}</template>
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
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="openForm(row)">编辑</el-button>
            <el-popconfirm title="确定要删除该活动吗？" @confirm="handleDelete(row)">
              <template #reference>
                <el-button text type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.limit"
        :total="pagination.total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="fetchData"
        @current-change="fetchData"
        style="margin-top:20px; justify-content:flex-end;"
      />
    </el-card>

    <!-- 活动表单 -->
    <el-dialog v-model="formVisible" :title="form.id ? '编辑拼团活动' : '创建拼团活动'" width="500px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="活动名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入活动名称（如：秋装特惠2人拼团）" />
        </el-form-item>
        <el-form-item label="关联商品" prop="product_id">
          <div style="display:flex; align-items:center; gap:12px; width:100%;">
            <div v-if="form.product" style="flex:1; display:flex; align-items:center; gap:10px; padding:6px 10px; border:1px solid #ebeef5; border-radius:6px; background:#fafbfc;">
              <el-avatar v-if="form.product.cover_image || form.product.images?.[0]" shape="square" :size="36" :src="form.product.cover_image || form.product.images?.[0]" />
              <div style="flex:1; min-width:0;">
                <div style="font-size:13px; color:#303133; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{{ form.product.name }}</div>
                <div style="font-size:12px; color:#909399;">ID: {{ form.product.id }} · ¥{{ form.product.retail_price }}</div>
              </div>
            </div>
            <div v-else style="flex:1; padding:6px 10px; border:1px dashed #dcdfe6; border-radius:6px; color:#909399; font-size:13px;">尚未选择商品</div>
            <el-button @click="productPickerVisible = true">{{ form.product ? '更换' : '选择商品' }}</el-button>
          </div>
          <div style="font-size:12px;color:#909399;margin-top:4px">
            此处选的是<strong>商品（SPU）</strong>和<strong>统一拼团价</strong>。小程序详情里的「规格」仍要选，因为库存、发货按 SKU 计算；未单独限定 SKU 时，<strong>任一有货规格</strong>都可以走该拼团价下单。
          </div>
          <div style="font-size:12px;color:#909399;margin-top:6px">须<strong>上架</strong>，并在商品侧开启<strong>参与拼团</strong>，否则无法保存活动。</div>
        </el-form-item>
        <el-form-item label="拼团秒杀价" prop="group_price">
          <el-input-number v-model="form.group_price" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="成团人数" prop="required_members">
          <el-input-number v-model="form.required_members" :min="2" :max="100" style="width:100%" placeholder="必须>=2" />
        </el-form-item>
        <el-form-item label="有效时间(时)" prop="expire_hours">
          <el-input-number v-model="form.expire_hours" :min="1" :max="168" style="width:100%" placeholder="拼团持续多少小时" />
        </el-form-item>
        <el-form-item label="活动库存量" prop="stock_limit">
          <el-input-number v-model="form.stock_limit" :min="0" style="width:100%" placeholder="放出多少库存供用户拼" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">确 定</el-button>
      </template>
    </el-dialog>

    <EntityPicker
      v-model:visible="productPickerVisible"
      v-model="form.product_id"
      entity="product"
      :preselected-items="form.product ? [form.product] : []"
      @confirm="onProductPicked"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import CompactIdCell from '@/components/CompactIdCell.vue'
import EntityPicker from '@/components/entity-picker'
import { getGroupBuys, createGroupBuy, updateGroupBuy, deleteGroupBuy } from '@/api'
import { usePagination } from '@/composables/usePagination'

// ====== 列表逻辑 ======
const loading = ref(false)
const tableData = ref([])
const { pagination, resetPage, applyResponse } = usePagination()
const searchForm = reactive({ keyword: '', status: '' })

const fetchData = async () => {
  loading.value = true
  try {
    const params = {
      keyword: searchForm.keyword || undefined,
      status: searchForm.status !== '' ? searchForm.status : undefined,
      page: pagination.page,
      limit: pagination.limit
    }
    const res = await getGroupBuys(params)
    tableData.value = res?.list || []
    applyResponse(res)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => { resetPage(); fetchData() }
const handleReset = () => {
  searchForm.keyword = ''
  searchForm.status = ''
  handleSearch()
}

// ====== 表单逻辑 ======
const formVisible = ref(false)
const formRef = ref()
const submitting = ref(false)
const productPickerVisible = ref(false)

const defaultForm = () => ({
  id: null,
  name: '',
  product_id: null,
  product: null, // 完整商品对象，仅用于 UI 显示 + EntityPicker 回填，提交时不发往后端
  group_price: 0,
  required_members: 2,
  expire_hours: 24,
  stock_limit: 100,
  status: 1
})
const form = reactive(defaultForm())

const rules = {
  name: [{ required: true, message: '必填项', trigger: 'blur' }],
  product_id: [{ required: true, message: '必须关联商品', trigger: 'change' }],
  group_price: [{ required: true, message: '必填项', trigger: 'blur' }]
}

const onProductPicked = (id, items) => {
  form.product_id = id
  form.product = items?.[0] || null
}

const openForm = (row) => {
  if (row) {
    Object.assign(form, {
      id: row.id,
      name: row.name,
      product_id: row.product_id,
      product: row.product || null,
      group_price: row.group_price,
      required_members: row.required_members,
      expire_hours: row.expire_hours,
      stock_limit: row.stock_limit,
      status: row.status
    })
  } else {
    Object.assign(form, defaultForm())
  }
  formVisible.value = true
}

const submitForm = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    submitting.value = true
    try {
      const { product: _product, ...data } = form
      if (data.id) {
        await updateGroupBuy(data.id, data)
        ElMessage.success('更新成功')
      } else {
        await createGroupBuy(data)
        ElMessage.success('创建成功')
      }
      formVisible.value = false
      fetchData()
    } finally {
      submitting.value = false
    }
  })
}

// ====== 快速操作 ======
const handleStatusChange = async (row, val) => {
  try {
    await updateGroupBuy(row.id, { status: val })
    ElMessage.success(val === 1 ? '活动开启' : '活动结束')
  } catch (e) {
    row.status = val === 1 ? 0 : 1
  }
}

const handleDelete = async (row) => {
  try {
    await deleteGroupBuy(row.id)
    ElMessage.success('删除成功')
    fetchData()
  } catch (e) {
    ElMessage.error('删除失败')
  }
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.search-form { margin-bottom: 20px; }
</style>
