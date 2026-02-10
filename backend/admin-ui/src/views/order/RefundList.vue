<template>
  <div>
    <!-- Filters -->
    <div style="margin-bottom: 20px;">
        <el-select v-model="query.status" placeholder="售后状态" clearable style="width: 150px; margin-right: 10px;">
            <el-option label="待处理" value="pending" />
            <el-option label="已同意" value="approved" />
            <el-option label="已拒绝" value="rejected" />
            <el-option label="已完成" value="completed" />
        </el-select>
        <el-button type="primary" @click="handleSearch">搜索</el-button>
    </div>

    <!-- Table -->
    <el-table :data="list" border v-loading="loading">
        <el-table-column prop="order.order_no" label="关联订单" width="180" />
        <el-table-column prop="reason" label="退款原因" />
        <el-table-column prop="amount" label="退款金额" width="120" />
        <el-table-column prop="status" label="状态" width="100">
             <template #default="{ row }">
                 <el-tag :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag>
             </template>
        </el-table-column>
        <el-table-column prop="created_at" label="申请时间" width="180">
            <template #default="{ row }">
                {{ new Date(row.createdAt).toLocaleString() }}
            </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
             <template #default="{ row }">
                 <template v-if="row.status === 'pending'">
                     <el-button type="success" size="small" @click="handleApprove(row)">同意</el-button>
                     <el-button type="danger" size="small" @click="handleReject(row)">拒绝</el-button>
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
import { getRefunds, approveRefund, rejectRefund } from '@/api/order'
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
    const map = { pending: '待处理', approved: '已同意', rejected: '已拒绝', completed: '已完成' }
    return map[status] || status
}

const getStatusType = (status) => {
    const map = { pending: 'warning', approved: 'success', rejected: 'danger', completed: 'info' }
    return map[status] || ''
}

const loadData = async () => {
    loading.value = true
    try {
        const res = await getRefunds(query)
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
    ElMessageBox.confirm('确认同意退款申请吗？', '提示', {
        type: 'warning'
    }).then(async () => {
        try {
            await approveRefund(row.id)
            ElMessage.success('操作成功')
            loadData()
        } catch (error) {
            console.error(error)
        }
    })
}

const handleReject = (row) => {
    ElMessageBox.prompt('请输入拒绝原因', '拒绝退款', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputValidator: (val) => val ? true : '请输入原因'
    }).then(async ({ value }) => {
        try {
            await rejectRefund(row.id, value)
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
