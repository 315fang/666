import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const cloudRoot = path.resolve(process.cwd());
const workspaceRoot = path.resolve(cloudRoot, '..');
const outputDir = path.join(cloudRoot, 'outputs', 'test-orders');
const outputPath = path.join(outputDir, `test-orders-${new Date().toISOString().slice(0, 10)}.xlsx`);

function callMcporter(payload) {
  const result = spawnSync('npx', [
    'mcporter',
    'call',
    'cloudbase.readNoSqlDatabaseContent',
    '--args',
    JSON.stringify(payload),
    '--output',
    'json'
  ], {
    cwd: cloudRoot,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 1024 * 1024 * 80
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'CloudBase 查询失败');
  }
  return JSON.parse(result.stdout);
}

function isTestOrder(order) {
  return order?.is_test_order === true || order?.is_test_order === 1 || order?.is_test_order === '1';
}

function dateValue(value) {
  if (!value) return '';
  if (value.$date != null) return new Date(value.$date);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed;
}

function text(value) {
  return value == null ? '' : String(value);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseObject(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? value : {};
}

function addressParts(order) {
  const address = {
    ...parseObject(order.address),
    ...parseObject(order.address_snapshot)
  };
  const receiver = text(address.receiver_name || address.name || address.recipient || order.receiver_name);
  const phone = text(address.phone || order.phone || order.receiver_phone);
  const full = [address.province, address.city, address.district, address.detail || address.detail_address || address.address]
    .map((item) => text(item).trim())
    .filter(Boolean)
    .join('');
  return { receiver, phone, full };
}

function productSummary(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length) return text(order.product_name || order.product?.name);
  return items.map((item) => {
    const name = text(item.snapshot_name || item.name || item.product_name || order.product_name || order.product?.name || '未命名商品');
    const spec = text(item.snapshot_spec || item.spec || item.sku_name || order.sku?.spec_value);
    const qty = number(item.qty || item.quantity || 1) || 1;
    return `${name}${spec ? `/${spec}` : ''} x${qty}`;
  }).join('；');
}

function categoryIds(order) {
  const ids = new Set();
  if (order.category_id != null && order.category_id !== '') ids.add(text(order.category_id));
  for (const item of Array.isArray(order.items) ? order.items : []) {
    if (item.category_id != null && item.category_id !== '') ids.add(text(item.category_id));
  }
  return [...ids];
}

function buildCategoryMap(categories) {
  const map = new Map();
  for (const category of categories) {
    for (const key of [category._id, category.id, category._legacy_id]) {
      if (key != null && key !== '') map.set(text(key), text(category.name));
    }
  }
  return map;
}

function categoryNames(order, categoryMap) {
  const ids = categoryIds(order);
  return ids.map((id) => categoryMap.get(id) || id).join('；');
}

function statusSummaryRows(orders) {
  const map = new Map();
  for (const order of orders) {
    const key = text(order.status || 'unknown');
    const current = map.get(key) || { status: key, count: 0, amount: 0, paid: 0 };
    current.count += 1;
    current.amount += number(order.total_amount);
    current.paid += number(order.pay_amount ?? order.actual_price);
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.count - a.count).map((row) => [row.status, row.count, row.amount, row.paid]);
}

function categorySummaryRows(orders, categoryMap) {
  const map = new Map();
  for (const order of orders) {
    const names = categoryNames(order, categoryMap) || '未记录分类';
    for (const name of names.split('；')) {
      const key = name || '未记录分类';
      const current = map.get(key) || { category: key, count: 0, amount: 0, paid: 0 };
      current.count += 1;
      current.amount += number(order.total_amount);
      current.paid += number(order.pay_amount ?? order.actual_price);
      map.set(key, current);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count).map((row) => [row.category, row.count, row.amount, row.paid]);
}

const ordersResponse = callMcporter({
  collectionName: 'orders',
  query: { $or: [{ is_test_order: true }, { is_test_order: 1 }, { is_test_order: '1' }] },
  sort: [{ key: 'created_at', direction: -1 }],
  limit: 500
});
const categoryResponse = callMcporter({ collectionName: 'categories', limit: 200 });

const orders = (Array.isArray(ordersResponse.data) ? ordersResponse.data : []).filter(isTestOrder);
const categoryMap = buildCategoryMap(Array.isArray(categoryResponse.data) ? categoryResponse.data : []);

const detailHeaders = [
  '序号', '订单号', '订单状态', '下单时间', '支付时间', '更新时间', '测试原因',
  'openid', '收货人', '手机号', '收货地址', '商品', '分类', '数量',
  '订单金额', '实付金额', '支付方式', '配送方式', '履约方式', '物流公司', '物流单号', '订单ID'
];

const detailRows = orders.map((order, index) => {
  const address = addressParts(order);
  return [
    index + 1,
    text(order.order_no),
    text(order.status),
    dateValue(order.created_at),
    dateValue(order.paid_at || order.pay_time),
    dateValue(order.updated_at),
    text(order.test_order_reason),
    text(order.openid),
    address.receiver,
    address.phone,
    address.full,
    productSummary(order),
    categoryNames(order, categoryMap),
    number(order.quantity || (Array.isArray(order.items) ? order.items.reduce((sum, item) => sum + number(item.qty || item.quantity || 1), 0) : 0)),
    number(order.total_amount),
    number(order.pay_amount ?? order.actual_price),
    text(order.payment_method || order.pay_channel),
    text(order.delivery_type),
    text(order.fulfillment_type),
    text(order.logistics_company || order.shipping_company),
    text(order.tracking_no),
    text(order._id)
  ];
});

const workbook = Workbook.create();
const summary = workbook.worksheets.add('汇总');
const details = workbook.worksheets.add('测试订单明细');

summary.getRange('A1:D1').values = [['测试订单导出', '', '', '']];
summary.getRange('A3:B7').values = [
  ['导出时间', new Date()],
  ['CloudBase 环境', 'cloud1-9gywyqe49638e46f'],
  ['测试订单数', orders.length],
  ['订单总金额', orders.reduce((sum, order) => sum + number(order.total_amount), 0)],
  ['实付总金额', orders.reduce((sum, order) => sum + number(order.pay_amount ?? order.actual_price), 0)]
];
summary.getRange('A9:D9').values = [['按状态汇总', '订单数', '订单金额', '实付金额']];
const statusRows = statusSummaryRows(orders);
if (statusRows.length) summary.getRange(`A10:D${9 + statusRows.length}`).values = statusRows;

const categoryStart = 12 + statusRows.length;
summary.getRange(`A${categoryStart}:D${categoryStart}`).values = [['按分类汇总', '订单数', '订单金额', '实付金额']];
const categoryRows = categorySummaryRows(orders, categoryMap);
if (categoryRows.length) summary.getRange(`A${categoryStart + 1}:D${categoryStart + categoryRows.length}`).values = categoryRows;

details.getRange(`A1:V1`).values = [detailHeaders];
if (detailRows.length) details.getRange(`A2:V${detailRows.length + 1}`).values = detailRows;

await fs.mkdir(outputDir, { recursive: true });
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);

console.log(JSON.stringify({ outputPath, count: orders.length }, null, 2));
