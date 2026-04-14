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
                  <el-input v-model="lv.name" placeholder="如：普通用户" />
                </el-form-item>
                <el-form-item label="描述">
                  <el-input v-model="lv.description" type="textarea" :rows="2" placeholder="该等级的权益说明" />
                </el-form-item>
                <el-form-item label="适用价格档位">
                  <el-select v-model="lv.price_tier" style="width:100%">
                    <el-option label="零售价 (retail_price)" value="retail" />
                    <el-option label="会员价 (price_member)" value="member" />
                    <el-option label="团长价 (price_leader)" value="leader" />
                    <el-option label="代理价 (price_agent)" value="agent" />
                  </el-select>
                </el-form-item>
                <el-form-item label="佣金级别">
                  <el-select v-model="lv.commission_type" style="width:100%">
                    <el-option label="不参与分销" value="none" />
                    <el-option label="直推佣金 (1级)" value="level1" />
                    <el-option label="间推佣金 (2级)" value="level2" />
                    <el-option label="三级佣金" value="level3" />
                  </el-select>
                </el-form-item>
                <el-form-item label="等级折扣率">
                  <el-input-number v-model="lv.discount_rate" :min="0.1" :max="1" :step="0.01" :precision="2" style="width:100%" />
                </el-form-item>
              </el-form>
            </el-card>
          </div>

          <el-divider content-position="left" style="margin-top:20px">拿货等级（仅价格权益）</el-divider>
          <el-alert
            type="info"
            :closable="false"
            title="拿货等级只影响拿货价，不参与代理佣金、团队关系与升级规则"
            style="margin-bottom:12px"
          />
          <div class="purchase-level-actions">
            <el-button type="primary" plain @click="addPurchaseLevel">新增拿货等级</el-button>
          </div>
          <el-table :data="purchaseLevels" border size="small">
            <el-table-column label="编码" width="140">
              <template #default="{ row }">
                <el-input v-model="row.code" placeholder="如 P1" />
              </template>
            </el-table-column>
            <el-table-column label="名称" min-width="160">
              <template #default="{ row }">
                <el-input v-model="row.name" placeholder="如 拿货一级" />
              </template>
            </el-table-column>
            <el-table-column label="价格档位" width="180">
              <template #default="{ row }">
                <el-select v-model="row.price_tier" style="width:100%">
                  <el-option label="零售价" value="retail" />
                  <el-option label="会员价" value="member" />
                  <el-option label="团长价" value="leader" />
                  <el-option label="代理价" value="agent" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="折扣系数" width="140">
              <template #default="{ row }">
                <el-input-number v-model="row.discount" :min="0.01" :max="1" :step="0.01" :precision="2" style="width:100%" />
              </template>
            </el-table-column>
            <el-table-column label="启用" width="90">
              <template #default="{ row }">
                <el-switch v-model="row.enabled" />
              </template>
            </el-table-column>
            <el-table-column label="排序" width="110">
              <template #default="{ row }">
                <el-input-number v-model="row.sort" :min="0" :step="10" style="width:100%" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="90" fixed="right">
              <template #default="{ $index }">
                <el-button text type="danger" @click="removePurchaseLevel($index)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- Tab 2: 商业策略 -->
      <el-tab-pane label="商业策略" name="commerce">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>全局商业策略</span>
              <el-button type="primary" @click="saveLevels" :loading="savingLevels">保存配置</el-button>
            </div>
          </template>
          <el-form label-width="220px" style="max-width:820px">
            <el-form-item label="全场福利折扣开关">
              <el-switch v-model="commercePolicy.global_discount.enabled" />
            </el-form-item>
            <el-form-item label="全场福利折扣率">
              <el-input-number v-model="commercePolicy.global_discount.rate" :min="0.1" :max="1" :step="0.01" :precision="2" />
            </el-form-item>
            <el-form-item label="等级额外折扣开关">
              <el-switch v-model="commercePolicy.member_level_extra_discount.enabled" />
            </el-form-item>
            <el-divider content-position="left">代理门户</el-divider>
            <el-form-item label="Web门户最低登录等级">
              <el-select v-model="commercePolicy.portal_login.min_role_level" style="width:240px">
                <el-option v-for="lv in memberLevels" :key="lv.level" :label="`Lv.${lv.level} ${lv.name}`" :value="lv.level" />
              </el-select>
            </el-form-item>
            <el-form-item label="平台顶级代理补位">
              <el-switch v-model="commercePolicy.platform_top_agent.enabled" />
            </el-form-item>
            <el-form-item label="顶级代理用户ID">
              <el-input-number v-model="commercePolicy.platform_top_agent.user_id" :min="0" />
            </el-form-item>
            <el-form-item label="顶级代理名称">
              <el-input v-model="commercePolicy.platform_top_agent.name" placeholder="如：平台合伙人" style="max-width:260px;" />
            </el-form-item>
            <el-divider content-position="left">运费策略</el-divider>
            <el-form-item label="偏远地区加收运费">
              <el-switch v-model="commercePolicy.shipping.remote_region_extra_fee_enabled" />
            </el-form-item>
            <el-form-item label="偏远地区运费(元)">
              <el-input-number v-model="commercePolicy.shipping.remote_region_fee" :min="0" />
            </el-form-item>
            <el-form-item label="偏远地区关键字">
              <el-input v-model="remoteRegionsText" placeholder="如：新疆,西藏,内蒙古" />
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- Tab 3: 成长规则 -->
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
            <el-divider content-position="left">成长值达标 → 复购折扣（users.discount_rate）</el-divider>
            <el-alert type="warning" :closable="false" style="margin-bottom:12px" title="下列阶梯按用户累计成长值匹配，决定 discount_rate（与等级额外折扣策略叠加规则以商业策略为准）。数字越小折扣越大，如 0.9 表示 9 折。" />
            <div class="purchase-level-actions" style="margin-bottom:10px;">
              <el-button type="primary" plain size="small" @click="addGrowthTierRow">新增阶梯</el-button>
            </div>
            <el-table :data="growthTiers" border size="small" style="max-width:920px">
              <el-table-column label="成长值 ≥" width="120">
                <template #default="{ row }">
                  <el-input-number v-model="row.min" :min="0" :step="1" controls-position="right" style="width:100%" />
                </template>
              </el-table-column>
              <el-table-column label="折扣系数" width="120">
                <template #default="{ row }">
                  <el-input-number v-model="row.discount" :min="0.01" :max="1" :step="0.01" :precision="2" style="width:100%" />
                </template>
              </el-table-column>
              <el-table-column label="名称" min-width="120">
                <template #default="{ row }">
                  <el-input v-model="row.name" placeholder="档名称" />
                </template>
              </el-table-column>
              <el-table-column label="说明" min-width="160">
                <template #default="{ row }">
                  <el-input v-model="row.desc" placeholder="对外说明" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="80" fixed="right">
                <template #default="{ $index }">
                  <el-button text type="danger" :disabled="growthTiers.length <= 1" @click="removeGrowthTierRow($index)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-divider content-position="left">其它行为（固定值）</el-divider>
            <el-form-item label="签到成长值">
              <el-input-number v-model="growthRules.checkin.fixed" :min="0" />
            </el-form-item>
            <el-form-item label="评价成长值">
              <el-input-number v-model="growthRules.review.fixed" :min="0" />
            </el-form-item>
            <el-form-item label="砍价帮砍成长值">
              <el-input-number v-model="growthRules.slash_help.fixed" :min="0" />
            </el-form-item>
            <el-form-item label="砍价成功成长值">
              <el-input-number v-model="growthRules.slash_start.fixed" :min="0" />
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- Tab 4: 成长值特权档位（积分中心） / 积分任务分值 -->
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
            <el-form-item label="每日签到">
              <el-input-number v-model="pointRules.checkin.points" :min="0" style="width:140px" />
              <span class="form-hint">文案：{{ pointRules.checkin.remark }}</span>
            </el-form-item>
            <el-form-item label="连续签到满7天额外奖励">
              <el-input-number v-model="pointRules.checkin_streak.points" :min="0" style="width:140px" />
            </el-form-item>
            <el-form-item label="分享商品（每次）">
              <el-input-number v-model="pointRules.share.points" :min="0" style="width:140px" />
            </el-form-item>
            <el-form-item label="写文字评价">
              <el-input-number v-model="pointRules.review.points" :min="0" style="width:140px" />
            </el-form-item>
            <el-form-item label="图文评价（含晒图）">
              <el-input-number v-model="pointRules.review_image.points" :min="0" style="width:140px" />
              <span class="form-hint">用户提交评价时若带图，按此项发分并记流水类型 review_image；纯文字按「写文字评价」分值。</span>
            </el-form-item>
            <el-form-item label="发起拼团">
              <el-input-number v-model="pointRules.group_start.points" :min="0" style="width:140px" />
            </el-form-item>
            <el-form-item label="拼团成功（每人）">
              <el-input-number v-model="pointRules.group_success.points" :min="0" style="width:140px" />
            </el-form-item>
            <el-form-item label="邀请新用户（预留）">
              <el-input-number v-model="pointRules.invite_success.points" :min="0" style="width:140px" />
            </el-form-item>
            <el-form-item label="注册说明文案">
              <el-input v-model="pointRules.register.remark" type="textarea" :rows="2" placeholder="注册积分日志说明" />
            </el-form-item>
            <el-form-item label="消费积分说明（1元=1分仍为订单逻辑）">
              <el-input v-model="pointRules.purchase.remark" />
              <el-input-number v-model="pointRules.purchase.rate" :min="0" :step="0.1" :precision="2" style="margin-left:12px;width:120px" />
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getMemberTierConfig, updateMemberTierConfig } from '@/api'

const activeTab = ref('levels')
const savingLevels = ref(false)
const remoteRegionsText = ref('新疆,西藏,内蒙古,青海,宁夏,海南')

const purchaseLevels = ref([])

const defaultPointLevels = () => [
  { level: 1, name: '体验官', min: 0, maxInput: '100', perksText: '全场包邮' },
  { level: 2, name: '品质会员', min: 101, maxInput: '500', perksText: '敬请期待' },
  { level: 3, name: '精选达人', min: 501, maxInput: '2000', perksText: '敬请期待' },
  { level: 4, name: '首席鉴赏家', min: 2001, maxInput: '', perksText: '敬请期待' }
]

const pointLevels = ref(defaultPointLevels())

const pointRules = reactive({
  register: { points: 0, remark: '注册自动升级体验官，享全场包邮特权' },
  deduction: { yuan_per_point: 0.1, max_order_ratio: 0.7 },
  purchase: { rate: 1, remark: '消费积分（1元=1积分）' },
  share: { points: 5, remark: '分享商品获得积分' },
  review: { points: 10, remark: '写评价获得积分' },
  review_image: { points: 20, remark: '图文评价获得积分' },
  checkin: { points: 5, remark: '每日签到' },
  checkin_streak: { points: 50, remark: '连续签到7天奖励' },
  invite_success: { points: 50, remark: '成功邀请新用户加入团队' },
  group_start: { points: 10, remark: '发起拼团' },
  group_success: { points: 30, remark: '拼团成功奖励' }
})

const growthRules = reactive({
  purchase: { enabled: true, multiplier: 1, fixed: 0, use_original_amount: false },
  checkin: { enabled: true, multiplier: 0, fixed: 2, use_original_amount: false },
  review: { enabled: true, multiplier: 0, fixed: 5, use_original_amount: false },
  slash_help: { enabled: true, multiplier: 0, fixed: 2, use_original_amount: false },
  slash_start: { enabled: true, multiplier: 0, fixed: 3, use_original_amount: false }
})

const defaultGrowthTiers = () => [
  { min: 0, discount: 1, name: '普通用户', desc: '无折扣' },
  { min: 299, discount: 0.9, name: '初级代理', desc: '9折' },
  { min: 580, discount: 0.85, name: '高级代理', desc: '8.5折' },
  { min: 3000, discount: 1, name: '推广合伙人', desc: '原价（赚佣金）' },
  { min: 30000, discount: 1, name: '运营合伙人', desc: '原价（赚佣金）' },
  { min: 198000, discount: 1, name: '区域合伙人', desc: '原价（赚佣金）' }
]

const growthTiers = ref(defaultGrowthTiers())

const commercePolicy = reactive({
  global_discount: { enabled: false, rate: 1 },
  member_level_extra_discount: { enabled: true },
  portal_login: { min_role_level: 3 },
  platform_top_agent: { enabled: true, user_id: 0, name: '平台顶级代理' },
  shipping: {
    free_shipping_for_all_members: true,
    remote_region_extra_fee_enabled: true,
    remote_region_fee: 10,
    remote_regions: ['新疆', '西藏', '内蒙古', '青海', '宁夏', '海南']
  }
})

const memberLevels = ref([
  { level: 0, name: '普通用户', description: '注册用户', color: '#909399', price_tier: 'retail', commission_type: 'none', discount_rate: 1 },
  { level: 1, name: '初级代理', description: 'C1 购买299元产品升级，佣金80元/单，9折', color: '#409EFF', price_tier: 'member', commission_type: 'level1', discount_rate: 0.90 },
  { level: 2, name: '高级代理', description: 'C2 直推2个C2+销售满580，佣金120元/单，8.5折', color: '#67c23a', price_tier: 'leader', commission_type: 'level2', discount_rate: 0.85 },
  { level: 3, name: '推广合伙人', description: 'B1 推荐10个C2或缴纳3000，佣金160元/单，6折', color: '#E6A23C', price_tier: 'agent', commission_type: 'level3', discount_rate: 0.60 },
  { level: 4, name: '运营合伙人', description: 'B2 推荐10个B1或缴纳3万，佣金160元/单，6折', color: '#F56C6C', price_tier: 'agent', commission_type: 'level3', discount_rate: 0.60 },
  { level: 5, name: '区域合伙人', description: 'B3 缴纳19.8万，区域管理，5.5折', color: '#9B59B6', price_tier: 'agent', commission_type: 'level3', discount_rate: 0.55 },
])

const mergePointRulesFromApi = (from) => {
  if (!from || typeof from !== 'object') return
  for (const key of Object.keys(pointRules)) {
    if (from[key] && typeof from[key] === 'object') {
      Object.assign(pointRules[key], from[key])
    }
  }
}

const loadConfig = async () => {
  try {
    const res = await getMemberTierConfig()
    const d = res?.data || res || {}
    if (Array.isArray(d.member_levels) && d.member_levels.length) memberLevels.value = d.member_levels
    if (Array.isArray(d.purchase_levels)) purchaseLevels.value = d.purchase_levels
    if (d.growth_rules) Object.assign(growthRules, d.growth_rules)
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
    if (d.commerce_policy) Object.assign(commercePolicy, d.commerce_policy)
    remoteRegionsText.value = (commercePolicy.shipping?.remote_regions || []).join(',')

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

const addPurchaseLevel = () => {
  purchaseLevels.value.push({
    code: '',
    name: '',
    description: '',
    price_tier: 'member',
    discount: 1,
    enabled: true,
    sort: (purchaseLevels.value.length + 1) * 10
  })
}

const removePurchaseLevel = (idx) => {
  purchaseLevels.value.splice(idx, 1)
}

const normalizeGrowthTiersPayload = () => {
  return growthTiers.value.map((row, idx) => {
    const min = Number(row.min)
    const discount = Number(row.discount)
    if (!Number.isFinite(min) || min < 0) {
      throw new Error(`成长值折扣阶梯第 ${idx + 1} 行：成长值下限须 ≥0`)
    }
    if (!Number.isFinite(discount) || discount <= 0 || discount > 1) {
      throw new Error(`成长值折扣阶梯第 ${idx + 1} 行：折扣系数须在 (0,1]`)
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

const normalizePurchaseLevels = () => {
  const usedCodes = new Set()
  const tiers = new Set(['retail', 'member', 'leader', 'agent'])
  return purchaseLevels.value.map((item, idx) => {
    const code = String(item.code || '').trim()
    if (!code) throw new Error(`第 ${idx + 1} 行拿货等级编码不能为空`)
    if (usedCodes.has(code)) throw new Error(`拿货等级编码重复: ${code}`)
    usedCodes.add(code)

    const tier = String(item.price_tier || '').trim()
    if (!tiers.has(tier)) throw new Error(`第 ${idx + 1} 行价格档位无效`)

    const discount = Number(item.discount ?? 1)
    if (!Number.isFinite(discount) || discount <= 0 || discount > 1) {
      throw new Error(`第 ${idx + 1} 行折扣系数必须在 (0,1]`)
    }

    return {
      code,
      name: String(item.name || code).trim(),
      description: String(item.description || '').trim(),
      price_tier: tier,
      discount: Number(discount.toFixed(4)),
      enabled: item.enabled !== false,
      sort: Number.isFinite(Number(item.sort)) ? Number(item.sort) : 0
    }
  })
}

const saveLevels = async () => {
  savingLevels.value = true
  try {
    commercePolicy.shipping.remote_regions = remoteRegionsText.value.split(',').map(s => s.trim()).filter(Boolean)
    const normalizedPurchaseLevels = normalizePurchaseLevels()
    const normalizedPointLevels = buildPointLevelsPayload()
    const normalizedGrowthTiers = normalizeGrowthTiersPayload()
    await updateMemberTierConfig({
      member_levels: memberLevels.value,
      growth_rules: growthRules,
      growth_tiers: normalizedGrowthTiers,
      commerce_policy: commercePolicy,
      purchase_levels: normalizedPurchaseLevels,
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
@media (max-width: 1200px) { .level-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
