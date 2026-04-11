<template>
  <div class="agent-system-page">
    <el-tabs v-model="activeTab" type="border-card">

      <!-- ====== 升级条件 ====== -->
      <el-tab-pane label="升级条件" name="upgrade">
        <el-card>
          <template #header><div class="card-header">
            <div><el-switch v-model="upgradeRules.enabled" active-text="启用" inactive-text="停用" style="margin-right:12px" />角色升级条件</div>
            <el-button type="primary" :loading="saving" @click="save('upgrade')">保存</el-button>
          </div></template>
          <el-form label-width="220px" style="max-width:700px" :disabled="!upgradeRules.enabled">
            <el-divider content-position="left">普通用户 → C1 初级代理</el-divider>
            <el-form-item label="最低消费金额（元）"><el-input-number v-model="upgradeRules.c1_min_purchase" :min="0" :step="10" /></el-form-item>
            <el-divider content-position="left">C1 → C2 高级代理</el-divider>
            <el-form-item label="直推C2级别人数"><el-input-number v-model="upgradeRules.c2_referee_count" :min="1" /></el-form-item>
            <el-form-item label="累计销售额（元）"><el-input-number v-model="upgradeRules.c2_min_sales" :min="0" :step="50" /></el-form-item>
            <el-divider content-position="left">C2 → B1 推广合伙人</el-divider>
            <el-form-item label="推荐C2人数"><el-input-number v-model="upgradeRules.b1_referee_count" :min="1" /></el-form-item>
            <el-form-item label="或 缴纳金额（元）"><el-input-number v-model="upgradeRules.b1_recharge" :min="0" :step="500" /></el-form-item>
            <el-divider content-position="left">B1 → B2 运营合伙人</el-divider>
            <el-form-item label="推荐B1人数"><el-input-number v-model="upgradeRules.b2_referee_count" :min="1" /></el-form-item>
            <el-form-item label="或 缴纳金额（元）"><el-input-number v-model="upgradeRules.b2_recharge" :min="0" :step="5000" /></el-form-item>
            <el-divider content-position="left">B2 → B3 区域合伙人</el-divider>
            <el-form-item label="缴纳金额（元）"><el-input-number v-model="upgradeRules.b3_recharge" :min="0" :step="10000" /></el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- ====== 佣金配置 ====== -->
      <el-tab-pane label="佣金配置" name="commission">
        <el-card>
          <template #header><div class="card-header">
            <div>佣金比例配置</div>
            <el-button type="primary" :loading="saving" @click="save('commission')">保存</el-button>
          </div></template>

          <el-alert
            type="info"
            :closable="false"
            style="margin-bottom:16px"
            title="所有佣金均以「占订单实付的百分比（%）」计算。固定金额类仅有上级代理协助奖（按件/单），配置在「代理协助奖」Tab。"
          />

          <el-row :gutter="20" class="commission-layout">
            <el-col :xs="24" :lg="14">
              <el-form label-width="240px" class="commission-form">
                <el-alert type="info" :closable="false" style="margin-bottom:12px" title="佣金计算逻辑：利润池 = 买家实付 - 发货成本（6折拿货价）。各层级从利润池中按下方比例获得佣金，剩余归发货方（代理商或平台）。" />

                <el-divider content-position="left">默认履约策略</el-divider>
                <el-form-item label="默认平台发货">
                  <el-switch v-model="commission.default_platform_fulfillment" />
                  <div class="form-tip-block">
                    开启后，新订单默认走平台发货；关闭后，若上级代理存在可用云仓库存，则优先进入代理待发货。
                  </div>
                </el-form-item>

                <el-divider content-position="left">直推上级佣金（占利润池 %）</el-divider>
                <el-form-item label="四级统一比例">
                  <el-input-number v-model="unifiedDirectPct" :min="0" :max="100" :step="0.5" :precision="1" />
                  <span class="unit-suffix">%</span>
                  <el-button type="primary" link style="margin-left:12px" @click="applyUnifiedDirectPct">同步到 C1～B2</el-button>
                </el-form-item>
                <el-form-item label="C1 直推佣金"><el-input-number v-model="commission.direct_pct_by_role[1]" :min="0" :max="100" :step="0.5" :precision="1" /><span class="unit-suffix">%</span></el-form-item>
                <el-form-item label="C2 直推佣金"><el-input-number v-model="commission.direct_pct_by_role[2]" :min="0" :max="100" :step="0.5" :precision="1" /><span class="unit-suffix">%</span></el-form-item>
                <el-form-item label="B1 直推佣金"><el-input-number v-model="commission.direct_pct_by_role[3]" :min="0" :max="100" :step="0.5" :precision="1" /><span class="unit-suffix">%</span></el-form-item>
                <el-form-item label="B2 直推佣金"><el-input-number v-model="commission.direct_pct_by_role[4]" :min="0" :max="100" :step="0.5" :precision="1" /><span class="unit-suffix">%</span></el-form-item>

                <el-divider content-position="left">二级上级佣金（上上级）</el-divider>
                <p class="section-micro">上上级的 role_level 为 C2 或 B1 时生效；其他等级不配则为 0。</p>
                <el-form-item label="C2 作为上上级"><el-input-number v-model="commission.indirect_pct_by_role[2]" :min="0" :max="100" :step="0.5" :precision="1" /><span class="unit-suffix">%</span></el-form-item>
                <el-form-item label="B1 作为上上级"><el-input-number v-model="commission.indirect_pct_by_role[3]" :min="0" :max="100" :step="0.5" :precision="1" /><span class="unit-suffix">%</span></el-form-item>

                <el-divider content-position="left">三级折减系数</el-divider>
                <el-form-item label="三级佣金折减">
                  <el-input-number v-model="commission.tertiary_pct_factor" :min="0" :max="100" :step="1" />
                  <span class="unit-suffix">%</span>
                  <div class="form-tip-block">三级有效比例 = 二级比例 × 本系数 ÷ 100。默认 50 即二级打5折。</div>
                </el-form-item>
                <el-divider content-position="left">B 端拿货折扣</el-divider>
                <el-form-item label="拿货折扣率">
                  <el-input-number v-model="commission.agent_cost_discount_rate" :min="0.1" :max="1" :step="0.05" :precision="2" />
                  <div class="form-tip-block">输入小数：<strong>0.60</strong> = 6 折拿货（B1 及以上生效）。</div>
                </el-form-item>
              </el-form>
            </el-col>

            <el-col :xs="24" :lg="10">
              <el-card shadow="never" class="preview-card">
                <template #header>
                  <span>分层利润预览</span>
                  <el-text type="info" size="small" class="preview-header-sub">示意 · 无封顶 · 无级差细节</el-text>
                </template>

                <template v-if="!commission.use_price_gap_middle_commission">
                  <el-form label-position="top" size="small" class="preview-form">
                    <el-form-item label="假设订单实付（元）">
                      <el-input-number v-model="previewPaid" :min="0" :max="9999999" :step="10" style="width:100%" controls-position="right" />
                    </el-form-item>
                    <el-form-item label="直推上级 role_level">
                      <el-select v-model="previewChain.parentRole" style="width:100%">
                        <el-option v-for="o in previewParentRoleOptions" :key="o.v" :label="o.l" :value="o.v" />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="二级上级（上上级）role_level">
                      <el-select v-model="previewChain.gpRole" style="width:100%">
                        <el-option v-for="o in previewIndirectRoleOptions" :key="'gp-'+o.v" :label="o.l" :value="o.v" />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="三级上级 role_level">
                      <el-select v-model="previewChain.ggpRole" style="width:100%">
                        <el-option v-for="o in previewIndirectRoleOptions" :key="'ggp-'+o.v" :label="o.l" :value="o.v" />
                      </el-select>
                    </el-form-item>
                  </el-form>

                  <div class="preview-bar-caption">占实付构成（彩色 = 各层中间佣金，灰 = 其余示意）</div>
                  <div v-if="previewBarSegments.length" class="preview-bar">
                    <el-tooltip v-for="seg in previewBarSegments" :key="seg.key" :content="seg.tip" placement="top">
                      <div
                        class="preview-bar-seg"
                        :style="{ flex: Math.max(seg.flex, 0.001), background: seg.color, color: seg.key === 'rest' ? '#606266' : '#fff' }"
                      >
                        <span v-if="seg.flex >= 0.07">{{ seg.pctLabel }}</span>
                      </div>
                    </el-tooltip>
                  </div>
                  <p v-else class="preview-footnote">请填写大于 0 的假设实付。</p>

                  <el-table :data="middlePreview.rows" size="small" border class="preview-table">
                    <el-table-column prop="layer" label="层级" width="72" />
                    <el-table-column prop="roleLabel" label="假设角色" min-width="100" show-overflow-tooltip />
                    <el-table-column prop="rateLabel" label="比例" width="108" show-overflow-tooltip />
                    <el-table-column label="金额" width="88" align="right">
                      <template #default="{ row }">¥{{ row.amount.toFixed(2) }}</template>
                    </el-table-column>
                  </el-table>
                  <p class="preview-footnote">
                    中间佣金合计 <strong>¥{{ middlePreview.totalMiddle.toFixed(2) }}</strong>；
                    与实付差额 <strong>¥{{ middlePreview.rest.toFixed(2) }}</strong> 含成本/平台等（非本表分项）。
                  </p>

                  <template v-if="commission.cost_split?.enabled">
                    <el-divider content-position="left">四维结构条（独立示意）</el-divider>
                    <div class="preview-bar-caption">与中间佣金条<strong>无关</strong>；当前配置合计 {{ costSplitSumPct }}%</div>
                    <div class="preview-bar preview-bar--split">
                      <el-tooltip v-for="seg in costSplitBarSegments" :key="seg.key" :content="seg.tip" placement="top">
                        <div class="preview-bar-seg" :style="{ flex: Math.max(seg.flex, 0.001), background: seg.color, color: '#333' }">
                          <span v-if="seg.flex >= 0.06">{{ seg.short }} {{ seg.pct }}%</span>
                        </div>
                      </el-tooltip>
                    </div>
                  </template>
                </template>
                <el-alert v-else type="warning" :closable="false" title="级差模式依赖商品多级价与单笔订单，此处不做金额预览。" />

                <el-divider content-position="left">拿货成本小算盘</el-divider>
                <el-form label-position="top" size="small">
                  <el-form-item label="假设基准成本（元）">
                    <el-input-number v-model="previewCostBase" :min="0" :step="10" style="width:100%" controls-position="right" />
                  </el-form-item>
                </el-form>
                <p class="preview-footnote">
                  锁定货款成本 ≈ <strong>¥{{ previewAgentCost.toFixed(2) }}</strong>
                  （{{ previewCostBase }} × 折扣率 <strong>{{ commission.agent_cost_discount_rate }}</strong>）
                </p>
              </el-card>
            </el-col>
          </el-row>
        </el-card>
      </el-tab-pane>

      <!-- ====== 平级奖 ====== -->
      <el-tab-pane label="平级奖" name="peer">
        <el-card>
          <template #header><div class="card-header">
            <div><el-switch v-model="peerBonus.enabled" active-text="启用" inactive-text="停用" style="margin-right:12px" />同级直推奖金</div>
            <el-button type="primary" :loading="saving" @click="save('peer')">保存</el-button>
          </div></template>
          <el-form label-width="260px" style="max-width:650px" :disabled="!peerBonus.enabled">
            <el-form-item label="C1推C1 现金（元）"><el-input-number v-model="peerBonus.level_1" :min="0" /></el-form-item>
            <el-form-item label="C2推C2 现金（元）"><el-input-number v-model="peerBonus.level_2" :min="0" /></el-form-item>
            <el-form-item label="B1推B1 现金（元）"><el-input-number v-model="peerBonus.level_3" :min="0" /><span class="form-tip">+产品奖励见下方</span></el-form-item>
            <el-form-item label="B2推B2 现金（元）"><el-input-number v-model="peerBonus.level_4" :min="0" /></el-form-item>
            <el-form-item label="B3推B3 现金（元）"><el-input-number v-model="peerBonus.level_5" :min="0" /></el-form-item>
            <el-divider content-position="left">产品奖励套数</el-divider>
            <el-form-item label="B1平级奖 产品套数"><el-input-number v-model="peerBonus.product_sets_3" :min="0" :max="50" /></el-form-item>
            <el-form-item label="B2平级奖 产品套数"><el-input-number v-model="peerBonus.product_sets_4" :min="0" :max="50" /></el-form-item>
            <el-form-item label="B3平级奖 产品套数"><el-input-number v-model="peerBonus.product_sets_5" :min="0" :max="50" /></el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- ====== 代理协助奖（动态阶梯）====== -->
      <el-tab-pane label="代理协助奖" name="assist">
        <el-card>
          <template #header><div class="card-header">
            <div><el-switch v-model="assistBonus.enabled" active-text="启用" inactive-text="停用" style="margin-right:12px" />上级代理协助下级代理发货阶梯奖</div>
            <el-button type="primary" :loading="saving" @click="save('assist')">保存</el-button>
          </div></template>
          <el-table :data="assistBonus.tiers" border style="max-width:500px;margin-bottom:16px" v-if="assistBonus.enabled">
            <el-table-column label="累计单数上限" width="160">
              <template #default="{row}"><el-input-number v-model="row.max_orders" :min="1" size="small" style="width:120px" /></template>
            </el-table-column>
            <el-table-column label="每单奖金（元）" width="160">
              <template #default="{row}"><el-input-number v-model="row.bonus" :min="0" :step="5" size="small" style="width:120px" /></template>
            </el-table-column>
            <el-table-column label="操作" width="80">
              <template #default="{$index}"><el-button type="danger" size="small" text @click="assistBonus.tiers.splice($index,1)">删除</el-button></template>
            </el-table-column>
          </el-table>
          <el-button type="primary" size="small" @click="assistBonus.tiers.push({max_orders:100,bonus:60})" v-if="assistBonus.enabled">+ 添加阶梯</el-button>
        </el-card>
      </el-tab-pane>

      <!-- ====== 基金池 ====== -->
      <el-tab-pane label="基金池" name="fund">
        <el-card>
          <template #header><div class="card-header">
            <div><el-switch v-model="fundPool.enabled" active-text="启用" inactive-text="停用" style="margin-right:12px" />合伙人基金池</div>
            <el-button type="primary" :loading="saving" @click="save('fund')">保存</el-button>
          </div></template>
          <el-alert title="每位合伙人晋升时从缴费中提取基金池，按四维比例拆分：镜像运营、旅行基金、父母奖、个人奖励。" type="info" :closable="false" style="margin-bottom:20px" />
          <div v-for="(label,key) in {b1:'B1 推广合伙人', b2:'B2 运营合伙人', b3:'B3 区域合伙人'}" :key="key" v-if="fundPool.enabled">
            <el-divider content-position="left">{{ label }}</el-divider>
            <el-form label-width="200px" style="max-width:600px">
              <el-form-item label="基金池总额（元）"><el-input-number v-model="fundPool[key].total" :min="0" :step="100" /></el-form-item>
              <el-form-item label="镜像运营 %"><el-input-number v-model="fundPool[key].mirror_ops_pct" :min="0" :max="100" /></el-form-item>
              <el-form-item label="旅行基金 %"><el-input-number v-model="fundPool[key].travel_pct" :min="0" :max="100" /></el-form-item>
              <el-form-item label="父母奖 %"><el-input-number v-model="fundPool[key].parent_pct" :min="0" :max="100" /></el-form-item>
              <el-form-item label="个人奖励 %"><el-input-number v-model="fundPool[key].personal_pct" :min="0" :max="100" /></el-form-item>
              <el-form-item label="金额预览">
                <el-tag v-for="(lbl,pctKey) in {mirror_ops_pct:'镜像运营',travel_pct:'旅行',parent_pct:'父母',personal_pct:'个人'}" :key="pctKey" style="margin-right:8px">
                  {{ lbl }} ¥{{ (fundPool[key].total * fundPool[key][pctKey] / 100).toFixed(0) }}
                </el-tag>
              </el-form-item>
            </el-form>
          </div>
        </el-card>
      </el-tab-pane>

      <!-- ====== 成本结构（内部核算，不影响佣金计算）====== -->
      <el-tab-pane label="成本结构" name="cost_structure">
        <el-card>
          <template #header><div class="card-header">
            <div>收入成本结构（内部核算）</div>
            <el-button type="primary" :loading="saving" @click="save('commission')">保存</el-button>
          </div></template>
          <el-alert
            type="warning"
            :closable="false"
            style="margin-bottom:20px"
            title="以下四维结构为公司内部管理核算模型，不参与自动佣金分配计算，仅供运营理解收入结构使用。建议四项合计 100%。"
          />
          <el-form label-width="200px" style="max-width:600px">
            <el-form-item label="直销收益">
              <el-input-number v-model="commission.cost_split.direct_sales_pct" :min="0" :max="100" />
              <span class="unit-suffix">%</span>
              <span class="form-tip">代理层佣金总额占比（约等于最高直推比例）</span>
            </el-form-item>
            <el-form-item label="运营成本">
              <el-input-number v-model="commission.cost_split.operations_pct" :min="0" :max="100" />
              <span class="unit-suffix">%</span>
              <span class="form-tip">物流、仓储、损耗等</span>
            </el-form-item>
            <el-form-item label="镜像运营成本">
              <el-input-number v-model="commission.cost_split.mirror_operations_pct" :min="0" :max="100" />
              <span class="unit-suffix">%</span>
              <span class="form-tip">海报、招商、会晤等运营支持</span>
            </el-form-item>
            <el-form-item label="利润">
              <el-input-number v-model="commission.cost_split.profit_pct" :min="0" :max="100" />
              <span class="unit-suffix">%</span>
            </el-form-item>
            <el-form-item label="当前合计">
              <el-tag :type="costSplitSumPct === 100 ? 'success' : 'warning'">
                {{ costSplitSumPct }}%
              </el-tag>
              <span v-if="costSplitSumPct !== 100" class="form-tip" style="color:#E6A23C">建议调整至合计 100%</span>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- ====== 年终分红（细化）====== -->
      <el-tab-pane label="年终分红" name="dividend">
        <el-card style="margin-bottom:16px">
          <template #header><div class="card-header">
            <div><el-switch v-model="dividendRules.enabled" active-text="启用" inactive-text="停用" style="margin-right:12px" />分红规则配置</div>
            <el-button type="primary" :loading="saving" @click="save('dividendRules')">保存规则</el-button>
          </div></template>
          <el-form label-width="200px" style="max-width:650px" :disabled="!dividendRules.enabled">
            <el-form-item label="分红来源比例 %"><el-input-number v-model="dividendRules.source_pct" :min="0" :max="10" :step="0.5" :precision="1" /></el-form-item>
            <el-form-item label="最低参与月数"><el-input-number v-model="dividendRules.min_months" :min="0" :max="12" /><span class="form-tip">需平足此月数才有资格</span></el-form-item>
            <el-divider content-position="left">B波团队奖（占 {{ dividendRules.b_team_award.pool_pct }}%）</el-divider>
            <el-form-item label="启用"><el-switch v-model="dividendRules.b_team_award.enabled" /></el-form-item>
            <el-form-item label="占分红池比例 %"><el-input-number v-model="dividendRules.b_team_award.pool_pct" :min="0" :max="10" :step="0.5" :precision="1" /></el-form-item>
            <div v-for="(r,i) in dividendRules.b_team_award.ranks" :key="'bt'+i" style="margin-left:200px;margin-bottom:8px">
              <el-tag>{{ r.label }}</el-tag> {{ r.count }}人 占 <el-input-number v-model="r.pct" :min="0" :max="5" :step="0.1" :precision="1" size="small" style="width:100px" /> %
            </div>
            <el-divider content-position="left">B1个人奖（占 {{ dividendRules.b1_personal_award.pool_pct }}%）</el-divider>
            <el-form-item label="启用"><el-switch v-model="dividendRules.b1_personal_award.enabled" /></el-form-item>
            <el-form-item label="占分红池比例 %"><el-input-number v-model="dividendRules.b1_personal_award.pool_pct" :min="0" :max="10" :step="0.5" :precision="1" /></el-form-item>
            <div v-for="(r,i) in dividendRules.b1_personal_award.ranks" :key="'b1'+i" style="margin-left:200px;margin-bottom:8px">
              <el-tag>{{ r.label }}</el-tag> {{ r.count }}人 占 <el-input-number v-model="r.pct" :min="0" :max="5" :step="0.1" :precision="1" size="small" style="width:100px" /> %
            </div>
          </el-form>
        </el-card>

        <el-card>
          <template #header><span>分红执行</span></template>
          <el-form label-width="160px" style="max-width:600px" :inline="false">
            <el-form-item label="分红年度"><el-date-picker v-model="dividendYear" type="year" value-format="YYYY" style="width:160px" /></el-form-item>
            <el-form-item label="分红池总金额（元）"><el-input-number v-model="dividendPool" :min="0" :step="1000" style="width:200px" /></el-form-item>
            <el-form-item>
              <el-button type="warning" @click="previewDividend" :loading="dividendLoading">预览</el-button>
              <el-button
                type="danger"
                @click="confirmExecuteDividend"
                :loading="dividendExecuting"
                :disabled="!dividendPreviewData.length || !isSuperAdmin"
              >
                确认发放
              </el-button>
            </el-form-item>
            <el-form-item v-if="!isSuperAdmin">
              <el-text type="warning" size="small">仅超级管理员可执行实际分红发放。</el-text>
            </el-form-item>
          </el-form>
          <el-table :data="dividendPreviewData" v-if="dividendPreviewData.length" style="margin-top:16px" border>
            <el-table-column prop="rank" label="排名" width="70" />
            <el-table-column label="昵称"><template #default="{row}">{{ row.nick_name || row.nickname || '-' }}</template></el-table-column>
            <el-table-column prop="roleLevel" label="等级" width="110"><template #default="{row}">{{ ROLE_NAMES[row.roleLevel] }}</template></el-table-column>
            <el-table-column prop="teamSales" label="团队业绩" width="130"><template #default="{row}">¥{{ Number(row.teamSales).toFixed(2) }}</template></el-table-column>
            <el-table-column prop="sharePercent" label="比例" width="80"><template #default="{row}">{{ row.sharePercent }}%</template></el-table-column>
            <el-table-column prop="dividendAmount" label="分红" width="130"><template #default="{row}"><b style="color:#E6A23C">¥{{ Number(row.dividendAmount).toFixed(2) }}</b></template></el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- ====== 合伙人退出 ====== -->
      <el-tab-pane label="合伙人退出" name="exit">
        <el-card style="margin-bottom:16px">
          <template #header><div class="card-header">
            <div><el-switch v-model="exitRules.enabled" active-text="启用" inactive-text="停用" style="margin-right:12px" />退出规则配置</div>
            <el-button type="primary" :loading="saving" @click="save('exitRules')">保存规则</el-button>
          </div></template>
          <el-form label-width="240px" style="max-width:650px" :disabled="!exitRules.enabled">
            <el-divider content-position="left">未满1年（365天）</el-divider>
            <el-form-item label="最短退款周期（工作日）"><el-input-number v-model="exitRules.under_1_year_min_days" :min="1" /></el-form-item>
            <el-form-item label="最长退款周期（工作日）"><el-input-number v-model="exitRules.under_1_year_max_days" :min="1" /></el-form-item>
            <el-divider content-position="left">满1年及以上</el-divider>
            <el-form-item label="最短退款周期（工作日）"><el-input-number v-model="exitRules.over_1_year_min_days" :min="1" /></el-form-item>
            <el-form-item label="最长退款周期（工作日）"><el-input-number v-model="exitRules.over_1_year_max_days" :min="1" /></el-form-item>
            <el-divider content-position="left">退款说明</el-divider>
            <el-form-item label="退款范围说明"><el-input v-model="exitRules.refund_scope" type="textarea" :rows="2" /></el-form-item>
            <el-form-item label="退出即撤销身份"><el-switch v-model="exitRules.auto_revoke_identity" /></el-form-item>
          </el-form>
        </el-card>

        <el-card>
          <template #header><span>执行退出</span></template>
          <el-form label-width="120px" style="max-width:500px">
            <el-form-item label="用户ID"><el-input-number v-model="exitForm.userId" :min="1" style="width:200px" /></el-form-item>
            <el-form-item label="退出原因"><el-input v-model="exitForm.reason" type="textarea" :rows="3" /></el-form-item>
            <el-form-item>
              <el-popconfirm title="确认执行合伙人退出？此操作不可撤销！" @confirm="executePartnerExit" confirm-button-type="danger">
                <template #reference><el-button type="danger" :loading="exitLoading" :disabled="!isSuperAdmin">执行退出退款</el-button></template>
              </el-popconfirm>
            </el-form-item>
            <el-form-item v-if="!isSuperAdmin">
              <el-text type="warning" size="small">仅超级管理员可创建和审核合伙人退出流程。</el-text>
            </el-form-item>
          </el-form>
          <el-descriptions v-if="exitResult" title="退款结果" :column="1" border style="margin-top:20px">
            <el-descriptions-item label="货款退款">¥{{ exitResult.walletRefund }}</el-descriptions-item>
            <el-descriptions-item label="佣金余额退款">¥{{ exitResult.balanceRefund }}</el-descriptions-item>
            <el-descriptions-item label="退款总计"><b style="color:#F56C6C;font-size:18px">¥{{ exitResult.refundAmount }}</b></el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-tab-pane>

      <!-- ====== 充值配置 ====== -->
      <el-tab-pane label="充值配置" name="recharge">
        <el-card>
          <template #header><div class="card-header">
            <div>货款充值预设金额与满赠规则</div>
            <el-button type="primary" :loading="saving" @click="save('recharge')">保存</el-button>
          </div></template>
          <el-form label-width="180px" style="max-width:700px">
            <el-divider content-position="left">预设充值金额（6个按钮）</el-divider>
            <el-form-item v-for="(_, idx) in rechargeConfig.preset_amounts" :key="'pa'+idx" :label="'按钮 ' + (idx+1)">
              <el-input-number v-model="rechargeConfig.preset_amounts[idx]" :min="1" :step="100" style="width:180px" />
              <el-button v-if="rechargeConfig.preset_amounts.length > 1" type="danger" text size="small" style="margin-left:8px" @click="rechargeConfig.preset_amounts.splice(idx,1)">删除</el-button>
            </el-form-item>
            <el-form-item label="">
              <el-button size="small" @click="rechargeConfig.preset_amounts.push(1000)" :disabled="rechargeConfig.preset_amounts.length >= 8">+ 添加金额</el-button>
              <span class="form-tip">建议 4~6 个，小程序端按顺序展示</span>
            </el-form-item>

            <el-divider content-position="left">充值满赠</el-divider>
            <el-form-item label="启用满赠"><el-switch v-model="rechargeConfig.bonus_enabled" /></el-form-item>
            <el-table :data="rechargeConfig.bonus_tiers" border style="max-width:500px;margin-bottom:16px" v-if="rechargeConfig.bonus_enabled">
              <el-table-column label="充值满（元）" width="180">
                <template #default="{row}"><el-input-number v-model="row.min" :min="1" :step="100" size="small" style="width:140px" /></template>
              </el-table-column>
              <el-table-column label="赠送（元）" width="180">
                <template #default="{row}"><el-input-number v-model="row.bonus" :min="0" :step="10" size="small" style="width:140px" /></template>
              </el-table-column>
              <el-table-column label="操作" width="80">
                <template #default="{$index}"><el-button type="danger" size="small" text @click="rechargeConfig.bonus_tiers.splice($index,1)">删除</el-button></template>
              </el-table-column>
            </el-table>
            <el-button type="primary" size="small" @click="rechargeConfig.bonus_tiers.push({min:10000,bonus:1000})" v-if="rechargeConfig.bonus_enabled">+ 添加档位</el-button>
            <el-alert title="满赠规则：充值金额 >= 档位最低金额时，自动赠送对应金额到货款余额。匹配最高满足的档位。" type="info" :closable="false" style="margin-top:16px" />
          </el-form>
        </el-card>
      </el-tab-pane>

    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/store/user'
import {
  getUpgradeRules, updateUpgradeRules,
  getCommissionConfig, updateCommissionConfig,
  getPeerBonusConfig, updatePeerBonusConfig,
  getAssistBonusConfig, updateAssistBonusConfig,
  getFundPoolConfig, updateFundPoolConfig,
  getDividendRulesConfig, updateDividendRulesConfig,
  getExitRulesConfig, updateExitRulesConfig,
  getRechargeConfig, updateRechargeConfig,
  getDividendPreview, executeDividend,
  createExitApplication
} from '@/api'

const activeTab = ref('upgrade')
const saving = ref(false)
const userStore = useUserStore()
const isSuperAdmin = computed(() => userStore.isSuperAdmin)
const ROLE_NAMES = { 0: '普通用户', 1: 'C1初级代理', 2: 'C2高级代理', 3: 'B1推广合伙人', 4: 'B2运营合伙人', 5: 'B3区域合伙人' }

async function withLoading(flagRef, task) {
  flagRef.value = true
  try {
    return await task()
  } finally {
    flagRef.value = false
  }
}

const upgradeRules = reactive({ enabled: true, c1_min_purchase: 299, c2_referee_count: 2, c2_min_sales: 580, b1_referee_count: 10, b1_recharge: 3000, b2_referee_count: 10, b2_recharge: 30000, b3_recharge: 198000 })
const commission = reactive({
  enabled: true,
  default_platform_fulfillment: true,
  use_price_gap_middle_commission: false,
  direct_pct_by_role: { 1: 20, 2: 30, 3: 40, 4: 40 },
  indirect_pct_by_role: { 2: 5, 3: 8 },
  tertiary_pct_factor: 50,
  agent_layer_between_pct: 3,
  agent_cost_discount_rate: 0.60,
  cost_split: { enabled: true, direct_sales_pct: 40, operations_pct: 25, mirror_operations_pct: 5, profit_pct: 30 }
})
const peerBonus = reactive({ enabled: true, level_1: 20, level_2: 50, level_3: 100, level_4: 2000, level_5: 5000, product_sets_3: 2, product_sets_4: 15, product_sets_5: 20 })
const assistBonus = reactive({ enabled: true, tiers: [{ max_orders: 30, bonus: 40 }, { max_orders: 50, bonus: 50 }, { max_orders: 100, bonus: 60 }] })
const fundPool = reactive({ enabled: true, b1: { total: 480, mirror_ops_pct: 42, travel_pct: 31, parent_pct: 11, personal_pct: 16 }, b2: { total: 4600, mirror_ops_pct: 42, travel_pct: 31, parent_pct: 11, personal_pct: 16 }, b3: { total: 0, mirror_ops_pct: 42, travel_pct: 31, parent_pct: 11, personal_pct: 16 } })
const dividendRules = reactive({ enabled: true, min_months: 2, source_pct: 3, b_team_award: { enabled: true, pool_pct: 2, ranks: [{ rank: 1, count: 1, pct: 1.0, label: '冠军' }, { rank: 2, count: 2, pct: 0.6, label: '亚军' }, { rank: 3, count: 3, pct: 0.4, label: '季军' }] }, b1_personal_award: { enabled: true, pool_pct: 1, ranks: [{ rank: 1, count: 1, pct: 0.5, label: '冠军' }, { rank: 2, count: 2, pct: 0.3, label: '亚军' }, { rank: 3, count: 3, pct: 0.2, label: '季军' }] } })
const exitRules = reactive({ enabled: true, under_1_year_min_days: 60, under_1_year_max_days: 90, over_1_year_min_days: 45, over_1_year_max_days: 60, refund_scope: '仅退本人后台账户余额（货款余额+佣金余额），不含利息及其他费用', auto_revoke_identity: true })
const rechargeConfig = reactive({ preset_amounts: [100, 300, 500, 1000, 2000, 5000], bonus_enabled: false, bonus_tiers: [{ min: 1000, bonus: 50 }, { min: 3000, bonus: 200 }, { min: 5000, bonus: 500 }] })

/** 仅表单辅助：一键把 C1～B2 直推比例设为同一数值（不单独落库） */
const unifiedDirectPct = ref(20)
function applyUnifiedDirectPct () {
  const v = Math.max(0, Math.min(100, Number(unifiedDirectPct.value) || 0))
  commission.direct_pct_by_role[1] = v
  commission.direct_pct_by_role[2] = v
  commission.direct_pct_by_role[3] = v
  commission.direct_pct_by_role[4] = v
  ElMessage.success('已同步四级直推比例')
}

/** —— 佣金 Tab：分层预览（与 CommissionService 实付比例分支公式一致，不含可分佣池封顶） */
const previewPaid = ref(399)
const previewCostBase = ref(100)
const previewChain = reactive({ parentRole: 1, gpRole: 2, ggpRole: 3 })
const commissionCollapse = ref([])

const previewParentRoleOptions = [
  { v: 1, l: 'Lv1 · C1 初级代理' },
  { v: 2, l: 'Lv2 · C2 高级代理' },
  { v: 3, l: 'Lv3 · B1 推广合伙人' },
  { v: 4, l: 'Lv4 · B2 运营合伙人' }
]
const previewIndirectRoleOptions = [
  { v: 0, l: '无（不计算）' },
  { v: 2, l: 'Lv2 · C2' },
  { v: 3, l: 'Lv3 · B1' }
]

function clampPctMap (map, role) {
  const n = Number(map?.[role])
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

const middlePreview = computed(() => {
  const paid = Math.max(0, Number(previewPaid.value) || 0)
  if (commission.use_price_gap_middle_commission || paid <= 0) {
    return { rows: [], totalMiddle: 0, paid: 0, rest: 0 }
  }
  const d = commission.direct_pct_by_role
  const ind = commission.indirect_pct_by_role
  const tf = Math.max(0, Math.min(100, Number(commission.tertiary_pct_factor ?? 50))) / 100
  const rows = []
  let total = 0

  if (previewChain.parentRole >= 1 && previewChain.parentRole <= 4) {
    const pct = clampPctMap(d, previewChain.parentRole)
    const amt = Math.round(paid * (pct / 100) * 100) / 100
    rows.push({
      key: 'd',
      layer: '直推',
      roleLabel: ROLE_NAMES[previewChain.parentRole] || `Lv${previewChain.parentRole}`,
      rateLabel: `${pct}%`,
      amount: amt
    })
    total += amt
  }
  if (previewChain.gpRole >= 1) {
    const pct = clampPctMap(ind, previewChain.gpRole)
    const amt = Math.round(paid * (pct / 100) * 100) / 100
    rows.push({
      key: 'g',
      layer: '二级',
      roleLabel: ROLE_NAMES[previewChain.gpRole] || `Lv${previewChain.gpRole}`,
      rateLabel: `${pct}%`,
      amount: amt
    })
    total += amt
  }
  if (previewChain.ggpRole >= 1) {
    const basePct = clampPctMap(ind, previewChain.ggpRole)
    const effectivePct = basePct * tf
    const amt = Math.round(paid * (effectivePct / 100) * 100) / 100
    rows.push({
      key: 't',
      layer: '三级',
      roleLabel: ROLE_NAMES[previewChain.ggpRole] || `Lv${previewChain.ggpRole}`,
      rateLabel: `${effectivePct.toFixed(2)}%（${basePct}%×${(tf * 100).toFixed(0)}%）`,
      amount: amt
    })
    total += amt
  }

  total = Math.round(total * 100) / 100
  const rest = Math.max(0, Math.round((paid - total) * 100) / 100)
  return { rows, totalMiddle: total, paid, rest }
})

const previewBarSegments = computed(() => {
  const { rows, paid, rest } = middlePreview.value
  if (paid <= 0) return []
  const colors = { d: '#409eff', g: '#67c23a', t: '#e6a23c' }
  const segs = rows.map((r) => ({
    key: r.key,
    flex: r.amount / paid,
    pctLabel: `${((r.amount / paid) * 100).toFixed(1)}%`,
    color: colors[r.key] || '#409eff',
    tip: `${r.layer} ¥${r.amount.toFixed(2)}（占实付 ${((r.amount / paid) * 100).toFixed(2)}%）`
  }))
  if (rest > 0.001) {
    segs.push({
      key: 'rest',
      flex: rest / paid,
      pctLabel: `${((rest / paid) * 100).toFixed(1)}%`,
      color: '#e4e7ed',
      tip: `其余 ¥${rest.toFixed(2)}（非本表中间佣金；含成本、平台留存等示意）`
    })
  }
  return segs
})

const previewAgentCost = computed(() => {
  const base = Math.max(0, Number(previewCostBase.value) || 0)
  const rate = Math.max(0.1, Math.min(1, Number(commission.agent_cost_discount_rate) || 0.6))
  return Math.round(base * rate * 100) / 100
})

const costSplitBarSegments = computed(() => {
  const cs = commission.cost_split
  if (!cs?.enabled) return []
  const items = [
    { key: 'ds', short: '直销', pct: Number(cs.direct_sales_pct) || 0, color: '#95d475' },
    { key: 'op', short: '运营', pct: Number(cs.operations_pct) || 0, color: '#b3e19d' },
    { key: 'mo', short: '镜像', pct: Number(cs.mirror_operations_pct) || 0, color: '#f3d19e' },
    { key: 'pf', short: '利润', pct: Number(cs.profit_pct) || 0, color: '#f89898' }
  ]
  const sum = items.reduce((s, i) => s + i.pct, 0) || 1
  return items.map((i) => ({
    ...i,
    flex: i.pct / sum,
    tip: `${i.short} 配置 ${i.pct}%（占四维合计 ${sum}% 中的权重）`
  }))
})

const costSplitSumPct = computed(() => {
  const cs = commission.cost_split
  if (!cs) return 0
  return (Number(cs.direct_sales_pct) || 0) + (Number(cs.operations_pct) || 0) +
    (Number(cs.mirror_operations_pct) || 0) + (Number(cs.profit_pct) || 0)
})

const dividendYear = ref(String(new Date().getFullYear() - 1))
const dividendPool = ref(0)
const dividendLoading = ref(false)
const dividendExecuting = ref(false)
const dividendPreviewData = ref([])
const exitForm = reactive({ userId: null, reason: '' })
const exitLoading = ref(false)
const exitResult = ref(null)

const configMap = {
  upgrade: { state: upgradeRules, get: getUpgradeRules, put: updateUpgradeRules },
  commission: { state: commission, get: getCommissionConfig, put: updateCommissionConfig },
  peer: { state: peerBonus, get: getPeerBonusConfig, put: updatePeerBonusConfig },
  assist: { state: assistBonus, get: getAssistBonusConfig, put: updateAssistBonusConfig },
  fund: { state: fundPool, get: getFundPoolConfig, put: updateFundPoolConfig },
  dividendRules: { state: dividendRules, get: getDividendRulesConfig, put: updateDividendRulesConfig },
  exitRules: { state: exitRules, get: getExitRulesConfig, put: updateExitRulesConfig },
  recharge: { state: rechargeConfig, get: getRechargeConfig, put: updateRechargeConfig }
}

function deepAssign(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && target[key] && typeof target[key] === 'object') {
      deepAssign(target[key], source[key])
    } else if (source[key] !== undefined) {
      target[key] = source[key]
    }
  }
}

const loadAll = async () => {
  const results = await Promise.allSettled(Object.values(configMap).map(c => c.get()))
  const keys = Object.keys(configMap)
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) {
      const payload = r.value.data ?? r.value
      if (payload && typeof payload === 'object') {
        deepAssign(configMap[keys[i]].state, payload)
      }
    }
  })
}

const save = async (key) => {
  await withLoading(saving, async () => {
    const c = configMap[key]
    await c.put(JSON.parse(JSON.stringify(c.state)))
    ElMessage.success('保存成功')
  }).catch(() => { ElMessage.error('保存失败') })
}

const previewDividend = async () => {
  if (!dividendYear.value || dividendPool.value <= 0) return ElMessage.warning('请选择年份并填写金额')
  await withLoading(dividendLoading, async () => {
    const res = await getDividendPreview({ year: dividendYear.value, pool: dividendPool.value })
    const data = res?.data || res
    dividendPreviewData.value = Array.isArray(data) ? data : (data?.list || [])
    if (!dividendPreviewData.value.length) ElMessage.info('暂无符合条件的合伙人')
  }).catch(() => { ElMessage.error('预览失败') })
}

const confirmExecuteDividend = async () => {
  if (!isSuperAdmin.value) return ElMessage.warning('仅超级管理员可执行实际分红发放')
  try {
    await ElMessageBox.confirm(`确认发放 ${dividendYear.value} 年度分红 ¥${dividendPool.value}？`, '确认', { type: 'warning' })
    await withLoading(dividendExecuting, async () => {
      const res = await executeDividend({ year: Number(dividendYear.value), pool: dividendPool.value })
      ElMessage.success(`已发放 ¥${res?.totalDistributed ?? res?.data?.totalDistributed ?? 0}`)
      dividendPreviewData.value = []
    })
  } catch (_) {}
}

const executePartnerExit = async () => {
  if (!isSuperAdmin.value) return ElMessage.warning('仅超级管理员可创建退出退款流程')
  if (!exitForm.userId) return ElMessage.warning('请输入用户ID')
  exitResult.value = null
  await withLoading(exitLoading, async () => {
    const res = await createExitApplication(exitForm.userId, { reason: exitForm.reason })
    exitResult.value = res?.data || res
    ElMessage.success('退出申请已创建，请在列表中进行审核和打款确认')
  }).catch((e) => { ElMessage.error(e?.message || '执行失败') })
}

onMounted(loadAll)
</script>

<style scoped>
.agent-system-page { padding: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.form-tip { margin-left: 12px; font-size: 12px; color: #909399; }

.commission-collapse { margin-bottom: 12px; }
.collapse-p { margin: 0 0 8px; font-size: 12px; color: #606266; line-height: 1.5; }
.commission-layout { margin-top: 8px; }
.commission-form { max-width: 100%; margin-top: 0; }
.commission-legend {
  margin: 0;
  padding-left: 1.2em;
  font-size: 12px;
  color: #606266;
  line-height: 1.65;
}
.commission-legend li { margin-bottom: 6px; }
.commission-legend code,
.form-tip-block code {
  font-size: 11px;
  padding: 0 4px;
  background: #f0f2f5;
  border-radius: 3px;
}
.section-micro {
  margin: -6px 0 12px 240px;
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
  max-width: 520px;
}
@media (max-width: 1200px) {
  .section-micro { margin-left: 0; }
}
.page-note { margin-bottom: 14px; }
.key-ref-collapse { margin-top: 16px; }
.key-ref-list { margin: 0; padding-left: 1.2em; font-size: 12px; color: #606266; line-height: 1.6; }

.preview-card { position: sticky; top: 16px; }
.preview-header-sub { margin-left: 8px; vertical-align: middle; }
.preview-form :deep(.el-form-item) { margin-bottom: 10px; }
.preview-bar-caption {
  font-size: 12px;
  color: #909399;
  margin: 10px 0 6px;
}
.preview-bar {
  display: flex;
  height: 32px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #ebeef5;
}
.preview-bar--split { height: 36px; }
.preview-bar-seg {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  min-width: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 2px;
}
.preview-table { margin-top: 12px; width: 100%; }
.preview-footnote {
  margin: 10px 0 0;
  font-size: 12px;
  color: #909399;
  line-height: 1.55;
}
.form-tip-block {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
  line-height: 1.65;
  max-width: 560px;
}
.unit-suffix {
  margin-left: 8px;
  font-size: 13px;
  color: #606266;
  font-weight: 500;
}
.label-tag {
  display: inline-block;
  margin-right: 6px;
  padding: 0 6px;
  font-size: 11px;
  color: #409eff;
  background: #ecf5ff;
  border-radius: 3px;
  vertical-align: middle;
}
.warn-text { color: #e6a23c; }
</style>
