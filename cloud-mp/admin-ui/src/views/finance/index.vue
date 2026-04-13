<template>
  <div class="finance-page">
    <!-- 页头 -->
    <div class="page-header">
      <div class="page-title">
        <el-icon class="title-icon"><Money /></el-icon>
        <span>财务看板</span>
      </div>
      <el-button :loading="loading" @click="fetchAll" :icon="Refresh" size="small">刷新</el-button>
    </div>

    <div v-loading="loading">
      <!-- ===== 区域 1：KPI 卡片 ===== -->
      <div class="kpi-grid">
        <div class="kpi-card blue">
          <div class="kpi-label">平台 GMV（全部）</div>
          <div class="kpi-value">¥{{ fmt(data.gmv) }}</div>
          <div class="kpi-sub">近30天 ¥{{ fmt(data.gmv_30d) }}</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-label">佣金总额</div>
          <div class="kpi-value">¥{{ fmt(data.commissions?.total) }}</div>
          <div class="kpi-sub">已结算 ¥{{ fmt(data.commissions?.settled) }}</div>
        </div>
        <div class="kpi-card orange">
          <div class="kpi-label">冻结中佣金</div>
          <div class="kpi-value">¥{{ fmt(data.commissions?.frozen) }}</div>
          <div class="kpi-sub">待审批 ¥{{ fmt(data.commissions?.pending_approval) }}</div>
        </div>
        <div class="kpi-card red">
          <div class="kpi-label">待提现金额</div>
          <div class="kpi-value">¥{{ fmt(data.withdrawals?.pending_amount) }}</div>
          <div class="kpi-sub">{{ data.withdrawals?.pending_count ?? 0 }} 笔待处理</div>
        </div>
        <div class="kpi-card purple">
          <div class="kpi-label">平台手续费收入</div>
          <div class="kpi-value">¥{{ fmt(data.withdrawals?.total_fee) }}</div>
          <div class="kpi-sub">已完成提现 ¥{{ fmt(data.withdrawals?.completed_amount) }}</div>
        </div>
        <div class="kpi-card teal">
          <div class="kpi-label">代理商货款欠款</div>
          <div class="kpi-value">¥{{ fmt(data.agent_debt?.total_debt) }}</div>
          <div class="kpi-sub">{{ data.agent_debt?.debtor_count ?? 0 }} 位代理商</div>
        </div>
        <div class="kpi-card indigo">
          <div class="kpi-label">基金池</div>
          <div class="kpi-value">
            <el-tag v-if="data.fund_pool?.enabled" type="success" size="small">已启用</el-tag>
            <el-tag v-else type="info" size="small">未启用</el-tag>
          </div>
          <div class="kpi-sub">代理体系基金池配置</div>
        </div>
        <div class="kpi-card pink">
          <div class="kpi-label">上次分红</div>
          <div class="kpi-value">¥{{ fmt(data.dividend?.last_total_distributed) }}</div>
          <div class="kpi-sub">{{ data.dividend?.last_executed_year ? data.dividend.last_executed_year + ' 年度' : '暂无分红记录' }}</div>
        </div>
      </div>

      <!-- ===== 区域 2：佣金 & 提现并排 ===== -->
      <el-row :gutter="16" style="margin-top: 20px">
        <!-- 佣金状态分布 -->
        <el-col :span="12">
          <el-card class="section-card">
            <template #header>
              <div class="card-header">
                <el-icon><Wallet /></el-icon>
                <span>佣金状态分布</span>
                <el-button text type="primary" size="small" @click="$router.push('/commissions')">查看明细</el-button>
              </div>
            </template>
            <el-table :data="commissionRows" size="small" stripe>
              <el-table-column label="状态" width="110">
                <template #default="{ row }">
                  <el-tag :type="row.tagType" size="small">{{ row.label }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="金额（元）" align="right">
                <template #default="{ row }">
                  <span :class="['amount', row.cls]">¥{{ fmt(row.amount) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="占比" width="100" align="right">
                <template #default="{ row }">
                  <span class="pct">{{ row.pct }}%</span>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>

        <!-- 提现待处理 -->
        <el-col :span="12">
          <el-card class="section-card">
            <template #header>
              <div class="card-header">
                <el-icon><CreditCard /></el-icon>
                <span>提现概览</span>
                <el-button text type="primary" size="small" @click="$router.push('/withdrawals')">查看明细</el-button>
              </div>
            </template>
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="待审批金额">
                <span class="amount red">¥{{ fmt(data.withdrawals?.pending_amount) }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="待审批笔数">
                {{ data.withdrawals?.pending_count ?? 0 }} 笔
              </el-descriptions-item>
              <el-descriptions-item label="累计已完成">
                <span class="amount green">¥{{ fmt(data.withdrawals?.completed_amount) }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="累计手续费">
                <span class="amount purple">¥{{ fmt(data.withdrawals?.total_fee) }}</span>
              </el-descriptions-item>
            </el-descriptions>
            <el-alert
              v-if="(data.withdrawals?.pending_count ?? 0) > 0"
              :title="`有 ${data.withdrawals.pending_count} 笔提现申请待审批，请及时处理`"
              type="warning" :closable="false" show-icon style="margin-top: 12px"
            />
          </el-card>
        </el-col>
      </el-row>

      <!-- ===== 区域 3：代理商货款 ===== -->
      <el-card class="section-card" style="margin-top: 16px">
        <template #header>
          <div class="card-header">
            <el-icon><CreditCard /></el-icon>
            <span>代理商货款（欠款明细）</span>
            <el-tag v-if="(data.agent_debt?.debtor_count ?? 0) > 0" type="danger" size="small">
              共 {{ data.agent_debt.debtor_count }} 位代理商有欠款
            </el-tag>
          </div>
        </template>
        <el-empty
          v-if="!data.agent_debt?.debtors?.length"
          description="暂无代理商货款欠款"
          :image-size="60"
        />
        <el-table
          v-else
          :data="data.agent_debt.debtors"
          size="small"
          stripe
          max-height="320"
        >
          <el-table-column prop="user_id" label="用户ID" width="80" />
          <el-table-column label="昵称" min-width="120">
            <template #default="{ row }">
              <el-button
                text type="primary" size="small"
                @click="$router.push(`/users?keyword=${row.member_no || row.user_id}`)"
              >
                {{ row.nickname || '未知用户' }}
              </el-button>
              <el-tag v-if="row.member_no" size="small" type="info" style="margin-left:4px">{{ row.member_no }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="等级" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="roleLevelType(row.role_level)">
                {{ roleLevelLabel(row.role_level) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="欠款金额" width="120" align="right">
            <template #default="{ row }">
              <span class="amount red">¥{{ fmt(row.debt_amount) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="debt_reason" label="欠款原因" min-width="160" show-overflow-tooltip />
        </el-table>
        <div v-if="data.agent_debt?.debtors?.length" class="total-row">
          合计欠款：<strong class="amount red">¥{{ fmt(data.agent_debt.total_debt) }}</strong>
        </div>
      </el-card>

      <!-- ===== 区域 4：基金池 & 分红记录 ===== -->
      <el-row :gutter="16" style="margin-top: 16px">
        <!-- 基金池配置 & 子账户 -->
        <el-col :span="10">
          <el-card class="section-card">
            <template #header>
              <div class="card-header">
                <el-icon><Coin /></el-icon>
                <span>基金池配置</span>
                <el-button text type="primary" size="small" @click="$router.push('/agent-system')">管理配置</el-button>
              </div>
            </template>
            <el-empty v-if="!data.fund_pool" description="暂无基金池配置" :image-size="50" />
            <template v-else>
              <el-descriptions :column="1" border size="small">
                <el-descriptions-item label="状态">
                  <el-tag :type="data.fund_pool.enabled ? 'success' : 'info'" size="small">
                    {{ data.fund_pool.enabled ? '已启用' : '已禁用' }}
                  </el-tag>
                </el-descriptions-item>
                <template v-for="(val, key) in fundPoolDisplayItems" :key="key">
                  <el-descriptions-item :label="val.label">
                    {{ val.value }}
                  </el-descriptions-item>
                </template>
              </el-descriptions>
              <div v-if="data.fund_pool_sub" class="fund-sub-grid" style="margin-top:12px;">
                <div v-for="sub in fundSubAccounts" :key="sub.key" class="fund-sub-card" :style="{borderLeft: `3px solid ${sub.color}`}">
                  <div class="fund-sub-label">{{ sub.label }}</div>
                  <div class="fund-sub-value">¥{{ fmt(sub.amount) }}</div>
                </div>
              </div>
            </template>
          </el-card>
        </el-col>

        <!-- 分红执行记录 -->
        <el-col :span="14">
          <el-card class="section-card">
            <template #header>
              <div class="card-header">
                <el-icon><TrendCharts /></el-icon>
                <span>年终分红执行记录</span>
                <el-button text type="primary" size="small" @click="$router.push('/agent-system')">执行分红</el-button>
              </div>
            </template>
            <el-empty
              v-if="!data.dividend?.executions?.length"
              description="暂无分红执行记录"
              :image-size="60"
            />
            <el-table v-else :data="data.dividend.executions" size="small" stripe>
              <el-table-column prop="year" label="年度" width="80" />
              <el-table-column label="发放总额" width="130" align="right">
                <template #default="{ row }">
                  <span class="amount green">¥{{ fmt(row.totalDistributed) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="发放人数" width="90" align="center">
                <template #default="{ row }">{{ row.distributedCount ?? '-' }}</template>
              </el-table-column>
              <el-table-column label="状态" width="80">
                <template #default="{ row }">
                  <el-tag :type="row.status === 'completed' ? 'success' : 'warning'" size="small">
                    {{ row.status === 'completed' ? '已完成' : (row.status || '执行中') }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="执行时间" min-width="140">
                <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
      </el-row>

      <!-- ===== 区域 5：业绩贡献榜 ===== -->
      <el-card class="section-card" style="margin-top: 16px">
        <template #header>
          <div class="card-header">
            <el-icon><Trophy /></el-icon>
            <span>直系出单业绩贡献榜</span>
            <div class="period-tabs">
              <el-radio-group v-model="perfPeriod" size="small" @change="fetchPerformance">
                <el-radio-button label="day">今日</el-radio-button>
                <el-radio-button label="month">本月</el-radio-button>
                <el-radio-button label="quarter">本季度</el-radio-button>
              </el-radio-group>
            </div>
            <span v-if="perfData.period_start" class="period-label">
              {{ perfData.period_start }} 至 {{ perfData.period_end }}
            </span>
          </div>
        </template>
        <el-empty v-if="!perfData.list?.length && !perfLoading" description="本期暂无直系出单数据" :image-size="60" />
        <el-table v-else :data="perfData.list" v-loading="perfLoading" size="small" stripe max-height="400">
          <el-table-column label="排名" width="70" align="center">
            <template #default="{ row }">
              <span :class="['rank-badge', `rank-${row.rank <= 3 ? row.rank : 'other'}`]">{{ row.rank }}</span>
            </template>
          </el-table-column>
          <el-table-column label="代理" min-width="150">
            <template #default="{ row }">
              <el-button text type="primary" size="small"
                @click="$router.push(`/users?keyword=${row.member_no || row.user_id}`)">
                {{ row.nickname || row.openid || '-' }}
              </el-button>
              <el-tag v-if="row.member_no" size="small" type="info" style="margin-left:4px">{{ row.member_no }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="等级" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="roleLevelType(row.role_level)">{{ roleLevelLabel(row.role_level) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="出单数" width="80" align="center" prop="order_count" />
          <el-table-column label="业绩（元）" min-width="130" align="right">
            <template #default="{ row }">
              <span class="amount green">¥{{ fmt(row.gmv) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="占比" width="100" align="right">
            <template #default="{ row }">
              <el-progress
                :percentage="perfData.list?.length ? Math.round(row.gmv / (perfData.list[0]?.gmv || 1) * 100) : 0"
                :stroke-width="6"
                :show-text="false"
              />
            </template>
          </el-table-column>
        </el-table>
        <div v-if="perfData.total_agents" class="total-row">
          本期共 <strong>{{ perfData.total_agents }}</strong> 位代理出单
        </div>
      </el-card>

      <!-- ===== 区域 6：个体 & 团队池子贡献 ===== -->
      <el-row :gutter="16" style="margin-top: 16px">
        <!-- 合伙人团队贡献 -->
        <el-col :span="14">
          <el-card class="section-card">
            <template #header>
              <div class="card-header">
                <el-icon><DataAnalysis /></el-icon>
                <span>合伙人团队贡献（分红资格池）</span>
                <el-tag v-if="poolData.dividend_enabled" type="success" size="small">分红已开启</el-tag>
                <el-tag v-else type="info" size="small">分红未开启</el-tag>
              </div>
            </template>
            <el-empty v-if="!poolData.partner_contributions?.length && !poolLoading"
              description="暂无合伙人（等级4+）数据" :image-size="50" />
            <el-table v-else :data="poolData.partner_contributions" v-loading="poolLoading" size="small" stripe max-height="360">
              <el-table-column label="合伙人" min-width="130">
                <template #default="{ row }">
                  <el-button text type="primary" size="small"
                    @click="$router.push(`/users?keyword=${row.member_no || row.user_id}`)">
                    {{ row.nickname || '-' }}
                  </el-button>
                  <el-tag v-if="row.member_no" size="small" type="info" style="margin-left:2px">{{ row.member_no }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="团队人数" width="80" align="center" prop="team_size" />
              <el-table-column label="团队销售额" min-width="120" align="right">
                <template #default="{ row }">
                  <span class="amount blue">¥{{ fmt(row.team_sales) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="个人销售" min-width="110" align="right">
                <template #default="{ row }">
                  <span class="amount green">¥{{ fmt(row.personal_sales) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="累计分佣" min-width="110" align="right">
                <template #default="{ row }">
                  <span class="amount purple">¥{{ fmt(row.settled_commission) }}</span>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>

        <!-- 代理商个人贡献 -->
        <el-col :span="10">
          <el-card class="section-card">
            <template #header>
              <div class="card-header">
                <el-icon><User /></el-icon>
                <span>代理商个人贡献 TOP 50</span>
              </div>
            </template>
            <el-empty v-if="!poolData.agent_contributions?.length && !poolLoading"
              description="暂无代理商（等级3）数据" :image-size="50" />
            <el-table v-else :data="poolData.agent_contributions" v-loading="poolLoading" size="small" stripe max-height="360">
              <el-table-column label="代理商" min-width="120">
                <template #default="{ row }">
                  <el-button text type="primary" size="small"
                    @click="$router.push(`/users?keyword=${row.member_no || row.user_id}`)">
                    {{ row.nickname || '-' }}
                  </el-button>
                  <el-tag v-if="row.member_no" size="small" type="info" style="margin-left:2px">{{ row.member_no }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="个人销售" min-width="110" align="right">
                <template #default="{ row }">
                  <span class="amount green">¥{{ fmt(row.personal_sales) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="累计分佣" min-width="100" align="right">
                <template #default="{ row }">
                  <span class="amount purple">¥{{ fmt(row.settled_commission) }}</span>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Money, Wallet, CreditCard, Coin, TrendCharts, Refresh, Trophy, DataAnalysis, User } from '@element-plus/icons-vue'
import { getFinanceOverview, getAgentPerformance, getPoolContributions } from '@/api'
import { formatDate } from '@/utils/format'

const loading = ref(false)
const data = ref({})

// 业绩榜
const perfLoading = ref(false)
const perfPeriod = ref('month')
const perfData = ref({ list: [], total_agents: 0, period_start: '', period_end: '' })

// 池子贡献
const poolLoading = ref(false)
const poolData = ref({ partner_contributions: [], agent_contributions: [], dividend_enabled: false })

const fmt = (val) => {
  const n = Number(val ?? 0)
  return isNaN(n) ? '0.00' : n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const roleLevelLabel = (level) => {
  const map = { 0: '普通用户', 1: '会员', 2: '团长', 3: '代理商', 4: '合伙人' }
  return map[level] ?? `等级${level}`
}
const roleLevelType = (level) => {
  const map = { 0: '', 1: 'success', 2: 'warning', 3: 'danger', 4: 'danger' }
  return map[level] ?? ''
}

const fetchOverview = async () => {
  loading.value = true
  try {
    const res = await getFinanceOverview()
    data.value = res || {}
  } catch (e) {
    ElMessage.error('加载财务数据失败，请重试')
  } finally {
    loading.value = false
  }
}

const fetchPerformance = async () => {
  perfLoading.value = true
  try {
    const res = await getAgentPerformance({ period: perfPeriod.value, limit: 50 })
    perfData.value = res || {}
  } catch (e) {
    ElMessage.error('加载业绩数据失败')
  } finally {
    perfLoading.value = false
  }
}

const fetchPoolContributions = async () => {
  poolLoading.value = true
  try {
    const res = await getPoolContributions()
    poolData.value = res || {}
  } catch (e) {
    ElMessage.error('加载池子贡献数据失败')
  } finally {
    poolLoading.value = false
  }
}

const fetchAll = async () => {
  await Promise.all([fetchOverview(), fetchPerformance(), fetchPoolContributions()])
}

// 佣金状态分布表格行
const commissionRows = computed(() => {
  const c = data.value.commissions || {}
  const total = c.total || 1
  const rows = [
    { label: '冻结中', amount: c.frozen, tagType: 'info', cls: '' },
    { label: '待审批', amount: c.pending_approval, tagType: 'warning', cls: 'orange' },
    { label: '已结算', amount: c.settled, tagType: 'success', cls: 'green' },
    { label: '已取消', amount: c.cancelled, tagType: 'danger', cls: 'red' }
  ]
  return rows.map((r) => ({
    ...r,
    amount: r.amount ?? 0,
    pct: ((r.amount ?? 0) / total * 100).toFixed(1)
  }))
})

// 基金池展示字段（过滤无意义的 enabled 字段）
const fundPoolDisplayItems = computed(() => {
  const pool = data.value.fund_pool || {}
  const labelMap = {
    pool_balance: { label: '池子余额', fmt: (v) => `¥${fmt(v)}` },
    source_pct: { label: '资金注入比例', fmt: (v) => `${v}%` },
    min_balance: { label: '最低留存', fmt: (v) => `¥${fmt(v)}` },
    annual_target: { label: '年度目标', fmt: (v) => `¥${fmt(v)}` }
  }
  const result = {}
  Object.entries(pool).forEach(([k, v]) => {
    if (k === 'enabled' || v === undefined || v === null || v === '') return
    if (labelMap[k]) {
      result[k] = { label: labelMap[k].label, value: labelMap[k].fmt(v) }
    } else if (typeof v !== 'object') {
      result[k] = { label: k, value: String(v) }
    }
  })
  return result
})

const fundSubAccounts = computed(() => {
  const sub = data.value.fund_pool_sub || {}
  return [
    { key: 'total_balance', label: '池总余额', amount: sub.total_balance || 0, color: '#303133' },
    { key: 'total_in', label: '累计入池', amount: sub.total_in || 0, color: '#606266' },
    { key: 'mirror_ops', label: '镜像运营', amount: sub.mirror_ops || 0, color: '#409eff' },
    { key: 'travel', label: '旅行基金', amount: sub.travel || 0, color: '#67c23a' },
    { key: 'parent', label: '父母奖', amount: sub.parent || 0, color: '#e6a23c' },
    { key: 'personal', label: '个人奖励', amount: sub.personal || 0, color: '#9c59d1' }
  ]
})

onMounted(fetchAll)
</script>

<style scoped>
.finance-page { padding: 0; }

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.page-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}
.title-icon { font-size: 20px; color: #409eff; }

/* KPI 卡片网格 */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.kpi-card {
  border-radius: 8px;
  padding: 16px 18px;
  color: #fff;
  min-height: 90px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.kpi-card.blue    { background: linear-gradient(135deg, #409eff, #1d7ee6); }
.kpi-card.green   { background: linear-gradient(135deg, #67c23a, #3f9e1e); }
.kpi-card.orange  { background: linear-gradient(135deg, #e6a23c, #c07918); }
.kpi-card.red     { background: linear-gradient(135deg, #f56c6c, #d43030); }
.kpi-card.purple  { background: linear-gradient(135deg, #9c59d1, #7033b2); }
.kpi-card.teal    { background: linear-gradient(135deg, #17a2b8, #0e7890); }
.kpi-card.indigo  { background: linear-gradient(135deg, #5c6bc0, #3949a9); }
.kpi-card.pink    { background: linear-gradient(135deg, #ec407a, #c2185b); }

.kpi-label { font-size: 12px; opacity: 0.9; }
.kpi-value { font-size: 20px; font-weight: 700; }
.kpi-sub   { font-size: 11px; opacity: 0.8; }

/* 区域卡片 */
.section-card { }
.card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  flex-wrap: wrap;
}
.card-header > span:first-of-type { flex: 1; }

.period-tabs { margin-left: auto; }
.period-label { font-size: 12px; color: #909399; font-weight: 400; }

/* 金额着色 */
.amount       { font-weight: 600; }
.amount.red   { color: #f56c6c; }
.amount.green { color: #67c23a; }
.amount.orange{ color: #e6a23c; }
.amount.purple{ color: #9c59d1; }
.amount.blue  { color: #409eff; }

.pct { color: #909399; font-size: 12px; }

.total-row {
  margin-top: 12px;
  text-align: right;
  font-size: 14px;
  color: #606266;
  padding-top: 8px;
  border-top: 1px solid #ebeef5;
}

/* 排名徽标 */
.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
  background: #f0f2f5;
  color: #606266;
}
.rank-badge.rank-1 { background: #f5d020; color: #8a5900; }
.rank-badge.rank-2 { background: #c0c0c0; color: #444; }
.rank-badge.rank-3 { background: #cd7f32; color: #fff; }

.fund-sub-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.fund-sub-card { padding: 10px 12px; background: #fafafa; border-radius: 4px; }
.fund-sub-label { font-size: 12px; color: #909399; }
.fund-sub-value { font-size: 16px; font-weight: 600; color: #303133; margin-top: 2px; }
</style>
