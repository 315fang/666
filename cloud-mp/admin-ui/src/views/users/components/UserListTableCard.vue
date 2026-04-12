<template>
  <el-card style="margin-top:16px">
    <template #header>
      <div class="card-header">
        <span>用户列表</span>
        <div class="header-actions">
          <template v-if="selectedIds.length > 0">
            <template v-if="canManageUserRole">
              <el-select v-model="batchRoleModel" placeholder="批量设置角色" size="small" style="width:130px">
                <el-option label="普通用户" :value="0" />
                <el-option label="会员" :value="1" />
                <el-option label="团长" :value="2" />
                <el-option label="代理商" :value="3" />
                <el-option label="合伙人" :value="4" />
                <el-option label="区域代理" :value="5" />
              </el-select>
              <el-button size="small" type="primary" :disabled="batchRole === null" @click="onBatchRole">
                批量升级 ({{ selectedIds.length }})
              </el-button>
              <el-divider direction="vertical" />
            </template>
          </template>
          <el-button size="small" @click="onRefresh">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </div>
    </template>

    <el-table :data="tableData" v-loading="loading" stripe @selection-change="onSelectionChange">
      <el-table-column type="selection" width="45" />
      <el-table-column label="头像/昵称" min-width="160">
        <template #default="{ row }">
          <div class="cell-info">
            <el-avatar :src="displayUserAvatar(row)" :size="32" />
            <div>
              <div class="cell-info__title">{{ displayUserName(row) }}</div>
              <div class="member-no">{{ row.member_no || '未生成' }}</div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="phone" label="手机号" width="120">
        <template #default="{ row }">{{ row.phone || '-' }}</template>
      </el-table-column>
      <el-table-column label="角色" width="90">
        <template #default="{ row }">
          <el-tag :type="roleTagType(row.role_level)" size="small">{{ roleText(row.role_level) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="拿货等级" width="120" class-name="hide-mobile">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ purchaseLevelText(row.purchase_level_code) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="余额" width="100">
        <template #default="{ row }">
          <span class="text-price">¥{{ Number(row.balance || 0).toFixed(2) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="累计消费" width="110" class-name="hide-mobile">
        <template #default="{ row }">
          <span>¥{{ Number(row.total_sales || 0).toFixed(0) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="直推/成长值" width="100" class-name="hide-mobile">
        <template #default="{ row }">
          <div>推 {{ row.referee_count || 0 }} 人</div>
          <div class="sub-text">{{ Number(row.growth_value || 0).toFixed(0) }}成长值</div>
        </template>
      </el-table-column>
      <el-table-column label="邀请码" width="90" class-name="hide-mobile">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ row.invite_code || row.member_no || '-' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 0 ? 'danger' : 'success'" size="small">
            {{ row.status === 0 ? '封禁' : '正常' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="注册时间" width="105" class-name="hide-mobile">
        <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="230" fixed="right">
        <template #default="{ row }">
          <el-button text type="primary" size="small" @click="onOpenDetail(row)">详情</el-button>
          <el-button v-if="canAdjustUserBalance" text type="warning" size="small" @click="onDropdown('account_adjust', row)">调账</el-button>
          <el-button v-if="canManageUserRole" text size="small" @click="onOpenRoleEdit(row)">升级</el-button>
          <el-button v-if="canManageUserRole" text size="small" @click="onOpenPurchaseLevel(row)">拿货等级</el-button>
          <el-dropdown size="small" @command="(cmd) => onDropdown(cmd, row)">
            <el-button text size="small">更多<el-icon><ArrowDown /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="invite">修改历史邀请码</el-dropdown-item>
                <el-dropdown-item command="member_no">修改会员码</el-dropdown-item>
                <el-dropdown-item command="remark">备注/标签</el-dropdown-item>
                <el-dropdown-item v-if="canManageUserParent" command="parent">修改上级</el-dropdown-item>
                <el-dropdown-item
                  v-if="canManageUserStatus"
                  :command="row.status === 1 ? 'ban' : 'unban'"
                  :class="row.status === 1 ? 'danger-item' : ''"
                  divided
                >
                  {{ row.status === 1 ? '封禁账号' : '解封账号' }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="pagination.page"
      v-model:page-size="pagination.limit"
      :total="pagination.total"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      class="pagination-bar"
      @size-change="onRefresh"
      @current-change="onRefresh"
    />
  </el-card>
</template>

<script setup>
import { computed } from 'vue'
import { Refresh, ArrowDown } from '@element-plus/icons-vue'
import { getUserAvatar, getUserNickname } from '@/utils/userDisplay'

const props = defineProps({
  tableData: {
    type: Array,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  },
  selectedIds: {
    type: Array,
    required: true
  },
  batchRole: {
    type: [Number, null],
    default: null
  },
  pagination: {
    type: Object,
    required: true
  },
  canAdjustUserBalance: {
    type: Boolean,
    default: false
  },
  canManageUserRole: {
    type: Boolean,
    default: false
  },
  canManageUserParent: {
    type: Boolean,
    default: false
  },
  canManageUserStatus: {
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
  onSelectionChange: {
    type: Function,
    required: true
  },
  onBatchRoleChange: {
    type: Function,
    required: true
  },
  onBatchRole: {
    type: Function,
    required: true
  },
  onRefresh: {
    type: Function,
    required: true
  },
  onOpenDetail: {
    type: Function,
    required: true
  },
  onOpenBalance: {
    type: Function,
    required: true
  },
  onOpenRoleEdit: {
    type: Function,
    required: true
  },
  onOpenPurchaseLevel: {
    type: Function,
    required: true
  },
  onDropdown: {
    type: Function,
    required: true
  }
})

const batchRoleModel = computed({
  get: () => props.batchRole,
  set: (value) => props.onBatchRoleChange(value)
})

const displayUserName = (user, fallback = '-') => getUserNickname(user || {}, fallback)
const displayUserAvatar = (user) => getUserAvatar(user || {})
</script>
