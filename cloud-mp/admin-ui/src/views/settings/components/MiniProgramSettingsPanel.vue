<template>
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

    <!-- 好友邀请海报顶部主视觉图（invite-poster） -->
    <el-form-item label="邀请海报顶部图">
      <div class="poster-upload-wrap">
        <div class="poster-preview" v-if="miniProgramForm.brand_config.share_poster_cover_url || miniProgramForm.brand_config.share_poster_url">
          <img :src="miniProgramForm.brand_config.share_poster_cover_url || miniProgramForm.brand_config.share_poster_url" class="poster-thumb" alt="海报预览" />
          <div class="poster-actions">
            <el-button size="small" type="danger" plain @click="clearPoster" :disabled="posterUploading">移除</el-button>
          </div>
        </div>
        <el-upload
          v-else
          class="poster-uploader"
          :show-file-list="false"
          :before-upload="beforePosterUpload"
          :http-request="handlePosterUpload"
          accept="image/jpeg,image/png,image/webp"
        >
          <div class="poster-upload-trigger" v-loading="posterUploading">
            <el-icon class="poster-upload-icon"><Plus /></el-icon>
            <span class="poster-upload-text">点击上传海报图</span>
            <span class="poster-upload-sub">建议 600×960px，JPG/PNG，≤2MB</span>
          </div>
        </el-upload>
        <div class="poster-upload-tip" v-if="miniProgramForm.brand_config.share_poster_cover_url || miniProgramForm.brand_config.share_poster_url">
          <el-button size="small" plain @click="triggerReplace" :disabled="posterUploading">
            <el-icon><RefreshRight /></el-icon> 替换图片
          </el-button>
          <el-upload
            ref="replaceUploadRef"
            style="display:none"
            :show-file-list="false"
            :before-upload="beforePosterUpload"
            :http-request="handlePosterUpload"
            accept="image/jpeg,image/png,image/webp"
          />
        </div>
        <div class="field-hint" style="margin-top:8px;">
          上传后小程序「好友邀请」海报页会用这张图替换顶部主视觉区域，下面的邀请码、头像和二维码仍保持动态生成。留空则使用默认主视觉。
        </div>
      </div>
    </el-form-item>

    <el-form-item label="客服微信">
      <el-input v-model="miniProgramForm.brand_config.customer_service_wechat" style="width:min(280px, 100%);" />
    </el-form-item>
    <el-form-item label="客服工作时间">
      <el-input v-model="miniProgramForm.brand_config.customer_service_hours" style="width:min(280px, 100%);" />
    </el-form-item>

    <el-divider content-position="left">客服通道（小程序「我的」入口）</el-divider>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      style="max-width: 880px; margin-bottom: 12px;"
      title="用于展示渠道/产品两个服务电话（点击拨号）与一张联系二维码。二维码请填 HTTPS 图片地址，且该域名须已加入小程序「downloadFile 合法域名」。"
    />
    <el-form-item label="渠道服务电话">
      <el-input
        v-model="miniProgramForm.customer_service_channel.channel_service_phone"
        placeholder="手机号或固话，例：0571-88880000"
        style="width:min(360px, 100%);"
      />
    </el-form-item>
    <el-form-item label="产品服务电话">
      <el-input
        v-model="miniProgramForm.customer_service_channel.product_service_phone"
        placeholder="手机号或客服热线"
        style="width:min(360px, 100%);"
      />
    </el-form-item>
    <el-form-item label="二维码图片 URL">
      <el-input
        v-model="miniProgramForm.customer_service_channel.qr_code_url"
        type="textarea"
        :rows="2"
        placeholder="https:// 开头的二维码图片链接（建议走素材库/CDN）"
        style="width: min(560px, 100%);"
      />
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

    <ProductDetailPledgesEditor
      :items="miniProgramForm.product_detail_pledges.items"
      :pledge-keys="productDetailPledgeKeys"
      :pledge-labels="productDetailPledgeLabels"
    />

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
    <el-form-item label="我的页·权益入口文案">
      <el-input v-model="miniProgramForm.membership_config.growth_privileges_entry_text" placeholder="如：查看权益" style="max-width:360px;" />
    </el-form-item>
    <el-form-item label="我的页·成长进度副文案模版">
      <el-input
        v-model="miniProgramForm.membership_config.growth_bar_subtitle_template"
        type="textarea"
        :rows="2"
        placeholder="距离「{next}」还需 {need} 成长值"
        style="max-width:560px;"
      />
      <div class="field-hint">占位符：{next} 下一档名称；{need} 还差成长值（整数）。折扣档、门槛在「会员与成长值→成长规则」中配置。</div>
    </el-form-item>
    <el-form-item label="我的页·已达最高档提示">
      <el-input
        v-model="miniProgramForm.membership_config.growth_bar_max_tier_text"
        type="textarea"
        :rows="2"
        style="max-width:560px;"
      />
    </el-form-item>
    <el-form-item label="权益说明页标题">
      <el-input v-model="miniProgramForm.membership_config.growth_privileges_page_title" style="max-width:360px;" />
    </el-form-item>

    <LightPromptModalsEditor :modals="miniProgramForm.light_prompt_modals" />

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

    <el-divider content-position="left">提现手续费（小程序）</el-divider>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      style="max-width: 880px; margin-bottom: 12px;"
      title="保存后对提现接口立即生效；若此处未填写某字段，则沿用运营库表 WITHDRAWAL 中的 FEE_RATE / FEE_CAP_MAX。费率按 0～100 表示百分比（如 0.6 表示 0.6%）。"
    />
    <el-form-item label="手续费 (%)">
      <el-input-number
        v-model="miniProgramForm.withdrawal_config.fee_rate_percent"
        :min="0"
        :max="100"
        :step="0.1"
        :precision="2"
        style="width:min(220px, 100%);"
      />
      <div class="field-hint">0 表示不按比例收取；与「封顶」同时生效时取 min(按比例金额, 封顶)。</div>
    </el-form-item>
    <el-form-item label="手续费封顶 (元/笔)">
      <el-input-number
        v-model="miniProgramForm.withdrawal_config.fee_cap_max"
        :min="0"
        :step="1"
        :precision="2"
        style="width:min(220px, 100%);"
      />
      <div class="field-hint">0 表示不封顶。仅在小程序 JSON 中显式填写时才会覆盖库表默认值。</div>
    </el-form-item>

    <el-form-item>
      <el-button type="primary" @click="onSave" :loading="miniProgramSaving">
        保存小程序配置
      </el-button>
    </el-form-item>
  </el-form>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, RefreshRight } from '@element-plus/icons-vue'
import { uploadFile } from '@/api/modules/mediaUpload'
import ProductDetailPledgesEditor from './ProductDetailPledgesEditor.vue'
import LightPromptModalsEditor from './LightPromptModalsEditor.vue'

const props = defineProps({
  miniProgramForm: { type: Object, required: true },
  miniProgramLoading: { type: Boolean, default: false },
  miniProgramSaving: { type: Boolean, default: false },
  productDetailPledgeKeys: { type: Array, required: true },
  productDetailPledgeLabels: { type: Object, required: true },
  onSave: { type: Function, required: true }
})

const posterUploading = ref(false)
const replaceUploadRef = ref(null)

function beforePosterUpload(file) {
  const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  const isLt2M = file.size / 1024 / 1024 < 2
  if (!isImage) { ElMessage.error('请上传 JPG / PNG / WebP 格式图片'); return false }
  if (!isLt2M) { ElMessage.error('图片大小不能超过 2MB'); return false }
  return true
}

async function handlePosterUpload({ file }) {
  posterUploading.value = true
  try {
    const res = await uploadFile(file, { params: { folder: 'share_poster', skip_library: 1 } })
    const fileId = res?.data?.file_id || res?.file_id || ''
    const url = res?.data?.url || res?.url || ''
    if (!url && !fileId) throw new Error('上传返回图片地址为空')
    props.miniProgramForm.brand_config.share_poster_cover_file_id = fileId
    props.miniProgramForm.brand_config.share_poster_cover_url = url
    ElMessage.success('顶部主视觉上传成功')
  } catch (e) {
    ElMessage.error('上传失败：' + (e?.message || '请重试'))
  } finally {
    posterUploading.value = false
  }
}

function clearPoster() {
  props.miniProgramForm.brand_config.share_poster_cover_file_id = ''
  props.miniProgramForm.brand_config.share_poster_cover_url = ''
}

function triggerReplace() {
  replaceUploadRef.value?.$el?.querySelector('input[type="file"]')?.click()
}
</script>

<style scoped>
.poster-upload-wrap { display: flex; flex-direction: column; gap: 8px; }
.poster-preview { display: flex; align-items: flex-start; gap: 16px; }
.poster-thumb { width: 120px; border-radius: 8px; border: 1px solid #e4e7ed; object-fit: cover; display: block; }
.poster-actions { display: flex; flex-direction: column; gap: 8px; }
.poster-uploader { display: block; }
.poster-upload-trigger { width: 160px; height: 200px; border: 1px dashed #d9d9d9; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; background: #fafafa; transition: border-color .2s; }
.poster-upload-trigger:hover { border-color: #409eff; }
.poster-upload-icon { font-size: 28px; color: #c0c4cc; }
.poster-upload-text { font-size: 13px; color: #606266; }
.poster-upload-sub { font-size: 11px; color: #909399; }
.field-hint { font-size: 12px; color: #909399; line-height: 1.5; }
</style>
