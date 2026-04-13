const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const docsDir = path.join(projectRoot, 'docs');
const jsonPath = path.join(docsDir, 'ORDER_MAIN_CONTRACT_AUDIT.json');
const mdPath = path.join(docsDir, 'ORDER_MAIN_CONTRACT_AUDIT.md');

const orderContract = require(path.join(projectRoot, 'cloudfunctions', 'order', 'order-contract.js'));
const adminOrderContract = require(path.join(projectRoot, 'cloudfunctions', 'admin-api', 'src', 'order-contract.js'));

const orderContractCases = [
  {
    name: 'pending payment status group',
    fn: 'normalizeOrderStatusGroup',
    input: 'pending_payment',
    expected: 'pending_pay'
  },
  {
    name: 'paid status group',
    fn: 'normalizeOrderStatusGroup',
    input: 'paid',
    expected: 'pending_ship'
  },
  {
    name: 'client pending status',
    fn: 'normalizeOrderStatusForClient',
    input: 'pending_payment',
    expected: 'pending'
  },
  {
    name: 'wechat payment alias',
    fn: 'normalizePaymentMethodCode',
    input: 'wxpay',
    expected: 'wechat'
  },
  {
    name: 'goods fund payment alias',
    fn: 'normalizePaymentMethodCode',
    input: 'goodsfund',
    expected: 'goods_fund'
  },
  {
    name: 'wallet refund target',
    fn: 'getRefundTargetText',
    input: 'wallet',
    expected: '退回账户余额'
  },
  {
    name: 'refund pending text',
    fn: 'getRefundStatusText',
    input: 'pending',
    expected: '审核中'
  }
];

const adminContractCases = [
  {
    name: 'pending payment status group',
    fn: 'normalizeOrderStatusGroup',
    input: 'pending_payment',
    expected: 'pending_pay'
  },
  {
    name: 'paid status group',
    fn: 'normalizeOrderStatusGroup',
    input: 'paid',
    expected: 'pending_ship'
  },
  {
    name: 'wechat payment alias',
    fn: 'normalizePaymentMethodCode',
    input: 'wxpay',
    expected: 'wechat'
  },
  {
    name: 'goods fund payment alias',
    fn: 'normalizePaymentMethodCode',
    input: 'goodsfund',
    expected: 'goods_fund'
  },
  {
    name: 'wallet refund target',
    fn: 'getRefundTargetText',
    input: 'wallet',
    expected: '退回账户余额'
  },
  {
    name: 'refund pending text',
    fn: 'getRefundStatusText',
    input: 'pending',
    expected: '待审核'
  }
];

const sourceChecks = [
  {
    file: 'cloudfunctions/order/order-query.js',
    patterns: ['status_group', 'status_text', 'payment_method_text', 'refund_target_text']
  },
  {
    file: 'cloudfunctions/order/order-lifecycle.js',
    patterns: ['payment_method', 'refund_channel', 'refund_target_text', 'return_company', 'return_tracking_no']
  },
  {
    file: 'cloudfunctions/admin-api/src/app.js',
    patterns: ['status_group', 'status_text', 'payment_method_text', 'refund_target_text']
  }
];

function runContractCases(moduleRef, moduleLabel, tests) {
  return tests.map((test) => {
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
    ...runContractCases(orderContract, 'order', orderContractCases),
    ...runContractCases(adminOrderContract, 'admin-api', adminContractCases),
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
    '# Order Main Contract Audit',
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
