<template>
  <div class="commission-list-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>佣金记录</span>
          <div class="filter-box">
             <el-select v-model="filter.status" placeholder="状态" clearable style="width: 120px; margin-right: 10px">
                <el-option label="冻结中" value="frozen" />
                <el-option label="待审核" value="pending_approval" />
                <el-option label="已发放" value="settled" />
             </el-select>
             <el-button type="primary" @click="fetchData">查询</el-button>
          </div>
        </div>
      </template>
      
      <div class="stats-panel" v-if="stats">
        <el-row :gutter="20">
            <el-col :span="6">
                <el-statistic title="累计已结算" :value="stats.totalSettled" prefix="¥" />
            </el-col>
            <el-col :span="6">
                <el-statistic title="冻结中金额" :value="stats.totalFrozen" prefix="¥" />
            </el-col>
            <el-col :span="6">
                <el-statistic title="待审核金额" :value="stats.totalPendingApproval" prefix="¥" />
            </el-col>
        </el-row>
      </div>

      <el-table :data="tableData" style="width: 100%; margin-top: 20px" v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column label="获佣用户" width="180">
            <template #default="scope">
                <div style="display: flex; align-items: center">
                    <el-avatar :size="30" :src="scope.row.user?.avatar_url" />
                    <span style="margin-left: 10px">{{ scope.row.user?.nickname }}</span>
                </div>
            </template>
        </el-table-column>
        <el-table-column prop="amount" label="金额">
             <template #default="scope">
                <span style="color: #f56c6c">¥{{ scope.row.amount }}</span>
             </template>
        </el-table-column>
        <el-table-column prop="type" label="类型" />
        <el-table-column prop="status" label="状态">
            <template #default="scope">
                <el-tag v-if="scope.row.status === 'settled'" type="success">已结算</el-tag>
                <el-tag v-else-if="scope.row.status === 'frozen'" type="warning">冻结中</el-tag>
                <el-tag v-else type="info">{{ scope.row.status }}</el-tag>
            </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" />
        <el-table-column prop="remark" label="备注" />
      </el-table>

      <div class="pagination-container">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.limit"
          :total="pagination.total"
          layout="total, prev, pager, next"
          @current-change="fetchData"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue'
import request from '@/utils/request'

const loading = ref(false)
const tableData = ref([])
const stats = ref(null)
const filter = reactive({
    status: ''
})
const pagination = reactive({
    page: 1,
    limit: 20,
    total: 0
})

const fetchData = async () => {
    loading.value = true
    try {
        const res = await request.get('/commissions', {
            params: {
                page: pagination.page,
                limit: pagination.limit,
                status: filter.status
            }
        })
        tableData.value = res.list
        pagination.total = res.pagination.total
        stats.value = res.stats
    } catch (error) {
        console.error(error)
    } finally {
        loading.value = false
    }
}

onMounted(() => {
    fetchData()
})
</script>

<style scoped>
.stats-panel {
    background: #f8f9fa;
    padding: 20px;
    margin-bottom: 20px;
    border-radius: 4px;
}
.pagination-container {
    margin-top: 20px;
    display: flex;
    justify-content: flex-end;
}
</style>
