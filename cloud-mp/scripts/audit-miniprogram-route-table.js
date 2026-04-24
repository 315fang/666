const fs = require('fs');
const path = require('path');
const { getAuditArtifactPaths } = require('./lib/audit-output');

const projectRoot = path.join(__dirname, '..');
const { outputDir: docsDir, jsonPath, mdPath } = getAuditArtifactPaths(projectRoot, 'MINIPROGRAM_ROUTE_TABLE_AUDIT');

const requestRouteTablePath = path.join(projectRoot, 'miniprogram', 'utils', 'requestRoutes.js');
const orderIndexPath = path.join(projectRoot, 'cloudfunctions', 'order', 'index.js');
const paymentIndexPath = path.join(projectRoot, 'cloudfunctions', 'payment', 'index.js');

const requiredRoutes = [
  { route: "'POST /orders'", fn: "'order'", action: "'create'", owner: 'order' },
  { route: "'GET /orders'", fn: "'order'", action: "'list'", owner: 'order' },
  { route: "'GET /orders/:id'", fn: "'order'", action: "'detail'", owner: 'order' },
  { route: "'POST /orders/:id/prepay'", fn: "'payment'", action: "'prepay'", owner: 'payment' },
  { route: "'GET /orders/:id/pay-status'", fn: "'payment'", action: "'queryStatus'", owner: 'payment' },
  { route: "'POST /orders/:id/sync-wechat-pay'", fn: "'payment'", action: "'syncWechatPay'", owner: 'payment' },
  { route: "'POST /orders/:id/retry-group-join'", fn: "'payment'", action: "'retryGroupJoin'", owner: 'payment' },
  { route: "'GET /refunds'", fn: "'order'", action: "'refundList'", owner: 'order' },
  { route: "'POST /refunds'", fn: "'order'", action: "'applyRefund'", owner: 'order' },
  { route: "'GET /refunds/:id'", fn: "'order'", action: "'refundDetail'", owner: 'order' },
  { route: "'PUT /refunds/:id/cancel'", fn: "'order'", action: "'cancelRefund'", owner: 'order' },
  { route: "'PUT /refunds/:id/return-shipping'", fn: "'order'", action: "'returnShipping'", owner: 'order' }
];

function actionExists(sourceText, actionName) {
  return sourceText.includes(`'${actionName}':`) || sourceText.includes(`"${actionName}":`) || sourceText.includes(`action === '${actionName}'`);
}

function main() {
  delete require.cache[require.resolve(requestRouteTablePath)];
  const { ROUTE_TABLE } = require(requestRouteTablePath);
  const orderIndex = fs.readFileSync(orderIndexPath, 'utf8');
  const paymentIndex = fs.readFileSync(paymentIndexPath, 'utf8');

  const findings = requiredRoutes.map((item) => {
    const routeKey = item.route.replace(/'/g, '');
    const routeConfig = ROUTE_TABLE[routeKey];
    const routeOk = !!routeConfig
      && routeConfig.fn === item.fn.replace(/'/g, '')
      && routeConfig.action === item.action.replace(/'/g, '');
    const ownerSource = item.owner === 'order' ? orderIndex : paymentIndex;
    const actionOk = actionExists(ownerSource, item.action.replace(/'/g, ''));
    return {
      route: routeKey,
      action: item.action.replace(/'/g, ''),
      route_ok: routeOk,
      action_ok: actionOk,
      ok: routeOk && actionOk
    };
  });

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
    '# Mini Program Route Table Audit',
    '',
    `生成时间：${report.generatedAt}`,
    `结果：${report.ok ? 'PASS' : 'FAIL'}`,
    '',
    '| 路由 | Action | ROUTE_TABLE | 云函数 Action | 结果 |',
    '| --- | --- | --- | --- | --- |',
    ...report.findings.map((item) => `| ${item.route} | ${item.action} | ${item.route_ok ? 'PASS' : 'FAIL'} | ${item.action_ok ? 'PASS' : 'FAIL'} | ${item.ok ? 'PASS' : 'FAIL'} |`)
  ];
  fs.writeFileSync(mdPath, lines.join('\n') + '\n');
  console.log(JSON.stringify({ ok: report.ok, total: report.total, failed: report.failed, jsonPath, mdPath }, null, 2));
  if (!ok) process.exit(1);
}

main();
