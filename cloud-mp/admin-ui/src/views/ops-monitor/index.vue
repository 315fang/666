<template>
  <div class="ops-page">
    <div class="ops-header">
      <h2 class="ops-title">运维监控</h2>
      <div class="ops-actions">
        <el-tag :type="overallStatus === 'online' ? 'success' : 'danger'" size="large" effect="dark">
          {{ overallStatus === 'online' ? '系统正常' : '系统异常' }}
        </el-tag>
        <el-button :icon="Refresh" @click="refreshAll" :loading="refreshing" size="small">
          刷新
        </el-button>
        <span class="last-update">上次更新：{{ lastUpdateTime }}</span>
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
            <div class="stat-label">服务器可用内存</div>
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
                  :type="row.status === 'ok' ? 'success' : row.status === 'pending' ? 'info' : 'danger'"
                  size="small"
                >
                  {{ row.status === 'ok' ? '正常' : row.status === 'pending' ? '待触发' : '异常' }}
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
  getDebugProcess,
  getDebugAnomalies,
  getDebugDbPing,
  getCronStatus,
  getDebugLogs,
  getStorageConfig,
  testStorageConfig
} from '@/api'
import dayjs from 'dayjs'

// ── 状态 ──────────────────────────────────────────────
const refreshing   = ref(false)
const loadingCron  = ref(false)
const loadingLog   = ref(false)
const lastUpdateTime = ref('—')

const sysStatus   = ref({})
const cronTasks   = ref([])
const anomalyStatus = ref('normal')
const anomalyIssues = ref([])
const anomalyStats  = ref({})
const logLines    = ref([])
const logNote     = ref('')

// ── 存储健康 ──────────────────────────────────────────
const storageStatus   = ref('checking')   // 'checking' | 'ok' | 'error'
const storageLatency  = ref(null)
const storageProvider = ref('')
const storageChecking = ref(false)

const storageCardClass = computed(() => {
  if (storageStatus.value === 'ok')       return 'ok'
  if (storageStatus.value === 'checking') return 'ok'
  return 'err'
})

const checkStorage = async () => {
  storageChecking.value = true
  storageStatus.value = 'checking'
  storageLatency.value = null
  try {
    // 获取 provider
    const cfgRes = await getStorageConfig()
    const cfgData = cfgRes.data || cfgRes
    storageProvider.value = cfgData.provider || cfgData.STORAGE_PROVIDER || '--'

    const t0 = Date.now()
    const testRes = await testStorageConfig()
    const elapsed = Date.now() - t0
    const testData = testRes.data || testRes
    if (testData?.url || testData?.provider || testData?.success || testData?.connected) {
      storageStatus.value  = 'ok'
      storageLatency.value = elapsed
    } else {
      storageStatus.value = 'error'
    }
  } catch {
    storageStatus.value = 'error'
  } finally {
    storageChecking.value = false
  }
}

// ── 计算属性 ──────────────────────────────────────────
const overallStatus = computed(() =>
  sysStatus.value.status === 'online' ? 'online' : 'degraded'
)
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
    const res = await getSystemStatus()
    sysStatus.value = res.data ?? res
  } catch { sysStatus.value = {} }
}

const fetchCron = async () => {
  loadingCron.value = true
  try {
    const res = await getCronStatus()
    cronTasks.value = res?.tasks ?? res?.data?.tasks ?? []
  } catch { cronTasks.value = [] } finally {
    loadingCron.value = false
  }
}

const fetchAnomalies = async () => {
  try {
    const res = await getDebugAnomalies()
    const d = res.data ?? res
    anomalyStatus.value  = d.status   ?? 'normal'
    anomalyIssues.value  = d.issues   ?? []
    anomalyStats.value   = d.stats    ?? {}
  } catch { anomalyIssues.value = [] }
}

const fetchLogs = async () => {
  loadingLog.value = true
  try {
    const res = await getDebugLogs(80)
    const d = res.data ?? res
    logLines.value = d.lines ?? []
    logNote.value  = d.note  ?? ''
  } catch { logLines.value = [] } finally {
    loadingLog.value = false
  }
}

const refreshAll = async () => {
  refreshing.value = true
  await Promise.all([fetchStatus(), fetchCron(), fetchAnomalies(), fetchLogs(), checkStorage()])
  lastUpdateTime.value = dayjs().format('HH:mm:ss')
  refreshing.value = false
}

// ── 工具 ──────────────────────────────────────────────
const fmtTime = (iso) => {
  if (!iso) return '—'
  return dayjs(iso).format('MM-DD HH:mm:ss')
}

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
</style>
