<template>
  <div class="finance-rules-panel">
    <el-alert
      v-if="loadIssueMessage"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom:16px"
      :title="loadIssueMessage"
    />

    <el-tabs v-model="activeTab" type="border-card">
      <el-tab-pane label="佣金配置" name="commission">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>佣金矩阵</span>
              <el-button type="primary" :loading="saving" @click="save('commission')">保存</el-button>
            </div>
          </template>
          <el-form label-width="220px" style="max-width:760px">
            <el-form-item label="默认平台发货"><el-switch v-model="commission.default_platform_fulfillment" /></el-form-item>
            <el-alert
              type="info"
              :closable="false"
              style="margin-bottom:12px"
              title="矩阵值表示“该上级角色对该买家角色”的总比例。二级上级实际拿级差，即：上上级矩阵值减去直推上级矩阵值。"
            />
            <el-table :data="matrixParentRoles" border size="small" style="max-width:920px;margin-bottom:16px">
              <el-table-column label="上级角色" width="120">
                <template #default="{ row }">{{ matrixRoleLabels[row] }}</template>
              </el-table-column>
              <el-table-column v-for="buyerRole in matrixBuyerRoles" :key="buyerRole" :label="matrixRoleLabels[buyerRole]" width="140">
                <template #default="{ row }">
                  <el-input-number v-model="commissionMatrix[row][buyerRole]" :min="0" :max="100" :step="0.5" :precision="1" style="width:110px" />
                  <span class="unit-suffix">%</span>
                </template>
              </el-table-column>
            </el-table>
            <el-form-item label="B端拿货折扣率"><el-input-number v-model="commission.agent_cost_discount_rate" :min="0.1" :max="1" :step="0.05" :precision="2" /></el-form-item>
            <el-divider content-position="left">成本结构（内部核算）</el-divider>
            <el-form-item label="启用成本结构"><el-switch v-model="commission.cost_split.enabled" /></el-form-item>
            <el-form-item label="直销收益 %"><el-input-number v-model="commission.cost_split.direct_sales_pct" :min="0" :max="100" /></el-form-item>
            <el-form-item label="运营成本 %"><el-input-number v-model="commission.cost_split.operations_pct" :min="0" :max="100" /></el-form-item>
            <el-form-item label="镜像运营成本 %"><el-input-number v-model="commission.cost_split.mirror_operations_pct" :min="0" :max="100" /></el-form-item>
            <el-form-item label="利润 %"><el-input-number v-model="commission.cost_split.profit_pct" :min="0" :max="100" /></el-form-item>
            <el-form-item label="当前合计"><el-tag :type="costSplitSumPct === 100 ? 'success' : 'warning'">{{ costSplitSumPct }}%</el-tag></el-form-item>
          </el-form>
          <div class="preview-bar-caption">分层利润预览（示意）</div>
        <div v-if="previewBarSegments.length" class="preview-bar">
            <el-tooltip v-for="seg in previewBarSegments" :key="seg.key" :content="seg.tip" placement="top">
              <div class="preview-bar-seg" :style="{ flex: Math.max(seg.flex, 0.001), background: seg.color }">
                <span v-if="seg.flex >= 0.07">{{ seg.pctLabel }}</span>
              </div>
            </el-tooltip>
          </div>
          <el-table :data="middlePreview.rows" size="small" border class="preview-table">
            <el-table-column prop="layer" label="层级" width="72" />
            <el-table-column prop="roleLabel" label="假设角色" min-width="120" />
            <el-table-column prop="rateLabel" label="比例" width="110" />
            <el-table-column label="金额" width="96" align="right"><template #default="{ row }">¥{{ row.amount.toFixed(2) }}</template></el-table-column>
          </el-table>
          <el-form inline style="margin-top:12px">
            <el-form-item label="买家角色">
              <el-select v-model="previewChain.buyerRole" style="width:120px">
                <el-option v-for="role in matrixBuyerRoles" :key="'buyer-' + role" :label="matrixRoleLabels[role]" :value="role" />
              </el-select>
            </el-form-item>
            <el-form-item label="直推上级">
              <el-select v-model="previewChain.parentRole" style="width:140px">
                <el-option v-for="o in previewParentRoleOptions" :key="o.v" :label="o.l" :value="o.v" />
              </el-select>
            </el-form-item>
            <el-form-item label="二级上级">
              <el-select v-model="previewChain.gpRole" style="width:140px">
                <el-option v-for="o in previewIndirectRoleOptions" :key="'gp-' + o.v" :label="o.l" :value="o.v" />
              </el-select>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="平级奖" name="peer">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>平级奖摘要</span>
              <el-button type="primary" @click="goMembershipPeerBonus">去会员配置页修改</el-button>
            </div>
          </template>
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="财务页不再直接修改平级奖配置；唯一可写真相源已收口到「会员与成长值」页面。"
          />
          <el-descriptions :column="2" border style="margin-top:16px">
            <el-descriptions-item label="总开关">{{ peerBonus.enabled ? '启用' : '关闭' }}</el-descriptions-item>
            <el-descriptions-item label="默认版本">{{ peerBonus.default_version === 'social' ? '社会版' : '团队版' }}</el-descriptions-item>
            <el-descriptions-item label="犹豫期">{{ peerBonus.cooldown_days }} 天</el-descriptions-item>
            <el-descriptions-item label="退款开发费比例">{{ peerBonus.refund_dev_fee_pct }}%</el-descriptions-item>
          </el-descriptions>
          <div class="level-grid">
            <el-card v-for="level in peerBonusLevels" :key="level" class="level-card">
              <template #header><span>Lv.{{ level }} 平级奖</span></template>
              <el-descriptions :column="1" size="small" border>
                <el-descriptions-item label="社会版现金比例">{{ Number(peerBonus.social['level_' + level].pct || 0) }}%</el-descriptions-item>
                <el-descriptions-item label="团队版现金">¥{{ Number(peerBonus.team['level_' + level].cash || 0) }}</el-descriptions-item>
                <el-descriptions-item label="兑换券张数">{{ Number(peerBonus.team['level_' + level].exchange_coupons || 0) }}</el-descriptions-item>
                <el-descriptions-item label="券面货值">¥{{ Number(peerBonus.team['level_' + level].coupon_product_value || 0) }}</el-descriptions-item>
                <el-descriptions-item label="解锁收益">¥{{ Number(peerBonus.team['level_' + level].unlock_reward || 0) }}</el-descriptions-item>
              </el-descriptions>
            </el-card>
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="代理协助奖" name="assist">
        <el-card>
          <template #header>
            <div class="card-header">
              <div><el-switch v-model="assistBonus.enabled" active-text="启用" inactive-text="停用" style="margin-right:12px" />代理协助奖</div>
              <el-button type="primary" :loading="saving" @click="save('assist')">保存</el-button>
            </div>
          </template>
          <el-table :data="assistBonus.tiers" border style="max-width:520px" v-if="assistBonus.enabled">
            <el-table-column label="累计单数上限" width="180"><template #default="{ row }"><el-input-number v-model="row.max_orders" :min="1" size="small" style="width:140px" /></template></el-table-column>
            <el-table-column label="每单奖金（元）" width="180"><template #default="{ row }"><el-input-number v-model="row.bonus" :min="0" :step="5" size="small" style="width:140px" /></template></el-table-column>
            <el-table-column label="操作" width="80"><template #default="{ $index }"><el-button text type="danger" @click="assistBonus.tiers.splice($index, 1)">删除</el-button></template></el-table-column>
          </el-table>
          <el-button v-if="assistBonus.enabled" type="primary" size="small" style="margin-top:12px" @click="assistBonus.tiers.push({ max_orders: 100, bonus: 60 })">+ 添加阶梯</el-button>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="基金池" name="fund">
        <el-card>
          <template #header>
            <div class="card-header">
              <div><el-switch v-model="fundPool.enabled" active-text="启用" inactive-text="停用" style="margin-right:12px" />基金池配置</div>
              <el-button type="primary" :loading="saving" @click="save('fund')">保存</el-button>
            </div>
          </template>
          <div v-for="(label,key) in { b1:'B1 推广合伙人', b2:'B2 运营合伙人', b3:'B3 区域合伙人' }" :key="key" v-if="fundPool.enabled">
            <el-divider content-position="left">{{ label }}</el-divider>
            <el-form label-width="180px" style="max-width:620px">
              <el-form-item label="基金池总额（元）"><el-input-number v-model="fundPool[key].total" :min="0" :step="100" /></el-form-item>
              <el-form-item label="镜像运营 %"><el-input-number v-model="fundPool[key].mirror_ops_pct" :min="0" :max="100" /></el-form-item>
              <el-form-item label="旅行基金 %"><el-input-number v-model="fundPool[key].travel_pct" :min="0" :max="100" /></el-form-item>
              <el-form-item label="父母奖 %"><el-input-number v-model="fundPool[key].parent_pct" :min="0" :max="100" /></el-form-item>
              <el-form-item label="个人奖励 %"><el-input-number v-model="fundPool[key].personal_pct" :min="0" :max="100" /></el-form-item>
            </el-form>
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="年终分红" name="dividendRules">
        <el-card style="margin-bottom:16px">
          <template #header>
            <div class="card-header">
              <div><el-switch v-model="dividendRules.enabled" active-text="启用" inactive-text="停用" style="margin-right:12px" />分红规则</div>
              <el-button type="primary" :loading="saving" @click="save('dividendRules')">保存规则</el-button>
            </div>
          </template>
          <el-form label-width="220px" style="max-width:700px" :disabled="!dividendRules.enabled">
            <el-form-item label="分红来源比例 %"><el-input-number v-model="dividendRules.source_pct" :min="0" :max="10" :step="0.5" :precision="1" /></el-form-item>
            <el-form-item label="最低参与月数"><el-input-number v-model="dividendRules.min_months" :min="0" :max="12" /></el-form-item>
            <el-divider content-position="left">B团队奖</el-divider>
            <el-form-item label="启用"><el-switch v-model="dividendRules.b_team_award.enabled" /></el-form-item>
            <el-form-item label="占分红池比例 %"><el-input-number v-model="dividendRules.b_team_award.pool_pct" :min="0" :max="10" :step="0.5" :precision="1" /></el-form-item>
            <div v-for="(r, i) in dividendRules.b_team_award.ranks" :key="'bt' + i" class="rank-row">
              <el-tag>{{ r.label }}</el-tag>
              <span>{{ r.count }}人 占</span>
              <el-input-number v-model="r.pct" :min="0" :max="5" :step="0.1" :precision="1" size="small" style="width:100px" />
              <span>%</span>
            </div>
            <el-divider content-position="left">B1个人奖</el-divider>
            <el-form-item label="启用"><el-switch v-model="dividendRules.b1_personal_award.enabled" /></el-form-item>
            <el-form-item label="占分红池比例 %"><el-input-number v-model="dividendRules.b1_personal_award.pool_pct" :min="0" :max="10" :step="0.5" :precision="1" /></el-form-item>
            <div v-for="(r, i) in dividendRules.b1_personal_award.ranks" :key="'b1' + i" class="rank-row">
              <el-tag>{{ r.label }}</el-tag>
              <span>{{ r.count }}人 占</span>
              <el-input-number v-model="r.pct" :min="0" :max="5" :step="0.1" :precision="1" size="small" style="width:100px" />
              <span>%</span>
            </div>
          </el-form>
        </el-card>
        <el-card>
          <template #header><span>分红执行</span></template>
          <el-form label-width="160px" style="max-width:600px">
            <el-form-item label="分红年度"><el-date-picker v-model="dividendYear" type="year" value-format="YYYY" style="width:160px" /></el-form-item>
            <el-form-item label="分红池总金额（元）"><el-input-number v-model="dividendPool" :min="0" :step="1000" style="width:200px" /></el-form-item>
            <el-form-item>
              <el-button type="warning" @click="previewDividend" :loading="dividendLoading">预览</el-button>
              <el-button type="danger" :disabled="!dividendPreviewData.length || !isSuperAdmin" :loading="dividendExecuting" @click="confirmExecuteDividend">确认发放</el-button>
            </el-form-item>
          </el-form>
          <el-table v-if="dividendPreviewData.length" :data="dividendPreviewData" border style="margin-top:16px">
            <el-table-column prop="rank" label="排名" width="70" />
            <el-table-column label="昵称"><template #default="{ row }">{{ row.nick_name || row.nickname || '-' }}</template></el-table-column>
            <el-table-column prop="roleLevel" label="等级" width="120"><template #default="{ row }">{{ ROLE_NAMES[row.roleLevel] }}</template></el-table-column>
            <el-table-column prop="teamSales" label="团队业绩" width="130"><template #default="{ row }">¥{{ Number(row.teamSales).toFixed(2) }}</template></el-table-column>
            <el-table-column prop="sharePercent" label="比例" width="80"><template #default="{ row }">{{ row.sharePercent }}%</template></el-table-column>
            <el-table-column prop="dividendAmount" label="分红" width="130"><template #default="{ row }">¥{{ Number(row.dividendAmount).toFixed(2) }}</template></el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="合伙人退出" name="exitRules">
        <el-card style="margin-bottom:16px">
          <template #header>
            <div class="card-header">
              <div><el-switch v-model="exitRules.enabled" active-text="启用" inactive-text="停用" style="margin-right:12px" />退出规则</div>
              <el-button type="primary" :loading="saving" @click="save('exitRules')">保存规则</el-button>
            </div>
          </template>
          <el-form label-width="240px" style="max-width:700px" :disabled="!exitRules.enabled">
            <el-form-item label="未满1年最短退款（工作日）"><el-input-number v-model="exitRules.under_1_year_min_days" :min="1" /></el-form-item>
            <el-form-item label="未满1年最长退款（工作日）"><el-input-number v-model="exitRules.under_1_year_max_days" :min="1" /></el-form-item>
            <el-form-item label="满1年最短退款（工作日）"><el-input-number v-model="exitRules.over_1_year_min_days" :min="1" /></el-form-item>
            <el-form-item label="满1年最长退款（工作日）"><el-input-number v-model="exitRules.over_1_year_max_days" :min="1" /></el-form-item>
            <el-form-item label="退款范围说明"><el-input v-model="exitRules.refund_scope" type="textarea" :rows="2" /></el-form-item>
            <el-form-item label="退出即撤销身份"><el-switch v-model="exitRules.auto_revoke_identity" /></el-form-item>
          </el-form>
        </el-card>
        <el-card>
          <template #header><span>执行退出</span></template>
          <el-form label-width="120px" style="max-width:500px">
            <el-form-item label="用户ID"><el-input-number v-model="exitForm.userId" :min="1" style="width:200px" /></el-form-item>
            <el-form-item label="退出原因"><el-input v-model="exitForm.reason" type="textarea" :rows="3" /></el-form-item>
            <el-form-item><el-button type="danger" :disabled="!canManageExit" :loading="exitLoading" @click="executePartnerExit">执行退出退款</el-button></el-form-item>
          </el-form>
          <el-descriptions v-if="exitResult" title="退款结果" :column="1" border style="margin-top:20px">
            <el-descriptions-item label="货款退款">¥{{ exitResult.walletRefund }}</el-descriptions-item>
            <el-descriptions-item label="佣金余额退款">¥{{ exitResult.balanceRefund }}</el-descriptions-item>
            <el-descriptions-item label="退款总计">¥{{ exitResult.refundAmount }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="充值配置" name="recharge">
        <el-card>
          <template #header>
            <div class="card-header">
              <div><el-switch v-model="rechargeConfig.enabled" active-text="启用" inactive-text="停用" style="margin-right:12px" />货款充值配置</div>
              <el-button type="primary" :loading="saving" @click="save('recharge')">保存</el-button>
            </div>
          </template>
          <el-form label-width="180px" style="max-width:700px" :disabled="!rechargeConfig.enabled">
            <el-form-item v-for="(_, idx) in rechargeConfig.preset_amounts" :key="'pa'+idx" :label="'按钮 ' + (idx + 1)">
              <el-input-number v-model="rechargeConfig.preset_amounts[idx]" :min="1" :step="100" style="width:180px" />
              <el-button v-if="rechargeConfig.preset_amounts.length > 1" type="danger" text size="small" style="margin-left:8px" @click="rechargeConfig.preset_amounts.splice(idx, 1)">删除</el-button>
            </el-form-item>
            <el-form-item label=""><el-button size="small" @click="rechargeConfig.preset_amounts.push(1000)" :disabled="rechargeConfig.preset_amounts.length >= 8">+ 添加金额</el-button></el-form-item>
            <el-divider content-position="left">充值满赠</el-divider>
            <el-form-item label="启用满赠"><el-switch v-model="rechargeConfig.bonus_enabled" /></el-form-item>
            <el-table :data="rechargeConfig.bonus_tiers" border style="max-width:520px" v-if="rechargeConfig.bonus_enabled">
              <el-table-column label="充值满（元）" width="180"><template #default="{ row }"><el-input-number v-model="row.min" :min="1" :step="100" size="small" style="width:140px" /></template></el-table-column>
              <el-table-column label="赠送（元）" width="180"><template #default="{ row }"><el-input-number v-model="row.bonus" :min="0" :step="10" size="small" style="width:140px" /></template></el-table-column>
              <el-table-column label="操作" width="80"><template #default="{ $index }"><el-button type="danger" text size="small" @click="rechargeConfig.bonus_tiers.splice($index, 1)">删除</el-button></template></el-table-column>
            </el-table>
            <el-button v-if="rechargeConfig.bonus_enabled" type="primary" size="small" style="margin-top:12px" @click="rechargeConfig.bonus_tiers.push({ min: 10000, bonus: 1000 })">+ 添加档位</el-button>
          </el-form>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/store/user'
import {
  createExitApplication,
  executeDividend,
  getAssistBonusConfig,
  getCommissionConfig,
  getCommissionMatrix,
  getDividendPreview,
  getDividendRulesConfig,
  getExitRulesConfig,
  getFundPoolConfig,
  getMemberTierConfig,
  getRechargeConfig,
  updateAssistBonusConfig,
  updateCommissionConfig,
  updateCommissionMatrix,
  updateDividendRulesConfig,
  updateExitRulesConfig,
  updateFundPoolConfig,
  updateRechargeConfig
} from '@/api'

const userStore = useUserStore()
const router = useRouter()
const activeTab = ref('commission')
const saving = ref(false)
const failedConfigKeys = ref([])
const isSuperAdmin = computed(() => userStore.isSuperAdmin)
const canManageExit = computed(() => userStore.isSuperAdmin || userStore.hasPermission('users'))
const peerBonusLevels = [3, 4, 5]
const ROLE_NAMES = { 0: '普通用户', 1: 'C1初级代理', 2: 'C2高级代理', 3: 'B1推广合伙人', 4: 'B2运营合伙人', 5: 'B3区域合伙人' }

const commission = reactive({
  enabled: true,
  default_platform_fulfillment: true,
  agent_cost_discount_rate: 0.6,
  cost_split: { enabled: true, direct_sales_pct: 40, operations_pct: 25, mirror_operations_pct: 5, profit_pct: 30 }
})
const matrixBuyerRoles = [0, 1, 2, 3, 4]
const matrixParentRoles = [1, 2, 3, 4, 5]
const matrixRoleLabels = { 0: 'VIP', 1: 'C1', 2: 'C2', 3: 'B1', 4: 'B2', 5: 'B3' }
const defaultCommissionMatrix = () => ({
  1: { 0: 20, 1: 0, 2: 0, 3: 0, 4: 0 },
  2: { 0: 30, 1: 5, 2: 0, 3: 0, 4: 0 },
  3: { 0: 0, 1: 20, 2: 10, 3: 0, 4: 0 },
  4: { 0: 0, 1: 30, 2: 20, 3: 10, 4: 0 },
  5: { 0: 0, 1: 35, 2: 25, 3: 15, 4: 5 }
})
const commissionMatrix = reactive(defaultCommissionMatrix())
const assistBonus = reactive({ enabled: false, tiers: [] })
const fundPool = reactive({
  enabled: false,
  b1: { total: 0, mirror_ops_pct: 42, travel_pct: 31, parent_pct: 11, personal_pct: 16 },
  b2: { total: 0, mirror_ops_pct: 42, travel_pct: 31, parent_pct: 11, personal_pct: 16 },
  b3: { total: 0, mirror_ops_pct: 42, travel_pct: 31, parent_pct: 11, personal_pct: 16 }
})
const dividendRules = reactive({
  enabled: false,
  min_months: 0,
  source_pct: 0,
  b_team_award: { enabled: false, pool_pct: 0, ranks: [] },
  b1_personal_award: { enabled: false, pool_pct: 0, ranks: [] }
})
const exitRules = reactive({
  enabled: false,
  under_1_year_min_days: 60,
  under_1_year_max_days: 90,
  over_1_year_min_days: 45,
  over_1_year_max_days: 60,
  refund_scope: '',
  auto_revoke_identity: true
})
const rechargeConfig = reactive({ enabled: false, preset_amounts: [1000, 3000, 5000], bonus_enabled: false, bonus_tiers: [] })

function defaultPeerBonusConfig() {
  return {
    enabled: true,
    default_version: 'team',
    cooldown_days: 90,
    refund_dev_fee_pct: 1.5,
    social: { level_3: { pct: 10 }, level_4: { pct: 20 }, level_5: { pct: 20 } },
    team: {
      level_3: { cash: 100, exchange_coupons: 2, coupon_product_value: 399, unlock_reward: 160, exchange_title: '', allowed_product_ids_text: '', allowed_sku_ids_text: '' },
      level_4: { cash: 2400, exchange_coupons: 15, coupon_product_value: 399, unlock_reward: 160, exchange_title: '', allowed_product_ids_text: '', allowed_sku_ids_text: '' },
      level_5: { cash: 0, exchange_coupons: 0, coupon_product_value: 0, unlock_reward: 0, exchange_title: '', allowed_product_ids_text: '', allowed_sku_ids_text: '' }
    }
  }
}

const peerBonus = reactive(defaultPeerBonusConfig())
const dividendYear = ref(String(new Date().getFullYear() - 1))
const dividendPool = ref(0)
const dividendLoading = ref(false)
const dividendExecuting = ref(false)
const dividendPreviewData = ref([])
const exitForm = reactive({ userId: null, reason: '' })
const exitLoading = ref(false)
const exitResult = ref(null)

const configLabels = {
  commission: '佣金配置',
  peer: '平级奖',
  assist: '代理协助奖',
  fund: '基金池',
  dividendRules: '年终分红',
  exitRules: '合伙人退出',
  recharge: '充值配置'
}

const loadIssueMessage = computed(() => {
  if (!failedConfigKeys.value.length) return ''
  return `以下财务规则加载失败，当前默认值不可直接保存：${failedConfigKeys.value.map((key) => configLabels[key] || key).join('、')}`
})

function deepAssign(target, source) {
  Object.keys(source || {}).forEach((key) => {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      deepAssign(target[key], source[key])
    } else if (source[key] !== undefined) {
      target[key] = source[key]
    }
  })
}

function mergePeerBonusFromApi(from) {
  if (!from || typeof from !== 'object') return
  peerBonus.enabled = from.enabled !== false
  peerBonus.default_version = ['team', 'social'].includes(String(from.default_version || '').toLowerCase()) ? String(from.default_version).toLowerCase() : 'team'
  peerBonus.cooldown_days = Number.isFinite(Number(from.cooldown_days)) ? Number(from.cooldown_days) : peerBonus.cooldown_days
  peerBonus.refund_dev_fee_pct = Number.isFinite(Number(from.refund_dev_fee_pct)) ? Number(from.refund_dev_fee_pct) : peerBonus.refund_dev_fee_pct
  peerBonusLevels.forEach((level) => {
    const social = from.social?.[`level_${level}`] || {}
    const team = from.team?.[`level_${level}`] || {}
    peerBonus.social[`level_${level}`].pct = Number(social.pct ?? peerBonus.social[`level_${level}`].pct) || 0
    Object.assign(peerBonus.team[`level_${level}`], {
      cash: Number(team.cash ?? peerBonus.team[`level_${level}`].cash) || 0,
      exchange_coupons: Number(team.exchange_coupons ?? peerBonus.team[`level_${level}`].exchange_coupons) || 0,
      coupon_product_value: Number(team.coupon_product_value ?? peerBonus.team[`level_${level}`].coupon_product_value) || 0,
      unlock_reward: Number(team.unlock_reward ?? peerBonus.team[`level_${level}`].unlock_reward) || 0,
      exchange_title: String(team.exchange_title || peerBonus.team[`level_${level}`].exchange_title || ''),
      allowed_product_ids_text: Array.isArray(team.allowed_product_ids) ? team.allowed_product_ids.join(',') : '',
      allowed_sku_ids_text: Array.isArray(team.allowed_sku_ids) ? team.allowed_sku_ids.join(',') : ''
    })
  })
}

const parseIdText = (value) => String(value || '').split(/[,，\n]/).map((item) => item.trim()).filter(Boolean)

function mergeCommissionMatrixFromApi(from) {
  const source = from && typeof from === 'object' ? from : {}
  const defaults = defaultCommissionMatrix()
  matrixParentRoles.forEach((parentRole) => {
    if (!commissionMatrix[parentRole] || typeof commissionMatrix[parentRole] !== 'object') {
      commissionMatrix[parentRole] = {}
    }
    matrixBuyerRoles.forEach((buyerRole) => {
      const rawValue = source?.[parentRole]?.[buyerRole]
      commissionMatrix[parentRole][buyerRole] = Number.isFinite(Number(rawValue)) ? Number(rawValue) : defaults[parentRole][buyerRole]
    })
  })
}

function buildCommissionMatrixPayload() {
  const payload = {}
  matrixParentRoles.forEach((parentRole) => {
    payload[parentRole] = {}
    matrixBuyerRoles.forEach((buyerRole) => {
      payload[parentRole][buyerRole] = Math.max(0, Number(commissionMatrix[parentRole]?.[buyerRole] || 0))
    })
  })
  return payload
}

function buildPeerBonusPayload() {
  const payload = {
    enabled: peerBonus.enabled,
    default_version: peerBonus.default_version,
    cooldown_days: Number(peerBonus.cooldown_days) || 0,
    refund_dev_fee_pct: Number(peerBonus.refund_dev_fee_pct) || 0,
    social: {},
    team: {}
  }
  peerBonusLevels.forEach((level) => {
    payload.social[`level_${level}`] = { pct: Number(peerBonus.social[`level_${level}`].pct) || 0 }
    payload.team[`level_${level}`] = {
      cash: Number(peerBonus.team[`level_${level}`].cash) || 0,
      exchange_coupons: Number(peerBonus.team[`level_${level}`].exchange_coupons) || 0,
      coupon_product_value: Number(peerBonus.team[`level_${level}`].coupon_product_value) || 0,
      unlock_reward: Number(peerBonus.team[`level_${level}`].unlock_reward) || 0,
      exchange_title: String(peerBonus.team[`level_${level}`].exchange_title || '').trim(),
      allowed_product_ids: parseIdText(peerBonus.team[`level_${level}`].allowed_product_ids_text),
      allowed_sku_ids: parseIdText(peerBonus.team[`level_${level}`].allowed_sku_ids_text)
    }
  })
  return payload
}

async function withLoading(flagRef, task) {
  flagRef.value = true
  try {
    return await task()
  } finally {
    flagRef.value = false
  }
}

const previewChain = reactive({ buyerRole: 1, parentRole: 1, gpRole: 2 })
const previewPaid = ref(399)
const previewParentRoleOptions = [
  { v: 1, l: 'Lv1 · C1 初级代理' },
  { v: 2, l: 'Lv2 · C2 高级代理' },
  { v: 3, l: 'Lv3 · B1 推广合伙人' },
  { v: 4, l: 'Lv4 · B2 运营合伙人' }
]
const previewIndirectRoleOptions = [
  { v: 0, l: '无（不计算）' },
  { v: 2, l: 'Lv2 · C2' },
  { v: 3, l: 'Lv3 · B1' }
]

function clampPctMap(map, role) {
  const n = Number(map?.[role])
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

const middlePreview = computed(() => {
  const paid = Math.max(0, Number(previewPaid.value) || 0)
  const rows = []
  let total = 0
  if (paid <= 0) return { rows, totalMiddle: 0, rest: 0 }
  const buyerRole = Number(previewChain.buyerRole || 0)
  const directPct = clampPctMap(commissionMatrix[previewChain.parentRole], buyerRole)
  const directAmt = Math.round(paid * directPct) / 100
  if (directAmt > 0) {
    rows.push({ key: 'd', layer: '直推', roleLabel: ROLE_NAMES[previewChain.parentRole], rateLabel: `${directPct}%`, amount: directAmt })
    total += directAmt
  }
  const gpTotalPct = clampPctMap(commissionMatrix[previewChain.gpRole], buyerRole)
  const indirectPct = Math.max(0, gpTotalPct - directPct)
  const indirectAmt = Math.round(paid * indirectPct) / 100
  if (indirectAmt > 0) {
    rows.push({ key: 'g', layer: '二级', roleLabel: ROLE_NAMES[previewChain.gpRole], rateLabel: `${indirectPct}%`, amount: indirectAmt })
    total += indirectAmt
  }
  total = Math.round(total * 100) / 100
  return { rows, totalMiddle: total, rest: Math.max(0, Math.round((paid - total) * 100) / 100) }
})

const previewBarSegments = computed(() => {
  const paid = Math.max(0, Number(previewPaid.value) || 0)
  if (paid <= 0) return []
  const { rows, rest } = middlePreview.value
  const colorMap = { d: '#409eff', g: '#67c23a', t: '#e6a23c' }
  const result = rows.map((row) => ({
    key: row.key,
    flex: row.amount / paid,
    pctLabel: `${((row.amount / paid) * 100).toFixed(1)}%`,
    color: colorMap[row.key] || '#409eff',
    tip: `${row.layer} ¥${row.amount.toFixed(2)}`
  }))
  if (rest > 0) {
    result.push({ key: 'rest', flex: rest / paid, pctLabel: `${((rest / paid) * 100).toFixed(1)}%`, color: '#e4e7ed', tip: `其余 ¥${rest.toFixed(2)}` })
  }
  return result
})

const costSplitSumPct = computed(() => {
  const cs = commission.cost_split || {}
  return (Number(cs.direct_sales_pct) || 0) + (Number(cs.operations_pct) || 0) + (Number(cs.mirror_operations_pct) || 0) + (Number(cs.profit_pct) || 0)
})

const resolveApiData = async (fn) => {
  const res = await fn()
  return res?.data || res || {}
}

const configLoaders = {
  commission: async () => {
    const [configData, matrixData] = await Promise.all([
      resolveApiData(getCommissionConfig),
      resolveApiData(getCommissionMatrix)
    ])
    deepAssign(commission, configData)
    mergeCommissionMatrixFromApi(matrixData)
  },
  peer: async () => {
    const data = await resolveApiData(getMemberTierConfig)
    mergePeerBonusFromApi(data.peer_bonus || {})
  },
  assist: async () => deepAssign(assistBonus, await resolveApiData(getAssistBonusConfig)),
  fund: async () => deepAssign(fundPool, await resolveApiData(getFundPoolConfig)),
  dividendRules: async () => deepAssign(dividendRules, await resolveApiData(getDividendRulesConfig)),
  exitRules: async () => deepAssign(exitRules, await resolveApiData(getExitRulesConfig)),
  recharge: async () => deepAssign(rechargeConfig, await resolveApiData(getRechargeConfig))
}

const loadAll = async () => {
  const keys = Object.keys(configLoaders)
  const results = await Promise.allSettled(keys.map((key) => configLoaders[key]()))
  failedConfigKeys.value = results.map((result, index) => (result.status === 'rejected' ? keys[index] : null)).filter(Boolean)
}

const save = async (key) => {
  if (failedConfigKeys.value.includes(key)) {
    ElMessage.warning(`「${configLabels[key] || key}」加载失败，当前默认值不可直接保存`)
    return
  }
  await withLoading(saving, async () => {
    if (key === 'commission') {
      await updateCommissionConfig(JSON.parse(JSON.stringify(commission)))
      await updateCommissionMatrix(buildCommissionMatrixPayload())
    }
    if (key === 'assist') await updateAssistBonusConfig(JSON.parse(JSON.stringify(assistBonus)))
    if (key === 'fund') await updateFundPoolConfig(JSON.parse(JSON.stringify(fundPool)))
    if (key === 'dividendRules') await updateDividendRulesConfig(JSON.parse(JSON.stringify(dividendRules)))
    if (key === 'exitRules') await updateExitRulesConfig(JSON.parse(JSON.stringify(exitRules)))
    if (key === 'recharge') await updateRechargeConfig(JSON.parse(JSON.stringify(rechargeConfig)))
    ElMessage.success('保存成功')
  }).catch(() => ElMessage.error('保存失败'))
}

const goMembershipPeerBonus = () => {
  router.push('/membership')
}

const previewDividend = async () => {
  if (!dividendYear.value || dividendPool.value <= 0) return ElMessage.warning('请选择年份并填写金额')
  await withLoading(dividendLoading, async () => {
    const res = await getDividendPreview({ year: dividendYear.value, pool: dividendPool.value })
    dividendPreviewData.value = res?.list || res?.data?.list || []
  }).catch(() => ElMessage.error('预览失败'))
}

const confirmExecuteDividend = async () => {
  if (!isSuperAdmin.value) return ElMessage.warning('仅超级管理员可执行实际分红发放')
  try {
    await ElMessageBox.confirm(`确认发放 ${dividendYear.value} 年度分红 ¥${dividendPool.value}？`, '确认', { type: 'warning' })
    await withLoading(dividendExecuting, async () => {
      const res = await executeDividend({ year: Number(dividendYear.value), pool: dividendPool.value })
      ElMessage.success(`已发放 ¥${res?.totalDistributed ?? res?.data?.totalDistributed ?? 0}`)
      dividendPreviewData.value = []
    })
  } catch (_) {}
}

const executePartnerExit = async () => {
  if (!canManageExit.value) return ElMessage.warning('当前账号无权发起退出流程')
  if (!exitForm.userId) return ElMessage.warning('请输入用户ID')
  exitResult.value = null
  await withLoading(exitLoading, async () => {
    const res = await createExitApplication(exitForm.userId, { reason: exitForm.reason })
    exitResult.value = res
    ElMessage.success('退出申请已创建，请在流程中继续审核')
  }).catch((e) => ElMessage.error(e?.message || '执行失败'))
}

onMounted(loadAll)

</script>

<style scoped>
.finance-rules-panel { padding: 0; }
.card-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.header-actions { display: flex; gap: 8px; align-items: center; }
.unit-suffix { margin-left: 8px; font-size: 13px; color: #606266; }
.preview-bar-caption { font-size: 12px; color: #909399; margin: 10px 0 6px; }
.preview-bar { display: flex; height: 32px; border-radius: 6px; overflow: hidden; border: 1px solid #ebeef5; }
.preview-bar-seg { display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; min-width: 2px; padding: 0 2px; color: #fff; }
.preview-table { margin-top: 12px; width: 100%; }
.level-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 16px; }
.level-card { border-radius: 8px; }
.rank-row { margin-left: 200px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
@media (max-width: 1200px) {
  .level-grid { grid-template-columns: 1fr; }
  .rank-row { margin-left: 0; }
}
</style>
