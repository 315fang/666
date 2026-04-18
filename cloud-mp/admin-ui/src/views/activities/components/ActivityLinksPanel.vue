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
        <el-form-item label="区块标题" class="meta-form-item">
          <el-input v-model="props.linksMeta.permanent_section_title" placeholder="如：热门活动" maxlength="20" class="meta-title-input" />
        </el-form-item>
        <el-form-item label="区块副标题" class="meta-form-item">
          <el-input v-model="props.linksMeta.permanent_section_subtitle" placeholder="如：优先展示平台主推入口" maxlength="30" class="meta-title-input" />
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
              <el-col :span="12">
                <el-form-item label="视觉预设" label-width="60px">
                  <el-select v-model="item.style_key" placeholder="默认按活动类型" clearable>
                    <el-option v-for="opt in stylePresetOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12"><el-form-item label="胶囊文案" label-width="60px"><el-input v-model="item.pill_text" placeholder="如：主推活动 / 常驻入口" maxlength="10" /></el-form-item></el-col>
              <el-col :span="24"><el-form-item label="图标路径" label-width="60px"><el-input v-model="item.icon" placeholder="如：/assets/icons/clock.svg；留空按预设或默认图标" /></el-form-item></el-col>
              <el-col :span="24">
                <el-form-item label="渐变背景" label-width="60px">
                  <el-input v-model="item.gradient" placeholder="如：linear-gradient(135deg, #7A1F1F 0%, #F97316 100%)" />
                  <div class="form-hint-muted">未配图片时生效；留空则按预设或默认活动样式。</div>
                </el-form-item>
              </el-col>
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
        <span class="links-section-title">限时秒杀</span>
        <el-button size="small" @click="props.addLinksItem('limited')"><el-icon><Plus /></el-icon> 添加卡片</el-button>
      </div>
      <div v-if="props.linksData.limited.length === 0" class="links-empty">暂无限时秒杀卡片，过期自动下架</div>
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
              <el-col :span="12"><el-form-item label="标题" label-width="60px"><el-input v-model="item.title" placeholder="限时秒杀标题" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="副标题" label-width="60px"><el-input v-model="item.subtitle" placeholder="秒杀说明" /></el-form-item></el-col>
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
            <el-alert
              type="info"
              :closable="false"
              show-icon
              style="margin-top: 12px"
              title="限时秒杀卡现在只负责入口、标题、副标题、封面和倒计时文案。真实售卖商品请到「商品与营销 > 限时商品」独立配置。"
            />
            <div v-if="item.spot_products && item.spot_products.length" class="form-hint-muted" style="margin-top: 8px;">
              当前保留旧专享商品配置 {{ item.spot_products.length }} 项，仅作兼容兜底；后续请迁移到独立限时商品后台。
            </div>
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
  searchProducts: { type: Function, required: false, default: () => {} },
  productSearchLoading: { type: Boolean, required: false, default: false },
  productOptions: { type: Array, required: false, default: () => [] },
  addSpotProduct: { type: Function, required: false, default: () => {} },
  removeSpotProduct: { type: Function, required: false, default: () => {} },
  addNewsItem: { type: Function, required: true },
  removeNewsItem: { type: Function, required: true },
  moveNewsItem: { type: Function, required: true }
})

const stylePresetOptions = [
  { value: 'flash_sale', label: '秒杀红' },
  { value: 'coupon_center', label: '优惠券蓝' },
  { value: 'lottery', label: '抽奖绿' },
  { value: 'group', label: '拼团蓝' },
  { value: 'slash', label: '砍价橙' }
]

const clearLinkTarget = (item) => {
  item.link_type = 'none'
  item.link_value = ''
}

const setManualLinkType = (item) => {
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
.links-sort-label,.meta-note,.form-hint-muted,.option-badge{font-size:12px;color:#909399}
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
.news-form{min-width:280px}
@media (max-width:767px){.card-header,.links-section-header{flex-wrap:wrap;gap:8px}.links-item-row{flex-direction:column}.links-item-preview{width:100%;height:120px}}
</style>
