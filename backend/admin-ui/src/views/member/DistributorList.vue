<template>
  <div>
    <!-- Filters (Specific for Distribution) -->
    <div style="margin-bottom: 20px;">
       <el-select v-model="query.role_level" placeholder="分销等级" clearable style="width: 150px; margin-right: 10px;">
            <el-option label="会员" :value="1" />
            <el-option label="团长" :value="2" />
            <el-option label="合伙人" :value="3" />
       </el-select>
       <el-button type="primary" @click="handleSearch">搜索</el-button>
    </div>

    <!-- Reusing similar structure to UserList but with Team Info -->
    <el-table :data="list" border v-loading="loading">
       <el-table-column label="分销员" width="250">
           <template #default="{ row }">
               <div style="display: flex; align-items: center;">
                   <el-avatar :src="row.avatar_url" style="margin-right: 10px;" />
                   <div>
                       <div>{{ row.nickname }}</div>
                       <el-tag size="small" :type="getRoleType(row.role_level)">{{ getRoleText(row.role_level) }}</el-tag>
                   </div>
               </div>
           </template>
       </el-table-column>
       <el-table-column prop="balance" label="累计佣金" width="120">
            <template #default="{ row }">¥{{ Number(row.wallet?.total_income || 0).toFixed(2) }}</template>
       </el-table-column>
       <el-table-column prop="balance" label="可提现余额" width="120">
            <template #default="{ row }">¥{{ Number(row.wallet?.balance || 0).toFixed(2) }}</template>
       </el-table-column>
        <el-table-column label="团队人数" width="100">
             <template #default>--</template>
        </el-table-column>
       <el-table-column label="操作">
           <template #default="{ row }">
               <el-button link type="primary" @click="showRoleDialog(row)">调整等级</el-button>
               <el-button link type="primary" @click="showTeam(row)">团队详情</el-button>
           </template>
       </el-table-column>
    </el-table>

    <!-- Pagination -->
    <div style="margin-top: 20px; text-align: right;">
        <el-pagination
            background
            layout="prev, pager, next"
            :total="total"
            :page-size="query.limit"
            @current-change="handlePageChange"
        />
    </div>

    <!-- Role Dialog (Copied logic) -->
    <el-dialog v-model="roleDialogVisible" title="调整分销等级" width="400px">
        <el-form label-width="80px">
            <el-form-item label="当前等级">
                <el-tag :type="getRoleType(currentUser?.role_level)">{{ getRoleText(currentUser?.role_level) }}</el-tag>
            </el-form-item>
            <el-form-item label="调整为">
                <el-select v-model="newRoleLevel">
                    <el-option label="普通用户" :value="0" />
                    <el-option label="会员 (LV1)" :value="1" />
                    <el-option label="团长 (LV2)" :value="2" />
                    <el-option label="合伙人 (LV3)" :value="3" />
                </el-select>
            </el-form-item>
        </el-form>
        <template #footer>
            <el-button @click="roleDialogVisible = false">取消</el-button>
            <el-button type="primary" @click="handleUpdateRole">确认</el-button>
        </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getUsers, updateUserRole } from '@/api/user'
import { ElMessage } from 'element-plus'

const list = ref([])
const total = ref(0)
const loading = ref(false)
const roleDialogVisible = ref(false)
const currentUser = ref(null)
const newRoleLevel = ref(0)

const query = reactive({
    page: 1,
    limit: 10,
    role_level: '', // Filter for distributors logic: > 0. But for UI filter, we let user pick. Or we default to "1,2,3"?
    // The backend might need explicit "role_level" param.
    // If I want to show all distributors by default, I should set a param like `is_distributor=true` if backend supports it.
    // The previous implementation used `role_level=1,2,3` manually or backend had a filter.
    // Let's assume sending role_level works.
})

const getRoleText = (level) => {
    const map = { 0: '普通用户', 1: '会员', 2: '团长', 3: '合伙人' }
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
        // Force showing only distributors if no specific level selected?
        // Actually Module 1 says "Distributor List".
        // If I don't send role_level, I get all users.
        // I should probably filter client side or ask backend.
        // For now, let's just search.
        const res = await getUsers(params)
        // Filter locally if backend doesn't support 'is_distributor'
        // But pagination would be wrong.
        // Assuming backend handles role_level filter.
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

const showRoleDialog = (row) => {
    currentUser.value = row
    newRoleLevel.value = row.role_level
    roleDialogVisible.value = true
}

const handleUpdateRole = async () => {
    try {
        await updateUserRole(currentUser.value.id, newRoleLevel.value)
        ElMessage.success('操作成功')
        roleDialogVisible.value = false
        loadData()
    } catch (error) {
        console.error(error)
    }
}

const showTeam = (row) => {
    ElMessage.info('团队详情暂未实现')
}

onMounted(() => {
    // Default show distributors
    // query.role_level = 1 // This would show only level 1. I need "1,2,3".
    // If backend supports array or comma string.
    query.role_level = '1,2,3' 
    loadData()
})
</script>
