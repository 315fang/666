<template>
  <div class="settings-page">
    <el-card>
      <template #header>
        系统设置
      </template>

      <el-tabs v-model="activeTab">
        <!-- 基本信息 -->
        <el-tab-pane label="基本信息" name="basic">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="系统名称">
              S2B2C 数字加盟系统
            </el-descriptions-item>
            <el-descriptions-item label="系统版本">
              v1.0.0
            </el-descriptions-item>
            <el-descriptions-item label="运行环境">
              Node.js + MySQL
            </el-descriptions-item>
            <el-descriptions-item label="服务状态">
              <el-tag type="success" v-if="systemStatus.status === 'ok' || systemStatus.status === 'online'">运行中</el-tag>
              <el-tag type="warning" v-else-if="systemStatus.status === 'degraded'">部分异常</el-tag>
              <el-tag type="danger" v-else>异常</el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </el-tab-pane>

        <!-- 运营参数 -->
        <el-tab-pane label="运营参数" name="config">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            style="max-width: 700px; margin-bottom: 16px;"
            title="这里维护的是日常运营参数（提现、订单时效、全局分销参数等）。单商品独立佣金等业务项请在对应业务页面配置。"
          />
          <el-form
            :model="settingsForm"
            label-width="160px"
            style="max-width: 700px;"
            v-loading="settingsLoading"
          >
            <el-divider content-position="left">分销设置</el-divider>
            <el-form-item label="分销佣金比例 (%)">
              <el-input-number v-model="settingsForm.commission_rate" :min="0" :max="100" :step="0.5" :precision="1" />
              <div class="field-hint">全局分销相关参数之一，具体是否参与计算以服务端佣金服务为准；填写 0～100 表示百分比。</div>
            </el-form-item>
            <el-form-item label="提现最低金额 (元)">
              <el-input-number v-model="settingsForm.min_withdrawal" :min="1" :step="10" />
              <div class="field-hint">用户/代理申请提现时金额不得低于该值。</div>
            </el-form-item>
            <el-form-item label="提现手续费 (%)">
              <el-input-number v-model="settingsForm.withdrawal_fee_rate" :min="0" :max="100" :step="0.5" :precision="1" />
              <div class="field-hint">按百分比从提现金额中扣除，0 表示无手续费。</div>
            </el-form-item>

            <el-divider content-position="left">订单设置</el-divider>
            <el-form-item label="自动取消时间 (分钟)">
              <el-input-number v-model="settingsForm.auto_cancel_minutes" :min="5" :max="1440" :step="5" />
              <div class="field-hint">未支付订单超过该时间未付款将自动关闭（需后端定时任务配合生效）。</div>
            </el-form-item>
            <el-form-item label="自动确认时间 (天)">
              <el-input-number v-model="settingsForm.auto_confirm_days" :min="1" :max="30" />
              <div class="field-hint">发货后超过该天数未申请售后则自动确认收货（以实际任务逻辑为准）。</div>
            </el-form-item>

            <el-form-item>
              <el-button type="primary" @click="handleSaveSettings" :loading="saving">
                保存配置
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="小程序配置" name="miniProgram">
          <el-form
            :model="miniProgramForm"
            label-width="180px"
            style="max-width: 880px;"
            v-loading="miniProgramLoading"
          >
            <el-divider content-position="left">品牌与分享</el-divider>
            <el-form-item label="品牌名称">
              <el-input v-model="miniProgramForm.brand_config.brand_name" style="width:min(280px, 100%);" />
            </el-form-item>
            <el-form-item label="默认分享标题">
              <el-input v-model="miniProgramForm.brand_config.share_title" />
            </el-form-item>
            <el-form-item label="客服微信">
              <el-input v-model="miniProgramForm.brand_config.customer_service_wechat" style="width:min(280px, 100%);" />
            </el-form-item>
            <el-form-item label="客服工作时间">
              <el-input v-model="miniProgramForm.brand_config.customer_service_hours" style="width:min(280px, 100%);" />
            </el-form-item>
            <el-form-item label="首页导航主标题">
              <el-input v-model="miniProgramForm.brand_config.nav_brand_title" style="width:min(280px, 100%);" />
            </el-form-item>
            <el-form-item label="首页导航副标题">
              <el-input v-model="miniProgramForm.brand_config.nav_brand_sub" style="width:min(280px, 100%);" />
            </el-form-item>
            <el-form-item label="关于页简介">
              <el-input v-model="miniProgramForm.brand_config.about_summary" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item label="活动页分享标题">
              <el-input v-model="miniProgramForm.brand_config.activity_share_title" />
            </el-form-item>
            <el-form-item label="物流页标题">
              <el-input v-model="miniProgramForm.brand_config.logistics_page_title" style="width:min(280px, 100%);" />
            </el-form-item>

            <el-divider content-position="left">底部导航栏（Tab）</el-divider>
            <el-alert
              type="info"
              :closable="false"
              show-icon
              style="max-width: 880px; margin-bottom: 12px;"
              title="与小程序 app.json 四个 Tab 顺序一致：首页、分类、活动、我的。保存后由接口下发，客户端 wx.setTabBarItem 动态生效；建议文案与包内默认一致可减少首帧闪烁。"
            />
            <el-form-item label="未选中文字色">
              <el-input v-model="miniProgramForm.brand_config.tab_bar.color" placeholder="#A8A29E" style="width:min(200px, 100%);" />
            </el-form-item>
            <el-form-item label="选中文字色">
              <el-input v-model="miniProgramForm.brand_config.tab_bar.selectedColor" placeholder="#C6A16E" style="width:min(200px, 100%);" />
            </el-form-item>
            <el-form-item label="背景色">
              <el-input v-model="miniProgramForm.brand_config.tab_bar.backgroundColor" placeholder="#FFFCF7" style="width:min(200px, 100%);" />
            </el-form-item>
            <el-form-item label="边框">
              <el-radio-group v-model="miniProgramForm.brand_config.tab_bar.borderStyle">
                <el-radio label="white">白边</el-radio>
                <el-radio label="black">黑边</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="Tab1 文案（首页）">
              <el-input v-model="miniProgramForm.brand_config.tab_bar.items[0].text" style="width:min(280px, 100%);" maxlength="8" show-word-limit />
            </el-form-item>
            <el-form-item label="Tab2 文案（分类）">
              <el-input v-model="miniProgramForm.brand_config.tab_bar.items[1].text" style="width:min(280px, 100%);" maxlength="8" show-word-limit />
            </el-form-item>
            <el-form-item label="Tab3 文案（活动）">
              <el-input v-model="miniProgramForm.brand_config.tab_bar.items[2].text" style="width:min(280px, 100%);" maxlength="8" show-word-limit />
            </el-form-item>
            <el-form-item label="Tab4 文案（我的）">
              <el-input v-model="miniProgramForm.brand_config.tab_bar.items[3].text" style="width:min(280px, 100%);" maxlength="8" show-word-limit />
            </el-form-item>

            <el-divider content-position="left">入口与功能开关</el-divider>
            <el-form-item label="显示自提站点入口">
              <el-switch v-model="miniProgramForm.feature_flags.show_station_entry" />
            </el-form-item>
            <el-form-item label="显示自提核销入口">
              <el-switch v-model="miniProgramForm.feature_flags.show_pickup_entry" />
            </el-form-item>
            <el-form-item label="显示物流入口">
              <el-switch v-model="miniProgramForm.feature_flags.enable_logistics_entry" />
            </el-form-item>
            <el-form-item label="显示抽奖入口">
              <el-switch v-model="miniProgramForm.feature_flags.enable_lottery_entry" />
            </el-form-item>

            <el-divider content-position="left">活动页默认文案</el-divider>
            <el-form-item label="常驻活动标题">
              <el-input v-model="miniProgramForm.activity_page_config.permanent_section_title" style="width:min(280px, 100%);" />
            </el-form-item>
            <el-form-item label="常驻活动说明">
              <el-input v-model="miniProgramForm.activity_page_config.permanent_section_desc" />
            </el-form-item>
            <el-form-item label="限时活动标题">
              <el-input v-model="miniProgramForm.activity_page_config.limited_section_title" style="width:min(280px, 100%);" />
            </el-form-item>
            <el-form-item label="限时活动说明">
              <el-input v-model="miniProgramForm.activity_page_config.limited_section_desc" />
            </el-form-item>
            <el-form-item label="活动未配置提示">
              <el-input v-model="miniProgramForm.activity_page_config.pending_toast" style="width:min(280px, 100%);" />
            </el-form-item>

            <el-divider content-position="left">抽奖页文案</el-divider>
            <el-form-item label="抽奖页主标题">
              <el-input v-model="miniProgramForm.lottery_config.hero_title" />
            </el-form-item>
            <el-form-item label="抽奖页副标题">
              <el-input v-model="miniProgramForm.lottery_config.hero_subtitle" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item label="中奖提示">
              <el-input v-model="miniProgramForm.lottery_config.result_win_title" style="width:min(280px, 100%);" />
            </el-form-item>
            <el-form-item label="未中奖提示">
              <el-input v-model="miniProgramForm.lottery_config.result_miss_title" style="width:min(280px, 100%);" />
            </el-form-item>

            <el-divider content-position="left">会员与入口提示</el-divider>
            <el-form-item label="登录提示文案">
              <el-input v-model="miniProgramForm.membership_config.login_agreement_hint" />
            </el-form-item>
            <el-form-item label="拼团发起提示">
              <el-input v-model="miniProgramForm.membership_config.group_buy_start_requirement_text" />
            </el-form-item>
            <el-form-item label="砍价发起提示">
              <el-input v-model="miniProgramForm.membership_config.slash_start_requirement_text" />
            </el-form-item>
            <el-form-item label="自提站点提示">
              <el-input v-model="miniProgramForm.membership_config.pickup_station_pending_text" />
            </el-form-item>
            <el-form-item label="自提核销提示">
              <el-input v-model="miniProgramForm.membership_config.pickup_code_pending_text" />
            </el-form-item>
            <el-form-item label="商务中心最低等级(role_level)">
              <el-input-number
                v-model="miniProgramForm.membership_config.business_center_min_role_level"
                :min="0"
                :max="10"
                controls-position="right"
                style="width:min(200px, 100%);"
              />
              <div class="field-hint">0游客 1初级代理(C1) 2高级(C2) 3推广合伙人…；低于此等级不显示「商务中心」入口</div>
            </el-form-item>

            <el-divider content-position="left">物流模式</el-divider>
            <el-form-item label="发货模式">
              <el-radio-group v-model="miniProgramForm.logistics_config.shipping_mode">
                <el-radio label="third_party">第三方物流查询</el-radio>
                <el-radio label="manual">手工发货模式</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="要求填写物流单号">
              <el-switch v-model="miniProgramForm.logistics_config.shipping_tracking_no_required" />
            </el-form-item>
            <el-form-item label="要求填写承运方名称">
              <el-switch v-model="miniProgramForm.logistics_config.shipping_company_name_required" />
            </el-form-item>
            <el-form-item label="保留物流详情页">
              <el-switch v-model="miniProgramForm.logistics_config.shipping_manual_tracking_page_enabled" />
            </el-form-item>
            <el-form-item label="手工模式状态标题">
              <el-input v-model="miniProgramForm.logistics_config.manual_status_text" />
            </el-form-item>
            <el-form-item label="手工模式说明">
              <el-input v-model="miniProgramForm.logistics_config.manual_status_desc" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item label="无轨迹提示">
              <el-input v-model="miniProgramForm.logistics_config.manual_empty_traces_text" />
            </el-form-item>
            <el-form-item label="刷新提示">
              <el-input v-model="miniProgramForm.logistics_config.manual_refresh_toast" />
            </el-form-item>

            <el-form-item>
              <el-button type="primary" @click="handleSaveMiniProgramConfig" :loading="miniProgramSaving">
                保存小程序配置
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="支付检测" name="paymentHealth">
          <div v-loading="paymentHealthLoading" class="payment-health-panel">
            <div class="payment-health-toolbar">
              <div>
                <div class="payment-health-title">微信支付健康检查</div>
                <div class="payment-health-subtitle">直接查看当前后台支付配置、证书和回调地址是否正常</div>
              </div>
              <div class="payment-health-actions">
                <el-button @click="fetchPaymentHealth()">刷新检查</el-button>
                <el-button type="primary" :loading="paymentHealthRefreshing" @click="handleRefreshPaymentCert">
                  刷新平台证书并重检
                </el-button>
              </div>
            </div>

            <el-alert
              :title="paymentHealth.summary || '尚未检查微信支付状态'"
              :type="paymentStatusType"
              :closable="false"
              show-icon
            />

            <el-descriptions :column="2" border style="margin-top: 16px;">
              <el-descriptions-item label="当前状态">
                <el-tag :type="paymentStatusType">{{ paymentStatusLabel }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="最近检查时间">
                {{ formatDateTime(paymentHealth.checked_at) }}
              </el-descriptions-item>
              <el-descriptions-item label="平台证书缓存">
                <el-tag :type="paymentHealth.cert_status?.is_valid ? 'success' : 'warning'">
                  {{ paymentHealth.cert_status?.is_valid ? '有效' : '无有效缓存' }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="证书缓存到期">
                {{ formatDateTime(paymentHealth.cert_status?.cached_until) }}
              </el-descriptions-item>
              <el-descriptions-item label="平台证书文件">
                {{ paymentHealth.cert_status?.file_path || '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="本地证书文件状态">
                <el-tag :type="paymentHealth.cert_status?.file_exists ? 'success' : 'warning'">
                  {{ paymentHealth.cert_status?.file_exists ? '已找到' : '未找到' }}
                </el-tag>
              </el-descriptions-item>
            </el-descriptions>

            <el-alert
              v-if="paymentHealth.refresh_result?.message"
              :title="paymentHealth.refresh_result.message"
              :type="paymentHealth.refresh_result.status === 'ok' ? 'success' : paymentHealth.refresh_result.status === 'warning' ? 'warning' : 'error'"
              :closable="false"
              show-icon
              style="margin-top: 16px;"
            />

            <el-table
              :data="paymentHealth.checks || []"
              border
              style="width: 100%; margin-top: 16px;"
              empty-text="暂无检查结果"
            >
              <el-table-column prop="label" label="检查项" min-width="180" />
              <el-table-column label="状态" width="110">
                <template #default="{ row }">
                  <el-tag :type="row.status === 'ok' ? 'success' : row.status === 'warning' ? 'warning' : 'danger'">
                    {{ row.status === 'ok' ? '正常' : row.status === 'warning' ? '警告' : '异常' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="message" label="说明" min-width="220" />
              <el-table-column prop="value" label="当前值" min-width="260" show-overflow-tooltip />
            </el-table>
          </div>
        </el-tab-pane>

        <!-- 账号管理 -->
        <el-tab-pane label="账号管理" name="account">
          <el-form :model="accountForm" label-width="120px" style="max-width: 600px;">
            <el-form-item label="当前用户名">
              <el-input v-model="accountForm.username" disabled />
            </el-form-item>
            <el-form-item label="角色">
              <el-input v-model="accountForm.role" disabled />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleChangePassword">
                修改密码
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 告警通知 -->
        <el-tab-pane label="告警通知" name="alert">
          <el-form
            :model="alertForm"
            label-width="180px"
            style="max-width: 700px;"
            v-loading="alertLoading"
          >
            <el-divider content-position="left">告警总开关</el-divider>
            <el-form-item label="启用告警推送">
              <el-switch v-model="alertForm.alert_enabled" />
              <span style="margin-left:12px;font-size:12px;color:#909399">
                关闭后所有渠道均停止推送
              </span>
            </el-form-item>

            <el-divider content-position="left">推送渠道</el-divider>
            <el-form-item label="推送渠道">
              <el-radio-group v-model="alertForm.alert_webhook_type">
                <el-radio value="dingtalk">仅钉钉</el-radio>
                <el-radio value="wecom">仅企业微信</el-radio>
                <el-radio value="both">两者都推</el-radio>
              </el-radio-group>
            </el-form-item>

            <el-form-item
              label="钉钉 Webhook 地址"
              v-if="alertForm.alert_webhook_type === 'dingtalk' || alertForm.alert_webhook_type === 'both'"
            >
              <el-input
                v-model="alertForm.alert_dingtalk_webhook"
                placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
                clearable
                style="width:min(420px, 100%)"
              />
              <el-button
                style="margin-left:8px"
                :loading="testingDing"
                @click="handleTestWebhook('dingtalk')"
              >测试</el-button>
            </el-form-item>

            <el-form-item
              label="企业微信 Webhook 地址"
              v-if="alertForm.alert_webhook_type === 'wecom' || alertForm.alert_webhook_type === 'both'"
            >
              <el-input
                v-model="alertForm.alert_wecom_webhook"
                placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                clearable
                style="width:min(420px, 100%)"
              />
              <el-button
                style="margin-left:8px"
                :loading="testingWecom"
                @click="handleTestWebhook('wecom')"
              >测试</el-button>
            </el-form-item>

            <el-divider content-position="left">推送策略</el-divider>
            <el-form-item label="同类告警最小间隔 (分钟)">
              <el-input-number
                v-model="alertForm.alert_min_interval_minutes"
                :min="1"
                :max="1440"
                :step="5"
              />
              <span style="margin-left:10px;font-size:12px;color:#909399">
                相同类型告警在此时间内不重复推送
              </span>
            </el-form-item>

            <el-form-item>
              <el-button type="primary" @click="handleSaveAlert" :loading="alertSaving">
                保存告警配置
              </el-button>
            </el-form-item>
          </el-form>
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
import { getSettings, updateSettings, getSystemStatus, getMiniProgramConfig, updateMiniProgramConfig, getPaymentHealth, getAlertConfig, saveAlertConfig, testAlertWebhook } from '@/api'

const userStore = useUserStore()
const route = useRoute()
const validTabs = ['basic', 'config', 'miniProgram', 'paymentHealth', 'account', 'alert']
const activeTab = ref(validTabs.includes(route.query.tab) ? route.query.tab : 'basic')
const settingsLoading = ref(false)
const saving = ref(false)

const systemStatus = ref({ status: 'ok' })
const miniProgramLoading = ref(false)
const miniProgramSaving = ref(false)
const paymentHealthLoading = ref(false)
const paymentHealthRefreshing = ref(false)
const paymentHealth = ref({
  status: 'warning',
  summary: '',
  checked_at: '',
  checks: [],
  cert_status: {},
  refresh_result: null
})

const settingsForm = reactive({
  commission_rate: 10,
  min_withdrawal: 100,
  withdrawal_fee_rate: 0,
  auto_cancel_minutes: 30,
  auto_confirm_days: 7
})

const DEFAULT_TAB_BAR = {
  color: '#A8A29E',
  selectedColor: '#C6A16E',
  backgroundColor: '#FFFCF7',
  borderStyle: 'white',
  items: [
    { index: 0, text: '商城首页' },
    { index: 1, text: '全部商品' },
    { index: 2, text: '热门活动' },
    { index: 3, text: '我的会员' }
  ]
}

const miniProgramForm = reactive({
  brand_config: {
    brand_name: '问兰',
    share_title: '问兰 · 品牌甄选',
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
    business_center_min_role_level: 1
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

const fetchAlertConfig = async () => {
  alertLoading.value = true
  try {
    const res = await getAlertConfig()
    const d = res.data || res
    if (d.alert_enabled !== undefined) alertForm.alert_enabled = !!d.alert_enabled
    if (d.alert_webhook_type)          alertForm.alert_webhook_type = d.alert_webhook_type
    if (d.alert_dingtalk_webhook)      alertForm.alert_dingtalk_webhook = d.alert_dingtalk_webhook
    if (d.alert_wecom_webhook)         alertForm.alert_wecom_webhook = d.alert_wecom_webhook
    if (d.alert_min_interval_minutes)  alertForm.alert_min_interval_minutes = Number(d.alert_min_interval_minutes)
  } catch (e) {
    console.error('获取告警配置失败:', e)
  } finally {
    alertLoading.value = false
  }
}

const handleSaveAlert = async () => {
  alertSaving.value = true
  try {
    await saveAlertConfig({ ...alertForm })
    ElMessage.success('告警配置已保存')
  } catch (e) {
    console.error('保存告警配置失败:', e)
  } finally {
    alertSaving.value = false
  }
}

const handleTestWebhook = async (type) => {
  const url = type === 'dingtalk' ? alertForm.alert_dingtalk_webhook : alertForm.alert_wecom_webhook
  if (!url) { ElMessage.warning('请先填写 Webhook 地址'); return }
  if (type === 'dingtalk') testingDing.value = true
  else testingWecom.value = true
  try {
    const res = await testAlertWebhook({ type, url })
    const d = res.data || res
    if (d.ok || d.success || d.message) ElMessage.success('测试消息发送成功，请检查对应群')
    else ElMessage.error(`发送失败：${d.message || '未知错误'}`)
  } catch (e) {
    ElMessage.error('发送失败：' + (e.message || '请求错误'))
  } finally {
    testingDing.value = false
    testingWecom.value = false
  }
}

// ========== 其余逻辑 ==========
const fetchSettings = async () => {
  settingsLoading.value = true
  try {
    const data = await getSettings()
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
      settingsForm.withdrawal_fee_rate = Number(
        withdrawal.FEE_RATE
        ?? settingsForm.withdrawal_fee_rate
      )
      settingsForm.auto_cancel_minutes = Number(
        order.AUTO_CANCEL_MINUTES
        ?? settingsForm.auto_cancel_minutes
      )
      settingsForm.auto_confirm_days = Number(
        order.AUTO_CONFIRM_DAYS
        ?? settingsForm.auto_confirm_days
      )
    }
  } catch (error) {
    console.error('获取设置失败:', error)
  } finally {
    settingsLoading.value = false
  }
}

const fetchSystemStatus = async () => {
  try {
    const data = await getSystemStatus()
    systemStatus.value = data || { status: 'ok' }
  } catch (error) {
    systemStatus.value = { status: 'error' }
  }
}

const paymentStatusType = computed(() => {
  if (paymentHealth.value.status === 'ok') return 'success'
  if (paymentHealth.value.status === 'warning') return 'warning'
  return 'error'
})

const paymentStatusLabel = computed(() => {
  if (paymentHealth.value.status === 'ok') return '正常'
  if (paymentHealth.value.status === 'warning') return '警告'
  return '异常'
})

const formatDateTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

const fetchPaymentHealth = async (params = {}) => {
  paymentHealthLoading.value = true
  try {
    const data = await getPaymentHealth(params)
    paymentHealth.value = {
      status: data?.status || 'warning',
      summary: data?.summary || '',
      checked_at: data?.checked_at || '',
      checks: Array.isArray(data?.checks) ? data.checks : [],
      cert_status: data?.cert_status || {},
      refresh_result: data?.refresh_result || null
    }
  } catch (error) {
    console.error('获取支付健康状态失败:', error)
  } finally {
    paymentHealthLoading.value = false
  }
}

const handleRefreshPaymentCert = async () => {
  paymentHealthRefreshing.value = true
  try {
    await fetchPaymentHealth({ refresh: 1 })
    ElMessage.success('已完成支付状态重检')
  } catch (error) {
    console.error('刷新支付证书失败:', error)
  } finally {
    paymentHealthRefreshing.value = false
  }
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
  miniProgramLoading.value = true
  try {
    const data = await getMiniProgramConfig()
    if (!data) return
    Object.assign(miniProgramForm.brand_config, data.brand_config || {})
    ensureBrandTabBarShape(miniProgramForm.brand_config)
    Object.assign(miniProgramForm.feature_flags, data.feature_flags || {})
    Object.assign(miniProgramForm.activity_page_config, data.activity_page_config || {})
    Object.assign(miniProgramForm.lottery_config, data.lottery_config || {})
    Object.assign(miniProgramForm.membership_config, data.membership_config || {})
    Object.assign(miniProgramForm.logistics_config, data.logistics_config || {})
  } catch (error) {
    console.error('获取小程序配置失败:', error)
  } finally {
    miniProgramLoading.value = false
  }
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
          MIN_AMOUNT: Number(settingsForm.min_withdrawal),
          FEE_RATE: Number(settingsForm.withdrawal_fee_rate)
        }
      }),
      updateSettings({
        category: 'ORDER',
        settings: {
          AUTO_CANCEL_MINUTES: Number(settingsForm.auto_cancel_minutes),
          AUTO_CONFIRM_DAYS: Number(settingsForm.auto_confirm_days)
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
  fetchPaymentHealth()
  fetchAlertConfig()
  fetchMiniProgramConfig()
})
</script>

<style scoped>
.settings-page {
  padding: 0;
}

.payment-health-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.payment-health-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.payment-health-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.payment-health-subtitle {
  margin-top: 4px;
  font-size: 13px;
  color: #909399;
}

.payment-health-actions {
  display: flex;
  gap: 12px;
}

.field-hint {
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
  margin-top: 6px;
  max-width: 520px;
}

@media (max-width: 767px) {
  .payment-health-toolbar { flex-direction: column; align-items: flex-start; }
  .payment-health-actions { flex-wrap: wrap; }
}
</style>
