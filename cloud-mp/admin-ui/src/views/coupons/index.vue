<template>
  <div class="coupons-page">
    <el-card>
      <template #header>优惠券管理</template>

      <el-alert
        title="自动发券：支持新用户注册自动发券。可在下方配置触发规则。"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 14px;"
      />

      <el-card shadow="never" style="margin-bottom: 16px;">
        <template #header>
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span>自动发券规则</span>
            <el-button type="primary" :loading="autoRuleSaving" @click="saveAutoRule">保存规则</el-button>
          </div>
        </template>
        <el-form label-width="130px">
          <el-form-item label="注册自动发券">
            <el-switch v-model="autoRule.enabled" />
          </el-form-item>
          <el-form-item label="目标优惠券">
            <el-select v-model="autoRule.coupon_id" placeholder="请选择优惠券" style="width:320px">
              <el-option v-for="c in couponOptions" :key="c.id" :label="`${c.name} (#${c.id})`" :value="c.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="目标用户等级">
            <el-checkbox-group v-model="autoRule.target_levels">
              <el-checkbox :label="0">普通用户(0)</el-checkbox>
              <el-checkbox :label="1">会员(1)</el-checkbox>
              <el-checkbox :label="2">团长(2)</el-checkbox>
              <el-checkbox :label="3">代理商(3)</el-checkbox>
              <el-checkbox :label="4">合伙人(4)</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
        </el-form>
      </el-card>

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
            <el-tag :type="row.type === 'percent' ? 'warning' : 'danger'">
              {{ row.type === 'fixed' ? '满减券' : row.type === 'no_threshold' ? '无门槛券' : '折扣券' }}
            </el-tag>
            <div style="margin-top:4px; font-weight:bold; color:#f56c6c">
              {{ row.type === 'percent' ? `${row.value * 10}折` : `¥${row.value}` }}
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
                <el-option label="无门槛券" value="no_threshold" />
                <el-option label="折扣券 (百分比)" value="percent" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="form.type === 'percent' ? '折扣率' : '减免额(元)'" prop="value">
              <!-- 折扣率 0.8 表示 8折 -->
              <el-input-number v-model="form.value" :min="0.01" :max="form.type === 'percent' ? 1 : 9999" :precision="2" :step="form.type === 'percent' ? 0.05 : 1" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="消费门槛(元)" prop="min_purchase">
          <el-input-number v-model="form.min_purchase" :min="0" :precision="2" style="width:100%" :disabled="form.type === 'no_threshold'" />
          <div class="form-tip">{{ form.type === 'no_threshold' ? '无门槛券固定为 0 元门槛' : '填0表示无门槛即可使用' }}</div>
        </el-form-item>

        <el-form-item label="使用范围" prop="scope">
          <el-radio-group v-model="form.scope">
            <el-radio label="all">全场通用</el-radio>
            <el-radio label="product">指定商品</el-radio>
            <el-radio label="category">指定分类</el-radio>
          </el-radio-group>
          <div class="form-tip">指定范围时须至少选择一项；下单时由接口校验是否与购物袋商品一致。</div>
        </el-form-item>

        <el-form-item v-if="form.scope === 'product'" label="适用商品" prop="scope_ids">
          <el-select
            v-model="form.scope_ids"
            multiple
            filterable
            remote
            reserve-keyword
            placeholder="输入关键字搜索商品"
            :remote-method="searchProducts"
            :loading="productSearchLoading"
            style="width: 100%"
            value-key="id"
          >
            <el-option
              v-for="p in productOptions"
              :key="p.id"
              :label="`${p.id} · ${p.name}`"
              :value="p.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item v-if="form.scope === 'category'" label="适用分类" prop="scope_ids">
          <el-select v-model="form.scope_ids" multiple filterable placeholder="选择分类" style="width: 100%">
            <el-option
              v-for="c in categoryOptions"
              :key="c.id"
              :label="`${c.id} · ${c.name}`"
              :value="c.id"
            />
          </el-select>
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
    <el-dialog v-model="issueVisible" title="定向发券" width="480px">
      <el-form label-width="110px">
        <el-form-item label="目标优惠券">
          <el-tag type="danger">{{ currentCoupon?.name || '' }}</el-tag>
        </el-form-item>
        <el-form-item label="发放方式">
          <el-radio-group v-model="issueForm.mode">
            <el-radio label="ids">指定用户ID</el-radio>
            <el-radio label="level">按用户等级</el-radio>
            <el-radio label="both">两者合并</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="用户等级" v-if="issueForm.mode !== 'ids'">
          <el-checkbox-group v-model="issueForm.roleLevels">
            <el-checkbox :label="0">普通用户(0)</el-checkbox>
            <el-checkbox :label="1">会员(1)</el-checkbox>
            <el-checkbox :label="2">团长(2)</el-checkbox>
            <el-checkbox :label="3">代理商(3)</el-checkbox>
            <el-checkbox :label="4">合伙人(4)</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="指定用户 ID" v-if="issueForm.mode !== 'level'">
          <el-input v-model="issueForm.userIdsText" type="textarea" :rows="3"
            placeholder="输入用户ID，多个用英文逗号分隔（例如：1, 23, 45）" />
        </el-form-item>
        <el-alert type="info" :closable="false" show-icon style="margin-top:4px"
          title="已持有该券的用户将自动跳过，不会重复发放。" />
      </el-form>
      <template #footer>
        <el-button @click="issueVisible = false">取消</el-button>
        <el-button type="primary" @click="submitIssue" :loading="submitting">确 认 发 放</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  issueCoupon,
  getCouponAutoRules,
  saveCouponAutoRules,
  getProducts,
  getCategories,
  getProductById
} from '@/api'
import { usePagination } from '@/composables/usePagination'

// ====== 列表逻辑 ======
const loading = ref(false)
const tableData = ref([])
const couponOptions = ref([])
const { pagination, resetPage, applyResponse } = usePagination()
const searchForm = reactive({ keyword: '', status: '' })
const autoRuleSaving = ref(false)
const autoRule = reactive({
  enabled: false,
  coupon_id: null,
  target_levels: []
})

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
    tableData.value = res?.list || []
    couponOptions.value = tableData.value
    applyResponse(res)
  } finally {
    loading.value = false
  }
}

const fetchAutoRule = async () => {
  try {
    const res = await getCouponAutoRules()
    const rules = res || []
    const reg = (rules || []).find(r => r.trigger_event === 'register') || null
    if (reg) {
      autoRule.enabled = !!reg.enabled
      autoRule.coupon_id = reg.coupon_id || null
      autoRule.target_levels = Array.isArray(reg.target_levels) ? reg.target_levels : []
    }
  } catch (e) {
    console.warn('获取自动发券规则失败', e)
  }
}

const saveAutoRule = async () => {
  autoRuleSaving.value = true
  try {
    const rules = [{
      id: 'register_welcome',
      name: '新用户注册发券',
      enabled: !!autoRule.enabled,
      trigger_event: 'register',
      coupon_id: autoRule.coupon_id || null,
      target_levels: Array.isArray(autoRule.target_levels) ? autoRule.target_levels : []
    }]
    await saveCouponAutoRules({ rules })
    ElMessage.success('自动发券规则已保存')
  } finally {
    autoRuleSaving.value = false
  }
}

const handleSearch = () => { resetPage(); fetchData() }
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

function normalizeScopeIds(val) {
  if (Array.isArray(val)) return val.map(Number).filter((n) => Number.isFinite(n))
  if (val && typeof val === 'object') return []
  if (typeof val === 'string' && val.trim()) {
    return val.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
  }
  return []
}

const categoryOptions = ref([])
const productOptions = ref([])
const productSearchLoading = ref(false)

const loadCategories = async () => {
  try {
    const list = await getCategories()
    categoryOptions.value = Array.isArray(list) ? list : []
  } catch {
    categoryOptions.value = []
  }
}

const searchProducts = async (query) => {
  productSearchLoading.value = true
  try {
    const res = await getProducts({
      page: 1,
      limit: 50,
      keyword: query || undefined
    })
    const list = res?.list || []
    const merged = new Map(productOptions.value.map((p) => [p.id, p]))
    for (const p of list) merged.set(p.id, { id: p.id, name: p.name })
    productOptions.value = [...merged.values()]
  } finally {
    productSearchLoading.value = false
  }
}

const defaultForm = () => ({
  id: null,
  name: '',
  type: 'fixed',
  value: 0,
  min_purchase: 0,
  scope: 'all',
  scope_ids: [],
  valid_days: 30,
  stock: -1,
  description: '',
  is_active: 1
})
const form = reactive(defaultForm())

const rules = {
  name: [{ required: true, message: '请输入券名称', trigger: 'blur' }],
  value: [{ required: true, message: '必填项', trigger: 'blur' }],
  scope_ids: [{
    validator: (_rule, _val, callback) => {
      if (form.scope === 'all') return callback()
      const ids = Array.isArray(form.scope_ids) ? form.scope_ids.filter((id) => id != null && id !== '') : []
      if (ids.length === 0) callback(new Error('请选择至少一项商品或分类'))
      else callback()
    },
    trigger: 'change'
  }]
}

const openForm = async (row) => {
  await loadCategories()
  if (row) {
    Object.assign(form, { ...row })
    form.scope_ids = normalizeScopeIds(row.scope_ids)
    productOptions.value = []
    if (form.scope === 'product' && form.scope_ids.length) {
      await searchProducts('')
      const need = new Set(form.scope_ids)
      const found = new Set(productOptions.value.map((p) => p.id))
      const missing = [...need].filter((id) => !found.has(id))
      for (const id of missing) {
        try {
          const detail = await getProductById(id)
          if (detail?.id) productOptions.value.push({ id: detail.id, name: detail.name })
        } catch {
          productOptions.value.push({ id, name: `#${id}` })
        }
      }
    }
  } else {
    Object.assign(form, defaultForm())
    productOptions.value = []
    await searchProducts('')
  }
  formVisible.value = true
}

watch(() => form.scope, (next, prev) => {
  if (next === 'all') form.scope_ids = []
  if (next === 'product' && prev !== 'product') {
    form.scope_ids = []
    searchProducts('')
  }
  if (next === 'category' && prev !== 'category') form.scope_ids = []
})

const submitForm = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    submitting.value = true
    try {
      const data = { ...form }
      if (data.type === 'no_threshold') {
        data.min_purchase = 0
      }
      if (data.scope === 'all') {
        data.scope_ids = null
      } else {
        data.scope_ids = normalizeScopeIds(data.scope_ids)
      }
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
const issueForm = reactive({ mode: 'ids', userIdsText: '', roleLevels: [] })

const handleIssue = (row) => {
  currentCoupon.value = row
  issueForm.mode = 'ids'
  issueForm.userIdsText = ''
  issueForm.roleLevels = []
  issueVisible.value = true
}

const submitIssue = async () => {
  const payload = {}

  if (issueForm.mode !== 'level') {
    const ids = issueForm.userIdsText.split(',')
      .map(id => id.trim()).filter(Boolean).map(Number).filter(n => !isNaN(n) && n > 0)
    if (ids.length === 0 && issueForm.mode === 'ids') {
      return ElMessage.warning('请输入有效的用户ID')
    }
    if (ids.length > 0) payload.user_ids = ids
  }

  if (issueForm.mode !== 'ids') {
    if (issueForm.roleLevels.length === 0) return ElMessage.warning('请至少选择一个用户等级')
    payload.role_levels = issueForm.roleLevels
  }

  submitting.value = true
  try {
    const result = await issueCoupon(currentCoupon.value.id, payload)
    ElMessage.success(result?.message || '发放成功')
    issueVisible.value = false
    fetchData()
  } catch (e) {
    // error handled by interceptor
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  fetchData()
  fetchAutoRule()
})
</script>

<style scoped>
.filter-container { margin-bottom: 20px; }
.form-tip { font-size: 12px; color: #909399; margin-top: 4px; line-height: 1.2; }
</style>
