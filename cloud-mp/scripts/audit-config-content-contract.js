const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const docsDir = path.join(projectRoot, 'docs');
const jsonPath = path.join(docsDir, 'CONFIG_CONTENT_CONTRACT_AUDIT.json');
const mdPath = path.join(docsDir, 'CONFIG_CONTENT_CONTRACT_AUDIT.md');

const configContract = require(path.join(projectRoot, 'cloudfunctions', 'config', 'config-contract.js'));
const adminConfigContract = require(path.join(projectRoot, 'cloudfunctions', 'admin-api', 'src', 'config-contract.js'));

const contractCases = [
  {
    name: 'mini program config logistics options',
    fn: 'normalizeMiniProgramConfig',
    input: { logistics_config: { shipping_company_options: ['顺丰速运', '', '顺丰速运', '申通快递'] } },
    expected: ['顺丰速运', '申通快递'],
    pick: (result) => result.logistics_config.shipping_company_options
  },
  {
    name: 'popup ad canonical field',
    fn: 'normalizePopupAdConfig',
    input: { enabled: 1, file_id: 'cloud://img', url: 'https://fallback' },
    expected: 'cloud://img',
    pick: (result) => result.file_id
  },
  {
    name: 'home section canonical field',
    fn: 'normalizeHomeSectionRecord',
    input: { id: 1, board_key: 'home.hero', board_name: '首页 Hero', board_type: 'hero' },
    expected: 'home.hero',
    pick: (result) => result.section_key
  }
];

const sourceChecks = [
  {
    file: 'cloudfunctions/config/index.js',
    patterns: ['normalizeMiniProgramConfig', 'normalizeHomeContentPayload', 'normalizeSplashConfig']
  },
  {
    file: 'cloudfunctions/admin-api/src/app.js',
    patterns: ['configContract.normalizeMiniProgramConfig', 'configContract.normalizePopupAdConfig', "patchCollectionRow('content_boards'"]
  }
];

function runContractCases(moduleRef, moduleLabel, tests) {
  return tests.map((test) => {
    if (typeof moduleRef[test.fn] !== 'function') {
      return { module: moduleLabel, name: test.name, ok: false, detail: `missing function ${test.fn}` };
    }
    const actualRaw = moduleRef[test.fn](test.input);
    const actual = typeof test.pick === 'function' ? test.pick(actualRaw) : actualRaw;
    const ok = JSON.stringify(actual) === JSON.stringify(test.expected);
    return {
      module: moduleLabel,
      name: test.name,
      ok,
      detail: `${test.fn} => ${JSON.stringify(actual)}`
    };
  });
}

function runSourceChecks() {
  return sourceChecks.flatMap((item) => {
    const filePath = path.join(projectRoot, item.file);
    const text = fs.readFileSync(filePath, 'utf8');
    return item.patterns.map((pattern) => ({
      module: 'source',
      name: `${item.file} contains ${pattern}`,
      ok: text.includes(pattern),
      detail: item.file
    }));
  });
}

function main() {
  const findings = [
    ...runContractCases(configContract, 'config', contractCases.slice(0, 2)),
    ...runContractCases(adminConfigContract, 'admin-api', contractCases),
    ...runSourceChecks()
  ];
  const ok = findings.every((item) => item.ok);
  const report = {
    generatedAt: new Date().toISOString(),
    ok,
    total: findings.length,
    failed: findings.filter((item) => !item.ok).length,
    findings
  };
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  const lines = [
    '# Config Content Contract Audit',
    '',
    `生成时间：${report.generatedAt}`,
    `结果：${report.ok ? 'PASS' : 'FAIL'}`,
    '',
    '| 模块 | 检查项 | 结果 | 说明 |',
    '| --- | --- | --- | --- |',
    ...report.findings.map((item) => `| ${item.module} | ${item.name} | ${item.ok ? 'PASS' : 'FAIL'} | ${item.detail.replace(/\|/g, '\\|')} |`)
  ];
  fs.writeFileSync(mdPath, lines.join('\n') + '\n');
  console.log(JSON.stringify({ ok: report.ok, total: report.total, failed: report.failed, jsonPath, mdPath }, null, 2));
  if (!ok) process.exit(1);
}

main();
