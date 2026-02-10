<template>
  <div>
    <!-- Filters -->
    <div style="margin-bottom: 20px;">
       <el-select v-model="query.status" placeholder="状态" clearable style="width: 150px; margin-right: 10px;">
            <el-option label="待审核" value="pending" />
            <el-option label="已通过/待打款" value="approved" />
            <el-option label="已拒绝" value="rejected" />
            <el-option label="已打款" value="completed" />
       </el-select>
       <el-button type="primary" @click="handleSearch">搜索</el-button>
    </div>

    <!-- Table -->
    <el-table :data="list" border v-loading="loading">
       <el-table-column prop="user.nickname" label="申请人" />
       <el-table-column prop="amount" label="提现金额" width="120">
           <template #default="{ row }">¥{{ Number(row.amount).toFixed(2) }}</template>
       </el-table-column>
       <el-table-column prop="method" label="方式" width="100" />
       <el-table-column prop="account_info" label="账户信息" />
       <el-table-column prop="status" label="状态" width="120">
           <template #default="{ row }">
               <el-tag :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag>
           </template>
       </el-table-column>
       <el-table-column prop="created_at" label="申请时间" width="180">
            <template #default="{ row }">
                {{ new Date(row.createdAt).toLocaleString() }}
            </template>
       </el-table-column>
       <el-table-column label="操作" width="250">
           <template #default="{ row }">
               <template v-if="row.status === 'pending'">
                   <el-button type="success" size="small" @click="handleApprove(row)">通过</el-button>
                   <el-button type="danger" size="small" @click="handleReject(row)">拒绝</el-button>
               </template>
               <template v-else-if="row.status === 'approved'">
                   <el-button type="primary" size="small" @click="handleComplete(row)">确认打款</el-button>
               </template>
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
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getWithdrawals, approveWithdrawal, rejectWithdrawal, completeWithdrawal } from '@/api/finance'
import { ElMessage, ElMessageBox } from 'element-plus'

const list = ref([])
const total = ref(0)
const loading = ref(false)

const query = reactive({
    page: 1,
    limit: 10,
    status: ''
})

const getStatusText = (status) => {
    const map = { pending: '待审核', approved: '待打款', rejected: '已拒绝', completed: '已完成' }
    return map[status] || status
}

const getStatusType = (status) => {
    const map = { pending: 'warning', approved: 'primary', rejected: 'danger', completed: 'success' }
    return map[status] || ''
}

const loadData = async () => {
    loading.value = true
    try {
        const res = await getWithdrawals(query)
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

const handleApprove = (row) => {
    ElMessageBox.confirm('确认通过提现申请？', '提示', { type: 'success' })
    .then(async () => {
        try {
            await approveWithdrawal(row.id)
            ElMessage.success('操作成功')
            loadData()
        } catch (error) {
            console.error(error)
        }
    })
}

const handleReject = (row) => {
    ElMessageBox.prompt('请输入拒绝原因', '拒绝提现', {
        inputValidator: (val) => val ? true : '必填'
    }).then(async ({ value }) => {
        try {
            await rejectWithdrawal(row.id, value)
            ElMessage.success('操作成功')
            loadData()
        } catch (error) {
            console.error(error)
        }
    })
}

const handleComplete = (row) => {
    ElMessageBox.confirm('确认已打款？', '提示', { type: 'success' })
    .then(async () => {
        try {
            await completeWithdrawal(row.id)
            ElMessage.success('操作成功')
            loadData()
        } catch (error) {
            console.error(error)
        }
    })
}

onMounted(() => {
    loadData()
})
</script>
