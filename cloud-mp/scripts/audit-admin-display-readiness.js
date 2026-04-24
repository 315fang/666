const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getAuditArtifactPaths } = require('./lib/audit-output');

const cloudRoot = path.resolve(__dirname, '..');
const { outputDir: docsDir, jsonPath, mdPath } = getAuditArtifactPaths(cloudRoot, 'ADMIN_DISPLAY_AUDIT');

function runMcporter(args) {
  const escapedArgs = args.map((arg) => {
    if (/[\s"[\]{}:,]/.test(arg)) return `"${arg.replace(/"/g, '\\"')}"`;
    return arg;
  });
  const output = execSync(`npx mcporter ${escapedArgs.join(' ')}`, {
    cwd: cloudRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true
  });
  return JSON.parse(output);
}

function readCollection(collectionName, { limit = 100, sort = null } = {}) {
  const args = ['call', 'cloudbase.readNoSqlDatabaseContent', `collectionName=${collectionName}`, `limit=${limit}`, '--output', 'json'];
  if (sort) args.splice(3, 0, `sort=${JSON.stringify(sort)}`);
  const result = runMcporter(args);
  return Array.isArray(result.data) ? result.data : [];
}

function pickString(value, fallback = '') {
  return value == null ? fallback : String(value);
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  return [value];
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function primaryId(row) {
  return row?.id ?? row?._legacy_id ?? row?._id ?? null;
}

function valueTokens(value) {
  if (value == null || value === '') return [];
  const raw = String(value).trim();
  if (!raw) return [];
  const tokens = new Set([raw]);
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) tokens.add(String(numeric));
  return [...tokens];
}

function rowLookupTokens(row, extraValues = []) {
  const values = [
    primaryId(row),
    row?._id,
    row?.openid,
    row?.user_id,
    row?.buyer_id,
    row?.order_id,
    row?.order_no,
    row?.member_no,
    row?.my_invite_code,
    row?.invite_code,
    ...extraValues
  ];
  return [...new Set(values.flatMap((item) => valueTokens(item)))];
}

function rowMatchesLookup(row, value, extraValues = []) {
  const targets = valueTokens(value);
  if (!targets.length) return false;
  const tokens = rowLookupTokens(row, extraValues);
  return targets.some((token) => tokens.includes(token));
}

function findByLookup(rows, value, extraValuesGetter) {
  if (value == null || value === '') return null;
  return rows.find((row) => rowMatchesLookup(row, value, typeof extraValuesGetter === 'function' ? extraValuesGetter(row) : [])) || null;
}

function getUserNickname(user) {
  return pickString(user?.nickname || user?.nickName || user?.name || '微信用户');
}

function getUserAvatar(user) {
  return pickString(user?.avatar_url || user?.avatarUrl || user?.avatar || user?.headimgurl || '');
}

function buildProductSummary(product, fallback = {}) {
  const images = toArray(product?.images).filter(Boolean);
  const image = pickString(product?.cover_image || product?.image_url || product?.image || images[0] || fallback.snapshot_image || fallback.image || '');
  const name = pickString(product?.name || product?.title || fallback.snapshot_name || fallback.name || fallback.product_name || '');
  return {
    id: primaryId(product) || fallback.product_id || '',
    name,
    image,
    images: images.length ? images : (image ? [image] : []),
    retail_price: toNumber(product?.retail_price ?? product?.price ?? fallback.price, 0)
  };
}

function buildPrizeImage(row = {}) {
  const current = pickString(row.image_url || row.image || row.cover_image || '');
  if (current) return current;
  return '__generated__';
}

function buildOrderDisplay(order, users, products) {
  const buyer = findByLookup(users, order.openid) || null;
  const items = toArray(order.items);
  const primaryItem = items[0] || {};
  const product = findByLookup(products, order.product_id ?? primaryItem.product_id);
  const productSummary = buildProductSummary(product, primaryItem);
  return {
    id: primaryId(order) || order._id,
    order_no: pickString(order.order_no),
    buyer_name: getUserNickname(buyer),
    buyer_avatar: getUserAvatar(buyer),
    product_name: pickString(productSummary.name || '未命名商品'),
    product_image: pickString(productSummary.image),
    spec_text: pickString(primaryItem.snapshot_spec || primaryItem.spec || order?.sku?.spec_value || ''),
    amount: toNumber(order.actual_price ?? order.pay_amount ?? order.total_amount, 0),
    status: pickString(order.status)
  };
}

function pushIssue(results, page, id, message, severity = 'error') {
  results.push({ page, id, severity, message });
}

function auditOrders(results, orders, users, products) {
  for (const order of orders.slice(0, 30)) {
    const view = buildOrderDisplay(order, users, products);
    if (!view.product_name || view.product_name === '未命名商品') {
      pushIssue(results, 'orders', view.id, `订单 ${view.order_no || view.id} 商品名缺失`);
    }
    if (!view.product_image) {
      pushIssue(results, 'orders', view.id, `订单 ${view.order_no || view.id} 商品图缺失`);
    }
    if (!view.status) {
      pushIssue(results, 'orders', view.id, `订单 ${view.order_no || view.id} 状态缺失`);
    }
  }
}

function auditGroupActivities(results, activities, products) {
  for (const row of activities) {
    const product = findByLookup(products, row.product_id);
    const productSummary = buildProductSummary(product);
    const displayName = pickString(row.name || row.title || (productSummary.name ? `${productSummary.name}拼团活动` : ''));
    if (!displayName) {
      pushIssue(results, 'group-buys', primaryId(row), `拼团活动 ${primaryId(row)} 名称缺失`);
    }
    if (!productSummary.name) {
      pushIssue(results, 'group-buys', primaryId(row), `拼团活动 ${primaryId(row)} 关联商品名缺失`);
    }
    if (!productSummary.image) {
      pushIssue(results, 'group-buys', primaryId(row), `拼团活动 ${primaryId(row)} 关联商品图缺失`, 'warning');
    }
  }
}

function auditSlashActivities(results, activities, products) {
  for (const row of activities) {
    const product = findByLookup(products, row.product_id);
    const productSummary = buildProductSummary(product);
    const displayName = pickString(row.name || row.title || (productSummary.name ? `${productSummary.name}砍价活动` : ''));
    if (!displayName) {
      pushIssue(results, 'slash-activities', primaryId(row), `砍价活动 ${primaryId(row)} 名称缺失`);
    }
    if (!productSummary.name) {
      pushIssue(results, 'slash-activities', primaryId(row), `砍价活动 ${primaryId(row)} 关联商品名缺失`);
    }
  }
}

function auditLotteryPrizes(results, prizes) {
  for (const row of prizes) {
    const name = pickString(row.name);
    const image = buildPrizeImage(row);
    if (!name) pushIssue(results, 'lottery-prizes', primaryId(row), `抽奖奖品 ${primaryId(row)} 名称缺失`);
    if (!image) pushIssue(results, 'lottery-prizes', primaryId(row), `抽奖奖品 ${primaryId(row)} 图片缺失`, 'warning');
  }
}

function auditPickupStations(results, stations) {
  for (const row of stations) {
    const name = pickString(row.name || row.station_name || row.title);
    const region = [row.province, row.city, row.district].filter(Boolean).join('/');
    if (!name) pushIssue(results, 'pickup-stations', primaryId(row), `自提门店 ${primaryId(row)} 名称缺失`);
    if (!region) pushIssue(results, 'pickup-stations', primaryId(row), `自提门店 ${primaryId(row)} 地区缺失`, 'warning');
  }
}

function auditBoards(results, boards, relations, products) {
  for (const board of boards) {
    const boardName = pickString(board.board_name || board.name || board.title || board.board_key);
    if (!boardName) pushIssue(results, 'featured-board', primaryId(board), `推荐位 ${primaryId(board)} 名称缺失`);
  }
  for (const rel of relations) {
    const product = findByLookup(products, rel.product_id);
    const productSummary = buildProductSummary(product);
    if (!productSummary.name) pushIssue(results, 'featured-board', primaryId(rel), `推荐商品关联 ${primaryId(rel)} 商品名缺失`);
    if (!productSummary.image) pushIssue(results, 'featured-board', primaryId(rel), `推荐商品关联 ${primaryId(rel)} 商品图缺失`, 'warning');
  }
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Admin Display Audit');
  lines.push('');
  lines.push(`生成时间：${report.generatedAt}`);
  lines.push(`环境：${report.envId}`);
  lines.push('');
  lines.push(`- 检查页面数：${Object.keys(report.summary.byPage).length}`);
  lines.push(`- 问题总数：${report.summary.totalIssues}`);
  lines.push(`- 错误：${report.summary.errors}`);
  lines.push(`- 警告：${report.summary.warnings}`);
  lines.push('');
  lines.push('## 按页面统计');
  lines.push('');
  lines.push('| 页面 | 问题数 |');
  lines.push('| --- | --- |');
  for (const [page, count] of Object.entries(report.summary.byPage)) {
    lines.push(`| ${page} | ${count} |`);
  }
  lines.push('');
  lines.push('## 详细问题');
  lines.push('');
  lines.push('| 页面 | ID | 级别 | 问题 |');
  lines.push('| --- | --- | --- | --- |');
  for (const issue of report.issues) {
    lines.push(`| ${issue.page} | ${issue.id} | ${issue.severity} | ${issue.message} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const auth = runMcporter(['call', 'cloudbase.auth', 'action=status', '--output', 'json']);
  const orders = readCollection('orders', { limit: 30, sort: [{ key: 'created_at', direction: -1 }] });
  const users = readCollection('users', { limit: 200 });
  const products = readCollection('products', { limit: 200 });
  const groupActivities = readCollection('group_activities', { limit: 100 });
  const slashActivities = readCollection('slash_activities', { limit: 100 });
  const lotteryPrizes = readCollection('lottery_prizes', { limit: 100 });
  const stations = readCollection('stations', { limit: 100 });
  const boards = readCollection('content_boards', { limit: 50 });
  const boardProducts = readCollection('content_board_products', { limit: 200 });

  const issues = [];
  auditOrders(issues, orders, users, products);
  auditGroupActivities(issues, groupActivities, products);
  auditSlashActivities(issues, slashActivities, products);
  auditLotteryPrizes(issues, lotteryPrizes);
  auditPickupStations(issues, stations);
  auditBoards(issues, boards, boardProducts, products);

  const byPage = issues.reduce((acc, issue) => {
    acc[issue.page] = (acc[issue.page] || 0) + 1;
    return acc;
  }, {});

  const report = {
    generatedAt: new Date().toISOString(),
    envId: auth.current_env_id,
    summary: {
      totalIssues: issues.length,
      errors: issues.filter((item) => item.severity === 'error').length,
      warnings: issues.filter((item) => item.severity === 'warning').length,
      byPage
    },
    issues
  };

  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, renderMarkdown(report));
  console.log(JSON.stringify({
    jsonPath,
    mdPath,
    summary: report.summary
  }, null, 2));
  if (issues.length > 0) process.exit(1);
}

main();
