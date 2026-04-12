<template>
  <div class="settings-page">
    <el-card>
      <template #header>
        系统设置
      </template>

      <el-tabs v-model="activeTab">
        <!-- 基本信息 -->
        <el-tab-pane label="基本信息" name="basic">
          <BasicInfoPanel :system-status="systemStatus" />
        </el-tab-pane>

        <!-- 运营参数 -->
        <el-tab-pane label="运营参数" name="config">
          <OperationsConfigPanel
            :settings-form="settingsForm"
            :loading="settingsLoading"
            :saving="saving"
            :on-save="handleSaveSettings"
          />
        </el-tab-pane>

        <el-tab-pane label="小程序配置" name="miniProgram">
          <MiniProgramSettingsPanel
            :mini-program-form="miniProgramForm"
            :mini-program-loading="miniProgramLoading"
            :mini-program-saving="miniProgramSaving"
            :product-detail-pledge-keys="productDetailPledgeKeys"
            :product-detail-pledge-labels="productDetailPledgeLabels"
            :on-save="handleSaveMiniProgramConfig"
          />
        </el-tab-pane>

        <!-- 账号管理 -->
        <el-tab-pane label="账号管理" name="account">
          <AccountSettingsPanel
            :account-form="accountForm"
            :on-change-password="handleChangePassword"
          />
        </el-tab-pane>

        <!-- 告警通知 -->
        <el-tab-pane label="告警通知" name="alert">
          <AlertConfigPanel
            :alert-form="alertForm"
            :loading="alertLoading"
            :saving="alertSaving"
            :testing-ding="testingDing"
            :testing-wecom="testingWecom"
            :on-save="handleSaveAlert"
            :on-test="handleTestWebhook"
          />
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/store/user'
import { useRoute } from 'vue-router'
import { getSettings, updateSettings, getSystemStatus, getMiniProgramConfig, updateMiniProgramConfig, getAlertConfig, saveAlertConfig, testAlertWebhook } from '@/api'
import BasicInfoPanel from './components/BasicInfoPanel.vue'
import OperationsConfigPanel from './components/OperationsConfigPanel.vue'
import ProductDetailPledgesEditor from './components/ProductDetailPledgesEditor.vue'
import AccountSettingsPanel from './components/AccountSettingsPanel.vue'
import AlertConfigPanel from './components/AlertConfigPanel.vue'
import LightPromptModalsEditor from './components/LightPromptModalsEditor.vue'
import MiniProgramSettingsPanel from './components/MiniProgramSettingsPanel.vue'

const userStore = useUserStore()
const route = useRoute()
const validTabs = ['basic', 'config', 'miniProgram', 'account', 'alert']
const activeTab = ref(validTabs.includes(route.query.tab) ? route.query.tab : 'basic')
const settingsSnapshot = ref(null)
const settingsLoading = ref(false)
const saving = ref(false)

const systemStatus = ref({ status: 'ok' })
const miniProgramLoading = ref(false)
const miniProgramSaving = ref(false)
const settingsForm = reactive({
  commission_rate: 10,
  min_withdrawal: 100,
  auto_cancel_minutes: 30,
  auto_confirm_days: 7,
  user_default_avatar_url: '/admin/assets/images/default-avatar.svg',
  user_idle_guest_purge_days: 7
})

const DEFAULT_TAB_BAR = {
  color: '#64748B',
  selectedColor: '#C6A16E',
  backgroundColor: '#F8FCFD',
  borderStyle: 'white',
  items: [
    { index: 0, text: '商城首页' },
    { index: 1, text: '全部商品' },
    { index: 2, text: '热门活动' },
    { index: 3, text: '我的会员' }
  ]
}

/** 与后端 utils/miniprogramConfig.js PRODUCT_DETAIL_PLEDGE_ORDER 一致 */
const productDetailPledgeKeys = [
  'seven_day',
  'return_shipping',
  'brand_guarantee',
  'authentic',
  'shipping_promise',
  'after_sale'
]

const productDetailPledgeLabels = {
  seven_day: '7天无理由退货',
  return_shipping: '退货运费说明',
  brand_guarantee: '品牌保证',
  authentic: '官方正品',
  shipping_promise: '发货时效',
  after_sale: '售后无忧'
}

function createDefaultProductDetailPledges() {
  return {
    items: {
      seven_day: {
        enabled: true,
        title: '7天无理由退货',
        desc: '签收后 7 天内可申请售后（定制、鲜活易腐等依法不适用情形除外，以审核为准）。'
      },
      return_shipping: {
        enabled: true,
        title: '退货运费说明',
        desc: '因质量问题或发错货，退货运费由商家承担；无理由退货一般运费由买家承担，具体以售后审核为准。'
      },
      brand_guarantee: {
        enabled: true,
        title: '品牌保证',
        desc: '正规渠道供货，支持验货与平台/客服协助处理争议。'
      },
      authentic: {
        enabled: true,
        title: '官方正品',
        desc: '品牌授权或官方合作供应链，假劣投诉可联系客服处理。'
      },
      shipping_promise: {
        enabled: false,
        title: '发货时效',
        desc: '现货订单在付款后尽快发出；预售以商品页说明为准。'
      },
      after_sale: {
        enabled: true,
        title: '售后无忧',
        desc: '订单问题可联系在线客服，协助处理退换与物流咨询。'
      }
    }
  }
}

function ensureProductDetailPledgesShape(form) {
  const base = createDefaultProductDetailPledges()
  if (!form.product_detail_pledges || typeof form.product_detail_pledges !== 'object') {
    form.product_detail_pledges = base
    return
  }
  if (!form.product_detail_pledges.items || typeof form.product_detail_pledges.items !== 'object') {
    form.product_detail_pledges.items = JSON.parse(JSON.stringify(base.items))
    return
  }
  for (const k of productDetailPledgeKeys) {
    form.product_detail_pledges.items[k] = {
      ...base.items[k],
      ...form.product_detail_pledges.items[k]
    }
  }
}

const miniProgramForm = reactive({
  brand_config: {
    brand_name: '问兰',
    share_title: '问兰 · 品牌甄选',
    share_poster_url: '',
    share_poster_cover_url: '',
    share_poster_intro: '合作共赢 共迎美好',
    share_poster_code_prefix: '邀请码：',
    share_poster_qr_hint: '长按识别小程序码',
    customer_service_wechat: 'wl_service',
    customer_service_hours: '9:00-21:00',
    nav_brand_title: '问兰镜像',
    nav_brand_sub: '品牌甄选',
    about_summary: '品牌甄选，值得信赖。',
    activity_share_title: '问兰 · 当季品牌活动进行中',
    logistics_page_title: '物流跟踪',
    tab_bar: JSON.parse(JSON.stringify(DEFAULT_TAB_BAR))
  },
  feature_flags: {
    show_station_entry: false,
    show_pickup_entry: false,
    enable_logistics_entry: true,
    enable_lottery_entry: true
  },
  activity_page_config: {
    permanent_section_title: '常驻活动',
    permanent_section_desc: '长期可参与，随时进入',
    limited_section_title: '限时活动',
    limited_section_desc: '抓紧时间，过期即止',
    pending_toast: '活动筹备中'
  },
  lottery_config: {
    hero_title: '把积分换成一点仪式感',
    hero_subtitle: '奖池支持后台配置 emoji、配色和标签，小奖池也能做出活动感。',
    result_win_title: '恭喜，手气不错',
    result_miss_title: '这次差一点点'
  },
  membership_config: {
    login_agreement_hint: '登录后查看订单、积分、佣金等信息',
    group_buy_start_requirement_text: '发起拼团需要会员身份，请先完成首单成为会员',
    slash_start_requirement_text: '发起砍价需满足当前活动规则',
    pickup_station_pending_text: '自提站点建设中，暂未开放',
    pickup_code_pending_text: '自提核销码功能建设中',
    business_center_min_role_level: 1,
    growth_bar_subtitle_template: '距离「{next}」还需 {need} 成长值',
    growth_bar_max_tier_text: '您已达到当前成长体系最高档位',
    growth_privileges_entry_text: '查看权益',
    growth_privileges_page_title: '成长值与权益说明'
  },
  logistics_config: {
    shipping_mode: 'third_party',
    shipping_tracking_no_required: true,
    shipping_company_name_required: false,
    shipping_manual_tracking_page_enabled: true,
    manual_status_text: '商家已手工发货',
    manual_status_desc: '当前订单走手工发货模式，可查看单号和发货时间',
    manual_empty_traces_text: '当前为手工发货模式，暂不提供第三方物流轨迹',
    manual_refresh_toast: '手工发货模式无需刷新轨迹'
  },
  customer_service_channel: {
    channel_service_phone: '',
    product_service_phone: '',
    qr_code_url: ''
  },
  withdrawal_config: {
    fee_rate_percent: 0,
    fee_cap_max: 0
  },
  product_detail_pledges: createDefaultProductDetailPledges(),
  light_prompt_modals: {
    coupon_usage: {
      enabled: true,
      title: '优惠券说明',
      body: '在结算页「礼遇与优惠」中选择可用券。请留意满减门槛与适用商品范围；每笔订单一般限用一张，以券面及结算页为准。'
    },
    points_checkin: {
      enabled: true,
      title: '签到与积分',
      body: '每日签到可获得积分，连续签到更有额外惊喜。积分可在下单结算时抵扣部分金额（规则以结算页为准），也可用于积分活动等。'
    },
    register_coupon: {
      enabled: true,
      show_without_coupon: false,
      title: '新人礼券',
      body: '欢迎加入！新人礼券已发放至「我的 · 优惠券」，请在有效期内使用。面额、门槛以券面展示为准。',
      body_when_issued: '欢迎加入！已为您发放 {count} 张优惠券，可前往「我的 · 优惠券」查看，请在有效期内于结算页使用。'
    }
  }
})

const accountForm = reactive({
  username: '',
  role: ''
})

// ========== 告警配置 ==========
const alertLoading = ref(false)
const alertSaving  = ref(false)
const testingDing  = ref(false)
const testingWecom = ref(false)

const alertForm = reactive({
  alert_enabled: false,
  alert_webhook_type: 'dingtalk',
  alert_dingtalk_webhook: '',
  alert_wecom_webhook: '',
  alert_min_interval_minutes: 10
})

async function withLoading(flagRef, task) {
  flagRef.value = true
  try {
    return await task()
  } finally {
    flagRef.value = false
  }
}

function getResponseData(payload) {
  return payload?.data || payload
}

const fetchAlertConfig = async () => {
  await withLoading(alertLoading, async () => {
    const res = await getAlertConfig()
    const d = getResponseData(res)
    if (d.alert_enabled !== undefined) alertForm.alert_enabled = !!d.alert_enabled
    if (d.alert_webhook_type)          alertForm.alert_webhook_type = d.alert_webhook_type
    if (d.alert_dingtalk_webhook)      alertForm.alert_dingtalk_webhook = d.alert_dingtalk_webhook
    if (d.alert_wecom_webhook)         alertForm.alert_wecom_webhook = d.alert_wecom_webhook
    if (d.alert_min_interval_minutes)  alertForm.alert_min_interval_minutes = Number(d.alert_min_interval_minutes)
  }).catch((e) => {
    console.error('获取告警配置失败:', e)
  })
}

const handleSaveAlert = async () => {
  await withLoading(alertSaving, async () => {
    await saveAlertConfig({ ...alertForm })
    ElMessage.success('告警配置已保存')
  }).catch((e) => {
    console.error('保存告警配置失败:', e)
  })
}

const handleTestWebhook = async (type) => {
  const url = type === 'dingtalk' ? alertForm.alert_dingtalk_webhook : alertForm.alert_wecom_webhook
  if (!url) { ElMessage.warning('请先填写 Webhook 地址'); return }
  const targetLoading = type === 'dingtalk' ? testingDing : testingWecom
  await withLoading(targetLoading, async () => {
    const res = await testAlertWebhook({ type, url })
    const d = getResponseData(res)
    if (d.ok || d.success || d.message) ElMessage.success('测试消息发送成功，请检查对应群')
    else ElMessage.error(`发送失败：${d.message || '未知错误'}`)
  }).catch((e) => {
    ElMessage.error('发送失败：' + (e.message || '请求错误'))
  })
}

// ========== 其余逻辑 ==========
const fetchSettings = async () => {
  await withLoading(settingsLoading, async () => {
    const data = await getSettings()
    settingsSnapshot.value = data || null
    if (data) {
      const order = data.ORDER || {}
      const withdrawal = data.WITHDRAWAL || {}
      const commission = data.COMMISSION || {}
      settingsForm.commission_rate = Number(
        commission.COMMISSION_RATE
        ?? commission.DEFAULT_RATE
        ?? settingsForm.commission_rate
      )
      settingsForm.min_withdrawal = Number(
        withdrawal.MIN_AMOUNT
        ?? settingsForm.min_withdrawal
      )
      settingsForm.auto_cancel_minutes = Number(
        order.AUTO_CANCEL_MINUTES
        ?? settingsForm.auto_cancel_minutes
      )
      settingsForm.auto_confirm_days = Number(
        order.AUTO_CONFIRM_DAYS
        ?? settingsForm.auto_confirm_days
      )
      const u = data.USER || {}
      if (u.DEFAULT_AVATAR_URL !== undefined && u.DEFAULT_AVATAR_URL !== null && u.DEFAULT_AVATAR_URL !== '') {
        settingsForm.user_default_avatar_url = String(u.DEFAULT_AVATAR_URL)
      }
      if (u.IDLE_GUEST_PURGE_DAYS !== undefined && u.IDLE_GUEST_PURGE_DAYS !== null) {
        settingsForm.user_idle_guest_purge_days = Number(u.IDLE_GUEST_PURGE_DAYS)
      }
    }
  }).catch((error) => {
    console.error('获取设置失败:', error)
  })
}

const fetchSystemStatus = async () => {
  try {
    const data = await getSystemStatus()
    systemStatus.value = data || { status: 'ok' }
  } catch (error) {
    systemStatus.value = { status: 'error' }
  }
}

const formatDateTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

function ensureBrandTabBarShape(bc) {
  if (!bc.tab_bar || typeof bc.tab_bar !== 'object') {
    bc.tab_bar = JSON.parse(JSON.stringify(DEFAULT_TAB_BAR))
    return
  }
  const tb = bc.tab_bar
  if (!tb.items || !Array.isArray(tb.items) || tb.items.length < 4) {
    tb.items = JSON.parse(JSON.stringify(DEFAULT_TAB_BAR.items))
  } else {
    for (let i = 0; i < 4; i++) {
      if (typeof tb.items[i].index !== 'number') tb.items[i].index = i
      if (typeof tb.items[i].text !== 'string') tb.items[i].text = DEFAULT_TAB_BAR.items[i].text
    }
  }
  if (!tb.color) tb.color = DEFAULT_TAB_BAR.color
  if (!tb.selectedColor) tb.selectedColor = DEFAULT_TAB_BAR.selectedColor
  if (!tb.backgroundColor) tb.backgroundColor = DEFAULT_TAB_BAR.backgroundColor
  if (tb.borderStyle !== 'black' && tb.borderStyle !== 'white') tb.borderStyle = DEFAULT_TAB_BAR.borderStyle
}

const fetchMiniProgramConfig = async () => {
  await withLoading(miniProgramLoading, async () => {
    const data = await getMiniProgramConfig()
    if (!data) return
    Object.assign(miniProgramForm.brand_config, data.brand_config || {})
    ensureBrandTabBarShape(miniProgramForm.brand_config)
    Object.assign(miniProgramForm.feature_flags, data.feature_flags || {})
    Object.assign(miniProgramForm.activity_page_config, data.activity_page_config || {})
    Object.assign(miniProgramForm.lottery_config, data.lottery_config || {})
    Object.assign(miniProgramForm.membership_config, data.membership_config || {})
    Object.assign(miniProgramForm.logistics_config, data.logistics_config || {})
    if (data.customer_service_channel && typeof data.customer_service_channel === 'object') {
      Object.assign(miniProgramForm.customer_service_channel, data.customer_service_channel)
    }

    if (data.product_detail_pledges && typeof data.product_detail_pledges === 'object') {
      miniProgramForm.product_detail_pledges = JSON.parse(JSON.stringify(data.product_detail_pledges))
    }

    const rawWc = data.withdrawal_config && typeof data.withdrawal_config === 'object'
      ? { ...data.withdrawal_config }
      : {}
    const wc = { ...rawWc }
    const hasFeeKey = Object.prototype.hasOwnProperty.call(wc, 'fee_rate_percent')
    const hasCapKey = Object.prototype.hasOwnProperty.call(wc, 'fee_cap_max')
    if (!hasFeeKey || !hasCapKey) {
      try {
        const s = settingsSnapshot.value || await getSettings()
        if (!settingsSnapshot.value && s) {
          settingsSnapshot.value = s
        }
        const w = s?.WITHDRAWAL || {}
        if (!hasFeeKey && w.FEE_RATE !== undefined && w.FEE_RATE !== null && w.FEE_RATE !== '') {
          const r = Number(w.FEE_RATE)
          wc.fee_rate_percent = r > 1 ? r : Math.round(r * 10000) / 100
        }
        if (!hasCapKey && w.FEE_CAP_MAX !== undefined && w.FEE_CAP_MAX !== null && w.FEE_CAP_MAX !== '') {
          wc.fee_cap_max = Number(w.FEE_CAP_MAX)
        }
      } catch (_e) {
        /* 预填失败则保留表单默认值 */
      }
    }
    Object.assign(miniProgramForm.withdrawal_config, wc)
    ensureProductDetailPledgesShape(miniProgramForm)

    if (data.light_prompt_modals && typeof data.light_prompt_modals === 'object') {
      const lp = data.light_prompt_modals
      if (lp.coupon_usage) Object.assign(miniProgramForm.light_prompt_modals.coupon_usage, lp.coupon_usage)
      if (lp.points_checkin) Object.assign(miniProgramForm.light_prompt_modals.points_checkin, lp.points_checkin)
      if (lp.register_coupon) Object.assign(miniProgramForm.light_prompt_modals.register_coupon, lp.register_coupon)
    }
  }).catch((error) => {
    console.error('获取小程序配置失败:', error)
  })
}

const handleSaveSettings = async () => {
  saving.value = true
  try {
    await Promise.all([
      updateSettings({
        category: 'COMMISSION',
        settings: {
          COMMISSION_RATE: Number(settingsForm.commission_rate)
        }
      }),
      updateSettings({
        category: 'WITHDRAWAL',
        settings: {
          MIN_AMOUNT: Number(settingsForm.min_withdrawal)
        }
      }),
      updateSettings({
        category: 'ORDER',
        settings: {
          AUTO_CANCEL_MINUTES: Number(settingsForm.auto_cancel_minutes),
          AUTO_CONFIRM_DAYS: Number(settingsForm.auto_confirm_days)
        }
      }),
      updateSettings({
        category: 'SYSTEM',
        settings: {
          USER_IDLE_GUEST_PURGE_DAYS: Number(settingsForm.user_idle_guest_purge_days),
          USER_DEFAULT_AVATAR_URL: String(settingsForm.user_default_avatar_url || '').trim()
        }
      })
    ])
    ElMessage.success('配置保存成功')
  } catch (error) {
    console.error('保存配置失败:', error)
  } finally {
    saving.value = false
  }
}

const handleSaveMiniProgramConfig = async () => {
  miniProgramSaving.value = true
  try {
    await updateMiniProgramConfig(JSON.parse(JSON.stringify(miniProgramForm)))
    ElMessage.success('小程序配置保存成功')
  } catch (error) {
    console.error('保存小程序配置失败:', error)
  } finally {
    miniProgramSaving.value = false
  }
}

const handleChangePassword = () => {
  ElMessage.info('请点击右上角用户菜单中的"修改密码"')
}

onMounted(() => {
  accountForm.username = userStore.username
  accountForm.role = userStore.role === 'super_admin' ? '超级管理员' : '管理员'
  fetchSettings()
  fetchSystemStatus()
  fetchAlertConfig()
  fetchMiniProgramConfig()
})
</script>

<style scoped>
.settings-page {
  padding: 0;
}

@media (max-width: 767px) {
}
</style>
