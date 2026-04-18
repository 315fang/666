<template>
  <el-card class="search-card">
    <el-form :inline="true" :model="searchForm">
      <el-form-item label="用户ID">
        <el-input v-model="searchForm.member_no" placeholder="8位用户ID" clearable style="width:160px" />
      </el-form-item>
      <el-form-item label="关键词">
        <el-input v-model="searchForm.keyword" placeholder="昵称 / 手机号 / 用户ID" clearable style="width:200px" />
      </el-form-item>
      <el-form-item label="角色">
        <el-select v-model="searchForm.role_level" placeholder="全部" clearable style="width:120px">
          <el-option label="VIP用户" :value="0" />
          <el-option label="初级会员" :value="1" />
          <el-option label="高级会员" :value="2" />
          <el-option label="推广合伙人" :value="3" />
          <el-option label="运营合伙人" :value="4" />
          <el-option label="区域合伙人" :value="5" />
          <el-option label="线下实体门店" :value="6" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="searchForm.status" placeholder="全部" clearable style="width:100px">
          <el-option label="正常" :value="1" />
          <el-option label="已封禁" :value="0" />
        </el-select>
      </el-form-item>
      <el-form-item label="团队负责人">
        <el-select
          v-model="searchForm.team_leader_id"
          class="team-leader-select"
          filterable
          remote
          clearable
          reserve-keyword
          placeholder="搜昵称/手机/用户ID"
          :remote-method="remoteSearchLeaders"
          :loading="leaderSearchLoading"
          style="width:240px"
        >
          <el-option
            v-for="user in leaderOptions"
            :key="user.id"
            :label="`${displayUserName(user)} (#${user.id})`"
            :value="user.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button :disabled="!searchForm.team_leader_id" @click="onOpenTeamSummary">团队概况</el-button>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="onSearch">搜索</el-button>
        <el-button @click="onReset">重置</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup>
import { getUserNickname } from '@/utils/userDisplay'

defineProps({
  searchForm: {
    type: Object,
    required: true
  },
  leaderSearchLoading: {
    type: Boolean,
    default: false
  },
  leaderOptions: {
    type: Array,
    required: true
  },
  remoteSearchLeaders: {
    type: Function,
    required: true
  },
  onOpenTeamSummary: {
    type: Function,
    required: true
  },
  onSearch: {
    type: Function,
    required: true
  },
  onReset: {
    type: Function,
    required: true
  }
})

const displayUserName = (user, fallback = '-') => getUserNickname(user || {}, fallback)
</script>
