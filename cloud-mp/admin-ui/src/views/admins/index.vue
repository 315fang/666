<template>
  <div class="admins-page">
    <el-tabs v-model="activeTab" class="top-tabs">

      <!-- ===== Tab 1: 管理员账号 ===== -->
      <el-tab-pane label="管理员账号" name="accounts">
        <el-card>
          <template #header>
            <div class="card-header card-header--wrap">
              <div class="header-left header-left--wrap">
                <el-input v-model="search.keyword" placeholder="搜索用户名/姓名" clearable style="width:200px" @input="fetchAdminsDebounced" />
                <el-select v-model="search.role" placeholder="全部角色" clearable style="width:140px;margin-left:10px" @change="fetchAdmins">
                  <el-option v-for="r in ROLES" :key="r.value" :label="r.label" :value="r.value" />
                </el-select>
              </div>
              <el-button v-if="isSuperAdmin" type="primary" @click="openAdminForm()">
                <el-icon><Plus /></el-icon> 新增管理员
              </el-button>

            </div>
          </template>

          <el-table :data="adminList" v-loading="loading" stripe>
            <el-table-column label="ID" width="90">
              <template #default="{ row }">
                <CompactIdCell :value="row.display_id || row.id" :full-value="row.id" />
              </template>
            </el-table-column>
            <el-table-column label="账号信息" min-width="180">
              <template #default="{ row }">
                <div class="admin-cell">
                  <div class="admin-avatar">{{ (row.name || row.username || '?').charAt(0).toUpperCase() }}</div>
                  <div>
                    <div class="admin-name">{{ row.name || row.username }}</div>
                    <div class="admin-username">@{{ row.username }}</div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="角色" width="130">
              <template #default="{ row }">
                <el-tag :type="roleTag(row.role)" size="small">{{ roleLabel(row.role) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="权限模块" min-width="260" class-name="hide-mobile">
              <template #default="{ row }">
                <template v-if="row.role === 'super_admin'">
                  <el-tag size="small" type="danger" effect="dark">全部权限</el-tag>
                </template>
                <template v-else>
                  <el-tag
                    v-for="p in (getEffectivePermissions(row))" :key="p"
                    size="small" effect="plain" style="margin:2px"
                  >{{ permLabel(p) }}</el-tag>
                </template>
              </template>
            </el-table-column>
            <el-table-column label="联系方式" width="130" class-name="hide-mobile">
              <template #default="{ row }">
                <div v-if="row.phone" class="sub-text">📱 {{ row.phone }}</div>
                <div v-if="row.email" class="sub-text">✉️ {{ row.email }}</div>
                <span v-if="!row.phone && !row.email" class="sub-text">—</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-switch
                  v-model="row.status" :active-value="1" :inactive-value="0"
                  :disabled="!isSuperAdmin || row.role === 'super_admin'"
                  @change="(v) => toggleAdminStatus(row, v)"
                />
              </template>
            </el-table-column>
            <el-table-column label="最后登录" width="145" class-name="hide-mobile">
              <template #default="{ row }">
                <div class="sub-text">{{ fmtDate(row.last_login_at) }}</div>
                <div class="sub-text" v-if="row.last_login_ip">{{ formatClientIp(row.last_login_ip) }}</div>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="190" fixed="right">
              <template #default="{ row }">
                <el-button v-if="canEditAdminRow(row)" text type="primary" size="small" @click="openAdminForm(row)">编辑</el-button>
                <el-button v-if="isSuperAdmin" text type="warning" size="small" @click="resetPwd(row)">改密</el-button>
                <el-popconfirm
                  v-if="isSuperAdmin"
                  :title="`确认删除 「${row.username}」？`"
                  @confirm="deleteAdmin(row)"
                  :disabled="row.role === 'super_admin'"
                >
                  <template #reference>
                    <el-button text type="danger" size="small" :disabled="row.role === 'super_admin'">删除</el-button>
                  </template>
                </el-popconfirm>
              </template>

            </el-table-column>
          </el-table>

          <el-pagination
            v-model:current-page="pagination.page" v-model:page-size="pagination.limit"
            :total="pagination.total" :page-sizes="pagination.pageSizes"
            layout="total, sizes, prev, pager, next"
            @size-change="fetchAdmins" @current-change="fetchAdmins"
            style="margin-top:16px;justify-content:flex-end"
          />
        </el-card>
      </el-tab-pane>

      <!-- ===== Tab 2: 角色权限矩阵 ===== -->
      <el-tab-pane label="角色权限矩阵" name="matrix">
        <el-card>
          <template #header><span>角色与权限配置说明</span></template>
          <el-alert type="info" :closable="false" show-icon
            title="超级管理员拥有所有权限，无法修改。其他角色的权限在「新增/编辑管理员」时可自定义勾选，或选择预设角色后自动填入默认权限。" 
            style="margin-bottom:20px" />

          <el-table :data="roleMatrixData" border max-height="520">
            <el-table-column prop="perm" label="权限模块" width="220" fixed="left" />
            <el-table-column prop="group" label="侧栏分组" width="120" />
            <el-table-column v-for="r in ROLES" :key="r.value" :label="r.label" align="center" width="100">
              <template #default="{ row }">
                <template v-if="r.value === 'super_admin'">
                  <el-icon color="#f56c6c"><CircleCheck /></el-icon>
                </template>
                <template v-else>
                  <el-icon v-if="defaultRolePerms[r.value]?.includes(row.key)" color="#67c23a"><CircleCheck /></el-icon>
                  <el-icon v-else color="#ddd"><Remove /></el-icon>
                </template>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- 会员等级配置已拆分到独立页面 /membership -->

    </el-tabs>

    <!-- ======= 新增/编辑管理员对话框 ======= -->
    <el-dialog v-model="adminFormVisible" :title="adminForm.id ? '编辑管理员' : '新增管理员'" width="min(820px, 96vw)" top="4vh" @close="resetAdminForm">
      <el-form ref="adminFormRef" :model="adminForm" :rules="adminRules" label-width="90px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="用户名" prop="username">
              <el-input v-model="adminForm.username" :disabled="!!adminForm.id" placeholder="登录用户名（不可更改）" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="显示名称" prop="name">
              <el-input v-model="adminForm.name" placeholder="姓名/昵称" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="密码" prop="password" v-if="!adminForm.id">
          <el-input v-model="adminForm.password" type="password" show-password placeholder="至少6位" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="手机号" prop="phone">
              <el-input v-model="adminForm.phone" placeholder="联系手机" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="邮箱" prop="email">
              <el-input v-model="adminForm.email" placeholder="联系邮箱" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="预设角色" prop="role">
          <el-select v-model="adminForm.role" style="width:100%" :disabled="!isSuperAdmin" @change="onRoleChange">
            <el-option v-for="r in editableRoleOptions" :key="r.value" :label="r.label" :value="r.value">

              <span>{{ r.label }}</span>
              <span style="color:#999;font-size:12px;margin-left:8px">{{ r.desc }}</span>
            </el-option>
          </el-select>
          <div class="form-tip">选择预设角色后会自动勾选该角色的默认权限，也可手动调整</div>
        </el-form-item>
        <el-form-item label="菜单权限">
          <div class="perm-menu-tip">按左侧导航分组，与可访问菜单一致；勾选父组内多项即组合权限。</div>
          <div class="perm-menu-groups">
            <div v-for="grp in permissionGroups" :key="grp.name" class="perm-menu-group">
              <div class="perm-menu-group-title">{{ grp.name }}</div>
              <el-checkbox-group v-model="adminForm.permissions" class="perm-menu-checkboxes">
                <el-checkbox
                  v-for="item in grp.items"
                  :key="item.key"
                  :label="item.key"
                  border
                  size="small"
                >
                  {{ item.label }}
                </el-checkbox>
              </el-checkbox-group>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="状态" v-if="adminForm.id && isSuperAdmin">

          <el-radio-group v-model="adminForm.status">
            <el-radio :label="1">启用</el-radio>
            <el-radio :label="0">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adminFormVisible = false">取消</el-button>
        <el-button type="primary" @click="submitAdminForm" :loading="submitting">
          {{ adminForm.id ? '保存修改' : '创建账号' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, CircleCheck, Remove } from '@element-plus/icons-vue'
import CompactIdCell from '@/components/CompactIdCell.vue'
import { getAdmins, createAdmin, updateAdmin, resetAdminPassword, deleteAdmin as deleteAdminApi } from '@/api'
import { formatDateShort as fmtDate, formatClientIp } from '@/utils/format'
import { usePagination } from '@/composables/usePagination'
import { useUserStore } from '@/store/user'
import { buildMenuPermissionGroups, flattenPermissionDefs } from '@/config/adminMenuPermissionGroups'
import { ADMIN_ROLE_PRESETS, getDefaultRolePermissions } from '@/config/adminRolePresets'

function debounce(fn, delay) {
  let timer = null
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

// ===== 常量 =====
const ROLES = [
  { value: 'super_admin', label: '超级管理员', desc: '全部权限', tag: 'danger' },
  { value: 'admin',       label: '管理员',     desc: '商品+订单+用户+内容+分销', tag: 'primary' },
  { value: 'operator',    label: '运营',        desc: '商品+订单+内容+群发', tag: 'success' },
  { value: 'finance',     label: '财务',        desc: '订单+提现+佣金', tag: 'warning' },
  { value: 'customer_service', label: '客服',   desc: '订单+售后+用户+群发', tag: 'info' },
  { value: 'warehouse',   label: '库房',        desc: '订单+物流（无看板）', tag: 'info' },
  { value: 'designer',    label: '美工',        desc: '图文+素材', tag: 'success' },
  { value: 'channel_manager', label: '渠道经理', desc: '用户+经销商+B1邀约+日志', tag: 'warning' },
  { value: 'marketing_director', label: '市场总监', desc: '全局只读（不可修改）', tag: 'info' },
]

const userStore = useUserStore()

/** 与 router 一致的全部分组（矩阵用） */
const menuGroupsBase = computed(() => buildMenuPermissionGroups())

/** 非超管编辑时不展示 super_admin 权限项（避免误授） */
const permissionGroups = computed(() => {
  const groups = Array.isArray(menuGroupsBase.value)
    ? menuGroupsBase.value
        .filter((group) => group && typeof group === 'object')
        .map((group) => ({
          ...group,
          items: Array.isArray(group.items) ? group.items : []
        }))
    : []
  if (userStore.isSuperAdmin) return groups
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => i?.key !== 'super_admin')
    }))
    .filter((g) => g.items.length > 0)
})

const allPermissionDefs = computed(() => flattenPermissionDefs(menuGroupsBase.value))

const defaultRolePerms = ADMIN_ROLE_PRESETS
const currentAdminId = computed(() => userStore.userInfo?.id ?? '')
const isSuperAdmin = computed(() => userStore.isSuperAdmin)
const editableRoleOptions = computed(() => ROLES.filter((role) => isSuperAdmin.value || role.value !== 'super_admin'))
const assignablePermissionSet = computed(() => new Set(
  permissionGroups.value.flatMap((group) => (Array.isArray(group.items) ? group.items : []).map((item) => item.key))
))
const canEditAdminRow = (row) => isSuperAdmin.value || String(row?.id ?? '') === String(currentAdminId.value)

// ===== 列表 =====
const activeTab = ref('accounts')
const loading = ref(false)
const adminList = ref([])
const { pagination, resetPage, applyResponse } = usePagination()
const search = reactive({ keyword: '', role: '' })

const fetchAdmins = async () => {
  loading.value = true
  try {
    const res = await getAdmins({ page: pagination.page, limit: pagination.limit, keyword: search.keyword || undefined, role: search.role || undefined })
    adminList.value = res?.list || []
    applyResponse(res)
  } catch (e) {
    console.error(e)
    ElMessage.error(e?.message || '加载管理员列表失败')
  }
  finally { loading.value = false }
}

const fetchAdminsDebounced = debounce(fetchAdmins, 300)

const toggleAdminStatus = async (row, val) => {
  if (!isSuperAdmin.value || row?.role === 'super_admin') {
    row.status = val === 1 ? 0 : 1
    ElMessage.error('只有超级管理员可以调整管理员状态')
    return
  }
  try {
    await updateAdmin(row.id, { status: val })
    ElMessage.success(val === 1 ? '已启用' : '已禁用')
  } catch (e) {
    row.status = val === 1 ? 0 : 1
    ElMessage.error(e?.message || '更新管理员状态失败')
  }
}

const deleteAdmin = async (row) => {
  if (!isSuperAdmin.value) {
    ElMessage.error('只有超级管理员可以删除管理员')
    return
  }
  try {
    await deleteAdminApi(row.id)
    ElMessage.success('删除成功')
    fetchAdmins()
  } catch (e) {
    ElMessage.error(e?.message || '删除管理员失败')
  }
}

const resetPwd = async (row) => {
  if (!isSuperAdmin.value) {
    ElMessage.error('只有超级管理员可以重置其他管理员密码')
    return
  }
  try {
    const { value: pwd } = await ElMessageBox.prompt(`重置 「${row.username}」 的密码`, '重置密码', {
      confirmButtonText: '确认', cancelButtonText: '取消',
      inputPlaceholder: '新密码（至少6位）',
      inputValidator: v => v && v.length >= 6 ? true : '密码至少6位',
      type: 'warning'
    })
    await resetAdminPassword(row.id, { new_password: pwd })
    ElMessage.success('密码已重置')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.message || '重置密码失败')
  }
}

// ===== 表单 =====
const adminFormVisible = ref(false)
const adminFormRef = ref()
const submitting = ref(false)
const adminForm = reactive({
  id: null, username: '', password: '', name: '', phone: '', email: '',
  role: 'operator', permissions: [], status: 1
})
const adminRules = {
  username: [{ required: true, message: '请输入用户名' }, { min: 3, message: '至少3个字符' }],
  password: [{ required: true, message: '请输入密码' }, { min: 6, message: '至少6位' }],
  role: [{ required: true, message: '请选择角色' }]
}

const openAdminForm = (row) => {
  if (!row && !isSuperAdmin.value) {
    ElMessage.error('只有超级管理员可以新增管理员')
    return
  }
  if (row && !canEditAdminRow(row)) {
    ElMessage.error('只能编辑自己的基础资料')
    return
  }
  if (row) {
    let perms = Array.isArray(row.permissions) ? [...row.permissions] : []
    if (!isSuperAdmin.value) perms = perms.filter((p) => p !== 'super_admin')
    Object.assign(adminForm, {
      id: row.id, username: row.username, password: '', name: row.name || '',
      phone: row.phone || '', email: row.email || '',
      role: row.role, permissions: perms,
      status: row.status
    })
  } else {
    Object.assign(adminForm, {
      id: null, username: '', password: '', name: '', phone: '', email: '',
      role: 'operator', permissions: [...getDefaultRolePermissions('operator')], status: 1
    })
  }
  adminFormVisible.value = true
}

const onRoleChange = (role) => {
  if (defaultRolePerms[role]) {
    adminForm.permissions = [...getDefaultRolePermissions(role)]
  }
}

const submitAdminForm = async () => {
  await adminFormRef.value?.validate(async (valid) => {
    if (!valid) return
    if (!adminForm.id && !isSuperAdmin.value) {
      ElMessage.error('只有超级管理员可以创建管理员账号')
      return
    }
    if (adminForm.id && !isSuperAdmin.value && String(adminForm.id) !== String(currentAdminId.value)) {
      ElMessage.error('只能编辑自己的基础资料')
      return
    }
    submitting.value = true
    try {
      let permissions = [...adminForm.permissions]
      if (!isSuperAdmin.value) permissions = permissions.filter((p) => assignablePermissionSet.value.has(p))
      if (adminForm.id) {
        const payload = isSuperAdmin.value
          ? {
              name: adminForm.name,
              role: adminForm.role,
              phone: adminForm.phone,
              email: adminForm.email,
              permissions,
              status: adminForm.status
            }
          : {
              name: adminForm.name,
              phone: adminForm.phone,
              email: adminForm.email
            }
        await updateAdmin(adminForm.id, payload)
        ElMessage.success('更新成功')
      } else {
        await createAdmin({
          username: adminForm.username, password: adminForm.password,
          name: adminForm.name, role: adminForm.role, phone: adminForm.phone,
          email: adminForm.email, permissions
        })
        ElMessage.success('创建成功')
      }

      adminFormVisible.value = false
      fetchAdmins()
    } catch (e) {
      ElMessage.error(e?.message || '保存管理员失败')
    }
    finally { submitting.value = false }
  })
}
const resetAdminForm = () => adminFormRef.value?.resetFields()

// ===== 权限矩阵（行 = 路由/目录推导的权限键） =====
const roleMatrixData = computed(() =>
  allPermissionDefs.value.map((p) => ({ perm: p.name, key: p.key, group: p.group }))
)

// ===== 工具函数 =====
const roleLabel = r => ROLES.find(x=>x.value===r)?.label || r
const roleTag   = r => ROLES.find(x=>x.value===r)?.tag || ''
const permLabel = (k) => allPermissionDefs.value.find((x) => x.key === k)?.name || k
const getEffectivePermissions = row => Array.isArray(row.permissions) && row.permissions.length > 0
  ? row.permissions
  : getDefaultRolePermissions(row.role)

onMounted(() => { fetchAdmins() })
</script>

<style scoped>
.admins-page { padding: 0; }
.top-tabs :deep(.el-tabs__header) { margin-bottom: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.header-left { display: flex; align-items: center; }

.admin-cell { display: flex; align-items: center; gap: 10px; }
.admin-avatar {
  width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff; font-weight: 700; font-size: 16px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.admin-name { font-size: 14px; font-weight: 500; }
.admin-username { font-size: 12px; color: #909399; }
.sub-text { font-size: 12px; color: #909399; line-height: 1.6; }

/* 权限勾选网格 */
.perm-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 6px;
}
.perm-item { margin: 0 !important; }
.form-tip { font-size: 12px; color: #909399; margin-top: 4px; }

@media (max-width: 767px) {
  .card-header--wrap { flex-wrap: wrap; gap: 8px; }
  .header-left--wrap { flex-wrap: wrap; gap: 6px; }
  .header-left--wrap .el-input { width: 100% !important; }
  .header-left--wrap .el-select { width: 100% !important; margin-left: 0 !important; }
}
</style>
