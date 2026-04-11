<template>
  <el-card style="margin-top: 16px" :loading="props.linksLoading">
    <template #header>
      <div class="card-header">
        <span>活动链接配置</span>
        <el-button type="primary" :loading="props.linksSaving" @click="props.saveActivityLinks">保存全部</el-button>
      </div>
    </template>

    <el-alert type="info" :closable="false" show-icon style="margin-bottom: 20px">
      <template #title>
        小程序活动页：<strong>顶部轮播</strong>会按顺序合并「Banner + 常驻活动 + 限时活动」统一展示；原卡片位改为<strong>品牌新闻</strong>列表（标题、摘要、封面、富文本正文）。下方仍可配置常驻/限时，用于纳入轮播。
      </template>
    </el-alert>

    <div class="links-section">
      <div class="links-section-header">
        <span class="links-section-title">Banner 轮播</span>
        <el-button size="small" @click="props.addLinksItem('banners')"><el-icon><Plus /></el-icon> 添加 Banner</el-button>
      </div>
      <div v-if="props.linksData.banners.length === 0" class="links-empty">暂无 Banner，点击添加</div>
      <el-card v-for="(item, idx) in props.linksData.banners" :key="item._key" shadow="never" class="links-item-card">
        <div class="links-item-row">
          <div class="links-sort-col">
            <span class="links-sort-label">排序</span>
            <el-input-number v-model="item.sort_order" :min="0" :max="99999" size="small" controls-position="right" class="sort-input" />
            <el-button text size="small" :disabled="idx === 0" @click="props.moveLinksItem('banners', idx, -1)">上移</el-button>
            <el-button text size="small" :disabled="idx === props.linksData.banners.length - 1" @click="props.moveLinksItem('banners', idx, 1)">下移</el-button>
          </div>
          <div class="links-item-preview">
            <el-image v-if="item.image" :src="item.image" fit="cover" class="preview-image" />
            <div v-else class="links-item-gradient" :style="{ background: item.gradient }"></div>
          </div>
          <div class="links-item-form">
            <el-row :gutter="12">
              <el-col :span="12"><el-form-item label="标题" label-width="60px"><el-input v-model="item.title" placeholder="Banner 标题" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="副标题" label-width="60px"><el-input v-model="item.subtitle" placeholder="副标题（可选）" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="标签" label-width="60px"><el-input v-model="item.tag" placeholder="如：限时 / 新品" maxlength="8" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="图片URL" label-width="60px"><el-input v-model="item.image" placeholder="留空使用渐变色背景" /></el-form-item></el-col>
              <el-col :span="24">
                <el-form-item label="跳转目标" label-width="60px">
                  <el-select
                    :model-value="props.currentActivityOptionKey(item.link_type, item.link_value)"
                    placeholder="选择跳转目标"
                    class="target-select"
                    :loading="props.activityOptionsLoading"
                    clearable
                    @change="(key) => props.applyOptionToItem(item, key)"
                    @clear="clearLinkTarget(item)"
                  >
                    <el-option v-for="opt in props.activityOptions" :key="opt.key" :label="opt.title" :value="opt.key" :disabled="opt.disabled">
                      <span>{{ opt.title }}</span>
                      <span class="option-badge">{{ opt.badge }}</span>
                    </el-option>
                  </el-select>
                  <el-input v-model="item.link_value" placeholder="或手填页面路径，如 /pages/product/detail?id=1" class="manual-link-input" @input="setManualLinkType(item)" />
                </el-form-item>
              </el-col>
            </el-row>
          </div>
          <el-button type="danger" text class="delete-button-top" @click="props.removeLinksItem('banners', idx)"><el-icon><Delete /></el-icon></el-button>
        </div>
      </el-card>
    </div>

    <div class="links-section">
      <div class="links-section-header">
        <span class="links-section-title">常驻活动</span>
        <el-button size="small" @click="props.addLinksItem('permanent')"><el-icon><Plus /></el-icon> 添加卡片</el-button>
      </div>
      <el-form class="meta-form" label-width="140px">
        <el-form-item label="小程序展示常驻区块" class="meta-form-item">
          <el-switch v-model="props.linksMeta.permanent_section_enabled" active-text="显示" inactive-text="隐藏" />
          <span class="meta-note">关闭后活动页整区隐藏（拼团/砍价/抽奖等入口一并收起）；卡片配置仍保留。</span>
        </el-form-item>
        <el-form-item label="区块顺序" class="meta-form-item">
          <el-radio-group v-model="props.linksMeta.activity_sections_order">
            <el-radio-button value="permanent_first">常驻在上</el-radio-button>
            <el-radio-button value="limited_first">限时在上</el-radio-button>
          </el-radio-group>
          <span class="meta-note">指合并进顶部轮播时，常驻与限时两组相对顺序</span>
        </el-form-item>
        <el-form-item label="新闻区标题" class="meta-form-item-last">
          <el-input v-model="props.linksMeta.brand_news_section_title" placeholder="品牌动态" maxlength="20" class="meta-title-input" />
        </el-form-item>
      </el-form>
      <div v-if="props.linksData.permanent.length === 0" class="links-empty">暂无常驻活动卡片</div>
      <el-card v-for="(item, idx) in props.linksData.permanent" :key="item._key" shadow="never" class="links-item-card">
        <div class="links-item-row">
          <div class="links-sort-col">
            <span class="links-sort-label">排序</span>
            <el-input-number v-model="item.sort_order" :min="0" :max="99999" size="small" controls-position="right" class="sort-input" />
            <el-button text size="small" :disabled="idx === 0" @click="props.moveLinksItem('permanent', idx, -1)">上移</el-button>
            <el-button text size="small" :disabled="idx === props.linksData.permanent.length - 1" @click="props.moveLinksItem('permanent', idx, 1)">下移</el-button>
            <div class="entry-toggle">
              <span class="links-sort-label">入口</span>
              <el-switch v-model="item.enabled" :active-value="true" :inactive-value="false" active-text="显示" inactive-text="隐藏" class="entry-switch" />
            </div>
          </div>
          <div class="links-item-preview">
            <el-image v-if="item.image" :src="item.image" fit="cover" class="preview-image" />
            <div v-else class="links-item-gradient" :style="{ background: item.gradient }"></div>
          </div>
          <div class="links-item-form">
            <el-row :gutter="12">
              <el-col :span="12"><el-form-item label="标题" label-width="60px"><el-input v-model="item.title" placeholder="活动标题" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="副标题" label-width="60px"><el-input v-model="item.subtitle" placeholder="一句话说明" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="标签" label-width="60px"><el-input v-model="item.tag" placeholder="如：常驻 / 拼团" maxlength="8" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="图片URL" label-width="60px"><el-input v-model="item.image" placeholder="留空使用渐变色背景" /></el-form-item></el-col>
              <el-col :span="24">
                <el-form-item label="跳转目标" label-width="60px">
                  <el-select
                    :model-value="props.currentActivityOptionKey(item.link_type, item.link_value)"
                    placeholder="选择跳转目标"
                    class="target-select"
                    :loading="props.activityOptionsLoading"
                    clearable
                    @change="(key) => props.applyOptionToItem(item, key)"
                    @clear="clearLinkTarget(item)"
                  >
                    <el-option v-for="opt in props.activityOptions" :key="opt.key" :label="opt.title" :value="opt.key" :disabled="opt.disabled">
                      <span>{{ opt.title }}</span>
                      <span class="option-badge">{{ opt.badge }}</span>
                    </el-option>
                  </el-select>
                  <el-input v-model="item.link_value" placeholder="或手填页面路径" class="manual-link-input" @input="setManualLinkType(item)" />
                </el-form-item>
              </el-col>
            </el-row>
          </div>
          <el-button type="danger" text class="delete-button-top" @click="props.removeLinksItem('permanent', idx)"><el-icon><Delete /></el-icon></el-button>
        </div>
      </el-card>
    </div>

    <div class="links-section">
      <div class="links-section-header">
        <span class="links-section-title">限时活动</span>
        <el-button size="small" @click="props.addLinksItem('limited')"><el-icon><Plus /></el-icon> 添加卡片</el-button>
      </div>
      <div v-if="props.linksData.limited.length === 0" class="links-empty">暂无限时活动卡片，过期自动下架</div>
      <el-card v-for="(item, idx) in props.linksData.limited" :key="item._key" shadow="never" class="links-item-card">
        <div class="links-item-row">
          <div class="links-sort-col">
            <span class="links-sort-label">排序</span>
            <el-input-number v-model="item.sort_order" :min="0" :max="99999" size="small" controls-position="right" class="sort-input" />
            <el-button text size="small" :disabled="idx === 0" @click="props.moveLinksItem('limited', idx, -1)">上移</el-button>
            <el-button text size="small" :disabled="idx === props.linksData.limited.length - 1" @click="props.moveLinksItem('limited', idx, 1)">下移</el-button>
          </div>
          <div class="links-item-preview">
            <el-image v-if="item.image" :src="item.image" fit="cover" class="preview-image" />
            <div v-else class="links-item-gradient" :style="{ background: item.gradient }"></div>
          </div>
          <div class="links-item-form">
            <el-row :gutter="12">
              <el-col :span="12"><el-form-item label="标题" label-width="60px"><el-input v-model="item.title" placeholder="限时活动标题" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="副标题" label-width="60px"><el-input v-model="item.subtitle" placeholder="活动说明" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="标签" label-width="60px"><el-input v-model="item.tag" placeholder="如：限时 48h" maxlength="8" /></el-form-item></el-col>
              <el-col :span="12">
                <el-form-item label="截止时间" label-width="60px">
                  <el-date-picker v-model="item.end_time" type="datetime" placeholder="选择截止时间" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DDTHH:mm:ss" style="width: 100%" />
                </el-form-item>
              </el-col>
              <el-col :span="24"><el-form-item label="图片URL" label-width="60px"><el-input v-model="item.image" placeholder="留空使用渐变色背景" /></el-form-item></el-col>
              <el-col :span="24">
                <el-form-item label="跳转目标" label-width="60px">
                  <el-select
                    :model-value="props.currentActivityOptionKey(item.link_type, item.link_value)"
                    placeholder="选择跳转目标"
                    class="target-select"
                    :loading="props.activityOptionsLoading"
                    clearable
                    @change="(key) => props.applyOptionToItem(item, key)"
                    @clear="clearLinkTarget(item)"
                  >
                    <el-option v-for="opt in props.activityOptions" :key="opt.key" :label="opt.title" :value="opt.key" :disabled="opt.disabled">
                      <span>{{ opt.title }}</span>
                      <span class="option-badge">{{ opt.badge }}</span>
                    </el-option>
                  </el-select>
                  <el-input v-model="item.link_value" placeholder="或手填页面路径" class="manual-link-input" @input="setManualLinkType(item)" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="12" class="limited-row">
              <el-col :span="24">
                <el-form-item label="主推商品" label-width="60px">
                  <el-select
                    v-model="item.direct_product_id"
                    filterable
                    remote
                    clearable
                    :remote-method="props.searchProducts"
                    :loading="props.productSearchLoading"
                    placeholder="不配专享时可选：小程序点击卡片进入该商品详情直购"
                    class="product-select"
                  >
                    <el-option v-for="p in props.productOptions" :key="p.id" :label="p.name" :value="String(p.id)" />
                  </el-select>
                  <div class="form-hint-muted">与下方「专享商品」可同时配置；已配置专享时优先进入限时专享页。仅配此项则走普通商品详情（加购/立即买）。</div>
                </el-form-item>
              </el-col>
              <el-col :span="24">
                <el-divider content-position="left">专享商品（可选）</el-divider>
                <el-alert type="info" :closable="false" style="margin-bottom: 10px">配置后保存将自动生成跳转至小程序「限时专享」页。支持仅积分、仅现金或两种方式同时开放。</el-alert>
                <el-button size="small" type="primary" plain @click="props.addSpotProduct(item)">+ 添加专享商品</el-button>
              </el-col>
            </el-row>
            <el-card v-for="(sp, si) in (item.spot_products || [])" :key="sp.id || si" shadow="never" class="spot-product-card">
              <el-row :gutter="10">
                <el-col :span="10">
                  <el-form-item label="商品" label-width="48px">
                    <el-select
                      v-model="sp.product_id"
                      filterable
                      remote
                      :remote-method="props.searchProducts"
                      :loading="props.productSearchLoading"
                      placeholder="搜索商品"
                      style="width: 100%"
                      @change="() => { sp.sku_id = null }"
                    >
                      <el-option v-for="p in props.productOptions" :key="p.id" :label="p.name" :value="String(p.id)" />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :span="6"><el-form-item label="SKU" label-width="40px"><el-input v-model.number="sp.sku_id" placeholder="可选规格ID" clearable /></el-form-item></el-col>
                <el-col :span="8" class="spot-delete-col"><el-button type="danger" text size="small" @click="props.removeSpotProduct(item, si)">删除</el-button></el-col>
              </el-row>
              <el-row :gutter="10">
                <el-col :span="6"><el-switch v-model="sp.enable_points" active-text="积分兑换" /></el-col>
                <el-col :span="6"><el-input-number v-model="sp.points_price" :min="1" :step="10" :disabled="!sp.enable_points" /><span class="money-note">积分</span></el-col>
                <el-col :span="6"><el-switch v-model="sp.enable_money" active-text="现金购买" /></el-col>
                <el-col :span="6"><el-input-number v-model="sp.money_price" :min="0.01" :precision="2" :step="1" :disabled="!sp.enable_money" /><span class="money-note">元</span></el-col>
              </el-row>
              <el-row :gutter="10">
                <el-col :span="8"><el-form-item label="名额" label-width="48px"><el-input-number v-model="sp.stock_limit" :min="1" :max="999999" /></el-form-item></el-col>
                <el-col :span="12"><span class="id-note">内部ID：{{ sp.id }}</span></el-col>
              </el-row>
            </el-card>
          </div>
          <el-button type="danger" text class="delete-button-top" @click="props.removeLinksItem('limited', idx)"><el-icon><Delete /></el-icon></el-button>
        </div>
      </el-card>
    </div>

    <div class="links-section">
      <div class="links-section-header">
        <span class="links-section-title">品牌新闻</span>
        <el-button size="small" @click="props.addNewsItem"><el-icon><Plus /></el-icon> 添加文章</el-button>
      </div>
      <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 12px">摘要用于列表展示；正文支持 HTML 片段（小程序 rich-text 子集）。无封面时前端显示占位底色。</el-alert>
      <div v-if="props.linksData.brand_news.length === 0" class="links-empty">暂无新闻，点击添加</div>
      <el-card v-for="(item, idx) in props.linksData.brand_news" :key="item._key" shadow="never" class="links-item-card">
        <div class="links-item-row links-item-row-news">
          <div class="links-sort-col">
            <span class="links-sort-label">排序</span>
            <el-input-number v-model="item.sort_order" :min="0" :max="99999" size="small" controls-position="right" class="sort-input" />
            <el-button text size="small" :disabled="idx === 0" @click="props.moveNewsItem(idx, -1)">上移</el-button>
            <el-button text size="small" :disabled="idx === props.linksData.brand_news.length - 1" @click="props.moveNewsItem(idx, 1)">下移</el-button>
            <div class="entry-toggle">
              <span class="links-sort-label">显示</span>
              <el-switch v-model="item.enabled" :active-value="true" :inactive-value="false" class="entry-switch" />
            </div>
          </div>
          <div class="links-item-form news-form">
            <el-row :gutter="12">
              <el-col :span="24"><el-form-item label="标题" label-width="72px"><el-input v-model="item.title" placeholder="新闻标题" maxlength="80" /></el-form-item></el-col>
              <el-col :span="24"><el-form-item label="摘要" label-width="72px"><el-input v-model="item.summary" type="textarea" :rows="2" placeholder="列表展示用简短摘要" maxlength="500" /></el-form-item></el-col>
              <el-col :span="24"><el-form-item label="封面图" label-width="72px"><el-input v-model="item.cover_image" placeholder="HTTPS 图片地址（可选）" /></el-form-item></el-col>
              <el-col :span="24">
                <el-form-item label="正文 HTML" label-width="72px">
                  <el-input v-model="item.content_html" type="textarea" :rows="6" placeholder="详情页展示，可用简单 HTML（p、img、strong 等）" />
                </el-form-item>
              </el-col>
            </el-row>
          </div>
          <el-button type="danger" text class="delete-button-top" @click="props.removeNewsItem(idx)"><el-icon><Delete /></el-icon></el-button>
        </div>
      </el-card>
    </div>
  </el-card>
</template>

<script setup>
import { Delete, Plus } from '@element-plus/icons-vue'

const props = defineProps({
  linksLoading: { type: Boolean, required: true },
  linksSaving: { type: Boolean, required: true },
  linksData: { type: Object, required: true },
  linksMeta: { type: Object, required: true },
  activityOptionsLoading: { type: Boolean, required: true },
  activityOptions: { type: Array, required: true },
  currentActivityOptionKey: { type: Function, required: true },
  applyOptionToItem: { type: Function, required: true },
  addLinksItem: { type: Function, required: true },
  removeLinksItem: { type: Function, required: true },
  moveLinksItem: { type: Function, required: true },
  saveActivityLinks: { type: Function, required: true },
  searchProducts: { type: Function, required: true },
  productSearchLoading: { type: Boolean, required: true },
  productOptions: { type: Array, required: true },
  addSpotProduct: { type: Function, required: true },
  removeSpotProduct: { type: Function, required: true },
  addNewsItem: { type: Function, required: true },
  removeNewsItem: { type: Function, required: true },
  moveNewsItem: { type: Function, required: true }
})

const clearLinkTarget = (item) => {
  item.link_type = 'none'
  item.link_value = ''
  item.direct_product_id = null
}

const setManualLinkType = (item) => {
  item.direct_product_id = null
  item.link_type = item.link_value ? 'page' : 'none'
}
</script>

<style scoped>
.card-header,.links-section-header{display:flex;align-items:center;justify-content:space-between}
.links-section{margin-bottom:32px}
.links-section-header{margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f0f0f0}
.links-section-title{font-size:15px;font-weight:600;color:#303133}
.links-empty{color:#aaa;font-size:13px;padding:16px 0;text-align:center}
.links-item-card{margin-bottom:12px}
.links-item-row{display:flex;gap:16px;align-items:flex-start}
.links-item-row-news{flex-wrap:wrap}
.links-sort-col{display:flex;flex-direction:column;gap:6px;width:108px;flex-shrink:0}
.links-sort-label,.meta-note,.form-hint-muted,.money-note,.id-note,.option-badge{font-size:12px;color:#909399}
.sort-input{width:100px}
.links-item-preview{width:100px;height:70px;border-radius:8px;overflow:hidden;flex-shrink:0;background:#f5f5f5}
.preview-image,.links-item-gradient{width:100%;height:100%}
.links-item-form{flex:1}
.target-select{width:min(280px,100%)}
.manual-link-input,.form-hint-muted{margin-top:6px}
.delete-button-top{align-self:flex-start;margin-top:4px}
.meta-form{margin-bottom:16px;padding:12px 16px;background:var(--el-fill-color-light);border-radius:8px}
.meta-form-item{margin-bottom:8px}
.meta-form-item-last{margin-bottom:0}
.meta-title-input{max-width:320px}
.entry-toggle{margin-top:10px}
.entry-switch{margin-left:6px}
.limited-row{margin-top:12px}
.product-select{width:100%;max-width:420px}
.spot-product-card{margin-top:10px}
.spot-delete-col{text-align:right}
.money-note{margin-left:6px}
.news-form{min-width:280px}
@media (max-width:767px){.card-header,.links-section-header{flex-wrap:wrap;gap:8px}.links-item-row{flex-direction:column}.links-item-preview{width:100%;height:120px}}
</style>
