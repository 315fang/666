<template>
  <el-drawer :model-value="visible" :title="`用户详情 · ${displayUserName(detailUser, '')}`" size="640px" @update:model-value="onVisibilityChange">
    <template v-if="detailUser">
      <el-tabs :model-value="detailTab" @update:model-value="onTabChange">
        <el-tab-pane label="基本信息" name="info">
          <div class="detail-section-title">基础信息</div>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="用户 ID">{{ detailUser.id }}</el-descriptions-item>
            <el-descriptions-item label="会员码">
              <el-tag type="primary">{{ detailUser.member_no || '未生成' }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="昵称">{{ displayUserName(detailUser) }}</el-descriptions-item>
            <el-descriptions-item label="手机号">{{ detailUser.phone || '-' }}</el-descriptions-item>
            <el-descriptions-item label="OpenID" :span="2">
              <span class="mono-ellipsis">{{ detailUser.openid || '-' }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="角色">
              <el-tag :type="roleTagType(detailUser.role_level)">{{ roleText(detailUser.role_level) }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="拿货等级">
              <el-tag type="info">{{ purchaseLevelText(detailUser.purchase_level_code) }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="账号状态">
              <el-tag :type="detailUser.status === 0 ? 'danger' : 'success'">{{ detailUser.status === 0 ? '封禁' : '正常' }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="成长值">{{ Number(detailUser.growth_value || 0).toFixed(0) }}</el-descriptions-item>
            <el-descriptions-item label="折扣比例">{{ ((detailUser.discount_rate || 1) * 10).toFixed(1) }}折</el-descriptions-item>
            <el-descriptions-item label="用户表·订单数">{{ detailUser.order_count || 0 }}</el-descriptions-item>
            <el-descriptions-item label="直推人数">{{ detailUser.referee_count || 0 }}</el-descriptions-item>
            <el-descriptions-item label="标签/分组" :span="2">
              <template v-if="detailTagList.length">
                <el-tag v-for="tag in detailTagList" :key="tag" size="small" style="margin:2px">{{ tag }}</el-tag>
              </template>
              <span v-else class="sub-hint">未设置（可在备注里维护 JSON 标签）</span>
            </el-descriptions-item>
            <el-descriptions-item label="会员码">{{ detailUser.member_no || detailUser.invite_code || '-' }}</el-descriptions-item>
            <el-descriptions-item label="团队中心(C端)">
              <el-switch
                :model-value="Number(detailUser.participate_distribution) === 1"
                :loading="commerceSaving"
                @change="onCommerceToggle"
              />
              <span class="sub-hint" style="margin-left:8px;color:#909399;font-size:12px">关闭后小程序「我的」不展示分销入口</span>
            </el-descriptions-item>
            <el-descriptions-item label="上级推荐人" :span="2">
              <template v-if="detailUser.parent?.id">
                <span>{{ displayUserName(detailUser.parent) }}（ID: {{ detailUser.parent.id }}）</span>
                <el-button type="primary" link size="small" style="margin-left:8px" @click="onOpenParentDetail">查看上级</el-button>
              </template>
              <span v-else>无</span>
            </el-descriptions-item>
            <el-descriptions-item label="云库存（代理）">{{ detailUser.stock_count || 0 }}</el-descriptions-item>
            <el-descriptions-item label="注册时间" :span="2">{{ formatDate(detailUser.created_at) }}</el-descriptions-item>
            <el-descriptions-item label="最后登录" :span="2">{{ formatDate(detailUser.last_login) }}</el-descriptions-item>
            <el-descriptions-item label="内部备注" :span="2">{{ detailUser.remark || '-' }}</el-descriptions-item>
          </el-descriptions>

          <div class="detail-section-title" style="margin-top:20px">钱包与消费</div>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="佣金余额">¥{{ Number(detailUser.balance || 0).toFixed(2) }}</el-descriptions-item>
            <el-descriptions-item label="欠款">¥{{ Number(detailUser.debt_amount || 0).toFixed(2) }}</el-descriptions-item>
            <el-descriptions-item label="累计消费(用户表)">¥{{ Number(detailUser.total_sales || 0).toFixed(2) }}</el-descriptions-item>
            <el-descriptions-item label="客单价(估)">¥{{ detailAvgOrderAmount }}</el-descriptions-item>
            <el-descriptions-item v-if="detailStats" label="订单笔数(库表统计)">
              {{ detailStats.orderCount ?? 0 }}
            </el-descriptions-item>
            <el-descriptions-item v-if="detailStats" label="直推团队人数(一级)">
              {{ detailStats.teamCount ?? 0 }} 人
            </el-descriptions-item>
          </el-descriptions>

          <div v-if="detailStats" style="margin-top:12px">
            <el-statistic title="累计佣金收益(佣金流水合计)" :value="Number(detailStats.totalCommission || 0)" prefix="¥" :precision="2" />
          </div>

          <div class="detail-section-title" style="margin-top:20px">团队（以本人为负责人 · 全体后代）</div>
          <p class="sub-hint" style="margin-bottom:10px">不含本人；含多级下级。可打开弹窗看订单维度，或跳到列表逐人查看。</p>
          <el-row v-if="detailTeamPreview" :gutter="12" class="team-preview-row">
            <el-col :span="12">
              <el-card shadow="never" class="mini-stat-card">
                <div class="mini-stat-label">后代人数</div>
                <div class="mini-stat-value">{{ detailTeamPreview.descendant_count }}</div>
              </el-card>
            </el-col>
            <el-col :span="12">
              <el-card shadow="never" class="mini-stat-card">
                <div class="mini-stat-label">后代累计消费(用户表)</div>
                <div class="mini-stat-value">¥{{ Number(detailTeamPreview.user_total_sales_sum || 0).toFixed(0) }}</div>
              </el-card>
            </el-col>
            <el-col :span="12" style="margin-top:8px">
              <el-card shadow="never" class="mini-stat-card">
                <div class="mini-stat-label">有效订单实付(全量)</div>
                <div class="mini-stat-value">¥{{ Number(detailTeamPreview.order_actual_price_sum || 0).toFixed(0) }}</div>
              </el-card>
            </el-col>
            <el-col :span="12" style="margin-top:8px">
              <el-card shadow="never" class="mini-stat-card">
                <div class="mini-stat-label">已支付实付(全量)</div>
                <div class="mini-stat-value">¥{{ Number(detailTeamPreview.order_paid_actual_sum || 0).toFixed(0) }}</div>
              </el-card>
            </el-col>
          </el-row>
          <div v-else class="sub-hint" style="margin-bottom:10px">团队数据加载中或暂不可用</div>
          <el-space wrap style="margin-top:12px">
            <el-button type="primary" @click="onOpenTeamSummary">团队概况（弹窗）</el-button>
            <el-button @click="onGoTeamMemberList">在列表中查看其整树团队</el-button>
          </el-space>
        </el-tab-pane>

        <el-tab-pane label="直推团队 (下级)" name="team">
          <p class="sub-hint" style="margin-bottom:10px">此处仅一级直推。多层级全体后代请在列表用「团队负责人」筛选或打开「团队概况」。</p>
          <el-table :data="teamData" stripe size="small" v-loading="teamLoading">
            <el-table-column label="昵称">
              <template #default="{ row }">{{ displayUserName(row) }}</template>
            </el-table-column>
            <el-table-column label="角色">
              <template #default="{ row }">
                <el-tag size="small" :type="roleTagType(row.role_level)">{{ roleText(row.role_level) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="加入时间">
              <template #default="{ row }">
                {{ formatDate(row.joined_team_at || row.created_at) }}
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </template>
  </el-drawer>
</template>

<script setup>
import { getUserNickname } from '@/utils/userDisplay'

defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  detailUser: {
    type: Object,
    default: null
  },
  detailTab: {
    type: String,
    default: 'info'
  },
  detailStats: {
    type: Object,
    default: null
  },
  detailTagList: {
    type: Array,
    default: () => []
  },
  detailAvgOrderAmount: {
    type: [String, Number],
    default: '0.00'
  },
  detailTeamPreview: {
    type: Object,
    default: null
  },
  commerceSaving: {
    type: Boolean,
    default: false
  },
  teamData: {
    type: Array,
    default: () => []
  },
  teamLoading: {
    type: Boolean,
    default: false
  },
  roleText: {
    type: Function,
    required: true
  },
  roleTagType: {
    type: Function,
    required: true
  },
  purchaseLevelText: {
    type: Function,
    required: true
  },
  formatDate: {
    type: Function,
    required: true
  },
  onVisibilityChange: {
    type: Function,
    required: true
  },
  onTabChange: {
    type: Function,
    required: true
  },
  onCommerceToggle: {
    type: Function,
    required: true
  },
  onOpenParentDetail: {
    type: Function,
    required: true
  },
  onOpenTeamSummary: {
    type: Function,
    required: true
  },
  onGoTeamMemberList: {
    type: Function,
    required: true
  }
})

const displayUserName = (user, fallback = '-') => getUserNickname(user || {}, fallback)
</script>
