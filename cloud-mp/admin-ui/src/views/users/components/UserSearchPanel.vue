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
      <el-form-item>
        <el-checkbox v-model="searchForm.include_hidden">含隐藏账号</el-checkbox>
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
          @change="onTeamLeaderChange"
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
        <el-button type="primary" @click="onSearch">搜索</el-button>
        <el-button @click="onReset">重置</el-button>
      </el-form-item>
    </el-form>
    <div v-if="searchForm.team_leader_id" class="team-level-bar">
      <div class="team-level-bar__copy">
        <div class="team-level-bar__title">团队结构</div>
        <div class="team-level-bar__hint">按小程序口径查看该负责人的一级直推和二级扩散成员</div>
      </div>
      <el-radio-group
        v-model="searchForm.team_level"
        class="team-level-switch"
        @change="onTeamLevelChange"
      >
        <el-radio-button label="1">
          一级团队<span class="team-level-count">{{ formatLevelCount(1) }}</span>
        </el-radio-button>
        <el-radio-button label="2">
          二级团队<span class="team-level-count">{{ formatLevelCount(2) }}</span>
        </el-radio-button>
      </el-radio-group>
    </div>
  </el-card>
</template>

<script setup>
import { getUserNickname } from '@/utils/userDisplay'

const props = defineProps({
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
  teamLevelStats: {
    type: Object,
    default: () => ({})
  },
  teamLevelStatsLoading: {
    type: Boolean,
    default: false
  },
  onTeamLevelChange: {
    type: Function,
    required: true
  },
  onTeamLeaderChange: {
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
const formatLevelCount = (level) => {
  if (props.teamLevelStatsLoading) return ''
  const count = props.teamLevelStats?.[level]
  return Number.isFinite(Number(count)) ? ` ${Number(count)}人` : ''
}
</script>

<style scoped>
.team-level-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid #d8e1ef;
  border-radius: 8px;
  background: #f7f9fc;
}

.team-level-bar__title {
  color: #1f2d3d;
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
}

.team-level-bar__hint {
  margin-top: 2px;
  color: #7a8699;
  font-size: 12px;
  line-height: 18px;
}

.team-level-switch {
  flex: 0 0 auto;
}

.team-level-count {
  margin-left: 4px;
  color: #607089;
  font-size: 12px;
}

@media (max-width: 900px) {
  .team-level-bar {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
