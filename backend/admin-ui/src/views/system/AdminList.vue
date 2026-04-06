<template>
  <div class="admin-list-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>管理员管理</span>
          <el-button type="primary">添加管理员</el-button>
        </div>
      </template>
      
      <el-table :data="tableData" style="width: 100%">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="username" label="用户名" />
        <el-table-column prop="name" label="姓名" />
        <el-table-column prop="role" label="角色">
            <template #default="scope">
                <el-tag>{{ scope.row.role }}</el-tag>
            </template>
        </el-table-column>
        <el-table-column prop="last_login_at" label="最后登录时间" />
        <el-table-column prop="status" label="状态">
             <template #default="scope">
                <el-tag :type="scope.row.status === 1 ? 'success' : 'danger'">
                    {{ scope.row.status === 1 ? '启用' : '禁用' }}
                </el-tag>
            </template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="scope">
            <el-button link type="primary" size="small">编辑</el-button>
            <el-button link type="danger" size="small">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const tableData = ref([
    { id: 1, username: 'admin', name: '超级管理员', role: 'super_admin', status: 1, last_login_at: '2026-02-09 12:00:00' }
])

// TODO: Integrate with adminAccountController API
</script>
