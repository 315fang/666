/**
 * 粗粒度对照：admin-ui API 模块中的 url 与 backend/routes/admin 中 router 声明路径。
 * 运行：node scripts/audit-admin-api-alignment.mjs
 * 说明：模板字符串中的动态段会规范为 :param；结果供人工排查，非严格契约测试。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function walkJsFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walkJsFiles(p, out)
    else if (name.endsWith('.js')) out.push(p)
  }
  return out
}

function normalizePath(s) {
  if (!s || typeof s !== 'string') return null
  let u = s.split('?')[0].trim()
  u = u.replace(/\$\{[^}]+\}/g, ':id')
  u = u.replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, ':id')
  if (!u.startsWith('/')) u = '/' + u
  return u.replace(/\/+/g, '/')
}

function extractFrontendUrls() {
  const modDir = path.join(root, 'admin-ui', 'src', 'api', 'modules')
  const files = walkJsFiles(modDir)
  const urls = new Set()
  const re = /url:\s*([`'"])((?:(?!\1).)+)\1/g
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8')
    let m
    while ((m = re.exec(text)) !== null) {
      const raw = m[2]
      const n = normalizePath(raw)
      if (n) urls.add(n)
    }
  }
  return urls
}

function extractBackendPaths() {
  const adminDir = path.join(root, 'backend', 'routes', 'admin')
  const files = walkJsFiles(adminDir)
  const paths = new Set()
  const re = /router\.(get|post|put|delete|patch)\(\s*([`'"])((?:(?!\2).)+)\2/gi
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8')
    let m
    while ((m = re.exec(text)) !== null) {
      const raw = m[3]
      if (raw === '/' || raw.startsWith('/*')) continue
      const n = normalizePath(raw)
      if (n) paths.add(n)
    }
  }
  return paths
}

function looseMatch(frontPath, backSet) {
  if (backSet.has(frontPath)) return true
  for (const b of backSet) {
    if (b.includes(':id') && frontPath.startsWith(b.split(':id')[0])) return true
  }
  return false
}

const front = extractFrontendUrls()
const back = extractBackendPaths()

const onlyFront = [...front].filter((p) => !looseMatch(p, back)).sort()
const onlyBack = [...back].filter((p) => !looseMatch(p, front)).sort()

const outPath = path.join(root, 'docs', '管理端前后端路径对照快照.md')
const fmtList = (arr) => (arr.length ? arr.map((x) => '- `' + x + '`').join('\n') : '_（无）_')

const body = `# 管理端前后端路径对照快照（自动生成）

生成命令：\`node scripts/audit-admin-api-alignment.mjs\`

## 统计

- 前端 API 模块解析到的路径数：${front.size}
- 后端 admin 路由解析到的路径数：${back.size}

## 前端有而后端未粗匹配（${onlyFront.length}）

${onlyFront.length ? '可能原因：挂载前缀、动态拼接遗漏、脚本误报。\n\n' + fmtList(onlyFront) : '_（无）_'}

## 后端有而前端 API 模块未粗匹配（${onlyBack.length}）

可能原因：尚未做管理页、由子路由挂载（本脚本未拼接 \`router.use\` 前缀，故 \`/:id\` 等相对路径会出现在此列表）、测试/运维专用接口。

${onlyBack.length ? fmtList(onlyBack) : '_（无）_'}

## 说明

- admin 实际挂载在 \`/admin/api\`（或等价前缀）下；此处只比较从源码解析出的路径字面量形态。
- 若路径含多级动态参数，需人工核对。
`

fs.writeFileSync(outPath, body, 'utf8')
console.log('Wrote', outPath)
console.log('onlyFront', onlyFront.length, 'onlyBack', onlyBack.length)
