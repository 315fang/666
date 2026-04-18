#!/usr/bin/env node
'use strict'

const path = require('path')
const { spawnSync } = require('child_process')
const { writeJson, writeText, runtimeFile, nowIso, projectRoot } = require('./release-runtime-kit')

const checks = [
  { name: 'index-manifest', command: 'node', args: ['scripts/check-cloudbase-index-manifest.js'], cwd: projectRoot },
  { name: 'perf-baseline', command: 'node', args: ['scripts/generate-cloudbase-perf-baseline.js'], cwd: projectRoot },
  { name: 'miniprogram-app-check', command: 'node', args: ['--check', 'miniprogram/app.js'], cwd: projectRoot },
  { name: 'miniprogram-prefetch-check', command: 'node', args: ['--check', 'miniprogram/appPrefetch.js'], cwd: projectRoot },
  { name: 'miniprogram-request-check', command: 'node', args: ['--check', 'miniprogram/utils/request.js'], cwd: projectRoot },
  { name: 'miniprogram-routes-check', command: 'node', args: ['--check', 'miniprogram/utils/requestRoutes.js'], cwd: projectRoot },
  { name: 'miniprogram-navigator-check', command: 'node', args: ['--check', 'miniprogram/utils/navigator.js'], cwd: projectRoot },
  { name: 'activity-loader-check', command: 'node', args: ['--check', 'miniprogram/pages/activity/activityLoader.js'], cwd: projectRoot },
  { name: 'limited-spot-check', command: 'node', args: ['--check', 'miniprogram/pages/activity/limited-spot.js'], cwd: projectRoot },
  { name: 'admin-build', command: 'npm', args: ['run', 'build'], cwd: path.join(projectRoot, 'admin-ui') }
]

function runCheck(check) {
  const result = spawnSync(check.command, check.args, {
    cwd: check.cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32'
  })
  return {
    name: check.name,
    command: `${check.command} ${check.args.join(' ')}`,
    cwd: check.cwd,
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  }
}

function renderDoc(report) {
  return `# V2 本地就绪检查\n\nGenerated at: ${report.generated_at}\n\n## 结果\n\n${report.results.map((item) => `- ${item.ok ? 'PASS' : 'FAIL'}: ${item.name} -> \`${item.command}\``).join('\n')}\n\n## 仍需人工完成\n\n- 微信开发者工具 / 真机走查：首页 -> 活动页 -> 限时商品页 -> 商品详情 -> 下单支付\n- 微信开发者工具 / 真机走查：我的页 -> 订单列表 / 售后列表 / 会员中心\n- CloudBase 控制台实际创建索引，并观察函数 cold start / p50 / p95\n`
}

function main() {
  const results = checks.map(runCheck)
  const report = {
    generated_at: nowIso(),
    ok: results.every((item) => item.ok),
    failed: results.filter((item) => !item.ok).length,
    results
  }

  writeJson(runtimeFile('v2-local-readiness.json'), report)
  writeText(path.join(projectRoot, 'docs', 'V2_LOCAL_READINESS.md'), renderDoc(report))

  console.log(JSON.stringify({
    generated_at: report.generated_at,
    ok: report.ok,
    failed: report.failed,
    results: report.results.map((item) => ({
      name: item.name,
      ok: item.ok,
      status: item.status
    }))
  }, null, 2))

  if (!report.ok) process.exit(1)
}

main()
