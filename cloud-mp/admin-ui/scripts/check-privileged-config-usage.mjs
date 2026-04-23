import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const srcRoot = path.join(projectRoot, 'src')
const ignoredPathPrefixes = ['src/api/']

const restrictedApiUsage = {
  getSettings: ['src/views/home-sections/index.vue', 'src/views/settings/index.vue'],
  updateSettings: ['src/views/home-sections/index.vue', 'src/views/settings/index.vue'],
  getAlertConfig: ['src/views/settings/index.vue'],
  saveAlertConfig: ['src/views/settings/index.vue'],
  testAlertWebhook: ['src/views/settings/index.vue'],
  getMiniProgramConfig: ['src/views/orders/index.vue', 'src/views/settings/index.vue'],
  updateMiniProgramConfig: ['src/views/orders/index.vue', 'src/views/settings/index.vue'],
  getMemberTierConfig: [
    'src/views/dashboard/index.vue',
    'src/views/settings/index.vue',
    'src/views/membership/index.vue',
    'src/views/users/index.vue',
    'src/views/finance/components/FinanceRulesPanel.vue'
  ],
  updateMemberTierConfig: ['src/views/membership/index.vue', 'src/views/settings/index.vue'],
  backfillExchangeCoupons: ['src/views/membership/index.vue', 'src/views/settings/index.vue'],
  getSystemStatus: ['src/views/dashboard/index.vue', 'src/views/ops-monitor/index.vue', 'src/views/settings/index.vue'],
  getCommissionConfig: ['src/views/finance/components/FinanceRulesPanel.vue'],
  updateCommissionConfig: ['src/views/finance/components/FinanceRulesPanel.vue'],
  getRechargeConfig: ['src/views/finance/components/FinanceRulesPanel.vue'],
  updateRechargeConfig: ['src/views/finance/components/FinanceRulesPanel.vue']
}

const sourceFileExtensions = new Set(['.js', '.mjs', '.ts', '.vue'])

function collectSourceFiles(dir) {
  const results = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(entryPath))
      continue
    }
    if (sourceFileExtensions.has(path.extname(entry.name))) {
      results.push(entryPath)
    }
  }
  return results
}

const sourceFiles = collectSourceFiles(srcRoot)
const violations = []

for (const absolutePath of sourceFiles) {
  const relativePath = path.relative(projectRoot, absolutePath).replace(/\\/g, '/')
  if (ignoredPathPrefixes.some((prefix) => relativePath.startsWith(prefix))) continue
  const content = readFileSync(absolutePath, 'utf8')

  for (const [apiName, allowlist] of Object.entries(restrictedApiUsage)) {
    if (allowlist.includes(relativePath)) continue
    if (new RegExp(`\\b${apiName}\\b`).test(content)) {
      violations.push(`${relativePath}: unexpected privileged API usage "${apiName}"`)
    }
  }
}

if (violations.length > 0) {
  console.error('Privileged config API usage check failed:')
  for (const message of violations) {
    console.error(`- ${message}`)
  }
  process.exit(1)
}

console.log('Privileged config API usage check passed.')
