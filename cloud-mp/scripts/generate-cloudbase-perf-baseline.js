#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const { readJson, writeJson, writeText, runtimeFile, nowIso, projectRoot } = require('./release-runtime-kit')

const { ROUTE_TABLE } = require(path.join(projectRoot, 'miniprogram', 'utils', 'requestRoutes'))
const miniProgramTargetsRegistry = readJson(path.join(projectRoot, 'miniprogram', 'utils', 'miniProgramTargets.json'), {})

const FUNCTIONS = ['admin-api', 'config', 'order', 'payment']
const HOT_FILES = [
  'cloudfunctions/admin-api/src/app.js',
  'cloudfunctions/admin-api/src/admin-marketing.js',
  'cloudfunctions/config/index.js',
  'cloudfunctions/order/order-create.js',
  'cloudfunctions/payment/payment-callback.js',
  'miniprogram/utils/request.js',
  'miniprogram/utils/requestRoutes.js',
  'admin-ui/src/components/ContentBlockEditor.vue',
  'admin-ui/src/views/content/index.vue',
  'admin-ui/src/views/home-sections/index.vue'
]

function readRuntimeConfig(functionName) {
  const packagePath = path.join(projectRoot, 'cloudfunctions', functionName, 'package.json')
  const packageJson = readJson(packagePath, {})
  const runtime = packageJson['cloudfunction-config'] || {}
  return {
    function_name: functionName,
    memorySize: Number(runtime.memorySize || 0),
    timeout: Number(runtime.timeout || 0)
  }
}

function statFile(relativePath) {
  const fullPath = path.join(projectRoot, relativePath)
  const exists = fs.existsSync(fullPath)
  return {
    path: relativePath,
    exists,
    bytes: exists ? fs.statSync(fullPath).size : 0,
    lines: exists ? fs.readFileSync(fullPath, 'utf8').split('\n').length : 0
  }
}

function renderDoc(report) {
  const runtimeRows = report.functions
    .map((item) => `- \`${item.function_name}\`: memory=${item.memorySize || 'unknown'}, timeout=${item.timeout || 'unknown'}`)
    .join('\n')

  const fileRows = report.hot_files
    .map((item) => `- \`${item.path}\`: ${item.lines} lines / ${item.bytes} bytes`)
    .join('\n')

  return `# CloudBase 性能基线\n\nGenerated at: ${report.generated_at}\n\n## 运行时\n\n${runtimeRows}\n\n## 热点文件体量\n\n${fileRows}\n\n## 路由与目标库\n\n- request route count: ${report.request_route_count}\n- mini program target count: ${report.target_count}\n- page whitelist prefix count: ${report.page_whitelist_prefix_count}\n\n## 部署后需补充\n\n- 记录四个核心函数冷启动 1 次耗时\n- 记录四个核心函数热启动 20 次 p50 / p95\n- 统计 \`cache_hit\` 命中率\n- 统计 \`getTempFileURL\` 调用次数\n`
}

function main() {
  const report = {
    generated_at: nowIso(),
    functions: FUNCTIONS.map(readRuntimeConfig),
    hot_files: HOT_FILES.map(statFile),
    request_route_count: Object.keys(ROUTE_TABLE).length,
    target_count: Array.isArray(miniProgramTargetsRegistry.targets) ? miniProgramTargetsRegistry.targets.length : 0,
    page_whitelist_prefix_count: Array.isArray(miniProgramTargetsRegistry.pageWhitelistPrefixes) ? miniProgramTargetsRegistry.pageWhitelistPrefixes.length : 0
  }

  writeJson(runtimeFile('cloudbase-perf-baseline.json'), report)
  writeText(path.join(projectRoot, 'docs', 'CLOUDBASE_PERF_BASELINE.md'), renderDoc(report))

  console.log(JSON.stringify(report, null, 2))
}

main()
