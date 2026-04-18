<template>
  <div class="membership-page">
    <el-tabs v-model="activeTab">

      <!-- Tab 1: 会员等级 -->
      <el-tab-pane label="会员等级" name="levels">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>会员等级定义</span>
              <el-button type="primary" @click="saveLevels" :loading="savingLevels">保存配置</el-button>
            </div>
          </template>

          <el-alert
            type="info"
            :closable="false"
            style="margin-bottom:12px"
            title="这里只维护等级名称、概况说明与权益描述；成交价统一按商品标价结算，角色差异体现在积分和团队权益。"
          />

          <div class="level-grid">
            <el-card v-for="lv in memberLevels" :key="lv.level" class="level-card" shadow="hover">
              <div class="level-header">
                <el-tag :style="{ background: lv.color, color: '#fff', border: 'none' }" size="large">
                  Lv.{{ lv.level }}
                </el-tag>
                <el-color-picker v-model="lv.color" size="small" style="margin-left:8px" />
              </div>
              <el-form label-position="top" style="margin-top:12px">
                <el-form-item label="等级名称">
                  <el-input v-model="lv.name" placeholder="如：VIP用户" />
                </el-form-item>
                <el-form-item label="描述">
                  <el-input v-model="lv.description" type="textarea" :rows="2" placeholder="该等级的权益说明" />
                </el-form-item>
                <el-form-item label="真实规则摘要">
                  <div class="level-rule-summary">{{ getUpgradeSummary(lv.level) }}</div>
                </el-form-item>
              </el-form>
            </el-card>
          </div>

        </el-card>
      </el-tab-pane>

      <!-- Tab 2: 成长规则 -->
      <el-tab-pane label="成长规则" name="growth">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>用户成长值获取规则</span>
              <el-button type="primary" @click="saveLevels" :loading="savingLevels">保存配置</el-button>
            </div>
          </template>
          <el-form label-width="220px" style="max-width:820px">
            <el-divider content-position="left">下单消费（全场）</el-divider>
            <el-alert type="info" :closable="false" style="margin-bottom:12px" title="支付成功后，默认按订单实付金额（total_amount）取整作为成长基数，与「消费积分」同一取整规则：每 1 元对应 1 点基数；再乘以下倍数并加每单固定值。商品管理里可设置「成长值奖励」覆盖为按件固定基数。" />
            <el-form-item label="消费获得成长值">
              <el-switch v-model="growthRules.purchase.enabled" active-text="开启" inactive-text="关闭" />
            </el-form-item>
            <el-form-item label="每 1 元实付对应成长值">
              <el-input-number v-model="growthRules.purchase.multiplier" :min="0" :max="100" :step="0.1" :precision="2" style="width:160px" />
              <span class="form-hint">默认 1 即全场消费 1 元累计 1 成长值（取整后）</span>
            </el-form-item>
            <el-form-item label="每单额外成长值">
              <el-input-number v-model="growthRules.purchase.fixed" :min="0" :max="999999" style="width:160px" />
            </el-form-item>
            <el-divider content-position="left">权益口径说明</el-divider>
            <el-alert
              type="warning"
              :closable="false"
              style="margin-bottom:12px"
              title="成长值与角色等级仅影响积分与团队权益，不再影响订单成交价。"
            />
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- Tab 3: 成长值特权档位（积分中心） / 积分任务分值 -->
      <el-tab-pane label="成长值等级" name="points">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>小程序「积分中心·等级特权」（按成长值定档）</span>
              <div class="header-actions">
                <el-button type="primary" plain @click="addPointLevel">新增一档</el-button>
                <el-button type="primary" @click="saveLevels" :loading="savingLevels">保存配置</el-button>
              </div>
            </div>
          </template>
          <el-alert
            type="info"
            :closable="false"
            style="margin-bottom:12px"
            title="与可消费积分无关：此处阶梯按用户「成长值」（消费/任务等累计，见成长规则）划分特权档位，控制积分中心「等级特权」列表与名称；积分余额仍用于抽奖、活动购、积分抵扣等。最高档「上限」留空表示无上限（显示为 xxx+）。"
          />
          <el-table :data="pointLevels" border size="small">
            <el-table-column label="档位" width="90">
              <template #default="{ row }">
                <el-input-number v-model="row.level" :min="1" :step="1" controls-position="right" style="width:100%" />
              </template>
            </el-table-column>
            <el-table-column label="名称" min-width="120">
              <template #default="{ row }">
                <el-input v-model="row.name" placeholder="如：体验官" />
              </template>
            </el-table-column>
            <el-table-column label="成长值下限（含）" width="140">
              <template #default="{ row }">
                <el-input-number v-model="row.min" :min="0" :step="1" controls-position="right" style="width:100%" />
              </template>
            </el-table-column>
            <el-table-column label="成长值上限（含，空=无上限）" width="210">
              <template #default="{ row }">
                <el-input v-model="row.maxInput" placeholder="留空则无上限" clearable />
              </template>
            </el-table-column>
            <el-table-column label="特权说明（逗号分隔）" min-width="200">
              <template #default="{ row }">
                <el-input v-model="row.perksText" placeholder="如：全场包邮，新品试用" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80" fixed="right">
              <template #default="{ $index }">
                <el-button text type="danger" :disabled="pointLevels.length <= 1" @click="removePointLevel($index)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <el-divider content-position="left">积分任务 / 签到分值</el-divider>
          <el-form label-width="200px" style="max-width:920px" size="small">
            <el-form-item label="订单积分抵扣">
              <el-input-number v-model="pointRules.deduction.yuan_per_point" :min="0.01" :step="0.01" :precision="2" style="width:140px" />
              <span class="form-hint">每 1 积分可抵扣金额，默认 0.10 元（即 1:10 兑换，1积分=0.1元）</span>
            </el-form-item>
            <el-form-item label="最高抵扣比例">
              <el-input-number v-model="pointRules.deduction.max_order_ratio" :min="0.01" :max="1" :step="0.05" :precision="2" style="width:140px" />
              <span class="form-hint">
                按券后商品金额计算，如 0.70 表示最多抵扣 70%；
                小程序结算页将显示：「1积分抵 {{ pointRules.deduction.yuan_per_point }} 元，最多抵扣订单 {{ Math.round(pointRules.deduction.max_order_ratio * 100) }}%」
              </span>
            </el-form-item>
            <el-form-item>
              <el-alert type="info" :closable="false" style="max-width:520px">
                <template #title>
                  优惠券和积分共同抵扣时，先扣券再按剩余金额计算积分上限；
                  商品关闭「允许积分抵扣」后，整单积分功能不可用，与此处比例无关。
                </template>
              </el-alert>
            </el-form-item>
            <el-divider content-position="left">复购积分倍率（按每消费100元）</el-divider>
            <div class="form-tip" style="margin-bottom:12px">影响路径：订单支付回调发分；这里填写的是每消费 100 元赠送的积分数。</div>
            <el-form-item label="VIP用户">
              <el-input-number v-model="pointRules.purchase_multiplier_by_role[0]" :min="0" :step="1" style="width:140px" />
            </el-form-item>
            <el-form-item label="初级会员">
              <el-input-number v-model="pointRules.purchase_multiplier_by_role[1]" :min="0" :step="1" style="width:140px" />
            </el-form-item>
            <el-form-item label="高级会员">
              <el-input-number v-model="pointRules.purchase_multiplier_by_role[2]" :min="0" :step="1" style="width:140px" />
            </el-form-item>
            <el-form-item label="推广合伙人">
              <el-input-number v-model="pointRules.purchase_multiplier_by_role[3]" :min="0" :step="1" style="width:140px" />
            </el-form-item>
            <el-form-item label="运营合伙人">
              <el-input-number v-model="pointRules.purchase_multiplier_by_role[4]" :min="0" :step="1" style="width:140px" />
            </el-form-item>
            <el-form-item label="区域合伙人">
              <el-input-number v-model="pointRules.purchase_multiplier_by_role[5]" :min="0" :step="1" style="width:140px" />
            </el-form-item>
            <el-form-item label="线下实体门店">
              <el-input-number v-model="pointRules.purchase_multiplier_by_role[6]" :min="0" :step="1" style="width:140px" />
            </el-form-item>
            <el-form-item label="每日签到">
              <el-input-number v-model="pointRules.checkin.points" :min="0" style="width:140px" />
              <span class="form-hint">影响路径：积分任务页 / 每日签到</span>
            </el-form-item>
            <el-form-item label="连续签到满7天额外奖励">
              <el-input-number v-model="pointRules.checkin_streak.points" :min="0" style="width:140px" />
              <span class="form-hint">影响路径：签到第 {{ pointRules.checkin_streak.streak_days || 7 }} 天额外奖励</span>
            </el-form-item>
            <el-form-item label="写文字评价">
              <el-input-number v-model="pointRules.review.points" :min="0" style="width:140px" />
              <span class="form-hint">影响路径：订单评价提交后发分；晒单默认沿用文字评价分值</span>
            </el-form-item>
            <el-form-item label="邀请新用户">
              <el-input-number v-model="pointRules.invite_success.points" :min="0" style="width:140px" />
              <span class="form-hint">影响路径：新用户首次注册并绑定邀请关系后发分</span>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="升级奖励" name="peerBonus">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>平级奖与兑换券绑定</span>
              <div class="header-actions">
                <el-button type="warning" plain :loading="backfillingExchangeCoupons" @click="onBackfillExchangeCoupons">补绑历史兑换券</el-button>
                <el-button type="primary" @click="saveLevels" :loading="savingLevels">保存配置</el-button>
              </div>
            </div>
          </template>
          <el-alert
            type="info"
            :closable="false"
            style="margin-bottom:12px"
            title="团队版平级奖会按这里的配置发放现金和 exchange 兑换券。兑换券必须绑定商品后才可兑换，右上角可一键补绑历史券。"
          />
          <el-form label-width="200px" style="max-width:920px">
            <el-form-item label="平级奖总开关">
              <el-switch v-model="peerBonus.enabled" />
            </el-form-item>
            <el-form-item label="默认发放版本">
              <el-radio-group v-model="peerBonus.default_version">
                <el-radio-button label="team">团队版</el-radio-button>
                <el-radio-button label="social">社会版</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="犹豫期（天）">
              <el-input-number v-model="peerBonus.cooldown_days" :min="0" :step="1" />
            </el-form-item>
            <el-form-item label="退款开发费比例（%）">
              <el-input-number v-model="peerBonus.refund_dev_fee_pct" :min="0" :step="0.1" :precision="1" />
            </el-form-item>
          </el-form>

          <div class="level-grid" style="margin-top:16px">
            <el-card v-for="level in peerBonusLevels" :key="level" class="level-card" shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>Lv.{{ level }} 平级奖</span>
                </div>
              </template>
              <el-form label-position="top">
                <el-form-item label="社会版现金比例（%）">
                  <el-input-number v-model="peerBonus.social['level_' + level].pct" :min="0" :step="1" style="width:100%" />
                </el-form-item>
                <el-form-item label="团队版现金（元）">
                  <el-input-number v-model="peerBonus.team['level_' + level].cash" :min="0" :step="1" style="width:100%" />
                </el-form-item>
                <el-form-item label="兑换券张数">
                  <el-input-number v-model="peerBonus.team['level_' + level].exchange_coupons" :min="0" :step="1" style="width:100%" />
                </el-form-item>
                <el-form-item label="券面货值（元）">
                  <el-input-number v-model="peerBonus.team['level_' + level].coupon_product_value" :min="0" :step="1" style="width:100%" />
                </el-form-item>
                <el-form-item label="解锁收益（元）">
                  <el-input-number v-model="peerBonus.team['level_' + level].unlock_reward" :min="0" :step="1" style="width:100%" />
                </el-form-item>
                <el-form-item label="兑换券标题">
                  <el-input v-model="peerBonus.team['level_' + level].exchange_title" placeholder="留空则用默认标题" />
                </el-form-item>
                <el-form-item label="允许兑换商品ID（逗号分隔）">
                  <el-input v-model="peerBonus.team['level_' + level].allowed_product_ids_text" type="textarea" :rows="2" placeholder="如：6,8,12" />
                </el-form-item>
                <el-form-item label="允许兑换SKU ID（逗号分隔，可选）">
                  <el-input v-model="peerBonus.team['level_' + level].allowed_sku_ids_text" type="textarea" :rows="2" placeholder="如：sku_a,sku_b" />
                </el-form-item>
              </el-form>
            </el-card>
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { backfillExchangeCoupons, getMemberTierConfig, updateMemberTierConfig } from '@/api'

const activeTab = ref('levels')
const savingLevels = ref(false)
const backfillingExchangeCoupons = ref(false)
const peerBonusLevels = [3, 4, 5]

const defaultPointLevels = () => [
  { level: 1, name: '体验官', min: 0, maxInput: '100', perksText: '全场包邮' },
  { level: 2, name: '品质会员', min: 101, maxInput: '500', perksText: '敬请期待' },
  { level: 3, name: '精选达人', min: 501, maxInput: '2000', perksText: '敬请期待' },
  { level: 4, name: '首席鉴赏家', min: 2001, maxInput: '', perksText: '敬请期待' }
]

const pointLevels = ref(defaultPointLevels())

const pointRules = reactive({
  deduction: { yuan_per_point: 0.1, max_order_ratio: 0.7 },
  purchase_multiplier_by_role: { 0: 50, 1: 100, 2: 150, 3: 300, 4: 400, 5: 500, 6: 500 },
  review: { points: 10, remark: '写评价获得积分' },
  checkin: { points: 5, remark: '每日签到' },
  checkin_streak: { points: 50, streak_days: 7, remark: '连续签到7天奖励' },
  invite_success: { points: 50, remark: '成功邀请新用户加入团队' }
})

const growthRules = reactive({
  purchase: { enabled: true, multiplier: 1, fixed: 0, use_original_amount: false }
})

const upgradeRules = reactive({
  enabled: true,
  c1_min_purchase: 299,
  c2_referee_count: 2,
  c2_min_sales: 580,
  b1_referee_count: 10,
  b1_recharge: 3000,
  b2_referee_count: 10,
  b2_recharge: 30000,
  b3_referee_b2_count: 3,
  b3_referee_b1_count: 30,
  b3_recharge: 198000,
  effective_order_days: 7
})

function defaultPeerBonusConfig() {
  return {
    enabled: true,
    default_version: 'team',
    cooldown_days: 90,
    refund_dev_fee_pct: 1.5,
    social: {
      level_3: { pct: 10 },
      level_4: { pct: 20 },
      level_5: { pct: 20 }
    },
    team: {
      level_3: { cash: 100, exchange_coupons: 2, coupon_product_value: 399, unlock_reward: 160, exchange_title: '', allowed_product_ids_text: '', allowed_sku_ids_text: '' },
      level_4: { cash: 2400, exchange_coupons: 15, coupon_product_value: 399, unlock_reward: 160, exchange_title: '', allowed_product_ids_text: '', allowed_sku_ids_text: '' },
      level_5: { cash: 0, exchange_coupons: 0, coupon_product_value: 0, unlock_reward: 0, exchange_title: '', allowed_product_ids_text: '', allowed_sku_ids_text: '' }
    }
  }
}

const peerBonus = reactive(defaultPeerBonusConfig())

const defaultGrowthTiers = () => [
  { min: 0, discount: 1, name: 'VIP用户', desc: '基础积分权益' },
  { min: 299, discount: 1, name: '初级会员', desc: '成长值提升后解锁更多积分权益' },
  { min: 580, discount: 1, name: '高级会员', desc: '成长值提升后解锁更多积分权益' },
  { min: 3000, discount: 1, name: '推广合伙人', desc: '享受团队与复购积分权益' },
  { min: 30000, discount: 1, name: '运营合伙人', desc: '享受团队与复购积分权益' },
  { min: 198000, discount: 1, name: '区域合伙人', desc: '享受团队与复购积分权益' }
]

const growthTiers = ref(defaultGrowthTiers())

const memberLevels = ref([
  { level: 0, name: 'VIP用户', description: '注册后进入基础会员层级，普通品复购每消费 100 元赠送 50 积分。', color: '#909399', price_tier: 'retail', commission_type: 'none', discount_rate: 1 },
  { level: 1, name: '初级会员', description: '消费满 299 元升级，解锁更高积分权益。', color: '#409EFF', price_tier: 'member', commission_type: 'level1', discount_rate: 1 },
  { level: 2, name: '高级会员', description: '满足成长与推荐条件后升级，解锁更高积分权益。', color: '#67c23a', price_tier: 'leader', commission_type: 'level2', discount_rate: 1 },
  { level: 3, name: '推广合伙人', description: '推荐或充值达标后升级，享团队与复购积分权益。', color: '#E6A23C', price_tier: 'agent', commission_type: 'level2', discount_rate: 1 },
  { level: 4, name: '运营合伙人', description: '推荐或充值达标后升级，享区域运营权益。', color: '#F56C6C', price_tier: 'agent', commission_type: 'level2', discount_rate: 1 },
  { level: 5, name: '区域合伙人', description: '团队达标后升级，享更高层级团队权益。', color: '#9B59B6', price_tier: 'agent', commission_type: 'level2', discount_rate: 1 },
  { level: 6, name: '线下实体门店', description: '线下实体门店身份由后台人工认定，不参与自动成长升级。', color: '#0F766E', price_tier: 'agent', commission_type: 'none', discount_rate: 1 },
])

const normalizeCommissionType = (value) => {
  const normalized = String(value || '').trim()
  if (normalized === 'level3') return 'level2'
  return ['none', 'level1', 'level2'].includes(normalized) ? normalized : 'none'
}

const mergePointRulesFromApi = (from) => {
  if (!from || typeof from !== 'object') return
  for (const key of Object.keys(pointRules)) {
    if (from[key] && typeof from[key] === 'object') {
      Object.assign(pointRules[key], from[key])
    }
  }
}

const mergePeerBonusFromApi = (from) => {
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

const buildPeerBonusPayload = () => {
  const payload = {
    enabled: peerBonus.enabled,
    default_version: peerBonus.default_version,
    cooldown_days: Number(peerBonus.cooldown_days) || 0,
    refund_dev_fee_pct: Number(peerBonus.refund_dev_fee_pct) || 0,
    social: {},
    team: {}
  }
  peerBonusLevels.forEach((level) => {
    payload.social[`level_${level}`] = {
      pct: Number(peerBonus.social[`level_${level}`].pct) || 0
    }
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

const getUpgradeSummary = (level) => {
  if (level === 0) return '注册进入基础会员层，普通品复购每消费 100 元赠送 50 积分。'
  if (level === 1) return `消费满 ${upgradeRules.c1_min_purchase} 元升级。`
  if (level === 2) return `直推 ${upgradeRules.c2_referee_count} 个 C1 且销售满 ${upgradeRules.c2_min_sales} 元升级。`
  if (level === 3) return `推荐 ${upgradeRules.b1_referee_count} 个 C1 或充值 ${upgradeRules.b1_recharge} 元升级。`
  if (level === 4) return `推荐 ${upgradeRules.b2_referee_count} 个 B1 或充值 ${upgradeRules.b2_recharge} 元升级。`
  if (level === 5) return `推荐 ${upgradeRules.b3_referee_b2_count} 个 B2 或 ${upgradeRules.b3_referee_b1_count} 个 B1，或充值 ${upgradeRules.b3_recharge} 元升级。`
  if (level === 6) return '线下实体门店由后台人工认定，不走自动升级规则。'
  return '按后台真实规则执行。'
}

const loadConfig = async () => {
  try {
    const res = await getMemberTierConfig()
    const d = res?.data || res || {}
    if (Array.isArray(d.member_levels) && d.member_levels.length) {
      memberLevels.value = d.member_levels.map((item) => ({
        ...item,
        commission_type: normalizeCommissionType(item.commission_type),
        discount_rate: 1
      }))
    }
    if (d.growth_rules) Object.assign(growthRules, d.growth_rules)
    if (d.upgrade_rules && typeof d.upgrade_rules === 'object') Object.assign(upgradeRules, d.upgrade_rules)
    if (Array.isArray(d.growth_tiers) && d.growth_tiers.length) {
      growthTiers.value = d.growth_tiers
        .map((r) => ({
          min: Number(r.min) || 0,
          discount: Number.isFinite(Number(r.discount)) ? Number(r.discount) : 1,
          name: String(r.name || '').trim(),
          desc: String(r.desc || '').trim()
        }))
        .sort((a, b) => a.min - b.min)
    }

    if (Array.isArray(d.point_levels) && d.point_levels.length) {
      pointLevels.value = d.point_levels.map((lv) => ({
        level: lv.level,
        name: lv.name,
        min: lv.min,
        maxInput: lv.max === null || lv.max === undefined || lv.max === '' ? '' : String(lv.max),
        perksText: Array.isArray(lv.perks) ? lv.perks.join('，') : ''
      }))
    }
    mergePointRulesFromApi(d.point_rules)
    mergePeerBonusFromApi(d.peer_bonus)
  } catch (e) { console.error(e) }
}

const addPointLevel = () => {
  const maxLv = Math.max(0, ...pointLevels.value.map((r) => Number(r.level) || 0))
  const maxMin = Math.max(0, ...pointLevels.value.map((r) => Number(r.min) || 0))
  pointLevels.value.push({
    level: maxLv + 1,
    name: '新等级',
    min: maxMin + 1,
    maxInput: '',
    perksText: ''
  })
}

const removePointLevel = (idx) => {
  if (pointLevels.value.length <= 1) return
  pointLevels.value.splice(idx, 1)
}

const buildPointLevelsPayload = () => {
  return pointLevels.value.map((row, idx) => {
    const level = parseInt(row.level, 10)
    const min = parseInt(row.min, 10)
    if (!Number.isFinite(level) || level < 1) {
      throw new Error(`成长值等级第 ${idx + 1} 行：档位序号须为 ≥1 的整数`)
    }
    if (!Number.isFinite(min) || min < 0) {
      throw new Error(`成长值等级第 ${idx + 1} 行：成长值下限须为 ≥0 的整数`)
    }
    let max = null
    if (row.maxInput !== '' && row.maxInput != null) {
      max = Math.floor(Number(row.maxInput))
      if (!Number.isFinite(max)) {
        throw new Error(`成长值等级第 ${idx + 1} 行：成长值上限须为数字或留空`)
      }
      if (max < min) {
        throw new Error(`成长值等级第 ${idx + 1} 行：成长值上限不能小于下限`)
      }
    }
    const perks = String(row.perksText || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean)
    return {
      level,
      name: String(row.name || '').trim() || `等级${level}`,
      min,
      max,
      perks
    }
  }).sort((a, b) => a.min - b.min || a.level - b.level)
}

const normalizeGrowthTiersPayload = () => {
  return growthTiers.value.map((row, idx) => {
    const min = Number(row.min)
    const discount = Number(row.discount)
    if (!Number.isFinite(min) || min < 0) {
      throw new Error(`成长值等级阶梯第 ${idx + 1} 行：成长值下限须 ≥0`)
    }
    if (!Number.isFinite(discount) || discount <= 0 || discount > 1) {
      throw new Error(`成长值等级阶梯第 ${idx + 1} 行：权益系数须在 (0,1]`)
    }
    return {
      min,
      discount: Number(discount.toFixed(4)),
      name: String(row.name || '').trim(),
      desc: String(row.desc || '').trim()
    }
  }).sort((a, b) => a.min - b.min)
}

const addGrowthTierRow = () => {
  const maxMin = Math.max(0, ...growthTiers.value.map((r) => Number(r.min) || 0))
  growthTiers.value.push({
    min: maxMin + 1,
    discount: 1,
    name: '新档位',
    desc: ''
  })
  growthTiers.value.sort((a, b) => a.min - b.min)
}

const removeGrowthTierRow = (idx) => {
  if (growthTiers.value.length <= 1) return
  growthTiers.value.splice(idx, 1)
}

const saveLevels = async () => {
  savingLevels.value = true
  try {
    const normalizedPointLevels = buildPointLevelsPayload()
    const normalizedGrowthTiers = normalizeGrowthTiersPayload()
    await updateMemberTierConfig({
      member_levels: memberLevels.value.map((item) => ({
        ...item,
        commission_type: normalizeCommissionType(item.commission_type),
        discount_rate: 1
      })),
      growth_rules: growthRules,
      growth_tiers: normalizedGrowthTiers,
      upgrade_rules: JSON.parse(JSON.stringify(upgradeRules)),
      peer_bonus: buildPeerBonusPayload(),
      point_levels: normalizedPointLevels,
      point_rules: JSON.parse(JSON.stringify(pointRules))
    })
    ElMessage.success('配置已保存')
  } catch (e) {
    console.error(e)
    ElMessage.error(e?.message || '保存失败')
  }
  finally { savingLevels.value = false }
}

const onBackfillExchangeCoupons = async () => {
  backfillingExchangeCoupons.value = true
  try {
    const res = await backfillExchangeCoupons()
    const data = res?.data || res || {}
    ElMessage.success(`已补绑 ${data.updated || 0} 张历史兑换券${data.pending_bind ? `，其中 ${data.pending_bind} 张仍待绑定商品` : ''}`)
  } catch (e) {
    console.error(e)
    ElMessage.error(e?.message || '补绑失败')
  } finally {
    backfillingExchangeCoupons.value = false
  }
}

onMounted(loadConfig)
</script>

<style scoped>
.membership-page { padding: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.level-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.level-card { border-radius: 8px; }
.level-header { display: flex; align-items: center; }
.purchase-level-actions { margin-bottom: 10px; display: flex; justify-content: flex-end; }
.header-actions { display: flex; gap: 8px; align-items: center; }
.form-hint { margin-left: 12px; color: var(--el-text-color-secondary); font-size: 12px; }
.form-tip { color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.6; }
.level-rule-summary { color: var(--el-text-color-secondary); line-height: 1.6; }
@media (max-width: 1200px) { .level-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
