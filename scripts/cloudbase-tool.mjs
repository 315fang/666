import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const cloudMpRoot = path.join(projectRoot, 'cloud-mp')

const commands = {
  foundation: 'check-cloudbase-foundation.js',
  importReady: 'check-cloudbase-import-ready.js',
  importValidate: 'validate-cloudbase-import.js',
  runtimeStatus: 'check-cloudbase-runtime-status.js',
  importSelected: 'import-cloudbase-collections.js',
  importReport: 'write-cloudbase-import-result.js',
  paymentReady: 'check-payment-readiness.js',
  legacyAudit: 'audit-legacy-compat.js',
  openidRepair: 'repair-cloudbase-openid-fields.js',
  productionCheck: 'check-production-gaps.js',
  normalizeData: 'normalize-cloudbase-data.js',
  buildImport: 'build-cloudbase-import-jsonl.js'
}

function printUsage() {
  console.log('Usage: node scripts/cloudbase-tool.mjs <command> [args...]')
  console.log('')
  console.log('Commands:')
  Object.entries(commands).forEach(([name, file]) => {
    console.log(`  ${name} -> cloud-mp/scripts/${file}`)
  })
}

const [, , commandName, ...args] = process.argv

if (!commandName || commandName === '--help' || commandName === '-h') {
  printUsage()
  process.exit(commandName ? 0 : 1)
}

const scriptFile = commands[commandName]
if (!scriptFile) {
  console.error(`Unknown command: ${commandName}`)
  printUsage()
  process.exit(1)
}

const scriptPath = path.join(cloudMpRoot, 'scripts', scriptFile)
const result = spawnSync(process.execPath, [scriptPath, ...args], {
  cwd: projectRoot,
  stdio: 'inherit'
})

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 0)
