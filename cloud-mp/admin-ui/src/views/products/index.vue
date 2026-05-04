<template>
  <div class="products-page">
    <!-- 搜索栏 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm">
        <el-form-item>
          <!-- 后端按商品名称模糊匹配 -->
          <el-input v-model="searchForm.keyword" placeholder="商品名称" clearable style="width:200px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item>
          <el-select v-model="searchForm.category_id" placeholder="全部分类" clearable style="width:140px">
            <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable style="width:110px">
            <el-option label="上架中" :value="1" />
            <el-option label="已下架" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
          <el-button @click="openCategoryDialog">分类管理</el-button>
          <el-button type="success" :icon="Plus" @click="openForm()">发布商品</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 表格 -->
    <el-card style="margin-top:16px">
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column label="商品" min-width="260">
          <template #default="{ row }">
            <div class="product-cell">
              <el-image :src="row.images?.[0]" class="product-img" fit="cover" />
              <div>
                <div class="product-name">{{ row.name }}</div>
                <div class="product-cat">{{ row.category?.name || '未分类' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="价格" width="170">
          <template #default="{ row }">
            <div class="price-col">
              <span class="price-main">¥{{ row.retail_price }}</span>
              <span class="price-sub" v-if="row.market_price" style="text-decoration:line-through;color:#999">原¥{{ row.market_price }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="stock" label="库存" width="80" align="center" />
        <el-table-column label="标签" width="150" class-name="hide-mobile">
          <template #default="{ row }">
            <el-tag v-if="row.is_explosive" size="small" type="danger" effect="dark" style="margin:2px">爆单品</el-tag>
            <el-tag v-if="row.product_tag === 'hot'" size="small" type="danger" style="margin:2px">爆品</el-tag>
            <el-tag v-if="row.product_tag === 'discount'" size="small" type="warning" style="margin:2px">折扣</el-tag>
            <el-tag v-if="row.product_tag === 'new'" size="small" type="success" style="margin:2px">新品</el-tag>
            <el-tag v-if="row.discount_exempt" size="small" effect="plain" type="info" style="margin:2px">免折</el-tag>
            <el-tag v-if="row.supports_pickup" size="small" effect="plain" type="success" style="margin:2px">自提</el-tag>
            <el-tag v-if="row.enable_coupon"    size="small" effect="plain" type="danger"   style="margin:2px">券</el-tag>
            <el-tag v-if="row.allow_points === 0" size="small" effect="plain" type="info"  style="margin:2px">无积分</el-tag>
            <el-tag v-if="row.enable_group_buy" size="small" effect="plain" type="warning"  style="margin:2px">拼团</el-tag>
            <el-tag v-if="row.custom_commissions" size="small" effect="plain" type="success" style="margin:2px">自定佣金</el-tag>
            <el-tag v-if="row.visible_in_mall === false || row.visible_in_mall === 0" size="small" effect="plain" type="info" style="margin:2px">商城隐藏</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="上架" width="80" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.status" :active-value="1" :inactive-value="0"
              @change="(v) => handleStatusChange(row, v)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="openForm(row)">编辑</el-button>
            <el-button text type="danger" size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page" v-model:page-size="pagination.limit"
        :total="pagination.total" :page-sizes="pagination.pageSizes"
        layout="total, sizes, prev, pager, next"
        @size-change="fetchProducts" @current-change="fetchProducts"
        style="margin-top:16px; justify-content:flex-end"
      />
    </el-card>

    <!-- ===== 发布/编辑抽屉（单页，无 Tab）===== -->
    <el-drawer
      v-model="formVisible"
      :title="form.id ? '编辑商品' : '发布商品'"
      size="680px"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <el-form
        :model="form"
        :rules="rules"
        ref="formRef"
        label-width="90px"
        class="product-form"
      >

        <!-- ── 基础信息 ── -->
        <div class="form-section-title">基础信息</div>

        <el-form-item label="商品名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入商品名称" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="商品分类" prop="category_id">
          <el-select v-model="form.category_id" placeholder="请选择分类" style="width:100%">
            <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="简介">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="列表页显示的简短描述（选填）" />
        </el-form-item>

        <!-- ── 图片 ── -->
        <div class="form-section-title">
          商品图片
          <span class="section-tip">主图最多 5 张，详情图不限</span>
        </div>
        <p class="image-spec-hint">
          小程序首页/分类/商品详情主图展示均为<strong>1:1 裁剪（aspectFill）</strong>。
          轮播主图建议上传<strong>正方形</strong>，例如 <strong>1080×1080</strong> 或 <strong>750×750</strong>（宽边 ≥750，避免模糊）；
          价格与卖点尽量放在<strong>中心安全区</strong>（四边预留约 8%，避免被裁切）。
          竖版长海报、多文字说明请放在下方「详情图」（详情图可用任意比例，宽度建议 ≥750px）。
          若素材<strong>自带四周深色/浅色边框</strong>，前端会原样显示，请在设计侧<strong>满版 1:1 导出</strong>、去掉画板留白。
          <strong>PNG 左右或四角透明</strong>时，小程序会透出占位底色（已与首页卡片区同色）；要完全无「条带」请改 <strong>JPG</strong> 或在画布上<strong>铺实色底</strong>再导出。
        </p>

        <el-form-item label="轮播主图" prop="images">
          <div class="img-row">
            <div
              v-for="(img, idx) in form.images"
              :key="idx"
              class="img-thumb"
            >
              <el-image :src="resolvePreviewUrl(img)" fit="cover" />
              <span class="img-del" @click="removeImg('images', idx)">×</span>
            </div>
            <div
              v-if="form.images.length < 5"
              class="img-add"
              @click="openPicker('images')"
            >
              <el-icon><Plus /></el-icon>
              <span>选图片</span>
            </div>
          </div>
        </el-form-item>

        <el-form-item label="详情图">
          <div class="img-row">
            <div
              v-for="(img, idx) in form.detail_images"
              :key="idx"
              class="img-thumb"
            >
              <el-image :src="resolvePreviewUrl(img)" fit="cover" />
              <span class="img-del" @click="removeImg('detail_images', idx)">×</span>
            </div>
            <div class="img-add" @click="openPicker('detail_images')">
              <el-icon><Plus /></el-icon>
              <span>选图片</span>
            </div>
          </div>
        </el-form-item>

        <!-- ── 价格与库存 ── -->
        <div class="form-section-title">价格与库存</div>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          class="form-alert"
          title="零售价、成本价为必填；B1/B2/B3 发货成本价用于代理履约扣货款和锁定利润口径。"
        />

        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="零售价" prop="retail_price">
              <el-input-number v-model="form.retail_price" :min="0.01" :precision="2" style="width:100%" placeholder="必填" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="市场原价">
              <el-input-number v-model="form.market_price" :min="0" :precision="2" style="width:100%" placeholder="划线价，选填" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="成本价" prop="cost_price">
              <el-input-number v-model="form.cost_price" :min="0.01" :precision="2" style="width:100%" placeholder="必填" />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="form-section-title">代理发货成本价</div>
        <el-alert
          type="warning"
          :closable="false"
          show-icon
          class="form-alert"
          title="这里只填代理发货时实际扣除的货款成本，不会直接展示给用户。关闭“默认平台发货”后，如未配置对应等级成本价，将无法分配给代理发货。"
        />
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="B1 成本价">
              <el-input-number v-model="form.supply_price_b1" :min="0" :precision="2" style="width:100%" placeholder="推广合伙人" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="B2 成本价">
              <el-input-number v-model="form.supply_price_b2" :min="0" :precision="2" style="width:100%" placeholder="运营合伙人" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="B3 成本价">
              <el-input-number v-model="form.supply_price_b3" :min="0" :precision="2" style="width:100%" placeholder="区域合伙人" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="总库存">
              <el-input-number v-model="form.stock" :min="0" :precision="0" style="width:100%" @change="syncSingleSkuStockFromTotal({ force: true })" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="虚拟权重">
              <el-input-number v-model="form.manual_weight" :min="0" :precision="0" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="商品成长值奖励">
              <el-input-number v-model="form.growth_value_reward" :min="0" :precision="2" style="width:100%" />
              <div class="hint">不填则按商品原价累计成长值</div>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- SKU（可选，默认折叠）-->
        <div class="form-section-title toggle-title">
          <span>商品规格</span>
          <el-switch v-model="skuEnabled" inactive-text="" active-text="多规格" />
        </div>
        <el-collapse-transition>
          <div v-show="skuEnabled">
            <p class="sku-hint">只填顾客看到的规格和库存即可；默认使用商品零售价，第一条规格作为默认展示。</p>
            <div class="sku-toolbar">
              <el-button size="small" type="primary" plain :icon="Plus" @click="addSku">添加规格</el-button>
              <el-switch v-model="skuPriceOverride" active-text="单独定价" />
            </div>
            <div class="sku-list">
              <div v-for="(row, index) in form.skus" :key="row.id || row._id || index" class="sku-row">
                <span class="sku-row-index">{{ index + 1 }}</span>
                <el-input v-model="row.spec_value" placeholder="规格，如：红色 / 500g / 大份" size="small" class="sku-name-input" />
                <el-input-number v-model="row.stock" :min="0" :precision="0" size="small" :controls="false" placeholder="库存" class="sku-stock-input" @change="syncTotalStockFromSkus" />
                <el-input-number
                  v-if="skuPriceOverride"
                  v-model="row.retail_price"
                  :min="0.01"
                  :precision="2"
                  size="small"
                  :controls="false"
                  placeholder="价格"
                  class="sku-price-input"
                />
                <el-button
                  text
                  circle
                  type="danger"
                  :icon="Delete"
                  :title="`删除第 ${index + 1} 个规格`"
                  @click="removeSku(index)"
                />
              </div>
            </div>
          </div>
        </el-collapse-transition>

        <!-- ── 营销开关（全部默认关闭）── -->
        <div class="form-section-title">营销功能 <span class="section-tip">默认关闭，按需开启</span></div>

        <div class="switch-grid">
          <div class="sw-item">
            <div class="sw-label">
              <span>允许使用优惠券</span>
              <span class="sw-desc">满减、折扣券可用于此商品</span>
            </div>
            <el-switch v-model="form.enable_coupon" :active-value="1" :inactive-value="0" />
          </div>
          <div class="sw-item">
            <div class="sw-label">
              <span>允许积分抵扣</span>
              <span class="sw-desc">爆款/折扣商品建议关闭，禁止叠加积分优惠</span>
            </div>
            <el-switch v-model="form.allow_points" :active-value="1" :inactive-value="0" />
          </div>
          <div class="sw-item">
            <div class="sw-label">
              <span>参与拼团</span>
              <span class="sw-desc">作为拼团活动可用商品</span>
            </div>
            <el-switch v-model="form.enable_group_buy" :active-value="1" :inactive-value="0" />
          </div>
          <div class="sw-item">
            <div class="sw-label">
              <span>独立佣金设置</span>
              <span class="sw-desc">不使用全局佣金比例</span>
            </div>
            <el-switch v-model="form.custom_commissions" :active-value="1" :inactive-value="0" />
          </div>
          <div class="sw-item">
            <div class="sw-label">
              <span>支持到店自提</span>
              <span class="sw-desc">开启后用户可选自提门店下单（需在「自提门店」维护网点）</span>
            </div>
            <el-switch v-model="form.supports_pickup" :active-value="1" :inactive-value="0" />
          </div>
          <div class="sw-item">
            <div class="sw-label">
              <span>商城展示</span>
              <span class="sw-desc">关闭后不在分类、搜索、首页热门与榜单等处出现；仍可在限时活动等选用并正常下单</span>
            </div>
            <el-switch v-model="form.visible_in_mall" />
          </div>
        </div>

        <el-form-item label="爆单品" style="margin-top:12px">
          <el-switch v-model="form.is_explosive" :active-value="1" :inactive-value="0" />
          <span style="margin-left:8px;color:#909399;font-size:12px">开启后自动禁用优惠券、积分抵扣</span>
        </el-form-item>
        <el-form-item label="商品标签">
          <el-select v-model="form.product_tag" style="width:180px">
            <el-option label="普通" value="normal" />
            <el-option label="爆品" value="hot" />
            <el-option label="折扣品" value="discount" />
            <el-option label="新品" value="new" />
          </el-select>
          <span style="margin-left:12px;font-size:12px;color:#909399">标记为爆品或折扣品时建议关闭"允许优惠券"和"允许积分抵扣"</span>
        </el-form-item>

        <!-- 佣金设置（仅开启后展示）-->
        <el-collapse-transition>
          <div v-show="form.custom_commissions === 1" class="commission-box">
            <el-alert
              type="info"
              :closable="false"
              show-icon
              class="form-alert"
              title="请填 0～100 的百分数（例：20 表示 20%）。仅覆盖本商品的直推/间推比例；未开启「独立佣金设置」时，统一走「代理体系 → 佣金配置」里的订单实付比例。"
            />
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="直推比例（%）">
                  <el-input-number v-model="form.commission_rate_1" :min="0" :max="100" style="width:100%" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="间推比例（%）">
                  <el-input-number v-model="form.commission_rate_2" :min="0" :max="100" style="width:100%" />
                </el-form-item>
              </el-col>
            </el-row>
          </div>
        </el-collapse-transition>

      </el-form>

      <template #footer>
        <div class="drawer-footer">
          <el-button @click="formVisible = false">取消</el-button>
          <el-button type="info" @click="submitForm(0)" :loading="submitting">保存草稿</el-button>
          <el-button type="primary" @click="submitForm(1)" :loading="submitting">保存并上架</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- 素材库选图弹窗 -->
    <MediaPicker
      v-model:visible="pickerVisible"
      :multiple="true"
      :max="pickerTarget === 'images' ? 5 - form.images.length : 20"
      @confirm="onPickerConfirm"
    />

    <!-- 分类管理 -->
    <el-dialog v-model="categoryDialogVisible" title="商品分类管理" width="680px">
      <div class="category-toolbar">
        <el-button type="primary" size="small" :icon="Plus" @click="openCategoryForm()">新增分类</el-button>
      </div>
      <el-table :data="categories" border size="small" max-height="320">
        <el-table-column label="ID" width="90">
          <template #default="{ row }">
            <CompactIdCell :value="row.display_id || row.id" :full-value="row.id" />
          </template>
        </el-table-column>
        <el-table-column prop="name" label="分类名称" min-width="180" />
        <el-table-column prop="sort_order" label="排序" width="80" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="openCategoryForm(row)">编辑</el-button>
            <el-button text type="danger" size="small" @click="handleDeleteCategory(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <el-dialog v-model="categoryFormVisible" :title="categoryForm.id ? '编辑分类' : '新增分类'" width="420px">
      <el-form :model="categoryForm" label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="categoryForm.name" placeholder="请输入分类名称" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="categoryForm.sort_order" :min="0" :precision="0" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="categoryFormVisible = false">取消</el-button>
        <el-button type="primary" :loading="categorySubmitting" @click="submitCategory">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Plus } from '@element-plus/icons-vue'
import { useRoute } from 'vue-router'
import CompactIdCell from '@/components/CompactIdCell.vue'
import { getProducts, createProduct, updateProduct, updateProductStatus, getCategories, deleteProduct, createCategory, updateCategory, deleteCategory } from '@/api'
import { usePagination } from '@/composables/usePagination'
import { confirmDanger } from '@/composables/useConfirm'
import MediaPicker from '@/components/MediaPicker.vue'
import { buildPersistentAssetRef, warnTemporaryAssetUrls } from '@/utils/assetUrlAudit'

// ===== 列表 =====
const route = useRoute()
const loading = ref(false)
const tableData = ref([])
const categories = ref([])
const { pagination, resetPage, applyResponse } = usePagination()
// keyword：按商品名称模糊匹配；支持从订单页跳转时携带 ?keyword=xxx 预填
const searchForm = reactive({ keyword: String(route.query.keyword || ''), category_id: '', status: '' })

function applyRouteQueryToFilters(query = {}) {
  searchForm.keyword = query?.keyword ? String(query.keyword) : ''
  if (query?.category_id === undefined || query?.category_id === null || query?.category_id === '') {
    searchForm.category_id = ''
  } else {
    const nextCategoryId = Number(query.category_id)
    searchForm.category_id = Number.isFinite(nextCategoryId) ? nextCategoryId : String(query.category_id)
  }
  if (query?.status === undefined || query?.status === null || query?.status === '') {
    searchForm.status = ''
  } else {
    const nextStatus = Number(query.status)
    searchForm.status = Number.isFinite(nextStatus) ? nextStatus : String(query.status)
  }
}

const loadCategories = async () => {
  try {
    const res = await getCategories()
    categories.value = res?.data || res?.list || res || []
  } catch (e) {
    ElMessage.error(e?.message || '加载分类失败')
  }
}

const fetchProducts = async () => {
  loading.value = true
  try {
    const res = await getProducts({
      keyword: searchForm.keyword || undefined,
      category_id: searchForm.category_id || undefined,
      status: searchForm.status !== '' ? searchForm.status : undefined,
      page: pagination.page,
      limit: pagination.limit
    })
    tableData.value = res?.list || []
    applyResponse(res)
  } catch (e) {
    if (!e?.__handledByRequest) {
      ElMessage.error(e?.message || '加载商品列表失败')
    }
  } finally {
    loading.value = false
  }
}

const handleSearch = () => { resetPage(); fetchProducts() }
const handleReset = () => { Object.assign(searchForm, { keyword: '', category_id: '', status: '' }); handleSearch() }

const handleStatusChange = async (row, val) => {
  const oldVal = val === 1 ? 0 : 1
  try {
    await confirmDanger({
      title: val === 1 ? '上架商品' : '下架商品',
      message: `确认${val === 1 ? '上架' : '下架'}「${row.name}」？`,
      type: 'warning'
    })
  } catch (_) {
    row.status = oldVal
    return
  }
  try {
    await updateProductStatus(row.id, { status: val })
    ElMessage.success(val === 1 ? '已上架' : '已下架')
    await fetchProducts()
  } catch (e) {
    row.status = oldVal
    if (!e?.__handledByRequest) {
      ElMessage.error(e?.message || '更新上架状态失败')
    }
  }
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(`确认删除「${row.name}」？`, '确认删除', { type: 'warning' })
    await deleteProduct(row.id)
    ElMessage.success('已删除')
    fetchProducts()
  } catch (e) {
    if (e !== 'cancel' && !e?.__handledByRequest) ElMessage.error(e?.message || '删除商品失败')
  }
}

/** 后端存 0～1 小数，表单用 0～100 百分数编辑 */
function commissionRateApiToForm(val) {
  const n = Number(val)
  if (!Number.isFinite(n) || n <= 0) return 0
  if (n > 1) return Math.min(n, 100)
  return Math.round(n * 10000) / 100
}

// ===== 表单 =====
const formVisible = ref(false)
const formRef = ref(null)
const submitting = ref(false)
const skuEnabled = ref(false)
const skuPriceOverride = ref(false)

const defaultForm = () => ({
  id: null,
  name: '',
  category_id: null,
  description: '',
  images: [],
  detail_images: [],
  retail_price: null,
  market_price: null,
  cost_price: null,
  supply_price_b1: null,
  supply_price_b2: null,
  supply_price_b3: null,
  stock: 0,
  manual_weight: 0,
  growth_value_reward: null,
  skus: [],
  default_sku_index: null,
  // 营销：全部默认关闭（allow_points 默认开，爆款手动关）
  enable_coupon: 0,
  enable_group_buy: 0,
  custom_commissions: 0,
  allow_points: 1,
  supports_pickup: 0,
  visible_in_mall: true,
  product_tag: 'normal',
  is_explosive: 0,
  commission_rate_1: 0,
  commission_rate_2: 0,
  commission_amount_1: 0,
  commission_amount_2: 0
})

const form = reactive(defaultForm())

const rules = {
  name: [{ required: true, message: '请填写商品名称', trigger: 'blur' }],
  retail_price: [{ required: true, type: 'number', message: '请填写零售价', trigger: 'blur' }],
  cost_price: [{ required: true, type: 'number', message: '请填写成本价', trigger: 'blur' }]
}

const skuIdentityValues = (sku = {}) => [sku.id, sku._id, sku._legacy_id]
  .filter((value) => value !== null && value !== undefined && value !== '')
  .map((value) => String(value))

const normalizeSkuForForm = (sku = {}) => ({
  ...sku,
  spec_value: String(sku.spec_value || sku.spec || '').trim(),
  retail_price: Number(sku.retail_price ?? sku.price ?? form.retail_price ?? 0),
  stock: Number(sku.stock || 0)
})

const skuPriceValue = (sku = {}) => Number(sku.retail_price ?? sku.price ?? 0)

const hasCustomSkuPrice = (skus = [], productPrice) => {
  const basePrice = Number(productPrice || 0)
  return skus.some((sku) => Math.abs(skuPriceValue(sku) - basePrice) > 0.009)
}

const orderSkusForForm = (skus = [], defaultSkuId) => {
  const rows = skus.map(normalizeSkuForForm)
  const defaultId = String(defaultSkuId || '').trim()
  if (!defaultId) return rows
  const defaultIndex = rows.findIndex((sku) => skuIdentityValues(sku).includes(defaultId))
  if (defaultIndex <= 0) return rows
  const [defaultSku] = rows.splice(defaultIndex, 1)
  return [defaultSku, ...rows]
}

const buildSkuPayloads = () => form.skus.map((sku, index) => {
  const specValue = String(sku.spec_value || sku.spec || '').trim()
  const retailPrice = skuPriceOverride.value
    ? Number(sku.retail_price ?? form.retail_price ?? 0)
    : Number(form.retail_price || 0)
  return {
    id: sku.id,
    _id: sku._id,
    _legacy_id: sku._legacy_id,
    spec: specValue,
    spec_name: '规格',
    spec_value: specValue,
    specs: [{ name: '规格', value: specValue }],
    retail_price: retailPrice,
    price: retailPrice,
    market_price: Number(form.market_price || 0),
    original_price: Number(form.market_price || 0),
    stock: Number(sku.stock || 0),
    sku_code: sku.sku_code || '',
    image: sku.image || '',
    sort_order: index,
    created_at: sku.created_at
  }
})

const syncSingleSkuStockFromTotal = ({ force = false } = {}) => {
  if (!skuEnabled.value || form.skus.length !== 1) return
  const totalStock = Number(form.stock || 0)
  const skuStock = Number(form.skus[0].stock || 0)
  if ((force && totalStock >= 0) || (totalStock > 0 && skuStock <= 0)) {
    form.skus[0].stock = totalStock
  }
}

const syncTotalStockFromSkus = () => {
  if (!skuEnabled.value || !form.skus.length) return
  form.stock = form.skus.reduce((sum, sku) => sum + Number(sku.stock || 0), 0)
}

const normalizePersistentAssetList = (urls = []) => (Array.isArray(urls) ? urls : [])
  .map((url) => buildPersistentAssetRef({ url }))
  .filter(Boolean)

const seedImagePreviewCache = (persistedUrls = [], previewUrls = []) => {
  persistedUrls.forEach((persistedUrl, index) => {
    const previewUrl = String(previewUrls[index] || '').trim()
    if (persistedUrl && previewUrl && persistedUrl !== previewUrl) {
      imagePreviewCache[persistedUrl] = previewUrl
    }
  })
}

const openForm = (row) => {
  if (row) {
    const nextSkus = orderSkusForForm(row.skus || [], row.default_sku_id)
    const normalizedImages = normalizePersistentAssetList(row.raw_images?.length ? row.raw_images : row.images)
    const normalizedDetailImages = normalizePersistentAssetList(row.raw_detail_images?.length ? row.raw_detail_images : row.detail_images)
    Object.assign(form, {
      id: row.id,
      name: row.name || '',
      category_id: row.category_id || null,
      description: row.description || '',
      images: normalizedImages,
      detail_images: normalizedDetailImages,
      retail_price: row.retail_price,
      market_price: row.market_price || null,
      cost_price: row.cost_price,
      supply_price_b1: row.supply_price_b1 ?? null,
      supply_price_b2: row.supply_price_b2 ?? null,
      supply_price_b3: row.supply_price_b3 ?? null,
      stock: row.stock || 0,
      manual_weight: row.manual_weight || 0,
      growth_value_reward: row.growth_value_reward || null,
      skus: nextSkus,
      default_sku_index: nextSkus.length ? 0 : null,
      enable_coupon: row.enable_coupon || 0,
      enable_group_buy: row.enable_group_buy || 0,
      custom_commissions: row.custom_commissions || 0,
      allow_points: row.allow_points == null ? 1 : (row.allow_points ? 1 : 0),
      supports_pickup: row.supports_pickup ? 1 : 0,
      visible_in_mall: !(row.visible_in_mall === false || row.visible_in_mall === 0),
      product_tag: row.product_tag || 'normal',
      is_explosive: row.is_explosive ? 1 : 0,
      commission_rate_1: commissionRateApiToForm(row.commission_rate_1),
      commission_rate_2: commissionRateApiToForm(row.commission_rate_2),
      commission_amount_1: row.commission_amount_1 || 0,
      commission_amount_2: row.commission_amount_2 || 0
    })
    skuEnabled.value = (row.skus?.length > 0)
    skuPriceOverride.value = hasCustomSkuPrice(nextSkus, row.retail_price)
    syncSingleSkuStockFromTotal()
    // 编辑已有商品时，后端可能返回带签名的临时预览 URL；
    // 表单里改存稳定引用，预览仍沿用当前可显示地址。
    seedImagePreviewCache(normalizedImages, row.images || [])
    seedImagePreviewCache(normalizedDetailImages, row.detail_images || [])
  } else {
    Object.assign(form, defaultForm())
    skuEnabled.value = false
    skuPriceOverride.value = false
  }
  formVisible.value = true
}

const addSku = () => {
  const nextIndex = form.skus.length
  form.skus.push({ spec_name: '规格', spec_value: '', sku_code: '', retail_price: form.retail_price || 0, stock: 0 })
  if (form.default_sku_index == null && nextIndex === 0) {
    form.default_sku_index = 0
  }
}

const removeSku = (i) => {
  form.skus.splice(i, 1)
  if (form.skus.length === 0) {
    form.default_sku_index = null
    return
  }
  if (form.default_sku_index === i) {
    form.default_sku_index = 0
    return
  }
  if (Number.isInteger(form.default_sku_index) && form.default_sku_index > i) {
    form.default_sku_index -= 1
  }
}
const removeImg = (key, i) => form[key].splice(i, 1)

watch(skuEnabled, (enabled) => {
  if (enabled) {
    if (!form.skus.length) addSku()
    form.default_sku_index = 0
  } else {
    form.default_sku_index = null
    skuPriceOverride.value = false
  }
})

const submitForm = async (status) => {
  // 使用 Promise 方式校验，避免 async callback 与 await 混用导致的校验结果丢失
  try {
    await formRef.value?.validate()
  } catch {
    ElMessage.warning('请检查必填项')
    return
  }

  if (!form.images.length) {
    ElMessage.warning('请至少添加一张主图')
    return
  }
  const tempUrlMessage = warnTemporaryAssetUrls([...form.images, ...form.detail_images], '商品图片')
  if (tempUrlMessage) {
    ElMessage.warning(tempUrlMessage)
    return
  }
  if ([...form.images, ...form.detail_images].some((url) => /^https?:\/\//i.test(String(url || '').trim()))) {
    ElMessage.warning('商品图片请从素材库重新选择，保存时必须使用 cloud:// file_id')
    return
  }

  submitting.value = true
  try {
    const data = { ...form, status }
    if (!skuEnabled.value) {
      data.skus = []
      data.default_sku_index = null
    } else {
      if (!form.skus.length) {
        ElMessage.warning('请至少添加一个规格')
        return
      }
      if (form.skus.some((sku) => !String(sku.spec_value || sku.spec || '').trim())) {
        ElMessage.warning('请填写规格名称')
        return
      }
      if (skuPriceOverride.value && form.skus.some((sku) => !(Number(sku.retail_price) > 0))) {
        ElMessage.warning('请填写规格价格')
        return
      }
      syncSingleSkuStockFromTotal()
      data.skus = buildSkuPayloads()
      data.default_sku_index = 0
    }
    // 百分比 → 小数（后端存 0~1）
    data.commission_rate_1 = (Number(data.commission_rate_1) || 0) / 100
    data.commission_rate_2 = (Number(data.commission_rate_2) || 0) / 100
    // 固定金额佣金保持原值，不强制清零

    if (data.id) {
      await updateProduct(data.id, data)
      ElMessage.success('更新成功')
    } else {
      delete data.id
      await createProduct(data)
      ElMessage.success(status === 1 ? '发布成功' : '已保存草稿')
    }
    formVisible.value = false
    fetchProducts()
  } catch (e) {
    if (!e?.__handledByRequest) {
      ElMessage.error(e?.message || '保存商品失败，请重试')
    }
  } finally {
    submitting.value = false
  }
}

// ===== 素材库选图 =====
const pickerVisible = ref(false)
const pickerTarget = ref('images')

/**
 * cloud:// file_id → 可展示 https URL 的本地缓存。
 * 当 MediaPicker 返回 cloud:// file_id 作为持久引用时，同时将对应的临时显示 URL 缓存在这里，
 * 让 el-image 能立即预览，而 form.images 存储的是不会过期的 cloud:// file_id。
 */
const imagePreviewCache = reactive({})

const isCloudId = (v) => /^cloud:\/\//i.test(String(v || ''))

/** 获取图片的可展示 URL：优先走缓存，兼容 cloud:// 和历史临时预览 URL */
const resolvePreviewUrl = (url) => imagePreviewCache[url] || url

const openPicker = (target) => {
  pickerTarget.value = target
  pickerVisible.value = true
}

/**
 * @param {string[]} persistIds - cloud:// file_id 或 https URL（用于存入数据库）
 * @param {string[]} displayUrls - 对应的可立即展示 https URL
 */
const onPickerConfirm = (persistIds, displayUrls = []) => {
  const picked = Array.isArray(persistIds) ? persistIds.filter(Boolean) : []
  if (!picked.length) return

  // 建立 cloud:// → https 的预览缓存，保证刚选出的图片能立即显示
  picked.forEach((id, i) => {
    if (isCloudId(id) && displayUrls[i]) {
      imagePreviewCache[id] = displayUrls[i]
    }
  })

  if (pickerTarget.value === 'images') {
    const merged = [...picked, ...form.images]
    form.images = merged.slice(0, 5)
    if (merged.length > 5) {
      ElMessage.warning('主图最多 5 张，已优先保留最新选择的图片')
    }
  } else {
    form[pickerTarget.value] = [...picked, ...form[pickerTarget.value]]
  }
}

// ===== 分类管理 =====
const categoryDialogVisible = ref(false)
const categoryFormVisible = ref(false)
const categorySubmitting = ref(false)
const categoryForm = reactive({ id: null, name: '', sort_order: 0 })

const openCategoryDialog = async () => {
  await loadCategories()
  categoryDialogVisible.value = true
}

const openCategoryForm = (row) => {
  if (row) {
    Object.assign(categoryForm, {
      id: row.id,
      name: row.name || '',
      sort_order: Number(row.sort_order || 0)
    })
  } else {
    Object.assign(categoryForm, { id: null, name: '', sort_order: 0 })
  }
  categoryFormVisible.value = true
}

const submitCategory = async () => {
  if (!categoryForm.name?.trim()) return ElMessage.warning('请填写分类名称')
  categorySubmitting.value = true
  try {
    const payload = {
      name: categoryForm.name.trim(),
      sort_order: Number(categoryForm.sort_order || 0)
    }
    if (categoryForm.id) {
      await updateCategory(categoryForm.id, payload)
      ElMessage.success('分类已更新')
    } else {
      await createCategory(payload)
      ElMessage.success('分类已创建')
    }
    categoryFormVisible.value = false
    await loadCategories()
  } finally {
    categorySubmitting.value = false
  }
}

const handleDeleteCategory = async (row) => {
  try {
    await ElMessageBox.confirm(`确认删除分类「${row.name}」？`, '删除分类', { type: 'warning' })
    await deleteCategory(row.id)
    ElMessage.success('分类已删除')
    await loadCategories()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.message || '删除分类失败')
  }
}

watch(
  () => route.query,
  (query) => {
    applyRouteQueryToFilters(query || {})
    resetPage()
    fetchProducts()
  },
  { immediate: true }
)

onMounted(() => { loadCategories() })
</script>

<style scoped>
.products-page { display: flex; flex-direction: column; gap: 0; }

/* 表格 */
.product-cell { display: flex; align-items: center; gap: 12px; }
.product-img { width: 56px; height: 56px; border-radius: 6px; background: #f5f7fa; flex-shrink: 0; }
.product-name { font-size: 14px; font-weight: 500; color: #1a1a2e; margin-bottom: 4px; }
.product-cat { font-size: 12px; color: #909399; }
.price-col { font-size: 12px; line-height: 1.7; }
.price-main { font-size: 14px; font-weight: 600; color: #f56c6c; }
.price-sub { display: block; color: #888; }

/* 表单 */
.product-form { padding: 0 8px; }

.form-section-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  padding: 16px 0 10px;
  border-bottom: 1px solid #f0f0f0;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-tip { font-size: 12px; font-weight: 400; color: #909399; margin-left: 8px; }

.image-spec-hint {
  font-size: 12px;
  color: #606266;
  line-height: 1.65;
  margin: -8px 0 14px;
  padding: 10px 12px;
  background: #f9fafb;
  border-radius: 6px;
  border: 1px solid #ebeef5;
}
.image-spec-hint strong { color: #303133; font-weight: 600; }

/* 展开更多价格 */
.toggle-row { margin: -8px 0 12px; }

/* 图片行 */
.img-row { display: flex; flex-wrap: wrap; gap: 8px; }
.img-thumb {
  width: 72px; height: 72px; position: relative; border-radius: 6px; overflow: hidden;
  border: 1px solid #e4e7ed;
}
.img-thumb .el-image { width: 100%; height: 100%; }
.img-del {
  position: absolute; top: 2px; right: 4px;
  color: #fff; background: rgba(0,0,0,0.45); border-radius: 50%;
  width: 16px; height: 16px; font-size: 12px; line-height: 16px; text-align: center;
  cursor: pointer; opacity: 0; transition: opacity 0.2s;
}
.img-thumb:hover .img-del { opacity: 1; }
.img-add {
  width: 72px; height: 72px; border: 1px dashed #d9d9d9; border-radius: 6px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 4px; color: #909399; font-size: 12px; cursor: pointer; transition: all 0.2s;
}
.img-add:hover { border-color: #409eff; color: #409eff; }

/* 引导提示 */
.form-alert { margin-bottom: 12px; }
.sku-hint { font-size: 12px; color: #909399; margin: 0 0 8px; line-height: 1.5; }

/* SKU */
.sku-toolbar {
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.toggle-title { gap: 12px; }
.sku-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sku-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: #f9fafb;
  border: 1px solid #ebeef5;
  border-radius: 6px;
}
.sku-row-index {
  width: 22px;
  height: 22px;
  line-height: 22px;
  text-align: center;
  border-radius: 50%;
  background: #eef5ff;
  color: #409eff;
  font-size: 12px;
  font-weight: 600;
}
.sku-name-input {
  min-width: 0;
  flex: 1;
}
.sku-stock-input { width: 88px; }
.sku-price-input { width: 96px; }

@media (max-width: 720px) {
  .sku-row {
    align-items: stretch;
    flex-wrap: wrap;
  }
  .sku-stock-input,
  .sku-price-input {
    width: 100%;
    margin-left: 30px;
    flex: 1 0 calc(50% - 34px);
  }
}

/* 营销开关网格 */
.switch-grid { display: flex; flex-direction: column; gap: 0; }
.sw-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 0; border-bottom: 1px solid #f5f5f5;
}
.sw-label { display: flex; flex-direction: column; gap: 3px; }
.sw-label span:first-child { font-size: 14px; color: #303133; }
.sw-desc { font-size: 12px; color: #909399; }

/* 佣金展开区 */
.commission-box { background: #fafbfc; border-radius: 6px; padding: 12px; margin: 8px 0; }

/* 底部按钮 */
.drawer-footer { display: flex; justify-content: flex-end; gap: 10px; }

.form-tip { font-size: 12px; color: #909399; margin-left: 90px; }
.hint { font-size: 12px; color: #909399; margin-top: 4px; }
.category-toolbar { margin-bottom: 10px; display: flex; justify-content: flex-end; }
</style>
