<template>
  <div>
    <!-- Filters -->
    <div style="margin-bottom: 20px; display: flex; gap: 10px; flex-wrap: wrap;">
       <el-input v-model="query.keyword" placeholder="昵称/邀请码/OpenID" style="width: 220px;" clearable />
       <el-select v-model="query.role_level" placeholder="角色筛选" clearable style="width: 140px;">
           <el-option label="普通用户" value="0" />
           <el-option label="会员" value="1" />
           <el-option label="团长" value="2" />
           <el-option label="代理商" value="3" />
       </el-select>
       <el-button type="primary" @click="handleSearch">搜索</el-button>
    </div>

    <!-- Table -->
    <el-table :data="list" border v-loading="loading" stripe>
       <el-table-column prop="id" label="ID" width="70" />
       <el-table-column label="用户信息" width="220">
           <template #default="{ row }">
               <div style="display: flex; align-items: center;">
                   <el-avatar :src="row.avatar_url" :size="36" style="margin-right: 10px; flex-shrink: 0;" />
                   <div>
                       <div style="font-weight: 500;">{{ row.nickname || '微信用户' }}</div>
                       <div style="font-size: 12px; color: #999;">{{ row.invite_code ? '邀请码: ' + row.invite_code : '' }}</div>
                   </div>
               </div>
           </template>
       </el-table-column>
       <el-table-column prop="role_level" label="角色" width="100">
           <template #default="{ row }">
               <el-tag :type="getRoleType(row.role_level)" size="small">{{ getRoleText(row.role_level) }}</el-tag>
           </template>
       </el-table-column>
       <el-table-column label="余额" width="100">
            <template #default="{ row }">¥{{ Number(row.balance || 0).toFixed(2) }}</template>
       </el-table-column>
       <el-table-column label="库存" width="80">
            <template #default="{ row }">
                <span :style="{ color: row.role_level >= 3 ? '#E6A23C' : '#C0C4CC', fontWeight: row.role_level >= 3 ? '600' : '400' }">
                    {{ row.stock_count || 0 }}
                </span>
            </template>
       </el-table-column>
       <el-table-column label="订单/业绩" width="140">
            <template #default="{ row }">
                <div>订单: {{ row.order_count || 0 }}</div>
                <div style="font-size: 12px; color: #999;">业绩: ¥{{ Number(row.total_sales || 0).toFixed(2) }}</div>
            </template>
       </el-table-column>
       <el-table-column label="上级" width="100">
            <template #default="{ row }">
                <span v-if="row.parent">{{ row.parent.nickname }}</span>
                <span v-else style="color: #ccc;">无</span>
            </template>
       </el-table-column>
       <el-table-column prop="created_at" label="注册时间" width="160">
            <template #default="{ row }">
                {{ new Date(row.created_at || row.createdAt).toLocaleString() }}
            </template>
       </el-table-column>
       <el-table-column label="操作" fixed="right" width="240">
           <template #default="{ row }">
               <el-button link type="primary" size="small" @click="showRoleDialog(row)">调整等级</el-button>
               <el-button link type="warning" size="small" @click="showStockDialog(row)" v-if="row.role_level >= 3">补库存</el-button>
               <el-button link type="info" size="small" @click="showDetailDrawer(row)">详情</el-button>
           </template>
       </el-table-column>
    </el-table>

    <!-- Pagination -->
    <div style="margin-top: 20px; text-align: right;">
        <el-pagination
            background
            layout="total, prev, pager, next"
            :total="total"
            :page-size="query.limit"
            @current-change="handlePageChange"
        />
    </div>

    <!-- Role Dialog -->
    <el-dialog v-model="roleDialogVisible" title="调整分销等级" width="400px">
        <el-form label-width="80px">
            <el-form-item label="用户">
                <span>{{ currentUser?.nickname }} (ID: {{ currentUser?.id }})</span>
            </el-form-item>
            <el-form-item label="当前等级">
                <el-tag :type="getRoleType(currentUser?.role_level)">{{ getRoleText(currentUser?.role_level) }}</el-tag>
            </el-form-item>
            <el-form-item label="调整为">
                <el-select v-model="newRoleLevel">
                    <el-option label="普通用户" :value="0" />
                    <el-option label="会员 (LV1)" :value="1" />
                    <el-option label="团长 (LV2)" :value="2" />
                    <el-option label="代理商 (LV3)" :value="3" />
                </el-select>
            </el-form-item>
        </el-form>
        <template #footer>
            <el-button @click="roleDialogVisible = false">取消</el-button>
            <el-button type="primary" @click="handleUpdateRole">确认</el-button>
        </template>
    </el-dialog>

    <!-- Stock Dialog -->
    <el-dialog v-model="stockDialogVisible" title="代理商库存管理" width="450px">
        <el-form label-width="100px">
            <el-form-item label="代理商">
                <span style="font-weight: 500;">{{ stockUser?.nickname }} (ID: {{ stockUser?.id }})</span>
            </el-form-item>
            <el-form-item label="当前库存">
                <el-tag type="warning" size="large">{{ stockUser?.stock_count || 0 }} 件</el-tag>
            </el-form-item>
            <el-form-item label="操作类型">
                <el-radio-group v-model="stockAction">
                    <el-radio-button label="add">补充库存</el-radio-button>
                    <el-radio-button label="reduce">扣减库存</el-radio-button>
                </el-radio-group>
            </el-form-item>
            <el-form-item label="数量">
                <el-input-number v-model="stockAmount" :min="1" :max="99999" />
            </el-form-item>
            <el-form-item label="备注">
                <el-input v-model="stockReason" placeholder="选填，如：打款补货、退货扣减等" />
            </el-form-item>
        </el-form>
        <template #footer>
            <el-button @click="stockDialogVisible = false">取消</el-button>
            <el-button type="primary" @click="handleUpdateStock">确认{{ stockAction === 'add' ? '补充' : '扣减' }}</el-button>
        </template>
    </el-dialog>

    <!-- User Detail Drawer -->
    <el-drawer v-model="detailDrawerVisible" title="用户详情" size="420px">
        <template v-if="detailUser">
            <div style="text-align: center; margin-bottom: 20px;">
                <el-avatar :src="detailUser.avatar_url" :size="64" />
                <div style="font-size: 18px; font-weight: 600; margin-top: 10px;">{{ detailUser.nickname || '微信用户' }}</div>
                <el-tag :type="getRoleType(detailUser.role_level)" style="margin-top: 6px;">{{ getRoleText(detailUser.role_level) }}</el-tag>
            </div>
            <el-descriptions :column="1" border size="small">
                <el-descriptions-item label="用户ID">{{ detailUser.id }}</el-descriptions-item>
                <el-descriptions-item label="邀请码">{{ detailUser.invite_code || '无' }}</el-descriptions-item>
                <el-descriptions-item label="OpenID">{{ detailUser.openid }}</el-descriptions-item>
                <el-descriptions-item label="余额">¥{{ Number(detailUser.balance || 0).toFixed(2) }}</el-descriptions-item>
                <el-descriptions-item label="云库存">{{ detailUser.stock_count || 0 }} 件</el-descriptions-item>
                <el-descriptions-item label="订单数">{{ detailUser.order_count || 0 }}</el-descriptions-item>
                <el-descriptions-item label="总业绩">¥{{ Number(detailUser.total_sales || 0).toFixed(2) }}</el-descriptions-item>
                <el-descriptions-item label="上级">{{ detailUser.parent?.nickname || '无' }} {{ detailUser.parent_id ? '(ID:' + detailUser.parent_id + ')' : '' }}</el-descriptions-item>
                <el-descriptions-item label="注册时间">{{ new Date(detailUser.created_at || detailUser.createdAt).toLocaleString() }}</el-descriptions-item>
                <el-descriptions-item v-if="detailUser.joined_team_at" label="加入团队时间">{{ new Date(detailUser.joined_team_at).toLocaleString() }}</el-descriptions-item>
            </el-descriptions>
            <div style="margin-top: 20px; display: flex; gap: 8px; flex-wrap: wrap;">
                <el-button type="primary" size="small" @click="showRoleDialog(detailUser)">调整等级</el-button>
                <el-button type="warning" size="small" @click="showStockDialog(detailUser)" v-if="detailUser.role_level >= 3">补充库存</el-button>
            </div>
        </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getUsers, updateUserRole, updateUserStock } from '@/api/user'
import { ElMessage, ElMessageBox } from 'element-plus'

const list = ref([])
const total = ref(0)
const loading = ref(false)

// 角色弹窗
const roleDialogVisible = ref(false)
const currentUser = ref(null)
const newRoleLevel = ref(0)

// 库存弹窗
const stockDialogVisible = ref(false)
const stockUser = ref(null)
const stockAction = ref('add')
const stockAmount = ref(100)
const stockReason = ref('')

// 详情抽屉
const detailDrawerVisible = ref(false)
const detailUser = ref(null)

const query = reactive({
    page: 1,
    limit: 10,
    keyword: '',
    role_level: ''
})

const getRoleText = (level) => {
    const map = { 0: '普通用户', 1: '会员', 2: '团长', 3: '代理商' }
    return map[level] || '未知'
}

const getRoleType = (level) => {
    const map = { 0: 'info', 1: 'success', 2: 'warning', 3: 'danger' }
    return map[level] || ''
}

const loadData = async () => {
    loading.value = true
    try {
        const params = { ...query }
        if (params.role_level === '') delete params.role_level
        const res = await getUsers(params)
        list.value = res.list
        total.value = res.pagination.total
    } catch (error) {
        console.error(error)
    } finally {
        loading.value = false
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

// --- 角色管理 ---
const showRoleDialog = (row) => {
    currentUser.value = row
    newRoleLevel.value = row.role_level
    roleDialogVisible.value = true
}

const handleUpdateRole = async () => {
    try {
        await updateUserRole(currentUser.value.id, newRoleLevel.value)
        ElMessage.success('等级调整成功')
        roleDialogVisible.value = false
        loadData()
    } catch (error) {
        console.error(error)
    }
}

// --- 库存管理 ---
const showStockDialog = (row) => {
    stockUser.value = row
    stockAction.value = 'add'
    stockAmount.value = 100
    stockReason.value = ''
    stockDialogVisible.value = true
}

const handleUpdateStock = async () => {
    const change = stockAction.value === 'add' ? stockAmount.value : -stockAmount.value
    const actionText = stockAction.value === 'add' ? '补充' : '扣减'

    try {
        await ElMessageBox.confirm(
            `确认为 ${stockUser.value.nickname} ${actionText} ${stockAmount.value} 件库存？`,
            '确认操作'
        )
        const res = await updateUserStock(stockUser.value.id, change, stockReason.value)
        ElMessage.success(`${actionText}成功！当前库存: ${res.new_stock} 件`)
        stockDialogVisible.value = false
        loadData()
    } catch (error) {
        if (error !== 'cancel') console.error(error)
    }
}

// --- 用户详情 ---
const showDetailDrawer = (row) => {
    detailUser.value = row
    detailDrawerVisible.value = true
}

onMounted(() => {
    loadData()
})
</script>
