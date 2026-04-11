<template>
  <div class="core-center-page">
    <el-card class="hero-card">
      <template #header>
        <div class="hero-header">
          <div>
            <div class="hero-title">{{ center.title }}</div>
            <div class="hero-subtitle">{{ center.subtitle }}</div>
          </div>
          <el-tag type="info" effect="plain">{{ center.scope }}</el-tag>
        </div>
      </template>

      <el-alert
        :title="center.alert"
        type="info"
        :closable="false"
        show-icon
      />

      <div class="principle-list">
        <div v-for="item in center.principles" :key="item" class="principle-item">{{ item }}</div>
      </div>
    </el-card>

    <div class="content-grid">
      <el-card>
        <template #header>
          <div class="section-header">
            <span>兼容入口</span>
            <el-tag size="small" type="warning">旧页逐步收口</el-tag>
          </div>
        </template>

        <div class="entry-list">
          <button
            v-for="entry in center.entries"
            :key="entry.path"
            class="entry-btn"
            @click="go(entry.path)"
          >
            <span class="entry-title">{{ entry.title }}</span>
            <span class="entry-desc">{{ entry.desc }}</span>
          </button>
        </div>
      </el-card>

      <el-card>
        <template #header>
          <div class="section-header">
            <span>当前落位规则</span>
          </div>
        </template>

        <div class="mapping-list">
          <div v-for="rule in center.rules" :key="rule.label" class="mapping-item">
            <div class="mapping-label">{{ rule.label }}</div>
            <div class="mapping-value">{{ rule.value }}</div>
          </div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const centerMap = {
  goods: {
    title: '商品池',
    subtitle: '商品、分类、价格、素材入口统一归这里，后续不再新增零散商品配置页。',
    scope: 'Products / Categories',
    alert: '凡是“商品本体”问题，包括上架、分类、价格、商品资料，都优先落商品池。',
    principles: [
      '商品本体只维护一份，不在活动页重复造商品字段。',
      '分类、价格档位、素材引用都围绕商品主数据展开。',
      '专题展示优先通过榜单池或页面编排引用商品池数据。'
    ],
    entries: [
      { path: '/products', title: '商品管理', desc: '维护商品主数据、价格、库存、状态' },
      { path: '/categories', title: '商品分类', desc: '维护前台分类结构与归属' }
    ],
    rules: [
      { label: '新增需求', value: '是商品本体或分类结构，直接落商品池。' },
      { label: '不要再做', value: '不要为某个专题单独再造一张“商品配置页”。' }
    ]
  },
  content: {
    title: '内容池',
    subtitle: 'Banner、图文块、素材、评论、开屏、消息文案统一收口。',
    scope: 'Banner / Material / Copy',
    alert: '凡是图片、文案、素材资源，优先落内容池，再由页面编排去引用。',
    principles: [
      '内容先成为资源，再决定显示在哪个页面。',
      '同一张图/同一段文案尽量只保存一次。',
      '不能直接写死在前端的内容，逐步补进内容池。'
    ],
    entries: [
      { path: '/content', title: 'Banner/内容', desc: '轮播图、图文资源、基础内容位' },
      { path: '/materials', title: '素材管理', desc: '素材分组、图片资源池' },
      { path: '/reviews', title: '评论管理', desc: '用户评论审核与展示控制' },
      { path: '/mass-message', title: '群发消息', desc: '站内消息/运营触达' },
      { path: '/splash', title: '开屏动画', desc: '小程序启动资源位' }
    ],
    rules: [
      { label: '新增需求', value: '是图片、文案、海报、公告，统一放内容池。' },
      { label: '不要再做', value: '不要新增“某页面专用图片配置页”。' }
    ]
  },
  board: {
    title: '榜单池',
    subtitle: '精选商品榜、推荐榜、专题商品集合统一收在榜单模型里。',
    scope: 'ContentBoard',
    alert: '凡是“某一组商品上榜/排序/启停”的需求，优先走榜单池。',
    principles: [
      '榜单只负责集合与排序，不复制商品字段。',
      '一个页面可以同时引用多个榜单。',
      '榜单池与页面编排分离，便于复用。'
    ],
    entries: [
      { path: '/featured-board', title: '精选商品榜', desc: '当前首页精选商品榜兼容入口' }
    ],
    rules: [
      { label: '新增需求', value: '是商品集合或推荐位，先考虑 ContentBoard。' },
      { label: '不要再做', value: '不要在首页/活动页里各自存一份商品数组。' }
    ]
  },
  campaign: {
    title: '活动池',
    subtitle: '拼团、砍价、抽奖、优惠券与活动页链接编排统一归这里。',
    scope: 'Campaign / Coupon',
    alert: '凡是玩法型资源或营销活动，统一放活动池，不再分散到多个独立配置页。',
    principles: [
      '活动池负责玩法资源，页面编排只决定展示顺序。',
      '活动链接位属于活动池资源，不属于首页商品配置。',
      '活动列表与活动详情尽量复用同一套资源模型。'
    ],
    entries: [
      { path: '/group-buys', title: '拼团活动', desc: '拼团商品、拼团规则、成团状态' },
      { path: '/activities', title: '砍价/抽奖/节日', desc: '活动页链接、节日配置、玩法资源' },
      { path: '/coupons', title: '优惠券管理', desc: '优惠券模板、自动发券规则' }
    ],
    rules: [
      { label: '新增需求', value: '是玩法、券、抽奖、拼团，统一进活动池。' },
      { label: '不要再做', value: '不要再额外新增“某活动专属后台页”。' }
    ]
  },
  layout: {
    title: '页面编排',
    subtitle: '首页、活动页、我的页不再各自拼配置，统一按模块顺序编排。',
    scope: 'PageLayout / PageContent',
    alert: '页面编排只关心“显示什么模块、顺序如何、引用哪个资源”。',
    principles: [
      '页面编排不保存商品主数据，只保存引用关系。',
      '首页/活动页/我的页统一走 page-content 聚合读口。',
      '老接口先兼容，新需求优先补进页面编排。'
    ],
    entries: [
      { path: '/home-sections', title: '页面管理', desc: '首页模块兼容入口' },
      { path: '/content-map', title: '前台内容归属', desc: '查看前台内容来源与后台落位' }
    ],
    rules: [
      { label: '新增需求', value: '是页面显示顺序/模块组合，落页面编排。' },
      { label: '不要再做', value: '不要让首页/活动页/我的页各自单独拼一套接口。' }
    ]
  },
  rule: {
    title: '规则中心',
    subtitle: '会员策略、系统开关、规则说明、后续通知规则统一归这里。',
    scope: 'Rule / 运营与策略',
    alert: '凡是规则、阈值、资格、说明文案，优先统一纳入规则中心。',
    principles: [
      '规则与页面展示解耦，规则改动不应要求改前端结构。',
      '会员、货款提醒、系统开关最终都应收敛到规则中心。',
      '说明类内容可由内容池承载正文，由规则中心管理生效逻辑。'
    ],
    entries: [
      { path: '/membership', title: '会员与策略', desc: '会员等级、成长值、商业策略' },
      { path: '/settings', title: '运营与系统设置', desc: '运营参数、账户与基础信息' }
    ],
    rules: [
      { label: '新增需求', value: '是阈值、资格、策略、提醒规则，先放规则中心。' },
      { label: '不要再做', value: '不要把规则散落到多个功能页角落里。' }
    ]
  }
}

const center = computed(() => centerMap[route.meta.centerKey] || centerMap.content)

const go = (path) => {
  router.push(path)
}
</script>

<style scoped>
.core-center-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hero-card,
.content-grid :deep(.el-card) {
  border-radius: 14px;
}

.hero-header,
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.hero-title {
  font-size: 20px;
  font-weight: 700;
  color: #1e293b;
}

.hero-subtitle {
  margin-top: 6px;
  font-size: 13px;
  color: #64748b;
}

.principle-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.principle-item {
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  font-size: 13px;
  color: #334155;
  line-height: 1.6;
}

.content-grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 16px;
}

.entry-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.entry-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  transition: all 0.15s ease;
}

.entry-btn:hover {
  border-color: #6366f1;
  background: #f8faff;
}

.entry-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.entry-desc {
  font-size: 12px;
  color: #64748b;
  text-align: left;
}

.mapping-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mapping-item {
  padding: 12px 14px;
  border-radius: 12px;
  background: #f8fafc;
}

.mapping-label {
  font-size: 12px;
  color: #64748b;
}

.mapping-value {
  margin-top: 6px;
  font-size: 13px;
  color: #1e293b;
  line-height: 1.6;
}

@media (max-width: 1080px) {
  .principle-list,
  .content-grid {
    grid-template-columns: 1fr;
  }
}
</style>
