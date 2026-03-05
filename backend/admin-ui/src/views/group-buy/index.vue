<template>
  <div class="group_buy-page">
    <el-card>
      <template #header>拼团活动管理</template>
      
      <!-- 搜索查询 -->
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="活动名称">
          <el-input v-model="searchForm.keyword" placeholder="活动名称" clearable />
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
        <el-table-column prop="id" label="ID" width="70" />
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
          <el-select v-model="form.product_id" filterable remote :remote-method="searchProducts" placeholder="搜索关键词选择商品参与活动" style="width:100%">
            <el-option v-for="item in productOptions" :key="item.id" :label="item.name" :value="item.id">
              <span style="float:left">{{ item.name }}</span>
              <span style="float:right; color:#8492a6; font-size:13px">¥{{ item.retail_price }}</span>
            </el-option>
          </el-select>
          <div style="font-size:12px;color:#909399;margin-top:4px">关联的商品必须在上架状态，且需要<span style="color:#e6a23c">在“商品列表-营销设置”中开启“参与拼团”</span>才可生效</div>
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
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getGroupBuys, createGroupBuy, updateGroupBuy, deleteGroupBuy, getProducts } from '@/api'

// ====== 列表逻辑 ======
const loading = ref(false)
const tableData = ref([])
const pagination = reactive({ page: 1, limit: 20, total: 0 })
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
    tableData.value = res.data?.list || []
    pagination.total = res.data?.pagination?.total || 0
  } finally {
    loading.value = false
  }
}

const handleSearch = () => { pagination.page = 1; fetchData() }
const handleReset = () => {
  searchForm.keyword = ''
  searchForm.status = ''
  handleSearch()
}

// ====== 表单逻辑 ======
const formVisible = ref(false)
const formRef = ref()
const submitting = ref(false)
const productOptions = ref([])

const defaultForm = () => ({
  id: null,
  name: '',
  product_id: null,
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

const searchProducts = async (query) => {
  if (query !== '') {
    try {
      const res = await getProducts({ keyword: query, limit: 50, status: 1 })
      productOptions.value = res.data?.list || []
    } catch(e){}
  } else {
    productOptions.value = []
  }
}

const openForm = (row) => {
  if (row) {
    Object.assign(form, {
      id: row.id,
      name: row.name,
      product_id: row.product_id,
      group_price: row.group_price,
      required_members: row.required_members,
      expire_hours: row.expire_hours,
      stock_limit: row.stock_limit,
      status: row.status
    })
    // 默认展示关联的商品名
    if (row.product) {
      productOptions.value = [row.product]
    }
  } else {
    Object.assign(form, defaultForm())
    productOptions.value = []
  }
  formVisible.value = true
}

const submitForm = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    submitting.value = true
    try {
      const data = { ...form }
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
