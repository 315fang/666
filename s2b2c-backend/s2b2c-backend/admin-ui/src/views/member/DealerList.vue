<template>
  <div>
    <!-- Filters -->
    <div style="margin-bottom: 20px;">
       <el-select v-model="query.status" placeholder="审核状态" clearable style="width: 150px; margin-right: 10px;">
            <el-option label="待审核" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="已拒绝" value="rejected" />
       </el-select>
       <el-button type="primary" @click="handleSearch">搜索</el-button>
    </div>

    <!-- Table -->
    <el-table :data="list" border v-loading="loading">
       <el-table-column prop="company_name" label="公司名称" />
       <el-table-column prop="contact_name" label="联系人" width="120" />
       <el-table-column prop="contact_phone" label="联系电话" width="120" />
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
       <el-table-column label="操作">
           <template #default="{ row }">
               <template v-if="row.status === 'pending'">
                   <el-button type="success" size="small" @click="handleApprove(row)">通过</el-button>
                   <el-button type="danger" size="small" @click="handleReject(row)">拒绝</el-button>
               </template>
               <el-button v-else link type="primary">详情</el-button>
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
import { getDealers, approveDealer, rejectDealer } from '@/api/dealer'
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
    const map = { pending: '待审核', approved: '已通过', rejected: '已拒绝' }
    return map[status] || status
}

const getStatusType = (status) => {
    const map = { pending: 'warning', approved: 'success', rejected: 'danger' }
    return map[status] || ''
}

const loadData = async () => {
    loading.value = true
    try {
        const res = await getDealers(query)
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
    ElMessageBox.confirm('确认通过该经销商申请吗？', '提示', {
        type: 'success'
    }).then(async () => {
        try {
            await approveDealer(row.id)
            ElMessage.success('操作成功')
            loadData()
        } catch (error) {
            console.error(error)
        }
    })
}

const handleReject = (row) => {
    ElMessageBox.confirm('确认拒绝该经销商申请吗？', '提示', {
        type: 'warning'
    }).then(async () => {
        try {
            await rejectDealer(row.id)
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
