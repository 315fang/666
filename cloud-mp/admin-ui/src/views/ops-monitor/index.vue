<template>
  <div class="ops-page">
    <div class="ops-header">
      <h2 class="ops-title">运维监控</h2>
      <div class="ops-actions">
        <el-tag :type="overallTagType" size="large" effect="dark">
          {{ overallStatusText }}
        </el-tag>
        <el-button :icon="Refresh" @click="refreshAll" :loading="refreshing" size="small">
          刷新
        </el-button>
        <span class="last-update">最近成功：{{ lastSuccessAt ? fmtTime(lastSuccessAt) : '—' }}</span>
        <span class="last-update">最近探测：{{ lastAttemptAt ? fmtTime(lastAttemptAt) : '—' }}</span>
        <span v-if="refreshError" class="last-update last-update--warn">{{ refreshError }}</span>
      </div>
    </div>

    <!-- ═══ 第一行：核心指标卡片 ═══ -->
    <el-row :gutter="16" class="stat-row">
      <!-- DB 延迟 -->
      <el-col :xs="12" :sm="6">
        <div class="stat-card" :class="dbOk ? 'ok' : 'err'">
          <div class="stat-icon">
            <el-icon size="24"><DataLine /></el-icon>
          </div>
          <div class="stat-body">
            <div class="stat-label">数据库</div>
            <div class="stat-value">
              <template v-if="dbOk">{{ sysStatus.services?.database?.latency_ms ?? '--' }} ms</template>
              <template v-else>连接异常</template>
            </div>
          </div>
        </div>
      </el-col>

      <!-- 堆内存 -->
      <el-col :xs="12" :sm="6">
        <div class="stat-card" :class="heapPercent > 85 ? 'warn' : 'ok'">
          <div class="stat-icon">
            <el-icon size="24"><Cpu /></el-icon>
          </div>
          <div class="stat-body">
            <div class="stat-label">堆内存使用率</div>
            <div class="stat-value">{{ heapPercent }}%</div>
            <el-progress
              :percentage="heapPercent"
              :status="heapPercent > 85 ? 'exception' : heapPercent > 70 ? 'warning' : ''"
              :show-text="false"
              :stroke-width="4"
              style="margin-top:4px"
            />
          </div>
        </div>
      </el-col>

      <!-- 运行时长 -->
      <el-col :xs="12" :sm="6">
        <div class="stat-card ok">
          <div class="stat-icon">
            <el-icon size="24"><Timer /></el-icon>
          </div>
          <div class="stat-body">
            <div class="stat-label">进程运行时长</div>
            <div class="stat-value">{{ sysStatus.process?.uptime_human ?? '--' }}</div>
          </div>
        </div>
      </el-col>

      <!-- 系统可用内存 -->
      <el-col :xs="12" :sm="6">
        <div class="stat-card" :class="freeMemPct < 10 ? 'warn' : 'ok'">
          <div class="stat-icon">
            <el-icon size="24"><Monitor /></el-icon>
          </div>
          <div class="stat-body">
            <div class="stat-label">实例可用内存</div>
            <div class="stat-value">{{ sysStatus.os?.free_mem_mb ?? '--' }} MB</div>
            <div class="stat-sub">共 {{ sysStatus.os?.total_mem_mb ?? '--' }} MB</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- ═══ 第一行补充：存储健康卡片 ═══ -->
    <el-row :gutter="16" style="margin-top:12px">
      <el-col :xs="24" :sm="12" :md="8">
        <div class="stat-card" :class="storageCardClass" style="height:auto;min-height:90px">
          <div class="stat-icon">
            <el-icon size="24"><FolderOpened /></el-icon>
          </div>
          <div class="stat-body">
            <div class="stat-label">对象存储</div>
            <div class="stat-value" style="font-size:16px">
              <el-tag
                :type="storageStatus === 'ok' ? 'success' : storageStatus === 'checking' ? 'info' : 'danger'"
                size="small"
                effect="dark"
                style="margin-right:6px"
              >
                {{ storageStatus === 'ok' ? '连通正常' : storageStatus === 'checking' ? '检测中…' : '连接失败' }}
              </el-tag>
              <span v-if="storageLatency !== null" style="font-size:13px;color:#606266">
                {{ storageLatency }} ms
              </span>
            </div>
            <div class="stat-sub">
              服务商：{{ storageProvider || '--' }}
              <el-button
                text
                size="small"
                style="margin-left:8px;padding:0"
                :loading="storageChecking"
                @click="checkStorage"
              >重新检测</el-button>
            </div>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8">
        <div class="stat-card" :class="cacheCardClass" style="height:auto;min-height:90px">
          <div class="stat-icon">
            <el-icon size="24"><Refresh /></el-icon>
          </div>
          <div class="stat-body">
            <div class="stat-label">缓存健康</div>
            <div class="stat-value" style="font-size:16px">
              <el-tag
                :type="cacheDirtyCount > 0 || cachePendingFlushCount > 0 ? 'warning' : 'success'"
                size="small"
                effect="dark"
                style="margin-right:6px"
              >
                {{ cacheDirtyCount > 0 || cachePendingFlushCount > 0 ? '有待同步' : '缓存稳定' }}
              </el-tag>
              <span style="font-size:13px;color:#606266">
                {{ cacheHealth.mode || '--' }}
              </span>
            </div>
            <div class="stat-sub">
              已缓存 {{ cacheHealth.cached_collections ?? 0 }} 集合
              <span style="margin-left:8px">脏集合 {{ cacheDirtyCount }}</span>
              <span style="margin-left:8px">待 flush {{ cachePendingFlushCount }}</span>
              <el-button
                text
                size="small"
                style="margin-left:8px;padding:0"
                :loading="cacheRefreshing"
                @click="refreshCacheStatus"
              >刷新缓存状态</el-button>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- ═══ 第二行：左：定时任务 / 右：业务异常速览 ═══ -->
    <el-row :gutter="16" style="margin-top:16px">
      <!-- 定时任务 -->
      <el-col :xs="24" :md="14">
        <el-card shadow="never">
          <template #header>
            <div class="card-hd">
              <el-icon><Clock /></el-icon>
              <span>定时任务状态</span>
            </div>
          </template>
          <el-table :data="cronTasks" size="small" v-loading="loadingCron">
            <el-table-column label="任务名称" prop="label" min-width="140" />
            <el-table-column label="间隔" prop="interval" width="90" />
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag
                  :type="cronStatusTagType(row.runtime_status || row.status)"
                  size="small"
                >
                  {{ cronStatusText(row.runtime_status || row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="执行 / 错误" width="90">
              <template #default="{ row }">
                <span>{{ row.run_count }}</span>
                <span v-if="row.error_count > 0" style="color:#f56c6c;margin-left:4px">
                  / {{ row.error_count }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="最近运行" min-width="130">
              <template #default="{ row }">
                <span class="time-text">{{ row.last_run_at ? fmtTime(row.last_run_at) : '尚未触发' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="最近错误" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">
                <span v-if="row.last_error" style="color:#f56c6c;font-size:12px">{{ row.last_error }}</span>
                <span v-else style="color:#909399;font-size:12px">—</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <!-- 业务异常速览 -->
      <el-col :xs="24" :md="10">
        <el-card shadow="never" style="height:100%">
          <template #header>
            <div class="card-hd">
              <el-icon><Warning /></el-icon>
              <span>业务异常速览</span>
              <el-tag
                :type="anomalyStatus === 'normal' ? 'success' : 'warning'"
                size="small"
                style="margin-left:8px"
              >
                {{ anomalyStatus === 'normal' ? '全部正常' : '有待关注' }}
              </el-tag>
            </div>
          </template>

          <div v-if="anomalyIssues.length === 0" class="empty-tip">
            <el-icon size="32" color="#67c23a"><CircleCheck /></el-icon>
            <p>暂无异常</p>
          </div>
          <ul v-else class="issue-list">
            <li v-for="(issue, i) in anomalyIssues" :key="i" class="issue-item">{{ issue }}</li>
          </ul>

          <el-divider style="margin:12px 0" />

          <el-descriptions :column="1" size="small">
            <el-descriptions-item label="超时未支付订单">
              {{ anomalyStats.long_pending_orders ?? '--' }} 单
            </el-descriptions-item>
            <el-descriptions-item label="近1h支付成功率">
              {{ anomalyStats.recent_pay_rate_percent ?? '--' }}%
              ({{ anomalyStats.recent_payments ?? '--' }} 笔)
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>

    <!-- ═══ 第三行：进程详情 + 近期错误日志 ═══ -->
    <el-row :gutter="16" style="margin-top:16px">
      <!-- 进程详情 -->
      <el-col :xs="24" :md="8">
        <el-card shadow="never">
          <template #header>
            <div class="card-hd">
              <el-icon><Cpu /></el-icon>
              <span>进程详情</span>
            </div>
          </template>
          <el-descriptions :column="1" size="small">
            <el-descriptions-item label="Node 版本">{{ sysStatus.process?.node_version }}</el-descriptions-item>
            <el-descriptions-item label="PID">{{ sysStatus.process?.pid }}</el-descriptions-item>
            <el-descriptions-item label="RSS 内存">{{ sysStatus.memory?.rss_mb }} MB</el-descriptions-item>
            <el-descriptions-item label="堆已用">
              {{ sysStatus.memory?.heap_used_mb }} / {{ sysStatus.memory?.heap_total_mb }} MB
            </el-descriptions-item>
            <el-descriptions-item label="OS 平台">{{ sysStatus.os?.platform }}</el-descriptions-item>
            <el-descriptions-item label="系统负载 (1/5/15m)">
              {{ sysStatus.os?.load_avg?.join(' / ') }}
            </el-descriptions-item>
            <el-descriptions-item label="缓存最近加载">{{ cacheHealth.loaded_at ? fmtTime(cacheHealth.loaded_at) : '—' }}</el-descriptions-item>
            <el-descriptions-item label="缓存最近刷新">{{ cacheHealth.last_reload_at ? fmtTime(cacheHealth.last_reload_at) : '—' }}</el-descriptions-item>
            <el-descriptions-item label="缓存最近错误">
              <span v-if="cacheHealth.last_error" style="color:#f56c6c">{{ cacheHealth.last_error }}</span>
              <span v-else>—</span>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>

      <!-- 近期错误日志 -->
      <el-col :xs="24" :md="16">
        <el-card shadow="never">
          <template #header>
            <div class="card-hd">
              <el-icon><Document /></el-icon>
              <span>近期错误日志（最新 {{ logLines.length }} 条）</span>
              <el-button text size="small" @click="fetchLogs" style="margin-left:auto">重新加载</el-button>
            </div>
          </template>
          <div class="log-box" v-loading="loadingLog">
            <div v-if="logNote" class="log-note">{{ logNote }}</div>
            <div v-for="(line, i) in logLines" :key="i" class="log-line">{{ line }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ═══ 第四行：审查与排障工作台 ═══ -->
    <el-row :gutter="16" style="margin-top:16px">
      <el-col :xs="24" :md="8">
        <el-card shadow="never">
          <template #header>
            <div class="card-hd">
              <el-icon><Document /></el-icon>
              <span>订单链路审查</span>
            </div>
          </template>
          <el-input v-model="orderAuditLookup" placeholder="输入订单ID或订单号" clearable @keyup.enter="loadOrderAudit" />
          <div style="margin-top:10px">
            <el-button size="small" type="primary" :loading="orderAuditLoading" @click="loadOrderAudit">查询订单链路</el-button>
          </div>
          <div class="audit-box" v-loading="orderAuditLoading">
            <pre v-if="orderAuditData">{{ formatJson(orderAuditData) }}</pre>
            <div v-else class="audit-empty">输入订单号后可查看订单 / 退款 / 佣金 / 钱包流水 / 审计日志链路。</div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="8">
        <el-card shadow="never">
          <template #header>
            <div class="card-hd">
              <el-icon><Cpu /></el-icon>
              <span>用户资金链路</span>
            </div>
          </template>
          <el-input v-model="userAuditLookup" placeholder="输入用户ID / OPENID / 会员码" clearable @keyup.enter="loadUserAudit" />
          <div style="margin-top:10px">
            <el-button size="small" type="primary" :loading="userAuditLoading" @click="loadUserAudit">查询用户链路</el-button>
          </div>
          <div class="audit-box" v-loading="userAuditLoading">
            <pre v-if="userAuditData">{{ formatJson(userAuditData) }}</pre>
            <div v-else class="audit-empty">输入用户标识后可查看用户、订单、佣金、提现、货款和余额流水链路。</div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="8">
        <el-card shadow="never">
          <template #header>
            <div class="card-hd">
              <el-icon><Warning /></el-icon>
              <span>配置来源审查</span>
            </div>
          </template>
          <el-input v-model="configAuditKey" placeholder="输入配置key，如 mini_program_config" clearable @keyup.enter="loadConfigAudit" />
          <div style="margin-top:10px">
            <el-button size="small" type="primary" :loading="configAuditLoading" @click="loadConfigAudit">查询配置来源</el-button>
          </div>
          <div class="audit-box" v-loading="configAuditLoading">
            <pre v-if="configAuditData">{{ formatJson(configAuditData) }}</pre>
            <div v-else class="audit-empty">输入配置key后可查看 singleton / configs / app_configs 的来源与当前生效值。</div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  Refresh, DataLine, Cpu, Timer, Monitor, Clock, Warning,
  CircleCheck, Document, FolderOpened
} from '@element-plus/icons-vue'
import {
  getSystemStatus,
  getDebugAnomalies,
  getCronStatus,
  getDebugLogs,
  getDebugOrderChain,
  getDebugUserChain,
  getDebugConfigSource,
  getStorageConfig,
  testStorageConfig
} from '@/api'
import dayjs from 'dayjs'

// ── 状态 ──────────────────────────────────────────────
const refreshing   = ref(false)
const loadingCron  = ref(false)
const loadingLog   = ref(false)
const lastUpdateTime = ref('—')
const lastSuccessAt = ref('')
const lastAttemptAt = ref('')
const refreshState = ref('fresh')
const refreshError = ref('')

const sysStatus   = ref({})
const cronTasks   = ref([])
const anomalyStatus = ref('normal')
const anomalyIssues = ref([])
const anomalyStats  = ref({})
const logLines    = ref([])
const logNote     = ref('')
const orderAuditLookup = ref('')
const orderAuditLoading = ref(false)
const orderAuditData = ref(null)
const userAuditLookup = ref('')
const userAuditLoading = ref(false)
const userAuditData = ref(null)
const configAuditKey = ref('')
const configAuditLoading = ref(false)
const configAuditData = ref(null)

// ── 存储健康 ──────────────────────────────────────────
const storageStatus   = ref('checking')   // 'checking' | 'ok' | 'error'
const storageLatency  = ref(null)
const storageProvider = ref('')
const storageChecking = ref(false)
const cacheRefreshing = ref(false)

const storageCardClass = computed(() => {
  if (storageStatus.value === 'ok')       return 'ok'
  if (storageStatus.value === 'checking') return 'ok'
  return 'err'
})
const cacheHealth = computed(() => sysStatus.value.cache_health || {})
const cacheDirtyCount = computed(() => (cacheHealth.value.dirty_collections || []).length)
const cachePendingFlushCount = computed(() => (cacheHealth.value.pending_flush_collections || []).length)
const cacheCardClass = computed(() => {
  if (cacheDirtyCount.value > 0 || cachePendingFlushCount.value > 0) return 'warn'
  return 'ok'
})

const checkStorage = async () => {
  storageChecking.value = true
  storageStatus.value = 'checking'
  storageLatency.value = null
  try {
    // 获取 provider
    const cfgRes = await getStorageConfig({ skipErrorMessage: true })
    const cfgData = cfgRes.data || cfgRes
    storageProvider.value = cfgData.provider || cfgData.STORAGE_PROVIDER || '--'

    const t0 = Date.now()
    const testRes = await testStorageConfig(undefined, { skipErrorMessage: true })
    const elapsed = Date.now() - t0
    const testData = testRes.data || testRes
    if (testData?.url || testData?.provider || testData?.success || testData?.connected) {
      storageStatus.value  = 'ok'
      storageLatency.value = elapsed
      return true
    } else {
      storageStatus.value = 'error'
      return false
    }
  } catch {
    storageStatus.value = 'error'
    return false
  } finally {
    storageChecking.value = false
  }
}

// ── 计算属性 ──────────────────────────────────────────
const overallStatus = computed(() =>
  refreshState.value === 'failed'
    ? 'failed'
    : (refreshState.value === 'stale'
      ? 'stale'
      : (sysStatus.value.status === 'online' ? 'online' : 'degraded'))
)
const overallStatusText = computed(() => ({
  online: '系统正常',
  degraded: '系统异常',
  stale: '数据过期',
  failed: '探测失败'
}[overallStatus.value] || '系统异常'))
const overallTagType = computed(() => ({
  online: 'success',
  degraded: 'danger',
  stale: 'warning',
  failed: 'danger'
}[overallStatus.value] || 'danger'))
const dbOk = computed(() =>
  sysStatus.value.services?.database?.status === 'ok'
)
const heapPercent = computed(() =>
  sysStatus.value.memory?.heap_percent ?? 0
)
const freeMemPct = computed(() => {
  const { free_mem_mb, total_mem_mb } = sysStatus.value.os || {}
  if (!free_mem_mb || !total_mem_mb) return 100
  return Math.round(free_mem_mb / total_mem_mb * 100)
})

// ── 数据获取 ──────────────────────────────────────────
const fetchStatus = async () => {
  try {
    const res = await getSystemStatus({ skipErrorMessage: true })
    sysStatus.value = res.data ?? res
    return true
  } catch {
    return false
  }
}

const refreshCacheStatus = async () => {
  cacheRefreshing.value = true
  try {
    const ok = await fetchStatus()
    if (ok) {
      const now = new Date().toISOString()
      lastSuccessAt.value = now
      lastUpdateTime.value = dayjs(now).format('HH:mm:ss')
      refreshState.value = 'fresh'
      refreshError.value = ''
    } else {
      refreshState.value = 'stale'
      refreshError.value = '缓存状态刷新失败，保留上次成功结果'
    }
  } finally {
    cacheRefreshing.value = false
  }
}

const fetchCron = async () => {
  loadingCron.value = true
  try {
    const res = await getCronStatus({ skipErrorMessage: true })
    const payload = res?.data ?? res ?? {}
    cronTasks.value = payload.tasks ?? payload.jobs ?? payload.data?.tasks ?? payload.data?.jobs ?? cronTasks.value
    return true
  } catch {
    return false
  } finally {
    loadingCron.value = false
  }
}

const fetchAnomalies = async () => {
  try {
    const res = await getDebugAnomalies({ skipErrorMessage: true })
    const d = res.data ?? res
    anomalyStatus.value  = d.status   ?? 'normal'
    anomalyIssues.value  = d.issues   ?? []
    anomalyStats.value   = d.stats    ?? {}
    return true
  } catch {
    return false
  }
}

const fetchLogs = async () => {
  loadingLog.value = true
  try {
    const res = await getDebugLogs(80, { skipErrorMessage: true })
    const d = res.data ?? res
    logLines.value = d.lines ?? []
    logNote.value  = d.note  ?? ''
    return true
  } catch {
    return false
  } finally {
    loadingLog.value = false
  }
}

const loadOrderAudit = async () => {
  if (!orderAuditLookup.value.trim()) return
  orderAuditLoading.value = true
  try {
    orderAuditData.value = await getDebugOrderChain({ id: orderAuditLookup.value.trim(), order_no: orderAuditLookup.value.trim() })
  } catch (e) {
    orderAuditData.value = { error: e?.message || '查询失败' }
  } finally {
    orderAuditLoading.value = false
  }
}

const loadUserAudit = async () => {
  if (!userAuditLookup.value.trim()) return
  userAuditLoading.value = true
  try {
    userAuditData.value = await getDebugUserChain({ id: userAuditLookup.value.trim(), member_no: userAuditLookup.value.trim(), openid: userAuditLookup.value.trim() })
  } catch (e) {
    userAuditData.value = { error: e?.message || '查询失败' }
  } finally {
    userAuditLoading.value = false
  }
}

const loadConfigAudit = async () => {
  if (!configAuditKey.value.trim()) return
  configAuditLoading.value = true
  try {
    configAuditData.value = await getDebugConfigSource({ key: configAuditKey.value.trim() })
  } catch (e) {
    configAuditData.value = { error: e?.message || '查询失败' }
  } finally {
    configAuditLoading.value = false
  }
}

const refreshAll = async () => {
  refreshing.value = true
  const attemptAt = new Date().toISOString()
  lastAttemptAt.value = attemptAt
  const results = await Promise.all([fetchStatus(), fetchCron(), fetchAnomalies(), fetchLogs(), checkStorage()])
  const successCount = results.filter(Boolean).length
  if (successCount === results.length) {
    refreshState.value = 'fresh'
    refreshError.value = ''
    lastSuccessAt.value = attemptAt
    lastUpdateTime.value = dayjs(attemptAt).format('HH:mm:ss')
  } else if (successCount > 0) {
    refreshState.value = 'stale'
    refreshError.value = '部分探测失败，当前页面保留最近一次成功结果'
  } else {
    refreshState.value = 'failed'
    refreshError.value = '本次探测全部失败，当前页面数据可能已过期'
  }
  refreshing.value = false
}

// ── 工具 ──────────────────────────────────────────────
const fmtTime = (iso) => {
  if (!iso) return '—'
  return dayjs(iso).format('MM-DD HH:mm:ss')
}
const formatJson = (value) => JSON.stringify(value, null, 2)
const cronStatusText = (status) => ({
  ok: '正常',
  pending: '待触发',
  unknown: '待确认',
  stale: '数据过期',
  error: '异常'
}[status] || '异常')
const cronStatusTagType = (status) => ({
  ok: 'success',
  pending: 'info',
  unknown: 'warning',
  stale: 'warning',
  error: 'danger'
}[status] || 'danger')

// ── 生命周期：首次加载 + 30s 自动刷新 ────────────────
let timer = null
onMounted(() => {
  refreshAll()
  timer = setInterval(refreshAll, 30 * 1000)
})
onUnmounted(() => clearInterval(timer))
</script>

<style scoped>
.ops-page {
  padding: 4px 0;
}

.ops-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 10px;
}

.ops-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0;
}

.ops-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.last-update {
  font-size: 12px;
  color: #909399;
}

.last-update--warn {
  color: #d97706;
}

/* ── 核心指标卡片 ── */
.stat-row { margin-bottom: 0; }

.stat-card {
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
  padding: 16px;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  height: 90px;
  box-sizing: border-box;
  transition: box-shadow .2s;
}

.stat-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,.08); }
.stat-card.ok    { border-left: 3px solid #67c23a; }
.stat-card.warn  { border-left: 3px solid #e6a23c; }
.stat-card.err   { border-left: 3px solid #f56c6c; }

.stat-icon {
  padding-top: 2px;
  color: #909399;
}

.stat-body { flex: 1; min-width: 0; }

.stat-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: #303133;
  line-height: 1.2;
}

.stat-sub {
  font-size: 11px;
  color: #c0c4cc;
  margin-top: 2px;
}

/* ── 卡片头部 ── */
.card-hd {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 14px;
}

/* ── 业务异常 ── */
.empty-tip {
  text-align: center;
  padding: 16px 0 8px;
  color: #909399;
  font-size: 13px;
}

.issue-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.issue-item {
  padding: 6px 0;
  border-bottom: 1px dashed #eee;
  font-size: 13px;
  color: #e6a23c;
}

/* ── 日志面板 ── */
.log-box {
  background: #1e1e2e;
  border-radius: 6px;
  padding: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
  line-height: 1.6;
  max-height: 280px;
  overflow-y: auto;
  color: #cdd6f4;
}

.log-line {
  padding: 1px 0;
  word-break: break-all;
  border-bottom: 1px solid rgba(255,255,255,.04);
}

.log-note {
  color: #94a3b8;
  font-style: italic;
  margin-bottom: 8px;
}

.time-text {
  font-size: 12px;
  color: #606266;
}

.audit-box {
  margin-top: 12px;
  min-height: 220px;
  max-height: 360px;
  overflow: auto;
  border-radius: 6px;
  background: #0f172a;
  color: #cbd5e1;
  padding: 12px;
  font-size: 12px;
  line-height: 1.6;
}

.audit-box pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.audit-empty {
  color: #94a3b8;
}
</style>
