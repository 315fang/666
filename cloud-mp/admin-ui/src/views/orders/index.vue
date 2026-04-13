<template>
  <div class="orders-page">
    <el-card>
      <template #header>
        <div class="card-header-row">
          <span>订单管理</span>
          <el-tag v-if="summaryPendingShip != null" type="warning" size="small">待发货队列 {{ summaryPendingShip }}</el-tag>
        </div>
      </template>

      <el-collapse class="tips-collapse">
        <el-collapse-item title="操作提示（点击展开）" name="1">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="订单页是高频处理主工作台。默认仅显示主单（不含拆分子单）；可按订单号、会员、收货人、商品名等多条件筛选。请核对支付方式、履约方式、金额与收货信息后再发货或改价。"
          />
        </el-collapse-item>
      </el-collapse>

      <div class="status-tabs">
        <el-radio-group v-model="searchForm.status_group" size="default" @change="onStatusGroupChange">
          <el-radio-button label="all">全部</el-radio-button>
          <el-radio-button label="pending_pay">待付款</el-radio-button>
          <el-radio-button label="pending_group">待成团</el-radio-button>
          <el-radio-button label="pending_ship">待发货</el-radio-button>
          <el-radio-button label="pending_receive">待收货</el-radio-button>
          <el-radio-button label="completed">已完成</el-radio-button>
          <el-radio-button label="closed">已关闭</el-radio-button>
        </el-radio-group>
      </div>

      <!-- 搜索表单 -->
      <el-form :model="searchForm" label-width="96px" class="filter-form">
        <el-row :gutter="12">
          <el-col :xs="24" :sm="24" :md="14" :lg="12">
            <el-form-item label="订单搜索">
              <div class="search-combo">
                <el-select v-model="searchForm.search_field" style="width: 140px" placeholder="字段">
                  <el-option label="自动匹配" value="auto" />
                  <el-option label="订单编号" value="order_no" />
                  <el-option label="会员昵称" value="buyer_nickname" />
                  <el-option label="会员手机" value="buyer_phone" />
                  <el-option label="会员编号" value="member_no" />
                  <el-option label="收货人姓名" value="receiver_name" />
                  <el-option label="收货人手机" value="receiver_phone" />
                  <el-option label="商品名称" value="product_name" />
                </el-select>
                <el-input v-model="searchForm.search_value" clearable placeholder="输入关键词" style="flex:1; min-width:120px" @keyup.enter="handleSearch" />
              </div>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="10" :lg="6">
            <el-form-item label="商品名称">
              <el-input v-model="searchForm.product_name" placeholder="含该商品的订单" clearable @keyup.enter="handleSearch" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="12" :lg="6">
            <el-form-item label="精确状态">
              <el-select v-model="searchForm.status" placeholder="不选则按上方 Tab" clearable style="width:100%">
                <el-option label="待支付" value="pending" />
                <el-option label="待发货(paid)" value="paid" />
                <el-option label="代理已确认" value="agent_confirmed" />
                <el-option label="申请发货" value="shipping_requested" />
                <el-option label="已发货" value="shipped" />
                <el-option label="已完成" value="completed" />
                <el-option label="已取消" value="cancelled" />
                <el-option label="已退款" value="refunded" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8" :lg="6">
            <el-form-item label="付款方式">
              <el-select v-model="searchForm.payment_method" placeholder="全部" clearable style="width:100%">
                <el-option label="微信支付" value="wechat" />
                <el-option label="货款支付" value="goods_fund" />
                <el-option label="余额支付" value="wallet" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8" :lg="6">
            <el-form-item label="配送方式">
              <el-select v-model="searchForm.delivery_type" placeholder="全部" clearable style="width:100%">
                <el-option label="快递" value="express" />
                <el-option label="到店自提" value="pickup" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="24" :md="16" :lg="12">
            <el-form-item label="下单时间">
              <el-date-picker
                v-model="dateRange"
                type="daterange"
                range-separator="至"
                start-placeholder="开始"
                end-placeholder="结束"
                value-format="YYYY-MM-DD"
                style="width:100%; max-width:360px"
              />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="24" :md="24" :lg="24">
            <el-form-item label=" ">
              <el-space wrap>
                <el-checkbox v-model="searchForm.include_suborders">含拆分子单</el-checkbox>
                <el-button type="primary" @click="handleSearch">查询</el-button>
                <el-button @click="handleReset">清空条件</el-button>
                <el-button @click="handleExport" :loading="exporting">导出 JSON</el-button>
              </el-space>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <!-- 订单表格 -->
      <el-table :data="tableData" v-loading="loading" stripe empty-text="暂无订单数据" class="orders-table">
        <el-table-column prop="id" label="ID" width="72" />
        <el-table-column label="订单信息" min-width="200">
          <template #default="{ row }">
            <div class="stack-block">
              <div><span class="stack-label">订单编号</span> {{ row.order_no }}</div>
              <div><span class="stack-label">类型</span> {{ orderTypeText(row) }}</div>
              <div><span class="stack-label">下单</span> {{ formatDateTime(row.created_at) }}</div>
              <div><span class="stack-label">支付</span> {{ row.paid_at ? formatDateTime(row.paid_at) : '-' }}</div>
              <div><span class="stack-label">来源</span> {{ orderSourceText(row) }}</div>
              <div class="hide-mobile"><span class="stack-label">配送</span> {{ deliveryTypeText(row.delivery_type) }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="会员信息" min-width="168" width="188">
          <template #default="{ row }">
            <div class="member-cell">
              <el-avatar :src="displayBuyerAvatar(row.buyer)" :size="36" class="member-avatar">{{ displayBuyerName(row.buyer, '?').slice(0, 1) }}</el-avatar>
              <div class="member-meta">
                <div class="text-secondary">编号 {{ row.buyer?.member_no || '-' }}</div>
                <div class="member-nick">{{ displayBuyerName(row.buyer) }}</div>
                <div class="text-secondary hide-mobile">{{ row.buyer?.phone || '-' }}</div>
                <el-tag size="small" :type="roleTagType(row.buyer?.role_level)" style="margin-top:4px">
                  {{ roleText(row.buyer?.role_level) }}
                </el-tag>
                <div class="hide-mobile" style="margin-top:4px">
                  <el-button link type="primary" size="small" @click="goUserManage(row)">找该会员</el-button>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="商品信息" min-width="240">
          <template #default="{ row }">
            <div class="cell-info-vertical">
              <el-image :src="row.product?.images?.[0]" class="product-thumb" fit="cover" />
              <div class="cell-info__body">
                <el-link type="primary" :underline="false" class="prod-title-link" @click="goProductManage(row)">
                  {{ row.product?.name || '-' }}
                </el-link>
                <div class="cell-info__sub">{{ listSkuText(row) }}</div>
                <div class="cell-info__sub">单价 ¥{{ lineUnitPrice(row) }} × {{ row.qty || row.quantity || 1 }}</div>
                <div class="cell-info__sub text-price">小计 ¥{{ money(row.total_amount) }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="实付 / 状态" width="180">
          <template #default="{ row }">
            <div class="text-price">¥{{ money(row.actual_price) }}</div>
            <div style="margin-top:6px">
              <el-tag :type="getStatusType(row.status)" size="small">{{ orderStatusText(row) }}</el-tag>
            </div>
            <div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:6px;">
              <el-tag :type="paymentMethodTagType(detailPaymentMethod(row))" effect="plain" size="small">
                {{ orderPaymentMethodText(row) }}
              </el-tag>
              <el-tag
                v-if="['refunding', 'refunded'].includes(row.status)"
                type="danger"
                effect="plain"
                size="small"
              >
                {{ orderRefundTargetText(row) }}
              </el-tag>
            </div>
            <div class="text-secondary hide-mobile" style="margin-top:4px;font-size:12px">{{ fulfillmentText(row) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="handleDetail(row)">订单详情</el-button>
            <el-button text type="success" size="small" v-if="['paid', 'agent_confirmed', 'shipping_requested'].includes(row.status)" @click="handleShip(row)">发货</el-button>
            <el-dropdown size="small" @command="(cmd) => handleDropdown(cmd, row)">
              <el-button text size="small">更多<el-icon><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-if="canAdjustOrderAmount" command="amount" :disabled="row.status !== 'pending'">改价</el-dropdown-item>
                  <el-dropdown-item command="remark">备注</el-dropdown-item>
                  <el-dropdown-item v-if="canForceCompleteOrder && row.status === 'shipped'" command="force_complete" class="warning-text">强制完成</el-dropdown-item>
                  <el-dropdown-item v-if="canForceCancelOrder" command="force_cancel" :disabled="['completed', 'cancelled', 'refunded'].includes(row.status)" class="danger-text">强制取消</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.limit"
        :total="pagination.total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="fetchOrders"
        @current-change="fetchOrders"
        style="margin-top: 20px; justify-content: flex-end;"
      />
    </el-card>

    <!-- ===== 订单详情抽屉 ===== -->
    <el-drawer v-model="detailVisible" :title="`订单详情 · ${detailData?.order_no || ''}`" size="820px">
      <template v-if="detailData">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          style="margin-bottom: 16px;"
          title="请核对状态、履约、收货与金额后再操作；买家留言与系统备注可能在同一字段中混排。"
        />

        <el-descriptions :column="2" border size="small" style="margin-bottom:20px">
          <el-descriptions-item label="订单号" :span="2">{{ detailData.order_no }}</el-descriptions-item>
          <el-descriptions-item label="订单状态">
            <el-tag :type="getStatusType(detailData.status)">{{ orderStatusText(detailData) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="履约方式">{{ fulfillmentText(detailData) }}</el-descriptions-item>
          <el-descriptions-item label="支付方式">
            <el-tag :type="paymentMethodTagType(detailPaymentMethod(detailData))" size="small">
              {{ orderPaymentMethodText(detailData) }}
            </el-tag>
            <span class="text-secondary" style="margin-left:8px">
              原值：{{ detailData.payment_method || detailData.pay_channel || detailData.pay_type || detailData.payment_channel || '-' }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="退款去向">{{ orderRefundTargetText(detailData) }}</el-descriptions-item>
          <el-descriptions-item label="配送方式">{{ deliveryTypeText(detailData.delivery_type) }}</el-descriptions-item>
          <el-descriptions-item label="下单时间">{{ fmtDateTime(detailData.created_at) }}</el-descriptions-item>
          <el-descriptions-item label="支付时间">{{ fmtDateTime(detailData.paid_at) }}</el-descriptions-item>
          <el-descriptions-item label="发货时间">{{ fmtDateTime(detailData.shipped_at) }}</el-descriptions-item>
          <el-descriptions-item label="完成时间">{{ fmtDateTime(detailData.completed_at) }}</el-descriptions-item>
          <el-descriptions-item label="代理确认">{{ fmtDateTime(detailData.agent_confirmed_at) }}</el-descriptions-item>
          <el-descriptions-item label="申请发货">{{ fmtDateTime(detailData.shipping_requested_at) }}</el-descriptions-item>
        </el-descriptions>

        <el-row :gutter="16" style="margin-bottom: 16px;">
          <el-col :span="24">
            <div class="detail-card">
              <div class="detail-card-title">会员信息</div>
              <div class="detail-member-row">
                <el-avatar :src="displayBuyerAvatar(detailData.buyer)" :size="48">{{ displayBuyerName(detailData.buyer, '?').slice(0, 1) }}</el-avatar>
                <el-descriptions :column="2" border size="small" class="detail-member-desc">
                  <el-descriptions-item label="买家昵称">{{ displayBuyerName(detailData.buyer) }}</el-descriptions-item>
                  <el-descriptions-item label="会员编号">{{ detailData.buyer?.member_no || '-' }}</el-descriptions-item>
                  <el-descriptions-item label="手机号">{{ detailData.buyer?.phone || '-' }}</el-descriptions-item>
                  <el-descriptions-item label="会员层级">
                    <el-tag size="small" :type="roleTagType(detailData.buyer?.role_level)">{{ roleText(detailData.buyer?.role_level) }}</el-tag>
                  </el-descriptions-item>
                  <el-descriptions-item label="邀请码">{{ detailData.buyer?.invite_code || '-' }}</el-descriptions-item>
                  <el-descriptions-item label="上级ID">{{ detailData.buyer?.parent_id || '-' }}</el-descriptions-item>
                </el-descriptions>
              </div>
            </div>
          </el-col>
        </el-row>

        <div class="detail-section-bar">商品信息</div>
        <el-row :gutter="16" class="detail-goods-row">
          <el-col :xs="24" :lg="15">
            <el-table :data="detailLineItems" border size="small" class="goods-lines-table">
              <el-table-column label="商品信息" min-width="220">
                <template #default="{ row }">
                  <div class="line-prod">
                    <el-image :src="row.image" class="line-prod-thumb" fit="cover" />
                    <div>
                      <div class="line-prod-name">{{ row.name }}</div>
                      <div class="line-prod-spec">{{ row.spec }}</div>
                    </div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="价格(元)" width="100" align="right">
                <template #default="{ row }">¥{{ row.unitPrice }}</template>
              </el-table-column>
              <el-table-column prop="qty" label="数量" width="72" align="center">
                <template #default="{ row }">{{ row.qty || row.quantity || 1 }}</template>
              </el-table-column>
              <el-table-column label="小计(元)" width="100" align="right">
                <template #default="{ row }">¥{{ row.lineTotal }}</template>
              </el-table-column>
            </el-table>
          </el-col>
          <el-col :xs="24" :lg="9">
            <div class="amount-summary">
              <div class="amount-row"><span>商品金额</span><span>¥{{ money(detailData.total_amount) }}</span></div>
              <div class="amount-row"><span>运费金额</span><span>¥{{ money(detailData.shipping_fee) }}</span></div>
              <div class="amount-row danger"><span>优惠金额</span><span>-¥{{ money(detailData.coupon_discount) }}</span></div>
              <div class="amount-row danger"><span>积分抵扣</span><span>-¥{{ money(detailData.points_discount) }}</span></div>
              <div class="amount-row total"><span>应付金额</span><span class="text-price">¥{{ money(detailData.actual_price) }}</span></div>
              <div class="amount-row">
                <span>支付方式</span>
                <span>{{ orderPaymentMethodText(detailData) }}</span>
              </div>
            </div>
          </el-col>
        </el-row>

        <div class="detail-section-bar" style="margin-top:20px">订单备注（买家留言与后台追加在同一字段）</div>
        <div class="buyer-remark-block">
          {{ detailData.remark?.trim() ? detailData.remark : '无' }}
        </div>

        <el-divider content-position="left">收货信息</el-divider>
        <div class="info-block detail-address">
          <template v-if="resolvedAddress(detailData)">
            <div class="detail-address-name">{{ resolvedAddress(detailData).receiver_name || resolvedAddress(detailData).name }} - {{ resolvedAddress(detailData).phone }}</div>
            <div class="detail-address-text">
              {{ resolvedAddress(detailData).province }} {{ resolvedAddress(detailData).city }} {{ resolvedAddress(detailData).district }}
              <br />
              {{ resolvedAddress(detailData).detail }}
            </div>
          </template>
          <template v-else>暂无收货信息</template>
        </div>

        <el-divider content-position="left">物流与履约</el-divider>
        <el-descriptions :column="2" border size="small" style="margin-bottom:20px">
          <el-descriptions-item label="承运方">{{ detailData.logistics_company || '-' }}</el-descriptions-item>
          <el-descriptions-item label="物流单号">{{ detailData.tracking_no || '-' }}</el-descriptions-item>
          <el-descriptions-item label="所属代理ID">{{ detailData.agent_id || '-' }}</el-descriptions-item>
          <el-descriptions-item label="实际履约人ID">{{ detailData.fulfillment_partner_id || '-' }}</el-descriptions-item>
          <el-descriptions-item label="锁定进货价">¥{{ money(detailData.locked_agent_cost) }}</el-descriptions-item>
          <el-descriptions-item label="中间佣金">¥{{ money(detailData.middle_commission_total) }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">订单时间线</el-divider>
        <el-timeline style="margin-bottom: 20px;">
          <el-timeline-item
            v-for="item in detailTimeline(detailData)"
            :key="`${item.label}-${item.time}`"
            :timestamp="item.time"
            placement="top"
          >
            {{ item.label }}
          </el-timeline-item>
        </el-timeline>

        <el-divider content-position="left">佣金记录</el-divider>
        <div v-if="detailData.commissions?.length" class="commission-list">
          <div v-for="item in detailData.commissions" :key="item.id" class="commission-item">
            <div class="commission-main">
              <span>{{ commissionTypeText(item.type) }}</span>
              <span class="commission-amount">¥{{ money(item.amount) }}</span>
            </div>
            <div class="commission-sub">
              <span>{{ commissionStatusText(item.status) }}</span>
              <span>{{ fmtDateTime(item.available_at) }}</span>
            </div>
            <div class="commission-remark" v-if="item.remark">{{ item.remark }}</div>
          </div>
        </div>
        <el-empty v-else description="暂无佣金记录" :image-size="80" />
      </template>
    </el-drawer>

    <!-- ===== 发货弹窗 ===== -->
    <el-dialog v-model="shipDialogVisible" title="订单发货" width="400px">
      <el-form :model="shipForm" label-width="80px">
        <el-form-item label="履约方式">
          <el-tag :type="shipForm.fulfillment_type === 'agent' ? 'warning' : 'primary'">
            {{ shipFulfillmentLabel }}
          </el-tag>
        </el-form-item>
          <el-alert
            :title="logisticsMode === 'manual' ? '当前为手工发货模式，不会调用第三方物流轨迹查询。' : '当前为第三方物流模式，请尽量填写标准物流信息。'"
            type="info"
            :closable="false"
            style="margin-bottom:12px"
          />
        <el-form-item label="快递公司">
          <el-select
            v-model="shipForm.logistics_company"
            filterable
            allow-create
            clearable
            default-first-option
            :reserve-keyword="false"
            style="width:100%"
            :placeholder="logisticsMode === 'manual' ? '选择或输入承运方，如顺丰速运 / 同城配送' : '选择或输入快递公司，如顺丰速运'"
          >
            <el-option
              v-for="company in shippingCompanyOptions"
              :key="company"
              :label="company"
              :value="company"
            />
          </el-select>
          <div class="text-secondary" style="font-size:12px; line-height:1.6; margin-top:6px;">
            支持直接输入新公司；发货成功后会自动记住{{ canManageSettings ? '并同步到共享配置' : '' }}。
          </div>
        </el-form-item>
        <el-form-item label="快递单号">
            <el-input v-model="shipForm.tracking_no" :placeholder="logisticsMode === 'manual' ? '输入运单号或手工单号' : '输入快递单号'" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="shipDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitShip" :loading="submittingShip">确认发货</el-button>
      </template>
    </el-dialog>

    <!-- ===== 修改金额弹窗 ===== -->
    <el-dialog v-model="amountVisible" title="修改订单金额" width="400px">
      <el-form :model="amountForm" label-width="90px">
        <el-form-item label="当前金额">
          <span style="color:#f56c6c; font-weight:bold; font-size:16px">¥{{ money(currentOrder?.actual_price) }}</span>
        </el-form-item>
        <el-form-item label="新金额">
          <el-input-number v-model="amountForm.actual_price" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="调整原因">
          <el-input v-model="amountForm.reason" placeholder="如：客服协商改价" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="amountVisible = false">取消</el-button>
        <el-button type="primary" @click="submitAmount" :loading="submittingAmount">确认修改</el-button>
      </template>
    </el-dialog>

    <!-- ===== 添加备注弹窗 ===== -->
    <el-dialog v-model="remarkVisible" title="添加内部备注" width="400px">
      <el-form>
        <el-input v-model="remarkText" type="textarea" :rows="4" placeholder="备注内容仅管理员可见，会追加到历史备注末尾" />
      </el-form>
      <template #footer>
        <el-button @click="remarkVisible = false">取消</el-button>
        <el-button type="primary" @click="submitRemark" :loading="submittingRemark">保存</el-button>
      </template>
    </el-dialog>

    <!-- ===== 强制动作弹窗 ===== -->
    <el-dialog v-model="forceVisible" :title="forceType === 'complete' ? '强制完成订单' : '强制取消订单'" width="400px">
      <el-alert v-if="forceType === 'cancel'" title="取消订单将自动发起退款，不可逆操作！" type="error" :closable="false" style="margin-bottom:15px" />
      <el-form :model="forceForm" label-width="90px">
        <el-form-item label="操作原因" required>
          <el-input v-model="forceForm.reason" placeholder="必填项" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="forceVisible = false">取消</el-button>
        <el-button :type="forceType === 'cancel' ? 'danger' : 'warning'" @click="submitForce" :loading="submittingForce">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import {
  getOrders,
  getOrderDetail,
  shipOrder,
  adjustOrderAmount,
  addOrderRemark,
  getMiniProgramConfig,
  updateMiniProgramConfig,
  forceCompleteOrder,
  forceCancelOrder,
  exportOrders
} from '@/api'
import { getCommissionTypeLabel } from '@/utils/commission'
import { formatDateTime } from '@/utils/format'
import { getUserAvatar, getUserNickname, normalizeUserDisplay } from '@/utils/userDisplay'
import { usePagination } from '@/composables/usePagination'
import { useUserStore } from '@/store/user'

const router = useRouter()
const route = useRoute()

// ===== 列表 =====
const loading = ref(false)
const exporting = ref(false)
const summaryPendingShip = ref(null)
const userStore = useUserStore()
const tableData = ref([])
const { pagination, resetPage, applyResponse } = usePagination()
const searchForm = reactive({
  status_group: 'all',
  status: '',
  search_field: 'auto',
  search_value: '',
  product_name: '',
  payment_method: '',
  delivery_type: '',
  include_suborders: false
})
const dateRange = ref([])
const submittingShip = ref(false)
const submittingAmount = ref(false)
const submittingRemark = ref(false)
const submittingForce = ref(false)
const logisticsMode = ref('third_party')
const logisticsTrackingRequired = ref(true)
const logisticsCompanyRequired = ref(false)
const miniProgramConfigSnapshot = ref(null)
const canAdjustOrderAmount = computed(() => userStore.hasPermission('order_amount_adjust'))
const canForceCompleteOrder = computed(() => userStore.hasPermission('order_force_complete'))
const canForceCancelOrder = computed(() => userStore.hasPermission('order_force_cancel'))
const canManageSettings = computed(() => userStore.hasPermission('settings_manage'))
const displayBuyer = (buyer) => normalizeUserDisplay(buyer || {})
const displayBuyerName = (buyer, fallback = '-') => getUserNickname(displayBuyer(buyer), fallback)
const displayBuyerAvatar = (buyer) => getUserAvatar(displayBuyer(buyer))

const SHIPPING_COMPANY_STORAGE_KEY = 'admin_shipping_company_options'
const DEFAULT_SHIPPING_COMPANY_OPTIONS = [
  '顺丰速运',
  '申通快递',
  '中通快递',
  '圆通速递',
  '韵达速递',
  '京东快递',
  '邮政EMS',
  '极兔速递',
  '德邦快递',
  '同城配送'
]

function normalizeShippingCompanyName(value) {
  return String(value || '').trim()
}

function dedupeStringList(list = []) {
  return [...new Set(
    list
      .map((item) => normalizeShippingCompanyName(item))
      .filter(Boolean)
  )]
}

function mergeShippingCompanyOptions(...groups) {
  return dedupeStringList(groups.flat())
}

function readLocalShippingCompanyOptions() {
  if (typeof window === 'undefined') return []
  try {
    const raw = JSON.parse(localStorage.getItem(SHIPPING_COMPANY_STORAGE_KEY) || '[]')
    return Array.isArray(raw) ? dedupeStringList(raw) : []
  } catch (_) {
    return []
  }
}

function persistLocalShippingCompanyOptions(list) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SHIPPING_COMPANY_STORAGE_KEY, JSON.stringify(dedupeStringList(list)))
  } catch (_) {
    // ignore local cache write failures
  }
}

const shippingCompanyOptions = ref(
  mergeShippingCompanyOptions(DEFAULT_SHIPPING_COMPANY_OPTIONS, readLocalShippingCompanyOptions())
)

/**
 * 构建订单列表查询参数
 *
 * search_field 枚举（对应 UI 下拉"搜索方式"）：
 *   auto        - 自动识别（后端按值格式判断是订单号、手机号还是昵称）
 *   order_no    - 精确匹配订单号
 *   phone       - 精确匹配买家手机号
 *   nickname    - 模糊匹配买家昵称
 *   member_no   - 精确匹配会员码（8位大写字母/数字）
 *   invite_code - 精确匹配邀请码（用于追踪推广来源订单）
 *
 * product_name  - 独立字段，按订单中包含的商品名称模糊匹配（与 search_value 互不干扰）
 * status_group  - Tab 级粗筛（all/pending/shipped/completed/cancelled），与精确 status 互斥
 * status        - 精确订单状态，由精确状态下拉选中时设置，优先级高于 status_group
 */
const buildListQueryParams = (forExport = false) => {
  const params = {}
  if (!forExport) {
    params.page = pagination.page
    params.limit = pagination.limit
  }
  if (searchForm.status) {
    params.status = searchForm.status
  } else if (searchForm.status_group && searchForm.status_group !== 'all') {
    params.status_group = searchForm.status_group
  }
  const sv = searchForm.search_value?.trim()
  if (sv) {
    params.search_field = searchForm.search_field || 'auto'
    params.search_value = sv
  }
  if (searchForm.product_name?.trim()) {
    params.product_name = searchForm.product_name.trim()
  }
  if (searchForm.payment_method) params.payment_method = searchForm.payment_method
  if (searchForm.delivery_type) params.delivery_type = searchForm.delivery_type
  if (dateRange.value && dateRange.value.length === 2) {
    params.start_date = dateRange.value[0]
    params.end_date = dateRange.value[1]
  }
  if (searchForm.include_suborders) params.include_suborders = '1'
  return params
}

const fetchOrders = async () => {
  loading.value = true
  try {
    const res = await getOrders(buildListQueryParams(false))
    tableData.value = res?.list || []
    applyResponse(res)
    const pShip = res?.pendingShip ?? res?.pending_ship ?? res?.summary?.pending_ship
    if (pShip != null) summaryPendingShip.value = pShip
  } catch (error) {
    console.error(error)
    ElMessage.error(error?.message || '加载订单列表失败')
  } finally {
    loading.value = false
  }
}

const refreshOrders = () => fetchOrders()

const runOrderMutation = async (loadingRef, task, successMessage, onSuccess) => {
  loadingRef.value = true
  try {
    await task()
    if (successMessage) {
      ElMessage.success(successMessage)
    }
    if (typeof onSuccess === 'function') {
      await onSuccess()
    }
    await refreshOrders()
  } catch (e) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    loadingRef.value = false
  }
}

watch(
  () => searchForm.status,
  (v) => {
    if (v) searchForm.status_group = 'all'
  }
)

const handleExport = async () => {
  exporting.value = true
  try {
    const blob = await exportOrders({ ...buildListQueryParams(true), limit: 2000 })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `orders-export-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('已导出订单 JSON')
  } catch (e) {
    ElMessage.error(e?.message || '导出失败')
  } finally {
    exporting.value = false
  }
}

const fetchMiniProgramConfig = async () => {
  try {
    const data = await getMiniProgramConfig()
    miniProgramConfigSnapshot.value = data || null
    logisticsMode.value = data?.logistics_config?.shipping_mode || 'third_party'
    logisticsTrackingRequired.value = data?.logistics_config?.shipping_tracking_no_required !== false
    logisticsCompanyRequired.value = !!data?.logistics_config?.shipping_company_name_required
    shippingCompanyOptions.value = mergeShippingCompanyOptions(
      DEFAULT_SHIPPING_COMPANY_OPTIONS,
      data?.logistics_config?.shipping_company_options || [],
      readLocalShippingCompanyOptions()
    )
    persistLocalShippingCompanyOptions(shippingCompanyOptions.value)
  } catch (e) {
    console.error('获取小程序物流配置失败:', e)
  }
}

const rememberShippingCompanyOption = async (value) => {
  const companyName = normalizeShippingCompanyName(value)
  if (!companyName) return

  const nextOptions = mergeShippingCompanyOptions(
    shippingCompanyOptions.value,
    [companyName]
  )
  shippingCompanyOptions.value = nextOptions
  persistLocalShippingCompanyOptions(nextOptions)

  if (!canManageSettings.value || !miniProgramConfigSnapshot.value) return

  const remoteOptions = dedupeStringList(
    miniProgramConfigSnapshot.value?.logistics_config?.shipping_company_options || []
  )
  if (remoteOptions.includes(companyName)) return

  const nextConfig = JSON.parse(JSON.stringify(miniProgramConfigSnapshot.value))
  nextConfig.logistics_config = {
    ...(nextConfig.logistics_config || {}),
    shipping_company_options: mergeShippingCompanyOptions(remoteOptions, [companyName])
  }

  try {
    await updateMiniProgramConfig(nextConfig)
    miniProgramConfigSnapshot.value = nextConfig
  } catch (error) {
    console.error('保存常用快递公司失败:', error)
    ElMessage.warning('快递公司已在当前浏览器记住，未能同步到共享配置')
  }
}

const handleSearch = () => {
  resetPage()
  refreshOrders()
}

const onStatusGroupChange = () => {
  searchForm.status = ''
  handleSearch()
}

const handleReset = () => {
  searchForm.status_group = 'all'
  searchForm.status = ''
  searchForm.search_field = 'auto'
  searchForm.search_value = ''
  searchForm.product_name = ''
  searchForm.payment_method = ''
  searchForm.delivery_type = ''
  searchForm.include_suborders = false
  dateRange.value = []
  handleSearch()
}

const money = (value) => {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n.toFixed(2) : '0.00'
}
const moneyNumber = (value) => Number(money(value))
const normalizeAmount = (value) => {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}
const fmtDateTime = (value) => value ? formatDateTime(value) : '-'
const detailPaymentMethod = (row = {}) => {
  const raw = String(
    row.payment_method
    || row.pay_channel
    || row.pay_type
    || row.payment_channel
    || ''
  ).trim().toLowerCase()
  if (['wechat', 'wx', 'jsapi', 'miniapp', 'wechatpay', 'weixin'].includes(raw)) return 'wechat'
  if (['goods_fund'].includes(raw)) return 'goods_fund'
  if (['wallet', 'balance', 'credit', 'debt'].includes(raw)) return 'wallet'
  return raw || ''
}
const paymentMethodText = (method) => ({
  wechat: '微信支付',
  goods_fund: '货款支付',
  wallet: '余额支付'
}[method] || (method || '-'))
const paymentMethodTagType = (method) => ({
  wechat: 'success',
  goods_fund: 'warning',
  wallet: 'info'
}[method] || 'info')
const refundDestinationText = (method) => ({
  wechat: '原路退回微信支付',
  goods_fund: '退回货款余额',
  wallet: '退回账户余额'
}[method] || '-')
const orderStatusText = (row = {}) => row.status_text || getStatusText(row.status)
const orderPaymentMethodText = (row = {}) => row.payment_method_text || paymentMethodText(detailPaymentMethod(row))
const orderRefundTargetText = (row = {}) => row.refund_target_text || refundDestinationText(detailPaymentMethod(row))
const deliveryTypeText = (type) => ({
  express: '快递配送',
  pickup: '到店自提'
}[type] || '-')

const orderTypeText = (row) => {
  const r = row?.remark || ''
  if (typeof r === 'string' && r.includes('group_no:')) return '拼团订单'
  return '普通订单'
}
const orderSourceText = () => '小程序商城'

const listSkuText = (row) => {
  if (row?.sku?.spec_name || row?.sku?.spec_value) {
    return `${row.sku.spec_name || '规格'}：${row.sku.spec_value || '-'}`
  }
  return '默认'
}

const lineUnitPrice = (row) => {
  const q = Number(row?.qty || row?.quantity || 1)
  const t = Number(row?.total_amount || 0)
  if (q <= 0) return money(t)
  return money(t / q)
}

const goUserManage = (row) => {
  const k = row.buyer?.member_no || row.buyer?.phone || displayBuyerName(row.buyer, '')
  if (!k) {
    ElMessage.warning('无会员信息可跳转')
    return
  }
  router.push({ name: 'Users', query: { keyword: String(k) } })
}

const goProductManage = (row) => {
  const name = row.product?.name
  router.push({ name: 'Products', query: name ? { keyword: name } : {} })
}
const fulfillmentText = (order) => (
  order?.fulfillment_type === 'Company'
    ? '云仓发货'
    : (order?.fulfillment_type === 'Agent'
        ? '代理商发货'
        : (order?.fulfillment_type === 'Agent_Pending' ? '代理待确认' : '自提/其他'))
)
const resolvedAddress = (order) => order?.address || order?.address_snapshot || null
const detailSkuText = (order) => {
  if (order?.sku?.spec_name || order?.sku?.spec_value) {
    return `${order.sku.spec_name || '规格'}：${order.sku.spec_value || '-'}`
  }
  return '默认规格'
}
const detailTimeline = (order) => {
  const items = [
    { label: '会员提交订单', time: fmtDateTime(order?.created_at) },
    { label: '会员支付订单', time: order?.paid_at ? fmtDateTime(order.paid_at) : '' },
    { label: '代理确认订单', time: order?.agent_confirmed_at ? fmtDateTime(order.agent_confirmed_at) : '' },
    { label: '申请发货', time: order?.shipping_requested_at ? fmtDateTime(order.shipping_requested_at) : '' },
    { label: '商家发货', time: order?.shipped_at ? fmtDateTime(order.shipped_at) : '' },
    { label: '订单完成', time: order?.completed_at ? fmtDateTime(order.completed_at) : '' }
  ]
  return items.filter(item => item.time)
}
const commissionTypeText = (type) => getCommissionTypeLabel(type)
const commissionStatusText = (status) => ({
  frozen: '冻结中',
  pending_approval: '待审批',
  approved: '已审批',
  settled: '已结算',
  cancelled: '已取消'
}[status] || status || '-')

// ===== 详情 =====
const detailVisible = ref(false)
const detailData = ref(null)

const detailLineItems = computed(() => {
  const o = detailData.value
  if (!o) return []
  const sourceItems = Array.isArray(o.items) && o.items.length
    ? o.items
    : [{
        snapshot_image: o.product?.images?.[0],
        snapshot_name: o.product?.name || '-',
        snapshot_spec: detailSkuText(o),
        qty: Number(o.qty || o.quantity || 1),
        item_amount: Number(o.total_amount || 0),
        unit_price: Number(o.total_amount || 0) / Math.max(1, Number(o.qty || o.quantity || 1))
      }]
  return sourceItems.map((item) => {
    const qty = Math.max(1, Number(item.qty || item.quantity || 1))
    const itemAmount = Number(item.item_amount ?? item.total_amount ?? item.price ?? 0)
    const unitPrice = Number(item.unit_price ?? (qty > 0 ? itemAmount / qty : itemAmount))
    return {
      image: item.snapshot_image || o.product?.images?.[0],
      name: item.snapshot_name || o.product?.name || '-',
      spec: item.snapshot_spec || detailSkuText(o),
      unitPrice: money(unitPrice),
      qty,
      lineTotal: money(itemAmount)
    }
  })
})

const handleDetail = async (row) => {
  try {
    const res = await getOrderDetail(row.id)
    detailData.value = res?.data || res
    if (detailData.value?.address_snapshot && !detailData.value.address) {
      detailData.value.address = detailData.value.address_snapshot
    }
    detailVisible.value = true
  } catch (e) {
    console.error(e)
    ElMessage.error(e?.message || '加载订单详情失败')
  }
}

// ===== 发货 =====
const shipDialogVisible = ref(false)
const currentOrder = ref(null)
const shipForm = reactive({ fulfillment_type: 'company', tracking_no: '', logistics_company: '' })

const inferFulfillmentType = (row) => {
  const type = String(row?.fulfillment_type || '').toLowerCase()
  if (type === 'agent' || type === 'agent_pending') return 'agent'
  if (['agent_confirmed', 'shipping_requested'].includes(row?.status)) return 'agent'
  return 'company'
}

const shipFulfillmentLabel = computed(() => (
  shipForm.fulfillment_type === 'agent'
    ? '代理商履约'
    : (logisticsMode.value === 'manual' ? '平台手工发货' : '平台云仓发货')
))

const handleShip = (row) => {
  currentOrder.value = row
  shipForm.fulfillment_type = inferFulfillmentType(row)
  shipForm.tracking_no = String(row?.tracking_no || '').trim()
  shipForm.logistics_company = normalizeShippingCompanyName(row?.logistics_company)
  shipDialogVisible.value = true
}
const submitShip = async () => {
  const trackingNo = String(shipForm.tracking_no || '').trim()
  const logisticsCompany = normalizeShippingCompanyName(shipForm.logistics_company)

  if (logisticsTrackingRequired.value && !trackingNo) {
    return ElMessage.warning('请输入物流单号')
  }
  if (logisticsCompanyRequired.value && !logisticsCompany) {
    return ElMessage.warning('请输入承运方名称')
  }
  await runOrderMutation(submittingShip, () => shipOrder(currentOrder.value.id, {
      ...shipForm,
      tracking_no: trackingNo,
      logistics_company: logisticsCompany,
      type: shipForm.fulfillment_type === 'agent' ? 'Agent' : 'Company',
      fulfillment_type: shipForm.fulfillment_type
    }), '发货成功', async () => {
      shipDialogVisible.value = false
      await rememberShippingCompanyOption(logisticsCompany)
    })
}

// ===== 改价 =====
const amountVisible = ref(false)
const amountForm = reactive({ actual_price: 0, reason: '' })

const handleAmount = (row) => {
  currentOrder.value = row
  amountForm.actual_price = moneyNumber(row.actual_price)
  amountForm.reason = ''
  amountVisible.value = true
}
const submitAmount = async () => {
  if (!amountForm.reason.trim()) return ElMessage.warning('请填写调整原因')
  await runOrderMutation(
    submittingAmount,
    () => adjustOrderAmount(currentOrder.value.id, { actual_price: normalizeAmount(amountForm.actual_price), reason: amountForm.reason }),
    '金额修改成功',
    () => { amountVisible.value = false }
  )
}

// ===== 备注 =====
const remarkVisible = ref(false)
const remarkText = ref('')

const handleRemarkItem = (row) => {
  currentOrder.value = row
  remarkText.value = ''
  remarkVisible.value = true
}
const submitRemark = async () => {
  if (!remarkText.value.trim()) return ElMessage.warning('请填写备注')
  await runOrderMutation(
    submittingRemark,
    () => addOrderRemark(currentOrder.value.id, { remark: remarkText.value }),
    '备注添加成功',
    () => { remarkVisible.value = false }
  )
}

// ===== 强制操作 =====
const forceVisible = ref(false)
const forceType = ref('') // 'complete' | 'cancel'
const forceForm = reactive({ reason: '' })

const handleForce = (row, type) => {
  currentOrder.value = row
  forceType.value = type
  forceForm.reason = ''
  forceVisible.value = true
}
const submitForce = async () => {
  if (!forceForm.reason.trim()) return ElMessage.warning('必填原因')
  const action = forceType.value === 'complete'
    ? () => forceCompleteOrder(currentOrder.value.id, forceForm)
    : () => forceCancelOrder(currentOrder.value.id, forceForm)
  const message = forceType.value === 'complete' ? '订单已强制完成' : '订单已强制取消并退款'
  await runOrderMutation(submittingForce, action, message, () => { forceVisible.value = false })
}

// Dropdown dispatch
const handleDropdown = (cmd, row) => {
  if (cmd === 'amount') handleAmount(row)
  else if (cmd === 'remark') handleRemarkItem(row)
  else if (cmd === 'force_complete') handleForce(row, 'complete')
  else if (cmd === 'force_cancel') handleForce(row, 'cancel')
}

// ===== 工具 =====
const roleText = (r) => (['普通用户', '会员', '团长', '代理商', '合伙人', '区域代理'][r] ?? '未知')
const roleTagType = (r) => (['', 'success', 'warning', 'danger', 'danger', 'danger'][r] ?? '')
const getStatusType = (s) => (
  ['pending', 'pending_payment'].includes(s)
    ? 'warning'
    : s === 'pending_group'
      ? 'warning'
      : ['paid', 'agent_confirmed', 'shipping_requested', 'shipped'].includes(s)
        ? 'primary'
        : ['completed'].includes(s)
          ? 'success'
          : 'info'
)
const getStatusText = (s) => ({
  pending: '待付款',
  pending_payment: '待付款',
  pending_group: '待成团',
  paid: '待发货',
  agent_confirmed: '代理已确认',
  shipping_requested: '代理申请发货',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款'
}[s] || s)
onMounted(() => {
  const q = route.query || {}
  if (q.status) {
    searchForm.status = String(q.status)
    searchForm.status_group = 'all'
  } else if (q.status_group) {
    searchForm.status_group = String(q.status_group)
    searchForm.status = ''
  }
  fetchMiniProgramConfig()
  refreshOrders()
})
</script>

<style scoped>
.card-header-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.tips-collapse { margin-bottom: 12px; border: none; }
.tips-collapse :deep(.el-collapse-item__header) { font-size: 13px; color: var(--el-color-info); }
.status-tabs { margin-bottom: 16px; }
.filter-form { margin-bottom: 8px; }
.search-combo { display: flex; gap: 8px; width: 100%; align-items: center; flex-wrap: wrap; }
.stack-block { font-size: 12px; line-height: 1.65; color: var(--el-text-color-regular); }
.stack-label { color: #909399; margin-right: 4px; }
.member-cell { display: flex; gap: 10px; align-items: flex-start; }
.member-avatar { flex-shrink: 0; }
.member-meta { min-width: 0; flex: 1; }
.member-nick { font-weight: 600; color: #303133; font-size: 13px; }
.prod-title-link { text-align: left; white-space: normal; line-height: 1.45; font-weight: 600; }
.orders-table { margin-top: 8px; }

.detail-section-bar {
  font-size: 14px;
  font-weight: 600;
  padding-bottom: 8px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.detail-goods-row { margin-bottom: 16px; }
.line-prod { display: flex; gap: 10px; align-items: flex-start; }
.line-prod-thumb { width: 48px; height: 48px; border-radius: 6px; flex-shrink: 0; }
.line-prod-name { font-weight: 600; font-size: 13px; }
.line-prod-spec { font-size: 12px; color: #909399; margin-top: 4px; }
.amount-summary {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 13px;
}
.amount-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}
.amount-row:last-child { border-bottom: none; }
.amount-row.danger span:last-child { color: var(--el-color-danger); }
.amount-row.total {
  font-weight: 700;
  font-size: 15px;
  padding-top: 10px;
  margin-top: 4px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.buyer-remark-block {
  min-height: 48px;
  padding: 12px;
  background: #fafafa;
  border-radius: 8px;
  font-size: 13px;
  color: #606266;
  white-space: pre-wrap;
  word-break: break-word;
}
.detail-member-row { display: flex; gap: 12px; align-items: flex-start; }
.detail-member-desc { flex: 1; min-width: 0; }

.danger-text { color: var(--el-color-danger) !important; }
.warning-text { color: var(--el-color-warning) !important; }

.product-thumb { width: 50px; height: 50px; border-radius: 4px; }
.detail-address { margin-bottom: 20px; }
.detail-card {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 12px;
  background: #fff;
}
.detail-card-title {
  font-size: 13px;
  font-weight: 700;
  color: #303133;
  margin-bottom: 10px;
}
.detail-product {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.detail-product-thumb {
  width: 64px;
  height: 64px;
  border-radius: 6px;
  flex-shrink: 0;
}
.detail-product-body {
  flex: 1;
  min-width: 0;
}
.detail-product-name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  line-height: 1.5;
}
.detail-product-spec {
  margin-top: 4px;
  font-size: 12px;
  color: #6b7280;
}
.detail-address-name {
  font-weight: 700;
  margin-bottom: 6px;
}
.detail-address-text {
  color: #606266;
  font-size: 13px;
  line-height: 1.7;
}
.order-remark {
  color: #e6a23c;
  font-size: 13px;
  background: #fdf6ec;
  padding: 10px;
  border-radius: 4px;
}
.commission-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.commission-item {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fff;
}
.commission-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  color: #303133;
}
.commission-amount {
  color: #f56c6c;
}
.commission-sub {
  display: flex;
  gap: 12px;
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}
.commission-remark {
  margin-top: 6px;
  font-size: 12px;
  color: #606266;
  line-height: 1.6;
}
</style>
