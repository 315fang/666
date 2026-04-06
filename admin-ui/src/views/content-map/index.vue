<template>
  <div class="content-map-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>页面与核心池归属</span>
        </div>
      </template>

      <el-alert
        title="这页用于告诉运营：每个前台页面的内容应该归到哪个核心池管理，避免继续新增碎片页面。"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
      />

      <div class="summary-grid">
        <div v-for="item in poolSummary" :key="item.name" class="summary-card">
          <div class="summary-name">{{ item.name }}</div>
          <div class="summary-desc">{{ item.desc }}</div>
        </div>
      </div>

      <el-table :data="rows" stripe>
        <el-table-column prop="page" label="页面" width="130" />
        <el-table-column prop="section" label="模块/内容" min-width="180" />
        <el-table-column prop="pool" label="核心池" width="120">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.pool }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="source" label="当前数据来源" min-width="220" />
        <el-table-column prop="adminEntry" label="后台入口" min-width="220" />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="row.status === '已后台化' ? 'success' : row.status === '部分后台化' ? 'warning' : 'info'">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="notes" label="备注" min-width="220" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
const poolSummary = [
  { name: '商品池', desc: '商品、分类、价格、SKU、商品状态' },
  { name: '内容池', desc: 'Banner、素材、图文、评论、消息文案' },
  { name: '榜单池', desc: '首页精选商品榜、专题商品集合' },
  { name: '活动池', desc: '拼团、砍价、抽奖、优惠券、活动链接' },
  { name: '页面编排', desc: '首页、活动页、我的页模块顺序与引用关系' },
  { name: '规则中心', desc: '会员等级、策略、阈值、规则摘要' }
]

const rows = [
  { page: '首页', section: '顶部轮播 Banner', pool: '内容池', source: 'page-content/home -> banners.home', adminEntry: '内容池 -> Banner/内容', status: '已后台化', notes: '已接入统一 page-content 读口' },
  { page: '首页', section: '中部/底部海报', pool: '内容池', source: 'page-content/home -> banners.home_mid / home_bottom', adminEntry: '内容池 -> Banner/内容', status: '已后台化', notes: '首页海报位统一按 Banner 资源管理' },
  { page: '首页', section: '精选商品榜', pool: '榜单池', source: 'page-content/home -> boards.home.featuredProducts', adminEntry: '榜单池 -> 精选商品榜', status: '已后台化', notes: '商品集合已切到 ContentBoard' },
  { page: '首页', section: '模块顺序/首页区块', pool: '页面编排', source: 'PageLayout + HomeSection(兼容)', adminEntry: '页面编排 -> 页面管理', status: '部分后台化', notes: '已新增 PageLayout，旧 HomeSection 仍兼容存在' },
  { page: '活动页', section: 'Banner / 常驻活动 / 限时活动', pool: '活动池', source: 'page-content/activity -> activity_links', adminEntry: '活动池 -> 砍价/抽奖/节日', status: '已后台化', notes: '活动页已优先走统一聚合读口' },
  { page: '我的页', section: '规则摘要卡片', pool: '规则中心', source: 'page-content/user -> rules', adminEntry: '规则中心 -> 会员与策略 / 系统配置', status: '已后台化', notes: '我的页已显示统一规则摘要' },
  { page: '我的页', section: '会员服务入口/工具区', pool: '页面编排', source: '前端配置 + PageLayout 骨架', adminEntry: '页面编排 -> 页面管理', status: '部分后台化', notes: '显示顺序后续继续收进 PageLayout' },
  { page: '分类页', section: '分类与商品列表', pool: '商品池', source: 'categories / products', adminEntry: '商品池 -> 商品管理 / 商品分类', status: '已后台化', notes: '分类与商品主数据已在商品池' },
  { page: '商品详情', section: '商品标题/价格/主图/SKU', pool: '商品池', source: 'products / skus', adminEntry: '商品池 -> 商品管理', status: '已后台化', notes: '商品详情数据统一归商品主数据' },
  { page: '商品详情', section: '评论区', pool: '内容池', source: 'reviews', adminEntry: '内容池 -> 评论管理', status: '已后台化', notes: '评论审核与展示状态可管' },
  { page: '订单/售后', section: '状态流转与售后处理', pool: '运营执行面', source: 'orders / refunds / withdrawals', adminEntry: '订单管理 / 售后管理 / 提现审核', status: '已后台化', notes: '这类页面保留为高频执行页，不并入内容类核心池' }
]
</script>

<style scoped>
.content-map-page { padding: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.summary-card {
  padding: 14px 16px;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  background: #f8fafc;
}
.summary-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}
.summary-desc {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: #606266;
}
@media (max-width: 1080px) {
  .summary-grid { grid-template-columns: 1fr; }
}
</style>
