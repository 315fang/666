<template>
  <div class="coupons-page">
    <el-card>
      <template #header>优惠券管理</template>

      <!-- 搜索查询 -->
      <el-form :inline="true" :model="searchForm" class="filter-container">
        <el-form-item label="关键字">
          <el-input v-model="searchForm.keyword" placeholder="优惠券名称" clearable />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部" clearable style="width: 120px">
            <el-option label="使用中" :value="1" />
            <el-option label="已停用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
          <el-button type="success" @click="openForm()">创建优惠券</el-button>
        </el-form-item>
      </el-form>

      <!-- 列表内容 -->
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="优惠券名称" min-width="120" />
        <el-table-column label="价值/类型" width="120">
          <template #default="{ row }">
            <el-tag :type="row.type === 'fixed' ? 'danger' : 'warning'">
              {{ row.type === 'fixed' ? '满减券' : '折扣券' }}
            </el-tag>
            <div style="margin-top:4px; font-weight:bold; color:#f56c6c">
              {{ row.type === 'fixed' ? `¥${row.value}` : `${row.value * 10}折` }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="使用门槛" width="100">
          <template #default="{ row }">
            {{ row.min_purchase > 0 ? `满${row.min_purchase}元` : '无门槛' }}
          </template>
        </el-table-column>
        <el-table-column label="时效与库存" width="150">
          <template #default="{ row }">
            <div>有效期: <span style="color:#409EFF">{{ row.valid_days }}天</span></div>
            <div>
              库存: 
              <span v-if="row.stock === -1" style="color:#67c23a">无限</span>
              <span v-else>{{ row.stock }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="发放情况 (发出/使用)" width="150">
          <template #default="{ row }">
            <div>已发: {{ row.issued_count }} 张</div>
            <div>已用: <span style="color:#f56c6c">{{ row.used_count }}</span> 张</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-switch
              v-model="row.is_active"
              :active-value="1"
              :inactive-value="0"
              @change="(val) => handleStatusChange(row, val)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="openForm(row)">编辑</el-button>
            <el-button text type="success" size="small" @click="handleIssue(row)" v-if="row.is_active === 1">发券</el-button>
            <el-popconfirm title="确定要删除此券吗？" @confirm="handleDelete(row)">
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

    <!-- ======== 优惠券表单 ======== -->
    <el-dialog v-model="formVisible" :title="form.id ? '编辑优惠券' : '创建优惠券'" width="600px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="110px">
        <el-form-item label="优惠券名称" prop="name">
          <el-input v-model="form.name" placeholder="例如：春季满100减20" />
        </el-form-item>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="券类型" prop="type">
              <el-select v-model="form.type" style="width:100%">
                <el-option label="满减券 (固定减免)" value="fixed" />
                <el-option label="折扣券 (百分比)" value="percent" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="form.type === 'fixed' ? '减免额(元)' : '折扣率'" prop="value">
              <!-- 折扣率 0.8 表示 8折 -->
              <el-input-number v-model="form.value" :min="0.01" :max="form.type === 'percent' ? 1 : 9999" :precision="2" :step="form.type === 'percent' ? 0.05 : 1" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="消费门槛(元)" prop="min_purchase">
          <el-input-number v-model="form.min_purchase" :min="0" :precision="2" style="width:100%" />
          <div class="form-tip">填0表示无门槛即可使用</div>
        </el-form-item>

        <el-form-item label="使用范围" prop="scope">
          <el-radio-group v-model="form.scope">
            <el-radio label="all">全场通用</el-radio>
            <el-radio label="product" disabled>指定商品 (暂未开放)</el-radio>
            <el-radio label="category" disabled>指定分类 (暂未开放)</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="有效天数" prop="valid_days">
              <el-input-number v-model="form.valid_days" :min="1" :precision="0" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="发放库存" prop="stock">
              <el-input-number v-model="form.stock" :min="-1" :precision="0" style="width:100%" />
              <div class="form-tip" style="position:absolute; bottom:-25px; left:0; line-height:1">-1 为不限库存</div>
            </el-form-item>
          </el-col>
        </el-row>
        <div style="height: 15px"></div>

        <el-form-item label="使用说明">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="填写给用户看的使用说明" />
        </el-form-item>

        <el-form-item label="状态">
          <el-switch v-model="form.is_active" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">确 定</el-button>
      </template>
    </el-dialog>

    <!-- ======== 人工发券 ======== -->
    <el-dialog v-model="issueVisible" title="定向发券" width="400px">
      <el-form label-width="100px">
        <el-form-item label="目标优惠券">
          <el-tag type="danger">{{ currentCoupon?.name || '' }}</el-tag>
        </el-form-item>
        <el-form-item label="发放用户 ID">
          <el-input v-model="issueForm.userIdsText" type="textarea" :rows="3" placeholder="输入用户UID，多个ID用英文逗号隔开 (例如: 1, 23, 45)" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="issueVisible = false">取消</el-button>
        <el-button type="primary" @click="submitIssue" :loading="submitting">确 认 发 放</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getCoupons, createCoupon, updateCoupon, deleteCoupon, issueCoupon } from '@/api'

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
    const res = await getCoupons(params)
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

const handleStatusChange = async (row, val) => {
  try {
    await updateCoupon(row.id, { is_active: val })
    ElMessage.success(val === 1 ? '已启用' : '已停用')
  } catch (e) {
    row.is_active = val === 1 ? 0 : 1
  }
}

const handleDelete = async (row) => {
  try {
    await deleteCoupon(row.id)
    ElMessage.success('删除成功')
    fetchData()
  } catch (e) {
    // 接口本身有校验，若已被领取则报错无法删除
  }
}

// ====== 表单逻辑 ======
const formVisible = ref(false)
const formRef = ref()
const submitting = ref(false)

const defaultForm = () => ({
  id: null,
  name: '',
  type: 'fixed',
  value: 0,
  min_purchase: 0,
  scope: 'all',
  valid_days: 30,
  stock: -1,
  description: '',
  is_active: 1
})
const form = reactive(defaultForm())

const rules = {
  name: [{ required: true, message: '请输入券名称', trigger: 'blur' }],
  value: [{ required: true, message: '必填项', trigger: 'blur' }]
}

const openForm = (row) => {
  if (row) {
    Object.assign(form, { ...row })
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
      const data = { ...form }
      if (data.id) {
        await updateCoupon(data.id, data)
        ElMessage.success('更新成功')
      } else {
        await createCoupon(data)
        ElMessage.success('创建成功')
      }
      formVisible.value = false
      fetchData()
    } finally {
      submitting.value = false
    }
  })
}

// ====== 人工发券 ======
const issueVisible = ref(false)
const currentCoupon = ref(null)
const issueForm = reactive({ userIdsText: '' })

const handleIssue = (row) => {
  currentCoupon.value = row
  issueForm.userIdsText = ''
  issueVisible.value = true
}

const submitIssue = async () => {
  const ids = issueForm.userIdsText.split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0)
    .map(id => parseInt(id))
  
  if (ids.length === 0 || ids.includes(NaN)) {
    return ElMessage.warning('请输入有效的用户ID')
  }

  submitting.value = true
  try {
    await issueCoupon(currentCoupon.value.id, { user_ids: ids })
    ElMessage.success('发放成功')
    issueVisible.value = false
    fetchData() // 刷新列表发券数量统计
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.filter-container { margin-bottom: 20px; }
.form-tip { font-size: 12px; color: #909399; margin-top: 4px; line-height: 1.2; }
</style>
