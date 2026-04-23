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
            <el-image v-if="resolveCardImage(item)" :src="resolveCardImage(item)" fit="cover" class="preview-image" />
            <div v-else class="links-item-gradient" :style="{ background: item.gradient }"></div>
          </div>
          <div class="links-item-form">
            <el-row :gutter="12">
              <el-col :span="12"><el-form-item label="标题" label-width="60px"><el-input v-model="item.title" placeholder="Banner 标题" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="副标题" label-width="60px"><el-input v-model="item.subtitle" placeholder="副标题（可选）" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="标签" label-width="60px"><el-input v-model="item.tag" placeholder="如：限时 / 新品" maxlength="8" /></el-form-item></el-col>
              <el-col :span="12">
                <el-form-item label="图片URL" label-width="60px">
                  <div class="image-field">
                    <el-input v-model="item.image" placeholder="留空使用渐变色背景" @input="onCardImageInput(item)" />
                    <div class="image-actions">
                      <el-button size="small" @click="openImagePicker('banners', idx)">从素材库选择</el-button>
                      <el-button v-if="resolveCardImage(item)" size="small" text type="danger" @click="clearCardImage(item)">清空</el-button>
                    </div>
                  </div>
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
          <el-input v-model="props.linksMeta.brand_news_section_title" placeholder="新闻中心" maxlength="20" class="meta-title-input" />
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
            <el-image v-if="resolveCardImage(item)" :src="resolveCardImage(item)" fit="cover" class="preview-image" />
            <div v-else class="links-item-gradient" :style="{ background: item.gradient }"></div>
          </div>
          <div class="links-item-form">
            <el-row :gutter="12">
              <el-col :span="12"><el-form-item label="标题" label-width="60px"><el-input v-model="item.title" placeholder="活动标题" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="副标题" label-width="60px"><el-input v-model="item.subtitle" placeholder="一句话说明" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="标签" label-width="60px"><el-input v-model="item.tag" placeholder="如：常驻 / 拼团" maxlength="8" /></el-form-item></el-col>
              <el-col :span="12">
                <el-form-item label="图片URL" label-width="60px">
                  <div class="image-field">
                    <el-input v-model="item.image" placeholder="留空使用渐变色背景" @input="onCardImageInput(item)" />
                    <div class="image-actions">
                      <el-button size="small" @click="openImagePicker('permanent', idx)">从素材库选择</el-button>
                      <el-button v-if="resolveCardImage(item)" size="small" text type="danger" @click="clearCardImage(item)">清空</el-button>
                    </div>
                  </div>
                </el-form-item>
              </el-col>
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
            <el-image v-if="resolveCardImage(item)" :src="resolveCardImage(item)" fit="cover" class="preview-image" />
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
              <el-col :span="24">
                <el-form-item label="图片URL" label-width="60px">
                  <div class="image-field">
                    <el-input v-model="item.image" placeholder="留空使用渐变色背景" @input="onCardImageInput(item)" />
                    <div class="image-actions">
                      <el-button size="small" @click="openImagePicker('limited', idx)">从素材库选择</el-button>
                      <el-button v-if="resolveCardImage(item)" size="small" text type="danger" @click="clearCardImage(item)">清空</el-button>
                    </div>
                  </div>
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
        <span class="links-section-title">新闻中心内容</span>
        <el-button size="small" @click="props.addNewsItem"><el-icon><Plus /></el-icon> 添加文章</el-button>
      </div>
      <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 12px">这里的内容供首页品牌专区固定三入口使用，按“最新活动 / 行业前沿 / 商城公告”分类展示；摘要用于列表展示，正文支持 HTML 片段。封面图支持直接上传、素材库选择，未单独设置时会尝试使用正文首图兜底。</el-alert>
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
              <el-col :span="24">
                <el-form-item label="分类" label-width="72px">
                  <el-select v-model="item.category_key" style="width:240px">
                    <el-option v-for="option in newsCategoryOptions" :key="option.value" :label="option.label" :value="option.value" />
                  </el-select>
                </el-form-item>
              </el-col>
               <el-col :span="24"><el-form-item label="标题" label-width="72px"><el-input v-model="item.title" placeholder="新闻标题" maxlength="80" /></el-form-item></el-col>
               <el-col :span="24"><el-form-item label="摘要" label-width="72px"><el-input v-model="item.summary" type="textarea" :rows="2" placeholder="列表展示用简短摘要" maxlength="500" /></el-form-item></el-col>
               <el-col :span="24">
                 <el-form-item label="封面图" label-width="72px">
                   <div class="news-cover-field">
                     <div class="news-cover-layout">
                       <div class="news-cover-controls">
                         <div :class="['news-cover-status', { 'is-derived': !hasExplicitNewsCover(item) && extractNewsCoverCandidate(item.content_html), 'is-empty': !resolveNewsCoverDisplay(item) }]">
                           <span class="news-cover-status-label">{{ getNewsCoverModeLabel(item) }}</span>
                           <span class="news-cover-status-text">{{ getNewsCoverModeHint(item) }}</span>
                         </div>
                         <div class="image-actions news-cover-actions">
                           <el-button size="small" type="primary" plain :loading="isUploadingNewsCover(idx)" @click="triggerNewsCoverUpload(idx)">上传封面</el-button>
                           <el-button size="small" @click="openImagePicker('brand_news', idx, 'cover')">从素材库选择</el-button>
                           <el-button v-if="extractNewsCoverCandidate(item.content_html)" size="small" @click="applyAutoNewsCover(item)">使用正文首图</el-button>
                           <el-button v-if="hasExplicitNewsCover(item)" size="small" text type="danger" @click="clearNewsCover(item)">清空</el-button>
                         </div>
                         <div :class="['news-cover-auto-note', { 'is-empty': !extractNewsCoverCandidate(item.content_html) }]">
                           {{ extractNewsCoverCandidate(item.content_html)
                             ? '已检测到正文首图。未单独设置时，前台列表与详情会优先使用这张图兜底。'
                             : '正文里还没有可识别图片，建议直接上传一张横图封面。' }}
                         </div>
                         <el-input
                           v-if="showNewsCoverManualInput(item)"
                           v-model="item.cover_image"
                           placeholder="高级方式：手动填写 HTTPS 图片地址"
                           @input="onNewsCoverInput(item)"
                         />
                         <el-button text size="small" class="news-cover-manual-toggle" @click="toggleNewsCoverManualInput(item)">
                           {{ showNewsCoverManualInput(item) ? '手动地址模式中' : '手动填写地址' }}
                         </el-button>
                       </div>
                       <div class="news-cover-previews">
                         <div class="news-preview-card">
                           <div class="news-preview-label">列表卡片</div>
                           <div class="news-preview-list-item">
                             <div class="news-preview-media">
                               <el-image v-if="resolveNewsCoverDisplay(item)" :src="resolveNewsCoverDisplay(item)" fit="cover" class="news-preview-image" />
                               <div v-else class="news-preview-placeholder">未设置封面</div>
                             </div>
                             <div class="news-preview-copy">
                               <div class="news-preview-title">{{ item.title || '新闻标题预览' }}</div>
                               <div class="news-preview-summary">{{ item.summary || '摘要将显示在这里，帮助运营判断列表信息密度。' }}</div>
                             </div>
                           </div>
                         </div>
                         <div class="news-preview-card">
                           <div class="news-preview-label">详情头图</div>
                           <div class="news-preview-detail">
                             <div class="news-preview-detail-media">
                               <el-image v-if="resolveNewsCoverDisplay(item)" :src="resolveNewsCoverDisplay(item)" fit="cover" class="news-preview-image" />
                               <div v-else class="news-preview-placeholder">详情页将直接进入正文</div>
                             </div>
                             <div class="news-preview-detail-title">{{ item.title || '新闻标题预览' }}</div>
                           </div>
                         </div>
                       </div>
                     </div>
                   </div>
                 </el-form-item>
               </el-col>
              <el-col :span="24">
                <el-form-item label="正文" label-width="72px">
                  <div class="news-content-field">
                    <div class="news-content-toolbar">
                      <el-button size="small" type="primary" plain :loading="isUploadingNewsContent(idx)" @click="triggerNewsContentUpload(idx)">上传正文图片</el-button>
                      <el-button size="small" @click="openImagePicker('brand_news', idx, 'content_image')">从素材库插图</el-button>
                    </div>
                    <div class="news-content-hint">
                      普通文字会按换行自动分段，前台默认每段首行缩进两格。单独插入的图片会按正文配图展示；高级用户仍可直接写 `p`、`img`、`strong` 等 HTML。
                    </div>
                    <el-input
                      :ref="(el) => setNewsContentInputRef(item._key, el)"
                      v-model="item.content_html"
                      type="textarea"
                      :rows="8"
                      placeholder="直接输入正文即可；每段换行一次，段首会自动缩进两格"
                      @focus="syncNewsContentCursor(item, $event)"
                      @click="syncNewsContentCursor(item, $event)"
                      @keyup="syncNewsContentCursor(item, $event)"
                      @select="syncNewsContentCursor(item, $event)"
                    />
                  </div>
                </el-form-item>
              </el-col>
            </el-row>
          </div>
          <el-button type="danger" text class="delete-button-top" @click="props.removeNewsItem(idx)"><el-icon><Delete /></el-icon></el-button>
        </div>
      </el-card>
    </div>
  </el-card>
  <MediaPicker
    v-model:visible="mediaPickerVisible"
    :multiple="false"
    :max="1"
    @confirm="handleMediaConfirm"
  />
  <input
    ref="newsCoverUploadInput"
    type="file"
    accept="image/*"
    style="display:none"
    @change="handleNewsCoverUpload"
  />
  <input
    ref="newsContentUploadInput"
    type="file"
    accept="image/*"
    style="display:none"
    @change="handleNewsContentUpload"
  />
</template>

<script setup>
import { nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, Plus } from '@element-plus/icons-vue'
import MediaPicker from '@/components/MediaPicker.vue'
import { createMaterial, uploadFile } from '@/api'
import { buildPersistentAssetRef } from '@/utils/assetUrlAudit'
import { extractFirstImageFromHtml } from '@/utils/newsCover'

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

const newsCategoryOptions = [
  { value: 'latest_activity', label: '最新活动' },
  { value: 'industry_frontier', label: '行业前沿' },
  { value: 'mall_notice', label: '商城公告' }
]

const mediaPickerVisible = ref(false)
const mediaPickerContext = ref({ section: '', index: -1, field: 'image' })
const newsCoverUploadInput = ref(null)
const newsCoverUploadContext = ref({ section: 'brand_news', index: -1, field: 'cover' })
const newsCoverUploading = ref(false)
const newsContentUploadInput = ref(null)
const newsContentUploadContext = ref({ section: 'brand_news', index: -1, field: 'content_image' })
const newsContentUploading = ref(false)
const newsContentInputRefs = ref({})
const newsContentSelectionMap = ref({})

const resolveCardImage = (item = {}) => item._preview_url || item.image || ''
const resolveNewsCover = (item = {}) => item._preview_url || item.cover_image || ''
const extractNewsCoverCandidate = (html = '') => extractFirstImageFromHtml(html)
const resolveNewsCoverDisplay = (item = {}) => resolveNewsCover(item) || extractNewsCoverCandidate(item.content_html || '')
const hasExplicitNewsCover = (item = {}) => !!String(resolveNewsCover(item) || item.cover_file_id || item.file_id || '').trim()

const setNewsContentInputRef = (key, el) => {
  if (!key) return
  if (el) {
    newsContentInputRefs.value[key] = el
    return
  }
  delete newsContentInputRefs.value[key]
}

const syncNewsContentCursor = (item, event) => {
  const key = item?._key
  const target = event?.target
  if (!key || !target || typeof target.selectionStart !== 'number') return
  newsContentSelectionMap.value[key] = {
    start: target.selectionStart,
    end: typeof target.selectionEnd === 'number' ? target.selectionEnd : target.selectionStart
  }
}

const openImagePicker = (section, index, field = 'image') => {
  mediaPickerContext.value = { section, index, field }
  mediaPickerVisible.value = true
}

const getTargetItem = (context = mediaPickerContext.value) => {
  const { section, index } = context || {}
  const list = props.linksData && props.linksData[section]
  if (!Array.isArray(list)) return null
  return list[index] || null
}

const onCardImageInput = (item) => {
  if (!item) return
  item.file_id = ''
  item._preview_url = ''
}

const onNewsCoverInput = (item) => {
  if (!item) return
  item.cover_file_id = ''
  item.file_id = ''
  item._preview_url = ''
  item._cover_source_type = 'manual'
  item._show_manual_cover_input = true
}

const clearCardImage = (item) => {
  if (!item) return
  item.image = ''
  item.file_id = ''
  item._preview_url = ''
}

const clearNewsCover = (item) => {
  if (!item) return
  item.cover_image = ''
  item.cover_file_id = ''
  item.file_id = ''
  item._preview_url = ''
  item._cover_source_type = ''
  item._show_manual_cover_input = false
}

const applyNewsCoverSelection = (item, { persist = '', display = '', source = persist ? 'material' : 'auto' } = {}) => {
  if (!item) return
  item.cover_file_id = persist
  item.file_id = persist
  item.cover_image = buildPersistentAssetRef({ url: display || persist, fileId: persist }) || ''
  item._preview_url = display || ''
  item._cover_source_type = source
  item._show_manual_cover_input = source === 'manual'
}

const getNewsCoverModeLabel = (item = {}) => {
  if (hasExplicitNewsCover(item)) {
    if (item._cover_source_type === 'auto' && !item.cover_file_id && !item.file_id) return '已采用正文首图'
    return item.cover_file_id || item.file_id ? '已绑定素材封面' : '已手动设置封面'
  }
  if (extractNewsCoverCandidate(item.content_html || '')) return '正文首图兜底'
  return '未设置封面'
}

const getNewsCoverModeHint = (item = {}) => {
  if (hasExplicitNewsCover(item)) return '前台会优先使用当前封面图'
  if (extractNewsCoverCandidate(item.content_html || '')) return '管理员可直接采用正文首图，少一次重复上传'
  return '建议补一张横图，列表与详情视觉会更稳定'
}

const showNewsCoverManualInput = (item = {}) => {
  return !!item._show_manual_cover_input || (
    !!String(item.cover_image || '').trim()
    && !item.cover_file_id
    && !item.file_id
    && item._cover_source_type !== 'auto'
    && item._cover_source_type !== 'material'
  )
}

const toggleNewsCoverManualInput = (item) => {
  if (!item) return
  item._show_manual_cover_input = !item._show_manual_cover_input
  if (item._show_manual_cover_input && !item.cover_image) {
    item._cover_source_type = 'manual'
  }
}

const applyAutoNewsCover = (item) => {
  const candidate = extractNewsCoverCandidate(item?.content_html || '')
  if (!candidate) {
    ElMessage.warning('正文里还没有可用图片，暂时无法自动生成封面')
    return
  }
  applyNewsCoverSelection(item, { display: candidate, source: 'auto' })
  ElMessage.success('已将正文首图设为封面')
}

const triggerNewsCoverUpload = (index) => {
  newsCoverUploadContext.value = { section: 'brand_news', index, field: 'cover' }
  if (newsCoverUploadInput.value) {
    newsCoverUploadInput.value.value = ''
    newsCoverUploadInput.value.click()
  }
}

const isUploadingNewsCover = (index) => {
  return newsCoverUploading.value && newsCoverUploadContext.value.index === index
}

const isUploadingNewsContent = (index) => {
  return newsContentUploading.value && newsContentUploadContext.value.index === index
}

const isCloudFileId = (value) => /^cloud:\/\//i.test(String(value || ''))

const sanitizeHtmlAttribute = (value = '') => {
  return String(value || '').replace(/"/g, '&quot;')
}

const buildNewsContentImageSnippet = (item, { persist = '', display = '' } = {}) => {
  const displayUrl = String(display || '').trim()
  const fileId = String(persist || '').trim()
  const renderableUrl = displayUrl || fileId
  if (!renderableUrl) return ''
  const raw = String(item?.content_html || '')
  const selection = newsContentSelectionMap.value[item?._key] || {}
  const start = Number.isFinite(selection.start) ? Math.max(0, Math.min(selection.start, raw.length)) : raw.length
  const end = Number.isFinite(selection.end) ? Math.max(start, Math.min(selection.end, raw.length)) : start
  const before = raw.slice(0, start)
  const after = raw.slice(end)
  const prefix = before && !before.endsWith('\n') ? '\n' : ''
  const suffix = after && !after.startsWith('\n') ? '\n' : ''
  const fileIdAttr = fileId ? ` data-file-id="${sanitizeHtmlAttribute(fileId)}"` : ''
  return {
    start,
    end,
    snippet: `${prefix}<img src="${sanitizeHtmlAttribute(renderableUrl)}"${fileIdAttr} alt="正文配图" />${suffix}`
  }
}

const insertNewsContentImage = async (item, asset = {}) => {
  if (!item) return
  const payload = buildNewsContentImageSnippet(item, asset)
  if (!payload?.snippet) {
    ElMessage.warning('未获得可用的正文图片地址，请重试')
    return
  }
  const raw = String(item.content_html || '')
  const nextValue = `${raw.slice(0, payload.start)}${payload.snippet}${raw.slice(payload.end)}`
  item.content_html = nextValue
  await nextTick()
  const inputInstance = newsContentInputRefs.value[item._key]
  const textarea = inputInstance?.textarea
  if (textarea && typeof textarea.focus === 'function') {
    const nextCursor = payload.start + payload.snippet.length
    textarea.focus()
    if (typeof textarea.setSelectionRange === 'function') {
      textarea.setSelectionRange(nextCursor, nextCursor)
    }
    newsContentSelectionMap.value[item._key] = { start: nextCursor, end: nextCursor }
  }
}

const triggerNewsContentUpload = (index) => {
  newsContentUploadContext.value = { section: 'brand_news', index, field: 'content_image' }
  if (newsContentUploadInput.value) {
    newsContentUploadInput.value.value = ''
    newsContentUploadInput.value.click()
  }
}

const handleNewsCoverUpload = async (event) => {
  const file = Array.from(event?.target?.files || [])[0]
  if (event?.target) event.target.value = ''
  if (!file) return

  const target = getTargetItem(newsCoverUploadContext.value)
  if (!target) {
    ElMessage.warning('未找到当前新闻条目，请重试')
    return
  }

  newsCoverUploading.value = true
  try {
    const res = await uploadFile(file, { params: { skip_library: '1', folder: 'materials' } })
    const displayUrl = res?.url || res?.data?.url || ''
    const fileId = res?.file_id || res?.data?.file_id || ''
    if (!displayUrl || !isCloudFileId(fileId)) {
      throw new Error('上传成功但未获得稳定素材标识，请检查存储配置')
    }

    try {
      await createMaterial({
        type: 'image',
        title: file.name.replace(/\.[^.]+$/, ''),
        url: buildPersistentAssetRef({ url: displayUrl, fileId }),
        file_id: fileId
      })
    } catch (error) {
      console.warn('[ActivityLinksPanel] create material for news cover failed:', error)
    }

    applyNewsCoverSelection(target, { persist: fileId, display: displayUrl, source: 'material' })
    ElMessage.success('封面已上传并选中')
  } catch (error) {
    ElMessage.error(error?.message || '封面上传失败，请重试')
  } finally {
    newsCoverUploading.value = false
  }
}

const handleNewsContentUpload = async (event) => {
  const file = Array.from(event?.target?.files || [])[0]
  if (event?.target) event.target.value = ''
  if (!file) return

  const target = getTargetItem(newsContentUploadContext.value)
  if (!target) {
    ElMessage.warning('未找到当前新闻正文，请重试')
    return
  }

  newsContentUploading.value = true
  try {
    const res = await uploadFile(file, { params: { skip_library: '1', folder: 'materials' } })
    const displayUrl = res?.url || res?.data?.url || ''
    const fileId = res?.file_id || res?.data?.file_id || ''
    if (!displayUrl || !isCloudFileId(fileId)) {
      throw new Error('上传成功但未获得稳定素材标识，请检查存储配置')
    }

    try {
      await createMaterial({
        type: 'image',
        title: file.name.replace(/\.[^.]+$/, ''),
        url: buildPersistentAssetRef({ url: displayUrl, fileId }),
        file_id: fileId
      })
    } catch (error) {
      console.warn('[ActivityLinksPanel] create material for news content image failed:', error)
    }

    await insertNewsContentImage(target, { persist: fileId, display: displayUrl })
    ElMessage.success('正文图片已插入')
  } catch (error) {
    ElMessage.error(error?.message || '正文图片上传失败，请重试')
  } finally {
    newsContentUploading.value = false
  }
}

const handleMediaConfirm = (persistIds = [], displayUrls = []) => {
  const target = getTargetItem()
  if (!target) return
  const persist = Array.isArray(persistIds) ? (persistIds[0] || '') : ''
  const display = Array.isArray(displayUrls) ? (displayUrls[0] || '') : ''
  const stableUrl = buildPersistentAssetRef({ url: display || persist })
  if (mediaPickerContext.value.field === 'cover') {
    applyNewsCoverSelection(target, { persist, display: display || stableUrl || '', source: 'material' })
    return
  }
  if (mediaPickerContext.value.field === 'content_image') {
    insertNewsContentImage(target, { persist, display: display || stableUrl || '' })
    return
  }
  target.file_id = persist
  target.image = stableUrl || ''
  target._preview_url = display || ''
}

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
.image-field{display:flex;flex-direction:column;gap:8px;width:100%}
.image-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.target-select{width:min(280px,100%)}
.manual-link-input,.form-hint-muted{margin-top:6px}
.news-cover-preview{width:120px;height:80px;border-radius:8px;border:1px solid #ebeef5}
.delete-button-top{align-self:flex-start;margin-top:4px}
.meta-form{margin-bottom:16px;padding:12px 16px;background:var(--el-fill-color-light);border-radius:8px}
.meta-form-item{margin-bottom:8px}
.meta-form-item-last{margin-bottom:0}
.meta-title-input{max-width:320px}
.entry-toggle{margin-top:10px}
.entry-switch{margin-left:6px}
.news-form{min-width:280px}
.news-cover-field{width:100%}
.news-cover-layout{display:grid;grid-template-columns:minmax(260px,1.25fr) minmax(260px,1fr);gap:12px;padding:12px;border:1px solid #e7e1d4;border-radius:12px;background:#f7f5ef}
.news-cover-controls{display:flex;flex-direction:column;gap:10px}
.news-cover-status{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border-radius:10px;background:#fff;border:1px solid #e7e1d4}
.news-cover-status.is-derived{border-color:#c7b693;background:#fbf8ef}
.news-cover-status.is-empty{border-style:dashed}
.news-cover-status-label{font-size:13px;font-weight:600;color:#2b2b2b}
.news-cover-status-text{font-size:12px;color:#7a6a4f;line-height:1.5}
.news-cover-actions{margin-top:0}
.news-cover-auto-note{font-size:12px;line-height:1.6;color:#7a6a4f;padding:8px 10px;border-radius:10px;background:rgba(198,93,46,.08)}
.news-cover-auto-note.is-empty{background:rgba(122,106,79,.1)}
.news-cover-manual-toggle{align-self:flex-start;padding-left:0}
.news-cover-previews{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.news-preview-card{display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:10px;background:#fff;border:1px solid #e7e1d4;min-height:186px}
.news-preview-label{font-size:12px;font-weight:600;color:#7a6a4f}
.news-preview-list-item{display:flex;flex-direction:column;gap:8px}
.news-preview-media,.news-preview-detail-media{height:92px;border-radius:8px;overflow:hidden;background:#efe8d8}
.news-preview-image{width:100%;height:100%}
.news-preview-placeholder{display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:0 12px;font-size:12px;color:#7a6a4f;text-align:center}
.news-preview-copy{display:flex;flex-direction:column;gap:6px}
.news-preview-title,.news-preview-detail-title{font-size:13px;font-weight:600;color:#2b2b2b;line-height:1.5}
.news-preview-summary{font-size:12px;color:#6b6b6b;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.news-preview-detail{display:flex;flex-direction:column;gap:8px}
.news-content-field{display:flex;flex-direction:column;gap:10px;width:100%}
.news-content-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.news-content-hint{font-size:12px;line-height:1.6;color:#7a6a4f;padding:8px 10px;border-radius:10px;background:#f7f5ef;border:1px solid #e7e1d4}
@media (max-width:767px){.card-header,.links-section-header{flex-wrap:wrap;gap:8px}.links-item-row{flex-direction:column}.links-item-preview{width:100%;height:120px}}
@media (max-width:960px){.news-cover-layout{grid-template-columns:1fr}.news-cover-previews{grid-template-columns:1fr}}
</style>
