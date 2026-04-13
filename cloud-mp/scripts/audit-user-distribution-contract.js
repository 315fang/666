const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const docsDir = path.join(projectRoot, 'docs');
const jsonPath = path.join(docsDir, 'USER_DISTRIBUTION_CONTRACT_AUDIT.json');
const mdPath = path.join(docsDir, 'USER_DISTRIBUTION_CONTRACT_AUDIT.md');

const userContract = require(path.join(projectRoot, 'cloudfunctions', 'user', 'user-contract.js'));
const loginContract = require(path.join(projectRoot, 'cloudfunctions', 'login', 'user-contract.js'));
const distributionContract = require(path.join(projectRoot, 'cloudfunctions', 'distribution', 'user-contract.js'));
const adminContract = require(path.join(projectRoot, 'cloudfunctions', 'admin-api', 'src', 'user-contract.js'));

const contractCases = [
  {
    name: 'commission balance canonical',
    fn: 'resolveCommissionBalance',
    input: { commission_balance: 18.6, balance: 99 },
    expected: 18.6
  },
  {
    name: 'goods fund balance canonical',
    fn: 'resolveGoodsFundBalance',
    input: { goods_fund_balance: 0, agent_wallet_balance: 56.2, wallet_balance: 11 },
    expected: 56.2
  },
  {
    name: 'role level canonical',
    fn: 'resolveRoleLevel',
    input: { role_level: 4, distributor_level: 2 },
    expected: 4
  }
];

const sourceChecks = [
  {
    file: 'cloudfunctions/login/index.js',
    patterns: ['buildCanonicalUser', "user-contract"]
  },
  {
    file: 'cloudfunctions/user/user-profile.js',
    patterns: ['buildCanonicalUser', "user-contract"]
  },
  {
    file: 'cloudfunctions/distribution/distribution-query.js',
    patterns: ['buildCanonicalUser', 'goods_fund_balance', 'commission_balance']
  },
  {
    file: 'cloudfunctions/distribution/index.js',
    patterns: ['normalizeTeamMember', 'goods_fund_balance', 'role_name']
  },
  {
    file: 'cloudfunctions/admin-api/src/app.js',
    patterns: ['buildCanonicalUser', 'goods_fund_balance', 'status_text']
  }
];

function runContractCases(moduleRef, moduleLabel) {
  return contractCases.map((test) => {
    if (typeof moduleRef[test.fn] !== 'function') {
      return { module: moduleLabel, name: test.name, ok: false, detail: `missing function ${test.fn}` };
    }
    const actual = moduleRef[test.fn](test.input);
    return {
      module: moduleLabel,
      name: test.name,
      ok: actual === test.expected,
      detail: `${test.fn}(${JSON.stringify(test.input)}) => ${JSON.stringify(actual)}`
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
    ...runContractCases(userContract, 'user'),
    ...runContractCases(loginContract, 'login'),
    ...runContractCases(distributionContract, 'distribution'),
    ...runContractCases(adminContract, 'admin-api'),
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
    '# User Distribution Contract Audit',
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
