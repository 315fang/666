const fs = require('fs');
const path = require('path');

const serviceRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(serviceRoot, '..', '..');
const seedRoot = process.env.ADMIN_NORMALIZED_DATA_ROOT
  ? path.resolve(process.env.ADMIN_NORMALIZED_DATA_ROOT)
  : path.join(projectRoot, 'cloud-mp', 'cloudbase-seed');
const runtimeOverrideRoot = path.join(serviceRoot, '.runtime', 'overrides');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
  if (!fs.existsSync(seedRoot)) {
    throw new Error(`Seed root not found: ${seedRoot}`);
  }

  ensureDir(runtimeOverrideRoot);

  const files = fs.readdirSync(seedRoot).filter((name) => name.endsWith('.json') && !name.startsWith('_'));
  files.forEach((file) => {
    const source = path.join(seedRoot, file);
    const target = path.join(runtimeOverrideRoot, file);
    fs.copyFileSync(source, target);
  });

  console.log(`Synced ${files.length} collections from ${seedRoot}`);
  console.log(`Target: ${runtimeOverrideRoot}`);
}

main();
