<template>
  <el-card class="search-card">
    <el-form :inline="true" :model="searchForm">
      <el-form-item label="会员码">
        <el-input v-model="searchForm.member_no" placeholder="8位数字/大写字母" clearable style="width:160px" />
      </el-form-item>
      <el-form-item label="关键词">
        <el-input v-model="searchForm.keyword" placeholder="昵称 / 手机号 / 会员码" clearable style="width:200px" />
      </el-form-item>
      <el-form-item label="角色">
        <el-select v-model="searchForm.role_level" placeholder="全部" clearable style="width:120px">
          <el-option label="普通用户" :value="0" />
          <el-option label="会员" :value="1" />
          <el-option label="团长" :value="2" />
          <el-option label="代理商" :value="3" />
          <el-option label="合伙人" :value="4" />
          <el-option label="区域代理" :value="5" />
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
          placeholder="搜昵称/手机/编号"
          :remote-method="remoteSearchLeaders"
          :loading="leaderSearchLoading"
          style="width:240px"
        >
          <el-option
            v-for="user in leaderOptions"
            :key="user.id"
            :label="`${user.nickname || '-'} (#${user.id})`"
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
</script>
