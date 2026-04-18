#!/usr/bin/env node
'use strict'

const path = require('path')
const { readJson, writeJson, writeText, runtimeFile, nowIso, projectRoot } = require('./release-runtime-kit')

const manifestPath = path.join(projectRoot, 'config', 'cloudbase-index-manifest.json')
const reportPath = runtimeFile('cloudbase-index-manifest-check.json')
const docPath = path.join(projectRoot, 'docs', 'CLOUDBASE_INDEX_MANIFEST.md')

function assert(condition, message, details = '') {
  return {
    ok: !!condition,
    message,
    details
  }
}

function renderDoc(manifest, checks) {
  const rows = manifest.collections
    .map((collection) => {
      const indexLines = collection.indexes
        .map((index) => `- \`${index.name}\`: ${index.fields.map((field) => `${field.field}(${field.order})`).join(', ')}，用途：${index.purpose}`)
        .join('\n')
      return `## ${collection.name}\n\n${indexLines}\n`
    })
    .join('\n')

  return `# CloudBase 索引清单\n\nGenerated at: ${nowIso()}\n\n## 校验结果\n\n${checks.map((item) => `- ${item.ok ? 'PASS' : 'FAIL'}: ${item.message}${item.details ? ` (${item.details})` : ''}`).join('\n')}\n\n## 集合索引\n\n${rows}`
}

function main() {
  const manifest = readJson(manifestPath, null)
  const checks = []

  checks.push(assert(!!manifest, 'manifest exists', manifestPath))
  checks.push(assert(Array.isArray(manifest && manifest.collections), 'collections is array'))

  const collections = Array.isArray(manifest && manifest.collections) ? manifest.collections : []
  const requiredCollections = [
    'orders',
    'refunds',
    'commissions',
    'products',
    'banners',
    'activity_links',
    'limited_sale_slots',
    'limited_sale_items'
  ]

  requiredCollections.forEach((name) => {
    const collection = collections.find((item) => item && item.name === name)
    checks.push(assert(!!collection, `collection ${name} declared`))
    checks.push(assert(collection && Array.isArray(collection.indexes) && collection.indexes.length > 0, `collection ${name} has indexes`))
  })

  collections.forEach((collection) => {
    ;(collection.indexes || []).forEach((index) => {
      checks.push(assert(!!index.name, `${collection.name} index has name`))
      checks.push(assert(Array.isArray(index.fields) && index.fields.length > 0, `${collection.name}.${index.name} has fields`))
      checks.push(assert(typeof index.purpose === 'string' && index.purpose.trim().length > 0, `${collection.name}.${index.name} has purpose`))
    })
  })

  const failures = checks.filter((item) => !item.ok)
  const report = {
    ok: failures.length === 0,
    generated_at: nowIso(),
    manifest_path: manifestPath,
    collection_count: collections.length,
    index_count: collections.reduce((sum, collection) => sum + (collection.indexes || []).length, 0),
    failed: failures.length,
    checks
  }

  writeJson(reportPath, report)
  if (manifest) {
    writeText(docPath, renderDoc(manifest, checks))
  }

  console.log(JSON.stringify(report, null, 2))
  if (failures.length > 0) process.exit(1)
}

main()
