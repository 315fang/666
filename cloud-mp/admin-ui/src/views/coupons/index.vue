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
              <el-checkbox :label="0">VIP用户(0)</el-checkbox>
              <el-checkbox :label="1">初级会员(1)</el-checkbox>
              <el-checkbox :label="2">高级会员(2)</el-checkbox>
              <el-checkbox :label="3">推广合伙人(3)</el-checkbox>
              <el-checkbox :label="4">运营合伙人(4)</el-checkbox>
              <el-checkbox :label="5">区域合伙人(5)</el-checkbox>
              <el-checkbox :label="6">线下实体门店(6)</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 搜索查询 -->
      <el-form :inline="true" :model="searchForm" class="filter-container">
        <el-form-item label="关键字">
          <!-- 后端按优惠券名称模糊匹配 -->
          <el-input v-model="searchForm.keyword" placeholder="优惠券名称" clearable @keyup.enter="handleSearch" />
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
        <el-table-column label="ID" width="72">
          <template #default="{ row }">
            <el-tooltip v-if="String(row.id).length > 6" :content="String(row.id)" placement="top">
              <span class="id-cell">{{ String(row.id).slice(0, 6) }}…</span>
            </el-tooltip>
            <span v-else class="id-cell">{{ row.id }}</span>
          </template>
        </el-table-column>
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
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="openForm(row)">编辑</el-button>
            <el-button text type="success" size="small" @click="handleIssue(row)" v-if="row.is_active === 1">发券</el-button>
            <el-button text type="warning" size="small" @click="handleShare(row)">分享</el-button>
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
    <el-dialog v-model="issueVisible" title="定向发券" width="520px">
      <el-form label-width="110px">
        <el-form-item label="目标优惠券">
          <el-tag type="danger">{{ currentCoupon?.name || '' }}</el-tag>
        </el-form-item>
        <el-form-item label="发放方式">
          <el-radio-group v-model="issueForm.mode">
            <el-radio label="search">搜索用户名称</el-radio>
            <el-radio label="ids">指定用户ID</el-radio>
            <el-radio label="level">按用户等级</el-radio>
            <el-radio label="both">ID + 等级合并</el-radio>
          </el-radio-group>
        </el-form-item>
        <!-- 搜索用户名称模式 -->
        <el-form-item label="搜索用户" v-if="issueForm.mode === 'search'">
          <el-select
            v-model="issueForm.selectedUsers"
            multiple
            filterable
            remote
            reserve-keyword
            placeholder="输入昵称 / 手机号搜索"
            :remote-method="searchUsers"
            :loading="userSearchLoading"
            value-key="id"
            style="width:100%"
          >
            <el-option
              v-for="u in userSearchOptions"
              :key="u.id"
              :label="`${u.nickname || '未知'} (${u.phone || u.member_no || '#' + u.id})`"
              :value="u"
            />
          </el-select>
          <div class="form-tip" style="margin-top:6px">已选 {{ issueForm.selectedUsers.length }} 位用户</div>
        </el-form-item>
        <el-form-item label="用户等级" v-if="issueForm.mode === 'level' || issueForm.mode === 'both'">
          <el-checkbox-group v-model="issueForm.roleLevels">
            <el-checkbox :label="0">VIP用户(0)</el-checkbox>
            <el-checkbox :label="1">初级会员(1)</el-checkbox>
            <el-checkbox :label="2">高级会员(2)</el-checkbox>
            <el-checkbox :label="3">推广合伙人(3)</el-checkbox>
            <el-checkbox :label="4">运营合伙人(4)</el-checkbox>
            <el-checkbox :label="5">区域合伙人(5)</el-checkbox>
            <el-checkbox :label="6">线下实体门店(6)</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="指定用户 ID" v-if="issueForm.mode === 'ids' || issueForm.mode === 'both'">
          <el-input v-model="issueForm.userIdsText" type="textarea" :rows="3"
            placeholder="输入用户ID，多个用英文逗号分隔（例如：1, 23, 45）" />
        </el-form-item>
        <el-alert type="info" :closable="false" show-icon style="margin-top:4px"
          title="已持有该券的用户将自动跳过，不会重复发放。" />
      </el-form>
      <template #footer>
        <el-button @click="issueVisible = false">取消</el-button>
        <el-button type="primary" @click="submitIssue" :loading="submitting">下一步：预览名单</el-button>
      </template>
    </el-dialog>

    <!-- ======== 分享优惠券 ======== -->
    <el-dialog v-model="shareVisible" title="分享优惠券" width="420px" @close="shareDialogClose">
      <div style="text-align:center; padding:8px 0">
        <p style="margin-bottom:12px; color:#606266; font-size:14px">
          券名称：<strong>{{ shareTarget?.name }}</strong>
        </p>
        <el-radio-group v-model="shareMode" style="margin-bottom: 16px;" @change="onShareModeChange">
          <el-radio-button label="standard">通用分享码</el-radio-button>
          <el-radio-button label="one_time">一次性领取码</el-radio-button>
        </el-radio-group>
        <!-- 小程序码图片 -->
        <div v-if="shareLoading" style="height:200px; display:flex; align-items:center; justify-content:center;">
          <el-icon class="is-loading" style="font-size:36px; color:#409EFF"><Loading /></el-icon>
        </div>
        <div v-else-if="shareWxacodeBase64" style="margin-bottom:16px">
          <img
            ref="wxacodeImgRef"
            :src="`data:image/png;base64,${shareWxacodeBase64}`"
            alt="小程序码"
            style="width:200px; height:200px; border-radius:8px; box-shadow:0 2px 12px rgba(0,0,0,.12);"
          />
          <div style="margin-top:8px; font-size:12px; color:#909399">长按或右键图片可保存</div>
        </div>
        <div v-if="shareMode === 'one_time' && shareTicketId" style="font-size:12px; color:#909399; margin-top:-8px; margin-bottom:12px;">
          票据 ID：{{ shareTicketId }}
        </div>
        <div v-else style="height:100px; line-height:100px; color:#909399; font-size:13px">
          小程序码暂不可用，可复制下方路径分享
        </div>
        <!-- 小程序路径 -->
        <div style="display:flex; align-items:center; gap:8px; margin:12px 0; background:#f5f7fa; border-radius:6px; padding:8px 12px;">
          <span style="flex:1; font-size:12px; color:#606266; word-break:break-all; text-align:left;">{{ shareMpPath }}</span>
          <el-button size="small" type="primary" plain @click="copyMpPath">复制路径</el-button>
        </div>
        <div style="display:flex; gap:8px; justify-content:center; margin-top:8px">
          <el-button v-if="shareMode === 'one_time'" type="warning" plain @click="reloadOneTimeShare">重新生成</el-button>
          <a
            v-if="shareWxacodeBase64"
            :href="`data:image/png;base64,${shareWxacodeBase64}`"
            :download="`coupon-${shareTarget?.id}.png`"
          >
            <el-button type="success">下载小程序码</el-button>
          </a>
        </div>
      </div>
    </el-dialog>

    <!-- 发券目标用户确认弹窗 -->
    <UserConfirmDialog
      v-model="issueConfirmVisible"
      title="发券确认 — 请核查目标用户名单"
      :action-desc="`发放优惠券「${currentCoupon?.name || ''}」`"
      :users="issuePreviewUsers"
      :count="issuePreviewCount"
      :truncated="issuePreviewTruncated"
      :loading="issuePreviewLoading"
      :confirming="issueConfirming"
      @confirm="doIssue"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import {
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  issueCoupon,
  previewCouponIssue,
  getCouponAutoRules,
  saveCouponAutoRules,
  getProducts,
  getCategories,
  getProductById,
  getCouponWxacode,
  createCouponClaimTicket
} from '@/api'
import { searchUsersLite } from '@/api/modules/users'
import { usePagination } from '@/composables/usePagination'
import UserConfirmDialog from '@/components/UserConfirmDialog.vue'

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
  value: 1,
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
  value: [
    { required: true, message: '必填项', trigger: 'blur' },
    {
      validator: (_rule, val, callback) => {
        const v = Number(val)
        if (!Number.isFinite(v) || v <= 0) return callback(new Error('金额必须大于 0'))
        if (form.type === 'percent' && v >= 1) return callback(new Error('折扣率必须小于 1（例如 0.8 表示 8折）'))
        callback()
      },
      trigger: 'blur'
    }
  ],
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
  const valid = await formRef.value.validate().catch(() => false)
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
  } catch (e) {
    ElMessage.error(e?.message || '保存失败，请重试')
  } finally {
    submitting.value = false
  }
}

// ====== 分享优惠券 ======
const shareVisible = ref(false)
const shareTarget = ref(null)
const shareLoading = ref(false)
const shareWxacodeBase64 = ref('')
const shareMpPath = ref('')
const shareMode = ref('standard')
const shareTicketId = ref('')
const wxacodeImgRef = ref(null)
const COUPON_WXACODE_ENVS = ['release', 'trial', 'develop']

async function loadCouponWxacode(rowId) {
  const attempts = []

  for (const env of COUPON_WXACODE_ENVS) {
    try {
      const res = await getCouponWxacode(rowId, env)
      attempts.push({ env, error: res?.error || '', ok: !!res?.wxacode_base64 })
      if (res?.mp_path) shareMpPath.value = res.mp_path
      if (res?.wxacode_base64) {
        return { ...res, env, attempts }
      }
    } catch (error) {
      attempts.push({ env, error: error?.message || 'request_failed', ok: false })
    }
  }

  return { wxacode_base64: '', attempts }
}

async function loadCouponClaimTicket(rowId) {
  const attempts = []

  for (const env of COUPON_WXACODE_ENVS) {
    try {
      const res = await createCouponClaimTicket(rowId, env)
      attempts.push({ env, error: res?.error || '', ok: !!res?.wxacode_base64 })
      if (res?.mp_path) shareMpPath.value = res.mp_path
      if (res?.ticket?.ticket_id) shareTicketId.value = res.ticket.ticket_id
      if (res?.wxacode_base64) {
        return { ...res, env, attempts }
      }
      return { ...res, env, attempts }
    } catch (error) {
      attempts.push({ env, error: error?.message || 'request_failed', ok: false })
    }
  }

  return { wxacode_base64: '', attempts }
}

async function loadSharePayload(rowId) {
  if (shareMode.value === 'one_time') {
    return loadCouponClaimTicket(rowId)
  }
  shareTicketId.value = ''
  return loadCouponWxacode(rowId)
}

const handleShare = async (row) => {
  shareTarget.value = row
  shareMode.value = 'standard'
  shareTicketId.value = ''
  shareWxacodeBase64.value = ''
  shareMpPath.value = `/pages/coupon/claim?id=${row.id}`
  shareVisible.value = true
  shareLoading.value = true
  try {
    const res = await loadSharePayload(row.id)
    shareWxacodeBase64.value = res?.wxacode_base64 || ''
    if (!shareWxacodeBase64.value) {
      const hints = (res?.attempts || [])
        .filter((item) => item.error)
        .map((item) => `${item.env}: ${item.error}`)
        .join('；')
      ElMessage.warning(hints ? `小程序码生成失败，已回退为路径分享（${hints}）` : '小程序码生成失败，可手动复制路径分享')
    }
  } catch (e) {
    ElMessage.warning('小程序码生成失败，可手动复制路径分享')
  } finally {
    shareLoading.value = false
  }
}

const shareDialogClose = () => {
  shareWxacodeBase64.value = ''
  shareTicketId.value = ''
  shareMode.value = 'standard'
}

const copyMpPath = async () => {
  try {
    await navigator.clipboard.writeText(shareMpPath.value)
    ElMessage.success('路径已复制，可在微信中粘贴发送')
  } catch {
    ElMessage.info(`请手动复制：${shareMpPath.value}`)
  }
}

const onShareModeChange = async () => {
  if (!shareTarget.value) return
  shareLoading.value = true
  shareWxacodeBase64.value = ''
  shareTicketId.value = ''
  shareMpPath.value = shareMode.value === 'one_time'
    ? ''
    : `/pages/coupon/claim?id=${shareTarget.value.id}`
  try {
    const res = await loadSharePayload(shareTarget.value.id)
    shareWxacodeBase64.value = res?.wxacode_base64 || ''
    if (!shareWxacodeBase64.value && !shareMpPath.value) {
      shareMpPath.value = res?.mp_path || shareMpPath.value
    }
  } finally {
    shareLoading.value = false
  }
}

const reloadOneTimeShare = async () => {
  if (!shareTarget.value || shareMode.value !== 'one_time') return
  shareLoading.value = true
  shareWxacodeBase64.value = ''
  shareTicketId.value = ''
  try {
    const res = await loadCouponClaimTicket(shareTarget.value.id)
    shareWxacodeBase64.value = res?.wxacode_base64 || ''
    shareMpPath.value = res?.mp_path || ''
  } finally {
    shareLoading.value = false
  }
}

// ====== 人工发券 ======
const issueVisible = ref(false)
const currentCoupon = ref(null)
const userSearchLoading = ref(false)
const userSearchOptions = ref([])
const issueForm = reactive({ mode: 'search', userIdsText: '', roleLevels: [], selectedUsers: [] })
let userSearchSeq = 0

const searchUsers = async (query) => {
  if (!query) {
    userSearchSeq += 1
    userSearchOptions.value = []
    return
  }
  const seq = ++userSearchSeq
  userSearchLoading.value = true
  try {
    const res = await searchUsersLite({ keyword: query, limit: 20 })
    if (seq !== userSearchSeq) return
    userSearchOptions.value = (res?.list || []).map(u => ({
      id: u.id || u._id,
      nickname: u.nickname || u.nickName || u.name || '未知',
      phone: (u.phone || u.mobile || '').replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
      member_no: u.member_no || ''
    }))
  } catch {
    if (seq === userSearchSeq) userSearchOptions.value = []
  } finally {
    if (seq === userSearchSeq) userSearchLoading.value = false
  }
}

// 发券确认弹窗状态
const issueConfirmVisible = ref(false)
const issuePreviewUsers = ref([])
const issuePreviewCount = ref(0)
const issuePreviewTruncated = ref(false)
const issuePreviewLoading = ref(false)
const issueConfirming = ref(false)
let pendingIssuePayload = null

const handleIssue = (row) => {
  currentCoupon.value = row
  issueForm.mode = 'search'
  issueForm.userIdsText = ''
  issueForm.roleLevels = []
  issueForm.selectedUsers = []
  userSearchOptions.value = []
  issueVisible.value = true
}

const buildIssuePayload = () => {
  const payload = {}
  if (issueForm.mode === 'search') {
    const ids = issueForm.selectedUsers.map(u => u.id).filter(Boolean)
    if (ids.length > 0) payload.user_ids = ids
  } else if (issueForm.mode === 'ids' || issueForm.mode === 'both') {
    const ids = issueForm.userIdsText.split(',')
      .map(id => id.trim()).filter(Boolean).map(Number).filter(n => !isNaN(n) && n > 0)
    if (ids.length > 0) payload.user_ids = ids
  }
  if (issueForm.mode === 'level' || issueForm.mode === 'both') {
    payload.role_levels = issueForm.roleLevels
  }
  return payload
}

// 点击"确认发放"：先查目标名单，弹出二次确认
const submitIssue = async () => {
  const payload = buildIssuePayload()

  if (issueForm.mode === 'search') {
    if ((payload.user_ids || []).length === 0) return ElMessage.warning('请先搜索并选择用户')
  } else if (issueForm.mode === 'ids') {
    if ((payload.user_ids || []).length === 0) return ElMessage.warning('请输入有效的用户ID')
  } else if (issueForm.mode === 'level') {
    if (!payload.role_levels || payload.role_levels.length === 0) return ElMessage.warning('请至少选择一个用户等级')
  } else if (issueForm.mode === 'both') {
    const hasIds = (payload.user_ids || []).length > 0
    const hasLevels = (payload.role_levels || []).length > 0
    if (!hasIds && !hasLevels) return ElMessage.warning('请填写用户ID或选择用户等级')
  }

  issuePreviewLoading.value = true
  issueConfirmVisible.value = true
  issuePreviewUsers.value = []
  issuePreviewCount.value = 0
  pendingIssuePayload = payload

  try {
    const res = await previewCouponIssue(currentCoupon.value.id, payload)
    issuePreviewUsers.value = res?.preview || []
    issuePreviewCount.value = res?.count ?? 0
    issuePreviewTruncated.value = !!res?.truncated
  } catch (e) {
    issueConfirmVisible.value = false
    ElMessage.error('查询目标用户失败，请重试')
  } finally {
    issuePreviewLoading.value = false
  }
}

// 确认名单后实际执行发放
const doIssue = async () => {
  if (!pendingIssuePayload) return
  issueConfirming.value = true
  try {
    const result = await issueCoupon(currentCoupon.value.id, pendingIssuePayload)
    ElMessage.success(result?.message || '发放成功')
    issueConfirmVisible.value = false
    issueVisible.value = false
    fetchData()
  } catch (e) {
    // error handled by interceptor
  } finally {
    issueConfirming.value = false
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
.id-cell { font-family: ui-monospace, monospace; font-size: 12px; color: #606266; cursor: default; }
</style>
